import puppeteer from 'puppeteer'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'
import bedrockReportService from './bedrock-report.js'
import prometheusService from './prometheus.js'
import kubernetesService from './kubernetes.js'
import lokiService from './loki.js'
import healthcheckService from './healthcheck.js'
import { WebClient } from '@slack/web-api'
import AWS from 'aws-sdk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const slack = new WebClient(process.env.SLACK_BOT_TOKEN)
const SLACK_CHANNEL = process.env.SLACK_CHANNEL

// AWS SES 설정
const ses = new AWS.SES({ 
  region: process.env.AWS_SES_REGION || 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

// 보고서 데이터 수집
async function collectReportData(reportType) {
  const now = new Date()
  let startTime, endTime
  
  if (reportType === 'daily') {
    startTime = new Date(now)
    startTime.setHours(0, 0, 0, 0)
    endTime = new Date(now)
    endTime.setHours(23, 59, 59, 999)
  } else if (reportType === 'weekly') {
    // 지난 주 일요일 ~ 토요일
    startTime = getLastSunday()
    endTime = new Date(startTime)
    endTime.setDate(endTime.getDate() + 6)
    endTime.setHours(23, 59, 59, 999)
  } else if (reportType === 'monthly') {
    // 지난 달 1일 ~ 마지막 날
    startTime = getLastMonthStart()
    endTime = getLastMonthEnd()
  }
  
  // 타임아웃 헬퍼 함수
  const withTimeout = (promise, timeoutMs, defaultValue) => {
    return Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve(defaultValue), timeoutMs))
    ]).catch(() => defaultValue)
  }
  
  console.log('Starting data collection...')
  
  // 데이터 수집 (CSV export와 동일한 데이터) - 각각 타임아웃 적용
  const dataCollectionPromises = [
    withTimeout(kubernetesService.getClusterOverview(), 10000, { nodes: { total: 0, ready: 0 }, pods: { total: 0, running: 0, failed: 0, pending: 0 } }),
    withTimeout(kubernetesService.getNodes(), 10000, []),
    withTimeout(prometheusService.getResourceUsageTimeline(null, startTime, endTime), 30000, { cpu: {}, memory: {} }),
    withTimeout(prometheusService.getContainerCPUMetrics(null, startTime, endTime), 30000, []),
    withTimeout(prometheusService.getContainerMemoryMetrics(null, startTime, endTime), 30000, []),
    withTimeout(prometheusService.getPodCPUMetrics(null, startTime, endTime), 30000, []),
    withTimeout(prometheusService.getPodMemoryMetrics(null, startTime, endTime), 30000, []),
    withTimeout(prometheusService.get5xxErrorBreakdown(startTime.toISOString(), endTime.toISOString()), 30000, {
      haproxy: { count: 0, percentage: '0' },
      gateway: { count: 0, percentage: '0' },
      application: { count: 0, percentage: '0' },
      downstream: { count: 0, percentage: '0' },
      total: 0
    }),
    withTimeout(lokiService.getTopErrorMessages(startTime.toISOString(), endTime.toISOString(), 10), 20000, []),
    withTimeout(healthcheckService.getHealthcheckStatus(), 20000, { hasErrors: false, errors: [], checkedPods: 0 })
  ]
  
  console.log('Waiting for data collection to complete...')
  const [clusterOverview, nodes, resourceUsage, containerCPU, containerMemory, podCPU, podMemory, errors, topErrors, healthcheck] = await Promise.all(dataCollectionPromises)
  console.log('Data collection completed.')
  
  return {
    reportType,
    periodStart: startTime,
    periodEnd: endTime,
    generatedAt: new Date(),
    clusterOverview,
    nodes,
    resourceUsage,
    containerCPU,
    containerMemory,
    podCPU,
    podMemory,
    errors,
    topErrors,
    healthcheck
  }
}

// 지난 주 일요일
function getLastSunday() {
  const date = new Date()
  const day = date.getDay()
  const diff = date.getDate() - day - 7
  const lastSunday = new Date(date.setDate(diff))
  lastSunday.setHours(0, 0, 0, 0)
  return lastSunday
}

// 지난 달 시작
function getLastMonthStart() {
  const date = new Date()
  date.setMonth(date.getMonth() - 1)
  date.setDate(1)
  date.setHours(0, 0, 0, 0)
  return date
}

// 지난 달 끝
function getLastMonthEnd() {
  const date = new Date()
  date.setDate(0) // 현재 달의 0일 = 지난 달의 마지막 날
  date.setHours(23, 59, 59, 999)
  return date
}

// 한국 시간으로 변환
function toKST(date) {
  const kstDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const year = kstDate.getFullYear()
  const month = String(kstDate.getMonth() + 1).padStart(2, '0')
  const day = String(kstDate.getDate()).padStart(2, '0')
  const hours = String(kstDate.getHours()).padStart(2, '0')
  const minutes = String(kstDate.getMinutes()).padStart(2, '0')
  const seconds = String(kstDate.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} (KST)`
}

// Bedrock AI 생성 내용을 HTML로 래핑
function wrapAIContentInHTML(aiContent, reportData, reportType) {
  const { periodStart, periodEnd, generatedAt, resourceUsage, containerCPU, containerMemory, podCPU, podMemory, errors } = reportData
  
  // Bedrock Agent가 이미 HTML을 반환하므로, 완전한 HTML 문서로 래핑
  // aiContent에 이미 HTML 태그가 포함되어 있을 수 있음
  console.log(`Wrapping AI content (length: ${aiContent.length} bytes)`)
  
  // 차트 데이터 준비
  const cpuTimeline = resourceUsage?.cpu?.timeline || []
  const memoryTimeline = resourceUsage?.memory?.timeline || []
  const containerCPUTop5 = (containerCPU || []).slice(0, 5)
  const containerMemoryTop5 = (containerMemory || []).slice(0, 5)
  const podCPUTop5 = (podCPU || []).slice(0, 5)
  const podMemoryTop5 = (podMemory || []).slice(0, 5)
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>HIKER 인프라 모니터링 보고서 - ${reportType}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
    body { 
      font-family: 'Noto Sans KR', 'Noto Sans CJK KR', 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; 
      margin: 20px; 
      color: #333; 
      line-height: 1.6;
    }
    * { font-family: 'Noto Sans KR', 'Noto Sans CJK KR', 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; }
    h1 { 
      color: #2c3e50; 
      border-bottom: 3px solid #3498db; 
      padding-bottom: 10px; 
      margin-top: 0;
      font-size: 28px;
    }
    h2 { 
      color: #34495e; 
      margin-top: 30px; 
      border-bottom: 2px solid #ecf0f1; 
      padding-bottom: 5px; 
      font-size: 22px;
    }
    h3 {
      color: #34495e;
      margin-top: 20px;
      font-size: 18px;
    }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      margin: 15px 0; 
      font-size: 14px;
    }
    th, td { 
      padding: 12px; 
      text-align: left; 
      border: 1px solid #ddd; 
    }
    th { 
      background-color: #3498db; 
      color: white; 
      font-weight: 600;
    }
    tr:nth-child(even) { 
      background-color: #f9f9f9; 
    }
    tr:hover {
      background-color: #f0f0f0;
    }
    ul, ol {
      margin: 10px 0;
      padding-left: 30px;
    }
    li {
      margin: 5px 0;
      line-height: 1.8;
    }
    .report-content { 
      line-height: 1.8; 
    }
    .meta-info { 
      color: #7f8c8d; 
      font-size: 14px; 
      margin-bottom: 25px; 
      padding: 15px;
      background-color: #f5f5f5;
      border-left: 4px solid #3498db;
      border-radius: 4px;
    }
    strong {
      font-weight: 600;
      color: #2c3e50;
    }
    em {
      font-style: italic;
    }
    .chart-container {
      margin: 25px 0;
      padding: 15px;
      background-color: #fafafa;
      border-radius: 4px;
      page-break-inside: avoid;
    }
    canvas {
      max-height: 400px;
      margin: 10px 0;
    }
    p {
      margin: 10px 0;
      line-height: 1.8;
    }
  </style>
</head>
<body>
  <div class="meta-info">
    <p><strong>보고 기간:</strong> ${periodStart.toISOString().split('T')[0]} ~ ${periodEnd.toISOString().split('T')[0]}</p>
    <p><strong>생성 일시:</strong> ${toKST(generatedAt)}</p>
  </div>
  <div class="report-content">
    ${aiContent}
  </div>
  
  ${cpuTimeline.length > 0 ? `
  <h2>리소스 사용률 시계열</h2>
  <div class="chart-container">
    <canvas id="resourceChart"></canvas>
  </div>
  ` : ''}
  
  ${containerCPUTop5.length > 0 ? `
  <h2>Container CPU 사용량 Top 5</h2>
  <div class="chart-container">
    <canvas id="containerCPUChart"></canvas>
  </div>
  ` : ''}
  
  ${containerMemoryTop5.length > 0 ? `
  <h2>Container Memory 사용량 Top 5</h2>
  <div class="chart-container">
    <canvas id="containerMemoryChart"></canvas>
  </div>
  ` : ''}
  
  ${podCPUTop5.length > 0 ? `
  <h2>Pod CPU 사용량 Top 5</h2>
  <div class="chart-container">
    <canvas id="podCPUChart"></canvas>
  </div>
  ` : ''}
  
  ${podMemoryTop5.length > 0 ? `
  <h2>Pod Memory 사용량 Top 5</h2>
  <div class="chart-container">
    <canvas id="podMemoryChart"></canvas>
  </div>
  ` : ''}
  
  ${errors?.total > 0 ? `
  <h2>5XX 에러 분류</h2>
  <div class="chart-container">
    <canvas id="errorPieChart"></canvas>
  </div>
  ` : ''}
  
  <script>
    ${cpuTimeline.length > 0 ? `
    const resourceCtx = document.getElementById('resourceChart');
    if (resourceCtx) {
      const cpuData = ${JSON.stringify(cpuTimeline.map(p => ({ x: new Date(p.timestamp * 1000).toISOString(), y: parseFloat(p.value.toFixed(2)) })))};
      const memData = ${JSON.stringify(memoryTimeline.map(p => ({ x: new Date(p.timestamp * 1000).toISOString(), y: parseFloat(p.value.toFixed(2)) })))};
      new Chart(resourceCtx, {
        type: 'line',
        data: {
          datasets: [{
            label: 'CPU 사용률 (%)',
            data: cpuData,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.1)',
            tension: 0.1
          }, {
            label: 'Memory 사용률 (%)',
            data: memData,
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.1)',
            tension: 0.1
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true, max: 100 }
          },
          plugins: { legend: { display: true } }
        }
      });
    }
    ` : ''}
    
    ${containerCPUTop5.length > 0 ? `
    const containerCPUCtx = document.getElementById('containerCPUChart');
    if (containerCPUCtx) {
      const labels = ${JSON.stringify(containerCPUTop5.map(c => `${c.namespace}/${c.pod}/${c.name}`))};
      const data = ${JSON.stringify(containerCPUTop5.map(c => {
        const lastValue = c.data && c.data.length > 0 ? parseFloat(c.data[c.data.length - 1][1]) : 0;
        return parseFloat(lastValue.toFixed(4));
      }))};
      new Chart(containerCPUCtx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'CPU 사용량 (cores)',
            data: data,
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
    ` : ''}
    
    ${containerMemoryTop5.length > 0 ? `
    const containerMemoryCtx = document.getElementById('containerMemoryChart');
    if (containerMemoryCtx) {
      const labels = ${JSON.stringify(containerMemoryTop5.map(c => `${c.namespace}/${c.pod}/${c.name}`))};
      const data = ${JSON.stringify(containerMemoryTop5.map(c => {
        if (c.usageBytesData && c.usageBytesData.length > 0) {
          const lastBytes = parseFloat(c.usageBytesData[c.usageBytesData.length - 1][1]);
          return parseFloat((lastBytes / 1024 / 1024).toFixed(2));
        }
        return 0;
      }))};
      new Chart(containerMemoryCtx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Memory 사용량 (MB)',
            data: data,
            backgroundColor: 'rgba(255, 99, 132, 0.6)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
    ` : ''}
    
    ${podCPUTop5.length > 0 ? `
    const podCPUCtx = document.getElementById('podCPUChart');
    if (podCPUCtx) {
      const labels = ${JSON.stringify(podCPUTop5.map(p => `${p.namespace}/${p.name}`))};
      const data = ${JSON.stringify(podCPUTop5.map(p => {
        const lastValue = p.data && p.data.length > 0 ? parseFloat(p.data[p.data.length - 1][1]) : 0;
        return parseFloat(lastValue.toFixed(4));
      }))};
      new Chart(podCPUCtx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'CPU 사용량 (cores)',
            data: data,
            backgroundColor: 'rgba(75, 192, 192, 0.6)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
    ` : ''}
    
    ${podMemoryTop5.length > 0 ? `
    const podMemoryCtx = document.getElementById('podMemoryChart');
    if (podMemoryCtx) {
      const labels = ${JSON.stringify(podMemoryTop5.map(p => `${p.namespace}/${p.name}`))};
      const data = ${JSON.stringify(podMemoryTop5.map(p => {
        if (p.usageBytesData && p.usageBytesData.length > 0) {
          const lastBytes = parseFloat(p.usageBytesData[p.usageBytesData.length - 1][1]);
          return parseFloat((lastBytes / 1024 / 1024).toFixed(2));
        }
        return 0;
      }))};
      new Chart(podMemoryCtx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Memory 사용량 (MB)',
            data: data,
            backgroundColor: 'rgba(153, 102, 255, 0.6)',
            borderColor: 'rgba(153, 102, 255, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
    ` : ''}
    
    ${errors?.total > 0 ? `
    const errorPieCtx = document.getElementById('errorPieChart');
    if (errorPieCtx) {
      new Chart(errorPieCtx, {
        type: 'pie',
        data: {
          labels: ['HAProxy', 'Gateway', 'Application', 'Downstream'],
          datasets: [{
            data: [
              ${errors.haproxy?.count || 0},
              ${errors.gateway?.count || 0},
              ${errors.application?.count || 0},
              ${errors.downstream?.count || 0}
            ],
            backgroundColor: [
              'rgba(255, 99, 132, 0.6)',
              'rgba(54, 162, 235, 0.6)',
              'rgba(255, 206, 86, 0.6)',
              'rgba(75, 192, 192, 0.6)'
            ],
            borderColor: [
              'rgba(255, 99, 132, 1)',
              'rgba(54, 162, 235, 1)',
              'rgba(255, 206, 86, 1)',
              'rgba(75, 192, 192, 1)'
            ],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: true, position: 'right' }
          }
        }
      });
    }
    ` : ''}
  </script>
</body>
</html>
  `
}

// HTML 템플릿 생성 (Fallback용)
function generateHTMLTemplate(reportData, reportType) {
  const { clusterOverview, nodes, resourceUsage, containerCPU, containerMemory, podCPU, podMemory, errors, topErrors, healthcheck, periodStart, periodEnd, generatedAt } = reportData
  
  // 리소스 사용률 데이터 준비
  const cpuTimeline = resourceUsage.cpu?.timeline || []
  const memoryTimeline = resourceUsage.memory?.timeline || []
  const cpuAvg = resourceUsage.cpu?.average?.toFixed(2) || '0'
  const cpuPeak = resourceUsage.cpu?.peak?.toFixed(2) || '0'
  const memAvg = resourceUsage.memory?.average?.toFixed(2) || '0'
  const memPeak = resourceUsage.memory?.peak?.toFixed(2) || '0'
  
  // Container/Pod Top 5 데이터 준비
  const containerCPUTop5 = containerCPU
    .filter(c => c.data && c.data.length > 0)
    .map(c => ({ ...c, current: parseFloat(c.data[c.data.length - 1][1]), peak: Math.max(...c.data.map(d => parseFloat(d[1]))) }))
    .sort((a, b) => b.current - a.current)
    .slice(0, 5)
  
  const containerMemoryTop5 = containerMemory
    .filter(c => c.usageBytesData && c.usageBytesData.length > 0)
    .map(c => {
      const currentBytes = parseFloat(c.usageBytesData[c.usageBytesData.length - 1][1])
      const peakBytes = Math.max(...c.usageBytesData.map(d => parseFloat(d[1])))
      return { ...c, current: (currentBytes / 1024 / 1024).toFixed(2), peak: (peakBytes / 1024 / 1024).toFixed(2) }
    })
    .sort((a, b) => parseFloat(b.current) - parseFloat(a.current))
    .slice(0, 5)
  
  const podCPUTop5 = podCPU
    .filter(p => p.data && p.data.length > 0)
    .map(p => ({ ...p, current: parseFloat(p.data[p.data.length - 1][1]), peak: Math.max(...p.data.map(d => parseFloat(d[1]))) }))
    .sort((a, b) => b.current - a.current)
    .slice(0, 5)
  
  const podMemoryTop5 = podMemory
    .filter(p => p.usageBytesData && p.usageBytesData.length > 0)
    .map(p => {
      const currentBytes = parseFloat(p.usageBytesData[p.usageBytesData.length - 1][1])
      const peakBytes = Math.max(...p.usageBytesData.map(d => parseFloat(d[1])))
      return { ...p, current: (currentBytes / 1024 / 1024).toFixed(2), peak: (peakBytes / 1024 / 1024).toFixed(2) }
    })
    .sort((a, b) => parseFloat(b.current) - parseFloat(a.current))
    .slice(0, 5)
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>HIKER 인프라 모니터링 보고서 - ${reportType}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
    body { 
      font-family: 'Noto Sans KR', 'Noto Sans CJK KR', 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; 
      margin: 20px; 
      color: #333; 
    }
    * { font-family: 'Noto Sans KR', 'Noto Sans CJK KR', 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; }
    h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
    h2 { color: #34495e; margin-top: 30px; border-bottom: 2px solid #ecf0f1; padding-bottom: 5px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { padding: 10px; text-align: left; border: 1px solid #ddd; }
    th { background-color: #3498db; color: white; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .metric-box { background: #ecf0f1; padding: 15px; margin: 10px 0; border-radius: 5px; }
    .metric-value { font-size: 24px; font-weight: bold; color: #2c3e50; }
    .error-count { color: #e74c3c; }
    .healthy { color: #27ae60; }
    .page-break { page-break-after: always; }
    canvas { max-height: 400px; margin: 20px 0; }
    .chart-container { margin: 20px 0; page-break-inside: avoid; }
  </style>
</head>
<body>
  <h1>HIKER 인프라 모니터링 ${reportType} 보고서</h1>
  <p><strong>보고 기간:</strong> ${periodStart.toISOString().split('T')[0]} ~ ${periodEnd.toISOString().split('T')[0]}</p>
  <p><strong>생성 일시:</strong> ${toKST(generatedAt)}</p>
  
  <h2>1. 클러스터 개요</h2>
  <table>
    <tr><th>항목</th><th>값</th></tr>
    <tr><td>노드 총 개수</td><td>${clusterOverview.nodes.total}</td></tr>
    <tr><td>노드 Ready 개수</td><td class="healthy">${clusterOverview.nodes.ready}</td></tr>
    <tr><td>Pod 총 개수</td><td>${clusterOverview.pods.total}</td></tr>
    <tr><td>Pod Running 개수</td><td class="healthy">${clusterOverview.pods.running}</td></tr>
    <tr><td>Pod Failed 개수</td><td class="error-count">${clusterOverview.pods.failed}</td></tr>
    <tr><td>Pod Pending 개수</td><td>${clusterOverview.pods.pending}</td></tr>
  </table>
  
  <h2>2. 노드 정보</h2>
  <table>
    <tr><th>노드명</th><th>IP</th><th>역할</th><th>상태</th><th>OS</th></tr>
    ${nodes.map(n => `<tr><td>${n.name}</td><td>${n.ip || ''}</td><td>${n.role || ''}</td><td>${n.status || ''}</td><td>${n.os || ''}</td></tr>`).join('')}
  </table>
  
  <h2>3. 리소스 사용률</h2>
  <div class="metric-box">
    <div>CPU 평균: <span class="metric-value">${cpuAvg}%</span> | CPU 피크: <span class="metric-value">${cpuPeak}%</span></div>
    <div>Memory 평균: <span class="metric-value">${memAvg}%</span> | Memory 피크: <span class="metric-value">${memPeak}%</span></div>
  </div>
  ${cpuTimeline.length > 0 ? `<div class="chart-container"><canvas id="resourceChart"></canvas></div>` : '<p>데이터가 없습니다.</p>'}
  
  <h2>4. Container CPU 사용량 Top 5</h2>
  ${containerCPUTop5.length > 0 ? `<div class="chart-container"><canvas id="containerCPUChart"></canvas></div>` : ''}
  <table>
    <tr><th>순위</th><th>Namespace</th><th>Pod</th><th>Container</th><th>현재 (cores)</th><th>피크 (cores)</th></tr>
    ${containerCPUTop5.map((c, i) => `<tr><td>${i + 1}</td><td>${c.namespace}</td><td>${c.pod}</td><td>${c.name}</td><td>${c.current.toFixed(4)}</td><td>${c.peak.toFixed(4)}</td></tr>`).join('')}
  </table>
  
  <h2>5. Container Memory 사용량 Top 5</h2>
  ${containerMemoryTop5.length > 0 ? `<div class="chart-container"><canvas id="containerMemoryChart"></canvas></div>` : ''}
  <table>
    <tr><th>순위</th><th>Namespace</th><th>Pod</th><th>Container</th><th>현재 (MB)</th><th>피크 (MB)</th></tr>
    ${containerMemoryTop5.map((c, i) => `<tr><td>${i + 1}</td><td>${c.namespace}</td><td>${c.pod}</td><td>${c.name}</td><td>${c.current}</td><td>${c.peak}</td></tr>`).join('')}
  </table>
  
  <h2>6. Pod CPU 사용량 Top 5</h2>
  ${podCPUTop5.length > 0 ? `<div class="chart-container"><canvas id="podCPUChart"></canvas></div>` : ''}
  <table>
    <tr><th>순위</th><th>Namespace</th><th>Pod</th><th>현재 (cores)</th><th>피크 (cores)</th></tr>
    ${podCPUTop5.map((p, i) => `<tr><td>${i + 1}</td><td>${p.namespace}</td><td>${p.name}</td><td>${p.current.toFixed(4)}</td><td>${p.peak.toFixed(4)}</td></tr>`).join('')}
  </table>
  
  <h2>7. Pod Memory 사용량 Top 5</h2>
  ${podMemoryTop5.length > 0 ? `<div class="chart-container"><canvas id="podMemoryChart"></canvas></div>` : ''}
  <table>
    <tr><th>순위</th><th>Namespace</th><th>Pod</th><th>현재 (MB)</th><th>피크 (MB)</th></tr>
    ${podMemoryTop5.map((p, i) => `<tr><td>${i + 1}</td><td>${p.namespace}</td><td>${p.name}</td><td>${p.current}</td><td>${p.peak}</td></tr>`).join('')}
  </table>
  
  <h2>8. 5XX 에러 단계별 분류</h2>
  ${errors.total > 0 ? `<div class="chart-container"><canvas id="errorPieChart"></canvas></div>` : ''}
  <table>
    <tr><th>단계</th><th>에러 수</th><th>비율 (%)</th></tr>
    <tr><td>HAProxy</td><td class="error-count">${errors.haproxy.count}</td><td>${errors.haproxy.percentage}</td></tr>
    <tr><td>Gateway</td><td class="error-count">${errors.gateway.count}</td><td>${errors.gateway.percentage}</td></tr>
    <tr><td>Application</td><td class="error-count">${errors.application.count}</td><td>${errors.application.percentage}</td></tr>
    <tr><td>Downstream</td><td class="error-count">${errors.downstream.count}</td><td>${errors.downstream.percentage}</td></tr>
    <tr><td><strong>전체</strong></td><td class="error-count"><strong>${errors.total}</strong></td><td><strong>100.0</strong></td></tr>
  </table>
  
  ${topErrors.length > 0 ? `
  <h2>9. Top 10 에러 메시지</h2>
  <table>
    <tr><th>순위</th><th>에러 메시지</th><th>발생 횟수</th><th>Namespace</th><th>Service</th></tr>
    ${topErrors.map((error, i) => `<tr><td>${i + 1}</td><td>${(error.message || '').substring(0, 100)}</td><td>${error.count}</td><td>${error.namespace || ''}</td><td>${error.service || ''}</td></tr>`).join('')}
  </table>
  ` : ''}
  
  <h2>10. 헬스체크 상태</h2>
  <div class="metric-box">
    <div>상태: <span class="metric-value ${healthcheck.hasErrors ? 'error-count' : 'healthy'}">${healthcheck.hasErrors ? 'Critical' : 'Healthy'}</span></div>
    <div>체크된 Pod 수: ${healthcheck.checkedPods || 0}</div>
    <div>에러 발생 Pod 수: <span class="error-count">${healthcheck.errors ? healthcheck.errors.length : 0}</span></div>
  </div>
  ${healthcheck.errors && healthcheck.errors.length > 0 ? `
  <table>
    <tr><th>Pod</th><th>Node</th><th>에러 메시지</th></tr>
    ${healthcheck.errors.flatMap(podError => podError.errors.map(error => `<tr><td>${podError.pod}</td><td>${podError.node}</td><td>${(error.message || '').substring(0, 150)}</td></tr>`)).join('')}
  </table>
  ` : ''}
  
  <script>
    // 리소스 사용률 시계열 차트
    ${cpuTimeline.length > 0 ? `
    const resourceCtx = document.getElementById('resourceChart');
    if (resourceCtx) {
      const cpuData = ${JSON.stringify(cpuTimeline.map(p => ({ x: new Date(p.timestamp * 1000).toISOString(), y: parseFloat(p.value.toFixed(2)) })))};
      const memData = ${JSON.stringify(memoryTimeline.map(p => ({ x: new Date(p.timestamp * 1000).toISOString(), y: parseFloat(p.value.toFixed(2)) })))};
      new Chart(resourceCtx, {
        type: 'line',
        data: {
          datasets: [{
            label: 'CPU 사용률 (%)',
            data: cpuData,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.1)',
            tension: 0.1
          }, {
            label: 'Memory 사용률 (%)',
            data: memData,
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.1)',
            tension: 0.1
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true, max: 100 }
          },
          plugins: { legend: { display: true } }
        }
      });
    }
    ` : ''}
    
    // Container CPU Top 5 바 차트
    ${containerCPUTop5.length > 0 ? `
    const containerCPUCtx = document.getElementById('containerCPUChart');
    if (containerCPUCtx) {
      const containerCPULabels = ${JSON.stringify(containerCPUTop5.map(c => `${c.namespace}/${c.pod}/${c.name}`))};
      const containerCPUData = ${JSON.stringify(containerCPUTop5.map(c => parseFloat(c.current.toFixed(4))))};
      new Chart(containerCPUCtx, {
        type: 'bar',
        data: {
          labels: containerCPULabels,
          datasets: [{
            label: 'CPU 사용량 (cores)',
            data: containerCPUData,
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
    ` : ''}
    
    // Container Memory Top 5 바 차트
    ${containerMemoryTop5.length > 0 ? `
    const containerMemoryCtx = document.getElementById('containerMemoryChart');
    if (containerMemoryCtx) {
      const containerMemoryLabels = ${JSON.stringify(containerMemoryTop5.map(c => `${c.namespace}/${c.pod}/${c.name}`))};
      const containerMemoryData = ${JSON.stringify(containerMemoryTop5.map(c => parseFloat(c.current)))};
      new Chart(containerMemoryCtx, {
        type: 'bar',
        data: {
          labels: containerMemoryLabels,
          datasets: [{
            label: 'Memory 사용량 (MB)',
            data: containerMemoryData,
            backgroundColor: 'rgba(255, 99, 132, 0.6)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
    ` : ''}
    
    // Pod CPU Top 5 바 차트
    ${podCPUTop5.length > 0 ? `
    const podCPUCtx = document.getElementById('podCPUChart');
    if (podCPUCtx) {
      const podCPULabels = ${JSON.stringify(podCPUTop5.map(p => `${p.namespace}/${p.name}`))};
      const podCPUData = ${JSON.stringify(podCPUTop5.map(p => parseFloat(p.current.toFixed(4))))};
      new Chart(podCPUCtx, {
        type: 'bar',
        data: {
          labels: podCPULabels,
          datasets: [{
            label: 'CPU 사용량 (cores)',
            data: podCPUData,
            backgroundColor: 'rgba(75, 192, 192, 0.6)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
    ` : ''}
    
    // Pod Memory Top 5 바 차트
    ${podMemoryTop5.length > 0 ? `
    const podMemoryCtx = document.getElementById('podMemoryChart');
    if (podMemoryCtx) {
      const podMemoryLabels = ${JSON.stringify(podMemoryTop5.map(p => `${p.namespace}/${p.name}`))};
      const podMemoryData = ${JSON.stringify(podMemoryTop5.map(p => parseFloat(p.current)))};
      new Chart(podMemoryCtx, {
        type: 'bar',
        data: {
          labels: podMemoryLabels,
          datasets: [{
            label: 'Memory 사용량 (MB)',
            data: podMemoryData,
            backgroundColor: 'rgba(153, 102, 255, 0.6)',
            borderColor: 'rgba(153, 102, 255, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
    ` : ''}
    
    // 에러 분류 파이 차트
    ${errors.total > 0 ? `
    const errorPieCtx = document.getElementById('errorPieChart');
    if (errorPieCtx) {
      new Chart(errorPieCtx, {
        type: 'pie',
        data: {
          labels: ['HAProxy', 'Gateway', 'Application', 'Downstream'],
          datasets: [{
            data: [
              ${errors.haproxy.count},
              ${errors.gateway.count},
              ${errors.application.count},
              ${errors.downstream.count}
            ],
            backgroundColor: [
              'rgba(255, 99, 132, 0.6)',
              'rgba(54, 162, 235, 0.6)',
              'rgba(255, 206, 86, 0.6)',
              'rgba(75, 192, 192, 0.6)'
            ],
            borderColor: [
              'rgba(255, 99, 132, 1)',
              'rgba(54, 162, 235, 1)',
              'rgba(255, 206, 86, 1)',
              'rgba(75, 192, 192, 1)'
            ],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: true, position: 'right' }
          }
        }
      });
    }
    ` : ''}
  </script>
</body>
</html>
  `
}

// PDF 생성
async function generatePDF(htmlContent) {
  let browser = null
  let page = null
  
  try {
    console.log('Launching browser...')
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions'
      ],
      timeout: 60000
    })
    console.log('Browser launched successfully')
    
    console.log('Creating new page...')
    page = await browser.newPage()
    console.log('Page created successfully')
    
    // 페이지 설정
    await page.setViewport({ width: 1200, height: 800 })
    console.log('Viewport set successfully')
    
    console.log('Setting content with timeout...')
    // HTML 내용 설정 (CDN 로드를 고려하여 domcontentloaded 사용)
    try {
      await page.setContent(htmlContent, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      })
      console.log('Content set successfully')
    } catch (err) {
      console.warn('Content load timeout, trying without wait:', err.message)
      await page.setContent(htmlContent, { waitUntil: 'load', timeout: 15000 }).catch(() => {
        console.warn('Content load failed, proceeding anyway')
      })
    }
    
    console.log('Waiting for resources to load...')
    // 외부 리소스(Chart.js CDN) 로드 대기
    try {
      await page.waitForFunction(() => {
        return typeof Chart !== 'undefined' || document.readyState === 'complete'
      }, { timeout: 20000 }).catch(() => {
        console.warn('Chart.js load timeout, proceeding anyway')
      })
      console.log('Resources loaded')
    } catch (err) {
      console.warn('Resource wait error:', err.message)
    }
    
    // 추가 렌더링 대기 시간
    console.log('Waiting for rendering...')
    await page.waitForTimeout(3000).catch(() => {})
    console.log('Rendering completed')
    
    console.log('Generating PDF...')
    const pdfBuffer = await Promise.race([
      page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('PDF generation timeout')), 60000))
    ])
    console.log(`PDF generated, size: ${pdfBuffer.length} bytes`)
  
    console.log('PDF generated, closing browser...')
  await browser.close()
    console.log('Browser closed.')
  
  return pdfBuffer
  } catch (error) {
    console.error('Error in PDF generation:', error)
    console.error('Error stack:', error.stack)
    if (page) {
      await page.close().catch(() => {})
    }
    if (browser) {
      await browser.close().catch(() => {})
    }
    throw error
  }
}

// Slack으로 보고서 전송
async function sendReportToSlack(pdfBuffer, reportType, periodStart, periodEnd, summary) {
  const fileName = `hiker-infra-report-${reportType}-${new Date().toISOString().split('T')[0]}.pdf`
  const tempPath = `/tmp/${fileName}`
  
  await fs.writeFile(tempPath, pdfBuffer)
  
  try {
    // files.upload는 deprecated되었으므로 files.uploadV2 사용
    const fileBuffer = await fs.readFile(tempPath)
    const result = await slack.files.uploadV2({
      channel_id: SLACK_CHANNEL,
      file: fileBuffer,
      filename: fileName,
      title: `HIKER 인프라 모니터링 ${reportType} 보고서`,
      initial_comment: `
HIKER 인프라 모니터링 ${reportType} 보고서가 생성되었습니다.

보고 기간: ${periodStart.toISOString()} ~ ${periodEnd.toISOString()}

주요 내용:
- 총 5XX 에러: ${summary.totalErrors || 0}건
- 임계치 초과 알람: ${summary.alerts || 0}건

PDF 파일을 확인하세요.
      `
    })
    
    console.log(`Slack에 보고서 전송 완료: ${result.file?.id}`)
  } finally {
    await fs.unlink(tempPath)
  }
}

// Raw Email 메시지 생성 (PDF 첨부용)
async function createRawEmailMessage(from, to, subject, pdfBuffer, fileName) {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  const message = [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    `<h2>HIKER 인프라 모니터링 보고서</h2>`,
    `<p>보고서 PDF 파일이 첨부되어 있습니다.</p>`,
    ``,
    `--${boundary}`,
    `Content-Type: application/pdf`,
    `Content-Transfer-Encoding: base64`,
    `Content-Disposition: attachment; filename="${fileName}"`,
    ``,
    pdfBuffer.toString('base64'),
    ``,
    `--${boundary}--`
  ].join('\r\n')
  
  return Buffer.from(message)
}

// SES로 보고서 이메일 전송
async function sendReportToSES(pdfBuffer, reportType, periodStart, periodEnd, summary, recipientEmails) {
  try {
    console.log(`SES 이메일 전송 시작: ${recipientEmails.length}명에게 전송`)
    console.log(`받는 사람: ${recipientEmails.join(', ')}`)
    
  const fileName = `hiker-infra-report-${reportType}-${new Date().toISOString().split('T')[0]}.pdf`
    const fromEmail = process.env.AWS_SES_FROM_EMAIL || 'monitoring@hiker-cloud.site'
    
    console.log(`발신 이메일: ${fromEmail}`)
    console.log(`PDF 파일 크기: ${pdfBuffer.length} bytes`)
  
  // SES 직접 사용 (nodemailer 대신)
  const rawMessage = await createRawEmailMessage(
      fromEmail,
    recipientEmails,
    `HIKER 인프라 모니터링 ${reportType} 보고서 - ${new Date().toISOString().split('T')[0]}`,
    pdfBuffer,
    fileName
  )
    
    console.log(`Raw 메시지 생성 완료: ${rawMessage.length} bytes`)
  
  const params = {
      Source: fromEmail,
    Destinations: recipientEmails,
    RawMessage: {
      Data: rawMessage
    }
  }
  
    console.log('SES sendRawEmail 호출 중...')
    console.log(`전송 파라미터: Source=${params.Source}, Destinations=${params.Destinations.join(', ')}`)
    const result = await ses.sendRawEmail(params).promise()
    console.log(`SES 전송 성공: MessageId=${result.MessageId}`)
    console.log(`응답 전체: ${JSON.stringify(result, null, 2)}`)
  console.log(`SES를 통해 보고서 이메일 전송 완료: ${recipientEmails.join(', ')}`)
    
    // 각 수신자별로 전송 상태 확인
    if (result.MessageId) {
      console.log(`✅ 이메일이 SES를 통해 전송되었습니다.`)
      console.log(`📧 받는 사람: ${recipientEmails.join(', ')}`)
      console.log(`📬 MessageId: ${result.MessageId}`)
      console.log(`⚠️  이메일이 도착하지 않았다면 스팸함을 확인하세요.`)
    }
  } catch (error) {
    console.error('SES 이메일 전송 실패:', error.message)
    console.error('에러 상세:', JSON.stringify(error, null, 2))
    throw error
  }
}

// 보고서 생성 및 전송
async function generateReport(reportType) {
  console.log(`Generating ${reportType} report...`)
  
  // 1. 데이터 수집
  const reportData = await collectReportData(reportType)
  
  // 2. 요약 정보 생성
  const summary = {
    totalErrors: reportData.errors?.total || 0,
    alerts: 0, // TODO: 알람 통계 추가
    nodesTotal: reportData.clusterOverview?.nodes?.total || 0,
    podsRunning: reportData.clusterOverview?.pods?.running || 0,
    podsFailed: reportData.clusterOverview?.pods?.failed || 0,
    healthcheckStatus: reportData.healthcheck?.hasErrors ? 'Critical' : 'Healthy'
  }
  
  // 3. Bedrock Agent를 사용하여 보고서 내용 생성
  console.log('Generating report content using Bedrock Agent...')
  let htmlContent
  
  // Bedrock Agent ID 확인
  const bedrockAgentId = process.env.BEDROCK_REPORT_AGENT_ID
  const bedrockAliasId = process.env.BEDROCK_REPORT_AGENT_ALIAS_ID
  
  if (bedrockAgentId && bedrockAliasId) {
    console.log(`Using Bedrock Agent: ${bedrockAgentId} (alias: ${bedrockAliasId})`)
    try {
      const aiGeneratedContent = await bedrockReportService.generateReportContent({
        reportType,
        reportData
      })
      console.log('AI-generated content received from Bedrock Agent')
      htmlContent = wrapAIContentInHTML(aiGeneratedContent, reportData, reportType)
    } catch (error) {
      console.error('Error generating content with Bedrock Agent, falling back to template:', error.message)
      console.error('Error details:', error)
      htmlContent = generateHTMLTemplate(reportData, reportType)
    }
  } else {
    console.warn('Bedrock Agent ID or Alias ID not configured, using default template')
    console.warn(`BEDROCK_REPORT_AGENT_ID: ${bedrockAgentId ? 'set' : 'not set'}`)
    console.warn(`BEDROCK_REPORT_AGENT_ALIAS_ID: ${bedrockAliasId ? 'set' : 'not set'}`)
    htmlContent = generateHTMLTemplate(reportData, reportType)
  }
  console.log('Report content generated.')
  
  // 4. PDF 생성
  console.log('Generating PDF...')
  const pdfBuffer = await generatePDF(htmlContent)
  console.log('PDF generated successfully.')
  
  // 5. 전송
  console.log('Preparing to send reports...')
  const teamEmails = process.env.TEAM_EMAILS ? 
    process.env.TEAM_EMAILS.split(',').map(e => e.trim()) : 
    []
  console.log(`Team emails: ${teamEmails.length > 0 ? teamEmails.join(', ') : 'none'}`)
  
  // Slack 전송
  console.log('Sending report to Slack...')
  await sendReportToSlack(
    pdfBuffer,
    reportType,
    reportData.periodStart,
    reportData.periodEnd,
    summary
  )
  
  // SES 이메일 전송
  if (teamEmails.length > 0) {
    console.log('Sending report via SES...')
    try {
    await sendReportToSES(
      pdfBuffer,
      reportType,
      reportData.periodStart,
      reportData.periodEnd,
      summary,
      teamEmails
    )
    } catch (error) {
      console.error('SES 전송 실패했지만 보고서 생성은 완료:', error.message)
      // SES 실패해도 보고서 생성은 성공으로 처리
    }
  } else {
    console.log('팀 이메일이 설정되지 않아 SES 전송을 건너뜁니다.')
  }
  
  console.log(`${reportType} report generated and sent successfully`)
}

export default {
  generateReport
}

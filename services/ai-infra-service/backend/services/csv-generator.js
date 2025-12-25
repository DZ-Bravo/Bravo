import prometheusService from './prometheus.js'
import kubernetesService from './kubernetes.js'

// UTF-8 BOM 추가 (Excel 호환성)
const BOM = '\ufeff'

// 노드 메트릭 CSV 생성
async function generateNodeMetricsCSV(nodeName, startTime, endTime) {
  const metrics = await prometheusService.getNodeMetrics(nodeName, startTime, endTime)
  
  const headers = [
    '시간',
    '노드명',
    'IP',
    'CPU 사용률(%)',
    '메모리 사용률(%)'
  ]
  
  const rows = []
  
  // CPU 데이터 처리
  if (metrics.cpu && metrics.cpu.length > 0) {
    metrics.cpu.forEach(cpuSeries => {
      const nodeNameFromMetric = cpuSeries.metric?.instance || nodeName || 'unknown'
      cpuSeries.values?.forEach(([timestamp, value]) => {
        rows.push({
          timestamp: new Date(parseInt(timestamp) * 1000).toISOString(),
          nodeName: nodeNameFromMetric,
          cpu: parseFloat(value).toFixed(2),
          memory: '0' // 메모리 데이터와 병합 필요
        })
      })
    })
  }
  
  // Memory 데이터와 병합
  if (metrics.memory && metrics.memory.length > 0) {
    metrics.memory.forEach(memSeries => {
      memSeries.values?.forEach(([timestamp, value]) => {
        const row = rows.find(r => 
          Math.abs(new Date(r.timestamp).getTime() - parseInt(timestamp) * 1000) < 1000
        )
        if (row) {
          row.memory = parseFloat(value).toFixed(2)
        }
      })
    })
  }
  
  // CSV 생성
  const csvRows = rows.map(row => [
    row.timestamp,
    row.nodeName,
    '', // IP는 별도 조회 필요
    row.cpu,
    row.memory
  ])
  
  const csvContent = [
    BOM,
    headers.join(','),
    ...csvRows.map(row => row.join(','))
  ].join('\n')
  
  return csvContent
}

// Pod 메트릭 CSV 생성
async function generatePodMetricsCSV({ namespace, node, start, end }) {
  // TODO: Pod 메트릭 데이터 수집 및 CSV 생성
  const headers = [
    '시간',
    'Pod명',
    '네임스페이스',
    '노드',
    '상태',
    'CPU 사용률(%)',
    '메모리 사용률(%)'
  ]
  
  // 실제 구현 필요
  return BOM + headers.join(',') + '\n'
}

// 서비스 메트릭 CSV 생성
async function generateServiceMetricsCSV(start, end) {
  // TODO: 서비스 메트릭 데이터 수집 및 CSV 생성
  const headers = [
    '시간',
    '서비스명',
    '네임스페이스',
    '평균 응답시간(ms)',
    '5xx 에러율(%)',
    '요청 수(RPS)'
  ]
  
  // 실제 구현 필요
  return BOM + headers.join(',') + '\n'
}

// 전체 메트릭 CSV 생성
async function generateAllMetricsCSV(start, end) {
  // TODO: 노드, Pod, 서비스 메트릭 통합 CSV 생성
  return BOM + '통합 메트릭 CSV\n'
}

export default {
  generateNodeMetricsCSV,
  generatePodMetricsCSV,
  generateServiceMetricsCSV,
  generateAllMetricsCSV
}



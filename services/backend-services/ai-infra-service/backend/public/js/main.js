// 전역 변수
let cpuChart, memoryChart, errorChart
let containerCpuChart, containerMemoryChart
let podCpuChart, podMemoryChart
let errorLogCountChart

let selectedNode = ''

// API 베이스 경로
const API_BASE = window.location.origin + '/api/monitoring'

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  initializeCharts()
  loadInitialData()
  setupEventListeners()
  setupNavigation()
  
  // 주기적 데이터 업데이트 (30초마다)
  setInterval(() => {
    updateAllMetrics()
  }, 30000)
})

// Top 5 토글 설정
function setupTop5Toggles() {
  const toggles = document.querySelectorAll('.top5-toggle')
  toggles.forEach(toggle => {
    toggle.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      const targetId = this.getAttribute('data-target')
      const container = document.getElementById(targetId)
      if (container) {
        const items = container.querySelector('.top-list-items')
        const isCollapsed = container.classList.contains('collapsed')
        
        if (isCollapsed) {
          // 펼치기
          container.classList.remove('collapsed')
          if (items) {
            items.style.display = 'block'
          }
        } else {
          // 접기
          container.classList.add('collapsed')
          if (items) {
            items.style.display = 'none'
          }
        }
      }
    })
  })
}

// 네비게이션 설정
function setupNavigation() {
  const navLinks = document.querySelectorAll('.nav-link')
  const sections = document.querySelectorAll('section[id], .filter-section[id]')
  
  // 네비게이션 링크 클릭 이벤트
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault()
      const targetId = link.getAttribute('href').substring(1)
      const targetSection = document.getElementById(targetId)
      
      if (targetSection) {
        const offsetTop = targetSection.offsetTop - 20
        window.scrollTo({
          top: offsetTop,
          behavior: 'smooth'
        })
      }
    })
  })
  
  // 스크롤 시 활성 섹션 하이라이트
  window.addEventListener('scroll', () => {
    let current = ''
    
    sections.forEach(section => {
      const sectionTop = section.offsetTop - 100
      const sectionHeight = section.clientHeight
      if (window.pageYOffset >= sectionTop && window.pageYOffset < sectionTop + sectionHeight) {
        current = section.getAttribute('id')
      }
    })
    
    navLinks.forEach(link => {
      link.classList.remove('active')
      if (link.getAttribute('href').substring(1) === current) {
        link.classList.add('active')
      }
    })
  })
}

// 차트 초기화
function initializeCharts() {
  // CPU 차트 (리소스 사용률)
  const cpuCtx = document.getElementById('cpuChart').getContext('2d')
  cpuChart = new Chart(cpuCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'CPU 사용률 (%)',
        data: [],
        borderColor: 'rgb(52, 152, 219)',
        backgroundColor: 'rgba(52, 152, 219, 0.1)',
        tension: 0.4
      }, {
        label: '경고 임계치',
        data: [],
        borderColor: 'rgb(255, 193, 7)',
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0
      }, {
        label: '위험 임계치',
        data: [],
        borderColor: 'rgb(220, 53, 69)',
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: function(value) {
              return value + '%'
            }
          }
        }
      }
    }
  })
  
  // 메모리 차트 (리소스 사용률)
  const memoryCtx = document.getElementById('memoryChart').getContext('2d')
  memoryChart = new Chart(memoryCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: '메모리 사용률 (%)',
        data: [],
        borderColor: 'rgb(155, 89, 182)',
        backgroundColor: 'rgba(155, 89, 182, 0.1)',
        tension: 0.4
      }, {
        label: '경고 임계치',
        data: [],
        borderColor: 'rgb(255, 193, 7)',
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0
      }, {
        label: '위험 임계치',
        data: [],
        borderColor: 'rgb(220, 53, 69)',
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: function(value) {
              return value + '%'
            }
          }
        }
      }
    }
  })
  
  // Container CPU 차트
  const containerCpuCtx = document.getElementById('containerCpuChart').getContext('2d')
  containerCpuChart = new Chart(containerCpuCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: []
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: function(value) {
              return value + '%'
            }
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            generateLabels: function(chart) {
              const original = Chart.defaults.plugins.legend.labels.generateLabels
              const labels = original.call(this, chart)
              // 임계치만 범례에 표시
              return labels.filter(label => 
                label.text === '경고 임계치' || label.text === '위험 임계치'
              )
            }
          }
        }
      }
    }
  })
  
  // Container Memory 차트
  const containerMemoryCtx = document.getElementById('containerMemoryChart').getContext('2d')
  containerMemoryChart = new Chart(containerMemoryCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: []
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: function(value) {
              return value + '%'
            }
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            generateLabels: function(chart) {
              const original = Chart.defaults.plugins.legend.labels.generateLabels
              const labels = original.call(this, chart)
              // 임계치만 범례에 표시
              return labels.filter(label => 
                label.text === '경고 임계치' || label.text === '위험 임계치'
              )
            }
          }
        }
      }
    }
  })
  
  // Pod CPU 차트
  const podCpuCtx = document.getElementById('podCpuChart').getContext('2d')
  podCpuChart = new Chart(podCpuCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: []
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: function(value) {
              return value + '%'
            }
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            generateLabels: function(chart) {
              const original = Chart.defaults.plugins.legend.labels.generateLabels
              const labels = original.call(this, chart)
              // 임계치만 범례에 표시
              return labels.filter(label => 
                label.text === '경고 임계치' || label.text === '위험 임계치'
              )
            }
          }
        }
      }
    }
  })
  
  // Pod Memory 차트
  const podMemoryCtx = document.getElementById('podMemoryChart').getContext('2d')
  podMemoryChart = new Chart(podMemoryCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: []
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: function(value) {
              return value + '%'
            }
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            generateLabels: function(chart) {
              const original = Chart.defaults.plugins.legend.labels.generateLabels
              const labels = original.call(this, chart)
              // 임계치만 범례에 표시
              return labels.filter(label => 
                label.text === '경고 임계치' || label.text === '위험 임계치'
              )
            }
          }
        }
      }
    }
  })
  
  // 에러 차트
  const errorCtx = document.getElementById('errorChart').getContext('2d')
  
  // 데이터가 모두 0일 때도 차트를 렌더링하기 위한 플러그인
  const emptyDataPlugin = {
    id: 'emptyDataPlugin',
    beforeDraw: (chart) => {
      const dataset = chart.data.datasets[0]
      if (dataset && dataset.data) {
        const hasData = dataset.data.some(value => value > 0)
        if (!hasData && chart.chartArea) {
          const ctx = chart.ctx
          ctx.save()
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.font = '14px Arial'
          ctx.fillStyle = '#999'
          const centerX = (chart.chartArea.left + chart.chartArea.right) / 2
          const centerY = (chart.chartArea.top + chart.chartArea.bottom) / 2
          ctx.fillText('에러 데이터 없음', centerX, centerY)
          ctx.restore()
        }
      }
    }
  }
  
  errorChart = new Chart(errorCtx, {
    type: 'pie',
    data: {
      labels: ['HAProxy', 'Istio Gateway', 'Application', 'Downstream'],
      datasets: [{
        data: [0, 0, 0, 0],
        backgroundColor: ['#f0ad4e', '#5bc0de', '#d9534f', '#292b2c'],
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        tooltip: {
          enabled: true
        }
      },
      animation: {
        animateRotate: true,
        animateScale: false
      }
    },
    plugins: [emptyDataPlugin]
  })
  
  // 에러 로그 수 차트
  const errorLogCountCtx = document.getElementById('errorLogCountChart').getContext('2d')
  errorLogCountChart = new Chart(errorLogCountCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: '에러 로그 수',
        data: [],
        borderColor: 'rgb(231, 76, 60)',
        backgroundColor: 'rgba(231, 76, 60, 0.1)',
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  })
}

// 초기 데이터 로드
async function loadInitialData() {
  await Promise.all([
    loadNodes(),
    loadClusterOverview(),
    loadErrorBreakdown(),
    loadRecentErrors(),
    loadExternalLinks()
  ])
  
  updateAllMetrics()
}

// 이벤트 리스너 설정
function setupEventListeners() {
  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadInitialData()
  })
  
  document.getElementById('nodeSelect').addEventListener('change', (e) => {
    selectedNode = e.target.value
    updateAllMetrics()
  })
  
  document.getElementById('analyzeBtn').addEventListener('click', runAIAnalysis)
  document.getElementById('exportCSVBtn').addEventListener('click', exportMetricsToCSV)
  
  // Top 5 토글 이벤트 리스너
  setupTop5Toggles()
  
  // 맨 위로 버튼 이벤트 리스너
  const scrollToTopBtn = document.getElementById('scrollToTopBtn')
  if (scrollToTopBtn) {
    scrollToTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      })
    })
  }
}

// 노드 목록 로드
async function loadNodes() {
  try {
    const response = await fetch(`${API_BASE}/metrics/nodes`)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const nodes = await response.json()
    const select = document.getElementById('nodeSelect')
    select.innerHTML = '<option value="">전체</option>'
    
    nodes.forEach(node => {
      const option = document.createElement('option')
      option.value = node.name
      // IP 주소에서 마지막 옥텟 추출 (예: 192.168.0.244 -> 244)
      const ipLastOctet = node.ip ? node.ip.split('.').pop() : ''
      option.textContent = `${node.name}(${ipLastOctet})`
      select.appendChild(option)
    })
  } catch (error) {
    console.error('Error loading nodes:', error)
  }
}

// 클러스터 개요 로드
async function loadClusterOverview() {
  try {
    const response = await fetch(`${API_BASE}/metrics/cluster/overview`)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const overview = await response.json()
    document.getElementById('nodeTotal').textContent = overview.nodes?.total || 0
    document.getElementById('nodeReady').textContent = overview.nodes?.ready || 0
    document.getElementById('podTotal').textContent = overview.pods?.total || 0
    document.getElementById('podRunning').textContent = overview.pods?.running || 0
  } catch (error) {
    console.error('Error loading cluster overview:', error)
  }
}

// 5XX 에러 분류 로드
async function loadErrorBreakdown() {
  try {
    const end = new Date()
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
    
    const response = await fetch(`${API_BASE}/errors/5xx?start=${start.toISOString()}&end=${end.toISOString()}`)
    if (!response.ok) {
      console.warn('Error breakdown API failed:', response.status)
      // API 실패 시에도 차트를 0으로 설정하여 표시
      if (errorChart) {
        errorChart.data.datasets[0].data = [0, 0, 0, 0]
        errorChart.update()
      }
      const errorCountEl = document.getElementById('errorCount')
      if (errorCountEl) errorCountEl.textContent = '0'
      return
    }
    
    const breakdown = await response.json()
    
    // breakdown 객체가 존재하면 데이터를 사용, 없으면 0으로 설정
    // 항상 차트를 업데이트하여 파이 그래프가 항상 표시되도록 함
    if (errorChart) {
      errorChart.data.datasets[0].data = [
        (breakdown?.haproxy?.count ?? 0) || 0,
        (breakdown?.gateway?.count ?? 0) || 0,
        (breakdown?.application?.count ?? 0) || 0,
        (breakdown?.downstream?.count ?? 0) || 0
      ]
      errorChart.update()
    }
    
    // 총 에러 수 업데이트
    const totalErrors = breakdown?.total ?? 0
    const errorCountEl = document.getElementById('errorCount')
    if (errorCountEl) {
      errorCountEl.textContent = totalErrors > 0 ? totalErrors.toFixed(2) : '0'
    }
  } catch (error) {
    console.error('Error loading error breakdown:', error)
    // 에러 발생 시에도 차트를 0으로 설정하여 표시
    if (errorChart) {
      errorChart.data.datasets[0].data = [0, 0, 0, 0]
      errorChart.update()
    }
    const errorCountEl = document.getElementById('errorCount')
    if (errorCountEl) errorCountEl.textContent = '0'
  }
}

// 최근 에러 로드
async function loadRecentErrors() {
  try {
    const response = await fetch(`${API_BASE}/errors/recent?limit=10`)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const errors = await response.json()
    const errorList = document.getElementById('errorList')
    errorList.innerHTML = ''
    
    if (errors && errors.length > 0) {
      errors.forEach(error => {
        const item = document.createElement('div')
        item.className = 'error-item'
        item.innerHTML = `
          <strong>${error.service || 'Unknown'}</strong>
          <p>${error.message || 'No message'}</p>
          <small>${new Date(error.timestamp).toLocaleString()}</small>
        `
        errorList.appendChild(item)
      })
    } else {
      errorList.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">최근 에러가 없습니다.</p>'
    }
  } catch (error) {
    console.error('Error loading recent errors:', error)
  }
}

// 외부 링크 로드
async function loadExternalLinks() {
  try {
    // NodePort로 직접 접근 (더 안정적)
    document.getElementById('grafanaLink').href = 'http://192.168.0.244:32000'
    document.getElementById('kialiLink').href = 'http://192.168.0.244:32755/kiali'
    // HAProxy Stats는 클러스터 외부이므로 직접 IP로 접근
    document.getElementById('haproxyStatsLink').href = 'http://192.168.0.244:8404/stats'
  } catch (error) {
    console.error('Error loading external links:', error)
  }
}

// 모든 메트릭 업데이트
async function updateAllMetrics() {
  const node = document.getElementById('nodeSelect').value
  const end = new Date()
  const start = new Date(end.getTime() - 1 * 60 * 60 * 1000) // 1시간 전
  
  await Promise.all([
    updateResourceUsage(node, start, end),
    updateContainerCPUMetrics(node, start, end),
    updateContainerMemoryMetrics(node, start, end),
    updatePodCPUMetrics(node, start, end),
    updatePodMemoryMetrics(node, start, end),
    updateErrorLogs(start, end),
    updateHealthcheckStatus()
  ])
}

// 리소스 사용률 업데이트
async function updateResourceUsage(node, start, end) {
  try {
    const nodeParam = node ? `&node=${node}` : ''
    const response = await fetch(`${API_BASE}/metrics/resource-usage?start=${start.toISOString()}&end=${end.toISOString()}${nodeParam}`)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const data = await response.json()
    
    // CPU 차트 업데이트
    if (data.cpu && data.cpu[0] && data.cpu[0].values) {
      const values = data.cpu[0].values
      const labels = values.map(v => new Date(v[0] * 1000).toLocaleTimeString())
      const cpuData = values.map(v => parseFloat(v[1]))
      
      cpuChart.data.labels = labels.slice(-20) // 최근 20개만
      cpuChart.data.datasets[0].data = cpuData.slice(-20)
      cpuChart.data.datasets[1].data = new Array(cpuData.slice(-20).length).fill(70) // 경고
      cpuChart.data.datasets[2].data = new Array(cpuData.slice(-20).length).fill(85) // 위험
      cpuChart.update()
    }
    
    // Memory 차트 업데이트
    if (data.memory && data.memory[0] && data.memory[0].values) {
      const values = data.memory[0].values
      const labels = values.map(v => new Date(v[0] * 1000).toLocaleTimeString())
      const memoryData = values.map(v => parseFloat(v[1]))
      
      memoryChart.data.labels = labels.slice(-20)
      memoryChart.data.datasets[0].data = memoryData.slice(-20)
      memoryChart.data.datasets[1].data = new Array(memoryData.slice(-20).length).fill(75) // 경고
      memoryChart.data.datasets[2].data = new Array(memoryData.slice(-20).length).fill(90) // 위험
      memoryChart.update()
    }
  } catch (error) {
    console.error('Error updating resource usage:', error)
  }
}

// 반응형 Y축 최대값 계산 함수
function calculateYAxisMax(maxUsage) {
  if (maxUsage < 10) return 10
  if (maxUsage < 20) return 20
  if (maxUsage < 40) return 40
  if (maxUsage < 60) return 60
  if (maxUsage < 80) return 80
  return 100
}

// Container CPU 메트릭 업데이트
async function updateContainerCPUMetrics(node, start, end) {
  try {
    const nodeParam = node ? `&node=${node}` : ''
    const response = await fetch(`${API_BASE}/metrics/containers/cpu?start=${start.toISOString()}&end=${end.toISOString()}${nodeParam}`)
    if (!response.ok) {
      console.warn('Container CPU metrics API failed:', response.status)
      return
    }
    
    const containers = await response.json()
    if (!containers || containers.length === 0) {
      console.log('No container CPU metrics data')
      return
    }
    
    // 차트 데이터 준비
    const datasets = []
    const colors = generateColors(containers.length)
    const now = new Date().toLocaleTimeString()
    
    // 컨테이너별 색상 매핑 저장 (리스트 표시용)
    const containerColorMap = new Map()
    
    // 최대값 계산
    let maxUsage = 0
    
    containers.slice(0, 10).forEach((container, index) => { // 최대 10개만 표시
      if (container.data && container.data.length > 0) {
        // 데이터가 있으면 사용, 없으면 현재 시간과 0값
        const labels = container.data.map(v => new Date(v[0] * 1000).toLocaleTimeString())
        const values = container.data.map(v => parseFloat(v[1]))
        
        // 최대값 추적
        const containerMax = Math.max(...values)
        if (containerMax > maxUsage) maxUsage = containerMax
        
        if (datasets.length === 0) {
          containerCpuChart.data.labels = labels.length > 0 ? labels.slice(-20) : [now]
        }
        
        const color = colors[index]
        const containerKey = `${container.namespace}/${container.pod}/${container.name}`
        containerColorMap.set(containerKey, color)
        
        datasets.push({
          label: containerKey,
          data: values.length > 0 ? values.slice(-20) : [0],
          borderColor: color,
          backgroundColor: color + '40',
          tension: 0.4
        })
      }
    })
    
    if (datasets.length > 0) {
      // 반응형 Y축 설정
      const yAxisMax = calculateYAxisMax(maxUsage)
      containerCpuChart.options.scales.y.max = yAxisMax
      
      // 임계치 데이터셋 추가 (CPU: 70% 경고, 85% 위험)
      const labels = containerCpuChart.data.labels
      const warningThreshold = {
        label: '경고 임계치',
        data: labels.map(() => 70),
        borderColor: 'rgb(255, 193, 7)',
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0,
        borderWidth: 2,
        hidden: maxUsage < 70 // 70% 미만이면 숨김
      }
      const criticalThreshold = {
        label: '위험 임계치',
        data: labels.map(() => 85),
        borderColor: 'rgb(220, 53, 69)',
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0,
        borderWidth: 2,
        hidden: maxUsage < 85 // 85% 미만이면 숨김
      }
      
      containerCpuChart.data.datasets = [warningThreshold, criticalThreshold, ...datasets]
      containerCpuChart.update()
      updateContainerCPUList(containers, containerColorMap)
    }
  } catch (error) {
    console.error('Error updating container CPU metrics:', error)
  }
}

// Container Memory 메트릭 업데이트
async function updateContainerMemoryMetrics(node, start, end) {
  try {
    const nodeParam = node ? `&node=${node}` : ''
    const response = await fetch(`${API_BASE}/metrics/containers/memory?start=${start.toISOString()}&end=${end.toISOString()}${nodeParam}`)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const containers = await response.json()
    if (!containers || containers.length === 0) return
    
    // 차트 데이터 준비
    const datasets = []
    const colors = generateColors(10) // 상위 10개만 표시하므로 10개 색상만 필요
    
    // 컨테이너별 색상 매핑 저장 (리스트 표시용) - 그래프에 표시된 상위 10개만
    const containerColorMap = new Map()
    
    // 사용량 기준으로 정렬하여 상위 10개만 선택
    const sortedContainers = containers
      .filter(c => c.data && c.data.length > 0)
      .map(c => {
        const values = c.data.map(v => parseFloat(v[1]))
        const latestValue = values[values.length - 1] || 0
        return { ...c, latestValue }
      })
      .sort((a, b) => b.latestValue - a.latestValue)
      .slice(0, 10)
    
    // 최대값 계산
    let maxUsage = 0
    
    sortedContainers.forEach((container, index) => {
      const labels = container.data.map(v => new Date(v[0] * 1000).toLocaleTimeString())
      // 백엔드에서 이미 사용률(%)로 변환되어 오므로 그대로 사용
      const values = container.data.map(v => parseFloat(v[1]))
      
      // 최대값 추적
      const containerMax = Math.max(...values)
      if (containerMax > maxUsage) maxUsage = containerMax
      
      if (datasets.length === 0) {
        containerMemoryChart.data.labels = labels.slice(-20)
      }
      
      const color = colors[index]
      const containerKey = `${container.namespace}/${container.pod}/${container.name}`
      containerColorMap.set(containerKey, color) // 그래프에 표시된 상위 10개만 색상 매핑
      
      datasets.push({
        label: containerKey,
        data: values.slice(-20),
        borderColor: color,
        backgroundColor: color + '40',
        tension: 0.4
      })
    })
    
    // 반응형 Y축 설정
    const yAxisMax = calculateYAxisMax(maxUsage)
    containerMemoryChart.options.scales.y.max = yAxisMax
    
    // 임계치 데이터셋 추가 (Memory: 70% 경고, 90% 위험)
    const labels = containerMemoryChart.data.labels
    const warningThreshold = {
      label: '경고 임계치',
      data: labels.map(() => 70),
      borderColor: 'rgb(255, 193, 7)',
      borderDash: [5, 5],
      fill: false,
      pointRadius: 0,
      borderWidth: 2,
      hidden: maxUsage < 70 // 70% 미만이면 숨김
    }
    const criticalThreshold = {
      label: '위험 임계치',
      data: labels.map(() => 90),
      borderColor: 'rgb(220, 53, 69)',
      borderDash: [5, 5],
      fill: false,
      pointRadius: 0,
      borderWidth: 2,
      hidden: maxUsage < 90 // 90% 미만이면 숨김
    }
    
    containerMemoryChart.data.datasets = [warningThreshold, criticalThreshold, ...datasets]
    containerMemoryChart.update()
    
    // 리스트 업데이트
    updateContainerMemoryList(containers, containerColorMap)
  } catch (error) {
    console.error('Error updating container memory metrics:', error)
  }
}

// Pod CPU 메트릭 업데이트
async function updatePodCPUMetrics(node, start, end) {
  try {
    const nodeParam = node ? `&node=${node}` : ''
    const response = await fetch(`${API_BASE}/metrics/pods/cpu?start=${start.toISOString()}&end=${end.toISOString()}${nodeParam}`)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const pods = await response.json()
    if (!pods || pods.length === 0) return
    
    // 차트 데이터 준비
    const datasets = []
    const colors = generateColors(10) // 상위 10개만 표시하므로 10개 색상만 필요
    
    // Pod별 색상 매핑 저장 (리스트 표시용) - 그래프에 표시된 상위 10개만
    const podColorMap = new Map()
    
    // 사용량 기준으로 정렬하여 상위 10개만 선택
    const sortedPods = pods
      .filter(p => p.data && p.data.length > 0)
      .map(p => {
        const values = p.data.map(v => parseFloat(v[1]))
        const latestValue = values[values.length - 1] || 0
        return { ...p, latestValue }
      })
      .sort((a, b) => b.latestValue - a.latestValue)
      .slice(0, 10)
    
    // 최대값 계산
    let maxUsage = 0
    
    sortedPods.forEach((pod, index) => {
      const labels = pod.data.map(v => new Date(v[0] * 1000).toLocaleTimeString())
      const values = pod.data.map(v => parseFloat(v[1]))
      
      // 최대값 추적
      const podMax = Math.max(...values)
      if (podMax > maxUsage) maxUsage = podMax
      
      if (datasets.length === 0) {
        podCpuChart.data.labels = labels.slice(-20)
      }
      
      const color = colors[index]
      const podKey = `${pod.namespace}/${pod.name}`
      podColorMap.set(podKey, color) // 그래프에 표시된 상위 10개만 색상 매핑
      
      datasets.push({
        label: podKey,
        data: values.slice(-20),
        borderColor: color,
        backgroundColor: color + '40',
        tension: 0.4
      })
    })
    
    // 반응형 Y축 설정
    const yAxisMax = calculateYAxisMax(maxUsage)
    podCpuChart.options.scales.y.max = yAxisMax
    
    // 임계치 데이터셋 추가 (CPU: 70% 경고, 85% 위험)
    const labels = podCpuChart.data.labels
    const warningThreshold = {
      label: '경고 임계치',
      data: labels.map(() => 70),
      borderColor: 'rgb(255, 193, 7)',
      borderDash: [5, 5],
      fill: false,
      pointRadius: 0,
      borderWidth: 2,
      hidden: maxUsage < 70 // 70% 미만이면 숨김
    }
    const criticalThreshold = {
      label: '위험 임계치',
      data: labels.map(() => 85),
      borderColor: 'rgb(220, 53, 69)',
      borderDash: [5, 5],
      fill: false,
      pointRadius: 0,
      borderWidth: 2,
      hidden: maxUsage < 85 // 85% 미만이면 숨김
    }
    
    podCpuChart.data.datasets = [warningThreshold, criticalThreshold, ...datasets]
    podCpuChart.update()
    
    // 리스트 업데이트 (정렬된 전체 pods 사용, colorMap은 상위 10개만 포함)
    updatePodCPUList(pods, podColorMap)
    
    // Top 5 업데이트
    updatePodCPUTop5(pods)
  } catch (error) {
    console.error('Error updating pod CPU metrics:', error)
  }
}

// Pod Memory 메트릭 업데이트
async function updatePodMemoryMetrics(node, start, end) {
  try {
    const nodeParam = node ? `&node=${node}` : ''
    const response = await fetch(`${API_BASE}/metrics/pods/memory?start=${start.toISOString()}&end=${end.toISOString()}${nodeParam}`)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const pods = await response.json()
    if (!pods || pods.length === 0) return
    
    // 차트 데이터 준비
    const datasets = []
    const colors = generateColors(10) // 상위 10개만 표시하므로 10개 색상만 필요
    
    // Pod별 색상 매핑 저장 (리스트 표시용) - 그래프에 표시된 상위 10개만
    const podColorMap = new Map()
    
    // 사용량 기준으로 정렬하여 상위 10개만 선택
    const sortedPods = pods
      .filter(p => p.data && p.data.length > 0)
      .map(p => {
        const values = p.data.map(v => parseFloat(v[1]))
        const latestValue = values[values.length - 1] || 0
        return { ...p, latestValue }
      })
      .sort((a, b) => b.latestValue - a.latestValue)
      .slice(0, 10)
    
    // 최대값 계산
    let maxUsage = 0
    
    sortedPods.forEach((pod, index) => {
      const labels = pod.data.map(v => new Date(v[0] * 1000).toLocaleTimeString())
      // 백엔드에서 이미 사용률(%)로 변환되어 오므로 그대로 사용
      const values = pod.data.map(v => parseFloat(v[1]))
      
      // 최대값 추적
      const podMax = Math.max(...values)
      if (podMax > maxUsage) maxUsage = podMax
      
      if (datasets.length === 0) {
        podMemoryChart.data.labels = labels.slice(-20)
      }
      
      const color = colors[index]
      const podKey = `${pod.namespace}/${pod.name}`
      podColorMap.set(podKey, color) // 그래프에 표시된 상위 10개만 색상 매핑
      
      datasets.push({
        label: podKey,
        data: values.slice(-20),
        borderColor: color,
        backgroundColor: color + '40',
        tension: 0.4
      })
    })
    
    // 반응형 Y축 설정
    const yAxisMax = calculateYAxisMax(maxUsage)
    podMemoryChart.options.scales.y.max = yAxisMax
    
    // 임계치 데이터셋 추가 (Memory: 70% 경고, 90% 위험)
    const labels = podMemoryChart.data.labels
    const warningThreshold = {
      label: '경고 임계치',
      data: labels.map(() => 70),
      borderColor: 'rgb(255, 193, 7)',
      borderDash: [5, 5],
      fill: false,
      pointRadius: 0,
      borderWidth: 2,
      hidden: maxUsage < 70 // 70% 미만이면 숨김
    }
    const criticalThreshold = {
      label: '위험 임계치',
      data: labels.map(() => 90),
      borderColor: 'rgb(220, 53, 69)',
      borderDash: [5, 5],
      fill: false,
      pointRadius: 0,
      borderWidth: 2,
      hidden: maxUsage < 90 // 90% 미만이면 숨김
    }
    
    podMemoryChart.data.datasets = [warningThreshold, criticalThreshold, ...datasets]
    podMemoryChart.update()
    
    // 리스트 업데이트 (정렬된 전체 pods 사용, colorMap은 상위 10개만 포함)
    updatePodMemoryList(pods, podColorMap)
    
    // Top 5 업데이트
    updatePodMemoryTop5(pods)
  } catch (error) {
    console.error('Error updating pod memory metrics:', error)
  }
}

// Container CPU 리스트 업데이트
function updateContainerCPUList(containers, colorMap) {
  const list = document.getElementById('containerCpuList')
  if (!list) return
  
  list.innerHTML = ''
  
  if (!containers || containers.length === 0) {
    list.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">컨테이너 메트릭 데이터가 없습니다.</p>'
    return
  }
  
  containers.forEach(container => {
    const lastValue = container.data && container.data.length > 0 
      ? parseFloat(container.data[container.data.length - 1][1]) 
      : 0
    
    const containerKey = `${container.namespace}/${container.pod}/${container.name}`
    const color = colorMap ? colorMap.get(containerKey) || '#3498db' : '#3498db'
    
    const item = document.createElement('div')
    item.className = 'metric-item'
    item.style.borderLeftColor = color  // border-left 색상을 컨테이너 색상으로 설정
    item.innerHTML = `
      <span class="metric-item-name">
        <span class="color-indicator" style="background-color: ${color};"></span>
        ${container.namespace}/${container.pod}/${container.name}
      </span>
      <span class="metric-item-value ${lastValue > 70 ? (lastValue > 85 ? 'high' : 'medium') : ''}">${lastValue.toFixed(2)}%</span>
    `
    list.appendChild(item)
  })
}

// Container Memory 리스트 업데이트
function updateContainerMemoryList(containers, colorMap) {
  const list = document.getElementById('containerMemoryList')
  if (!list) return
  
  list.innerHTML = ''
  
  if (!containers || containers.length === 0) {
    list.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">컨테이너 메트릭 데이터가 없습니다.</p>'
    return
  }
  
  containers.forEach(container => {
    // 원본 bytes 값 사용 (usageBytesData) 또는 data의 값 사용 (limit이 없는 경우)
    const lastValueBytes = container.usageBytesData && container.usageBytesData.length > 0
      ? parseFloat(container.usageBytesData[container.usageBytesData.length - 1][1])
      : (container.data && container.data.length > 0 ? parseFloat(container.data[container.data.length - 1][1]) * (container.limitBytes || 1) / 100 : 0)
    const lastValue = lastValueBytes / 1024 / 1024 // bytes to MB
    
    const containerKey = `${container.namespace}/${container.pod}/${container.name}`
    const color = colorMap ? colorMap.get(containerKey) || '#3498db' : '#3498db'
    
    const item = document.createElement('div')
    item.className = 'metric-item'
    item.style.borderLeftColor = color  // border-left 색상을 컨테이너 색상으로 설정
    item.innerHTML = `
      <span class="metric-item-name">
        <span class="color-indicator" style="background-color: ${color};"></span>
        ${container.namespace}/${container.pod}/${container.name}
      </span>
      <span class="metric-item-value">${lastValue.toFixed(2)} MB</span>
    `
    list.appendChild(item)
  })
}

// Pod CPU 리스트 업데이트
function updatePodCPUList(pods, colorMap) {
  const list = document.getElementById('podCpuList')
  if (!list) return
  
  list.innerHTML = ''
  
  if (!pods || pods.length === 0) {
    list.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">Pod 메트릭 데이터가 없습니다.</p>'
    return
  }
  
  // 사용량 기준으로 정렬 (상위 항목이 먼저 오도록)
  const sortedPods = [...pods]
    .filter(p => p.data && p.data.length > 0)
    .map(p => {
      const values = p.data.map(v => parseFloat(v[1]))
      const latestValue = values[values.length - 1] || 0
      return { ...p, latestValue }
    })
    .sort((a, b) => b.latestValue - a.latestValue)
  
  sortedPods.forEach(pod => {
    const lastValue = pod.latestValue || 0
    const podKey = `${pod.namespace}/${pod.name}`
    // colorMap에 있으면 해당 색상, 없으면 기본 색상 (회색)
    const color = colorMap && colorMap.has(podKey) ? colorMap.get(podKey) : '#95a5a6'
    
    const item = document.createElement('div')
    item.className = 'metric-item'
    item.style.borderLeftColor = color  // border-left 색상을 Pod 색상으로 설정
    item.innerHTML = `
      <span class="metric-item-name">
        <span class="color-indicator" style="background-color: ${color};"></span>
        ${pod.namespace}/${pod.name}
      </span>
      <span class="metric-item-value ${lastValue > 70 ? (lastValue > 85 ? 'high' : 'medium') : ''}">${lastValue.toFixed(2)}%</span>
    `
    list.appendChild(item)
  })
}

// Pod CPU Top 5 업데이트
function updatePodCPUTop5(pods) {
  const container = document.getElementById('podCpuTop5')
  const top5Container = container ? container.querySelector('.top-list-items') : null
  if (!top5Container) return
  
  top5Container.innerHTML = ''
  
  if (!pods || pods.length === 0) {
    top5Container.innerHTML = '<p style="text-align: center; color: #999; font-size: 12px; padding: 10px;">데이터 없음</p>'
    return
  }
  
  // CPU 사용량 기준으로 정렬
  const sortedPods = [...pods]
    .filter(pod => pod.data && pod.data.length > 0)
    .map(pod => ({
      ...pod,
      lastValue: parseFloat(pod.data[pod.data.length - 1][1])
    }))
    .sort((a, b) => b.lastValue - a.lastValue)
    .slice(0, 5)
  
  // 테이블 생성
  const table = document.createElement('table')
  table.className = 'top5-table'
  table.innerHTML = `
    <thead>
      <tr>
        <th>순위</th>
        <th>Pod 이름</th>
        <th>Namespace</th>
        <th>CPU 사용률</th>
      </tr>
    </thead>
    <tbody>
      ${sortedPods.map((pod, index) => `
        <tr>
          <td class="rank-cell">${index + 1}</td>
          <td class="name-cell">${pod.name}</td>
          <td class="namespace-cell">${pod.namespace}</td>
          <td class="value-cell">${pod.lastValue.toFixed(2)}%</td>
        </tr>
      `).join('')}
    </tbody>
  `
  top5Container.appendChild(table)
  
  // 기본적으로 접힌 상태로 설정
  if (container && !container.classList.contains('expanded')) {
    container.classList.add('collapsed')
    top5Container.style.display = 'none'
  }
}

// Pod Memory 리스트 업데이트
function updatePodMemoryList(pods, colorMap) {
  const list = document.getElementById('podMemoryList')
  if (!list) return
  
  list.innerHTML = ''
  
  if (!pods || pods.length === 0) {
    list.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">Pod 메트릭 데이터가 없습니다.</p>'
    return
  }
  
  // 사용량 기준으로 정렬 (상위 항목이 먼저 오도록)
  const sortedPods = [...pods]
    .filter(p => p.data && p.data.length > 0)
    .map(p => {
      // 원본 bytes 값 사용 (usageBytesData) 또는 data의 값 사용 (limit이 없는 경우)
      const lastValueBytes = p.usageBytesData && p.usageBytesData.length > 0
        ? parseFloat(p.usageBytesData[p.usageBytesData.length - 1][1])
        : (p.data && p.data.length > 0 ? parseFloat(p.data[p.data.length - 1][1]) * (p.limitBytes || 1) / 100 : 0)
      const lastValue = lastValueBytes / 1024 / 1024 // bytes to MB
      return { ...p, lastValue }
    })
    .sort((a, b) => b.lastValue - a.lastValue)
  
  sortedPods.forEach(pod => {
    const lastValue = pod.lastValue || 0
    const podKey = `${pod.namespace}/${pod.name}`
    // colorMap에 있으면 해당 색상, 없으면 기본 색상 (회색)
    const color = colorMap && colorMap.has(podKey) ? colorMap.get(podKey) : '#95a5a6'
    
    const item = document.createElement('div')
    item.className = 'metric-item'
    item.style.borderLeftColor = color  // border-left 색상을 Pod 색상으로 설정
    item.innerHTML = `
      <span class="metric-item-name">
        <span class="color-indicator" style="background-color: ${color};"></span>
        ${pod.namespace}/${pod.name}
      </span>
      <span class="metric-item-value">${lastValue.toFixed(2)} MB</span>
    `
    list.appendChild(item)
  })
}

// Pod Memory Top 5 업데이트
function updatePodMemoryTop5(pods) {
  const container = document.getElementById('podMemoryTop5')
  const top5Container = container ? container.querySelector('.top-list-items') : null
  if (!top5Container) return
  
  top5Container.innerHTML = ''
  
  if (!pods || pods.length === 0) {
    top5Container.innerHTML = '<p style="text-align: center; color: #999; font-size: 12px; padding: 10px;">데이터 없음</p>'
    return
  }
  
  // Memory 사용량 기준으로 정렬 (원본 bytes 값 사용)
  const sortedPods = [...pods]
    .filter(pod => pod.data && pod.data.length > 0)
    .map(pod => {
      const lastValueBytes = pod.usageBytesData && pod.usageBytesData.length > 0
        ? parseFloat(pod.usageBytesData[pod.usageBytesData.length - 1][1])
        : (pod.data && pod.data.length > 0 ? parseFloat(pod.data[pod.data.length - 1][1]) * (pod.limitBytes || 1) / 100 : 0)
      return {
        ...pod,
        lastValue: lastValueBytes / 1024 / 1024 // MB
      }
    })
    .sort((a, b) => b.lastValue - a.lastValue)
    .slice(0, 5)
  
  // 테이블 생성
  const table = document.createElement('table')
  table.className = 'top5-table'
  table.innerHTML = `
    <thead>
      <tr>
        <th>순위</th>
        <th>Pod 이름</th>
        <th>Namespace</th>
        <th>Memory 사용량</th>
      </tr>
    </thead>
    <tbody>
      ${sortedPods.map((pod, index) => `
        <tr>
          <td class="rank-cell">${index + 1}</td>
          <td class="name-cell">${pod.name}</td>
          <td class="namespace-cell">${pod.namespace}</td>
          <td class="value-cell">${pod.lastValue.toFixed(2)} MB</td>
        </tr>
      `).join('')}
    </tbody>
  `
  top5Container.appendChild(table)
  
  // 기본적으로 접힌 상태로 설정 (collapsed 클래스 추가)
  if (container && !container.classList.contains('expanded')) {
    container.classList.add('collapsed')
    top5Container.style.display = 'none'
  }
}

// 에러 로그 업데이트
async function updateErrorLogs(start, end) {
  try {
    // 시간별 에러 로그 수
    const countResponse = await fetch(`${API_BASE}/errors/log-count?start=${start.toISOString()}&end=${end.toISOString()}&source=app`)
    if (countResponse.ok) {
      const counts = await countResponse.json()
      
      if (counts && counts.length > 0) {
        const labels = counts.map(c => new Date(c[0]).toLocaleTimeString())
        const data = counts.map(c => c[1])
        
        errorLogCountChart.data.labels = labels.slice(-20)
        errorLogCountChart.data.datasets[0].data = data.slice(-20)
        errorLogCountChart.update()
      }
    }
    
    // Namespace/서비스별 최근 에러 로그
    const serviceErrorsResponse = await fetch(`${API_BASE}/errors/service-errors?start=${start.toISOString()}&end=${end.toISOString()}&limit=30`)
    if (serviceErrorsResponse.ok) {
      const serviceErrors = await serviceErrorsResponse.json()
      updateServiceErrorList('serviceErrorList', serviceErrors)
    }
    
    // Top N 에러 메시지
    const topErrorsResponse = await fetch(`${API_BASE}/errors/top-errors?start=${start.toISOString()}&end=${end.toISOString()}&topN=10`)
    if (topErrorsResponse.ok) {
      const topErrors = await topErrorsResponse.json()
      updateTopErrorMessagesList('topErrorMessagesList', topErrors)
    }
  } catch (error) {
    console.error('Error updating error logs:', error)
  }
}

// Namespace/서비스별 에러 로그 리스트 업데이트
function updateServiceErrorList(listId, logs) {
  const list = document.getElementById(listId)
  if (!list) return
  
  list.innerHTML = ''
  
  if (!logs || logs.length === 0) {
    list.innerHTML = '<p style="padding: 10px; text-align: center; color: #999; font-size: 12px;">에러 로그가 없습니다.</p>'
    return
  }
  
  logs.forEach(log => {
    const item = document.createElement('div')
    item.className = 'log-item'
    item.innerHTML = `
      <div class="log-item-header">
        <span class="log-item-namespace">${log.namespace || 'unknown'}</span>
        <span class="log-item-service">${log.service || 'unknown'}</span>
        <span class="log-item-time">${new Date(log.timestamp).toLocaleString()}</span>
      </div>
      <div class="log-item-message">${escapeHtml(log.message || 'No message')}</div>
      ${log.level ? `<div class="log-item-level level-${log.level.toLowerCase()}">${log.level}</div>` : ''}
    `
    list.appendChild(item)
  })
}

// Top N 에러 메시지 리스트 업데이트
function updateTopErrorMessagesList(listId, topErrors) {
  const list = document.getElementById(listId)
  if (!list) return
  
  list.innerHTML = ''
  
  if (!topErrors || topErrors.length === 0) {
    list.innerHTML = '<p style="padding: 10px; text-align: center; color: #999; font-size: 12px;">에러 메시지가 없습니다.</p>'
    return
  }
  
  topErrors.forEach((error, index) => {
    const item = document.createElement('div')
    item.className = 'log-item top-error-item'
    item.innerHTML = `
      <div class="top-error-rank">#${index + 1}</div>
      <div class="top-error-content">
        <div class="top-error-header">
          <span class="top-error-count">${error.count}회 발생</span>
          <span class="top-error-level level-${error.level ? error.level.toLowerCase() : 'error'}">${error.level || 'ERROR'}</span>
          <span class="top-error-time">최근: ${new Date(error.lastOccurred).toLocaleString()}</span>
        </div>
        <div class="top-error-message">${escapeHtml(error.message || 'No message')}</div>
      </div>
    `
    list.appendChild(item)
  })
}

// HTML 이스케이프 유틸리티
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// 헬스체크 상태 업데이트
async function updateHealthcheckStatus() {
  try {
    const response = await fetch(`${API_BASE}/healthcheck/status`)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const status = await response.json()
    const statusDiv = document.getElementById('healthcheckStatus')
    const errorsDiv = document.getElementById('healthcheckErrors')
    
    // 섹션에 에러 상태 클래스 추가/제거
    const section = document.getElementById('healthcheck')
    if (status.hasErrors && status.errors && status.errors.length > 0) {
      // 에러가 있을 때
      section.classList.add('has-errors')
      statusDiv.innerHTML = `<p style="color: #e74c3c; font-weight: bold;">⚠️ 헬스체크 오류가 발견되었습니다. (${status.errors.length}개 Pod)</p>`
      errorsDiv.style.display = 'block'
      errorsDiv.innerHTML = ''
      
      status.errors.forEach(errorGroup => {
        const groupDiv = document.createElement('div')
        groupDiv.className = 'healthcheck-error-group'
        groupDiv.innerHTML = `<h4>Pod: ${errorGroup.pod} (Node: ${errorGroup.node})</h4>`
        
        const errorsList = document.createElement('div')
        errorGroup.errors.forEach(error => {
          const item = document.createElement('div')
          item.className = 'healthcheck-error-item'
          item.innerHTML = `
            <div class="healthcheck-error-item-time">${error.timestamp}</div>
            <div class="healthcheck-error-item-message">${error.message}</div>
          `
          errorsList.appendChild(item)
        })
        
        groupDiv.appendChild(errorsList)
        errorsDiv.appendChild(groupDiv)
      })
    } else {
      // 정상일 때
      section.classList.remove('has-errors')
      statusDiv.innerHTML = `<p style="color: #27ae60; font-weight: bold;">✅ 모든 헬스체크가 정상입니다. (확인된 Pod: ${status.checkedPods || 0}개)</p>`
      errorsDiv.style.display = 'none'
    }
  } catch (error) {
    console.error('Error updating healthcheck status:', error)
    const statusDiv = document.getElementById('healthcheckStatus')
    statusDiv.innerHTML = `<p style="color: #e74c3c;">❌ 헬스체크 상태를 가져올 수 없습니다: ${error.message}</p>`
  }
}

// AI 분석 실행
async function runAIAnalysis() {
  const resultDiv = document.getElementById('aiAnalysisResult')
  resultDiv.innerHTML = '<p>분석 중...</p>'
  
  try {
    const response = await fetch(`${API_BASE}/ai/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        node: selectedNode,
        context: { selectedNode }
      })
    })
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const analysis = await response.json()
    resultDiv.innerHTML = `<pre>${analysis.analysis || '분석 결과가 없습니다.'}</pre>`
  } catch (error) {
    console.error('Error in AI analysis:', error)
    resultDiv.innerHTML = '<p style="color: red;">분석 중 오류가 발생했습니다.</p>'
  }
}

// CSV 내보내기 (종합 데이터)
async function exportMetricsToCSV() {
  const node = document.getElementById('nodeSelect').value
  const end = new Date()
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000) // 최근 24시간
  
  try {
    const nodeParam = node ? `&node=${node}` : ''
    const response = await fetch(`${API_BASE}/csv/metrics?start=${start.toISOString()}&end=${end.toISOString()}${nodeParam}`)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `monitoring-data-${node || 'cluster'}-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Error exporting CSV:', error)
    alert('CSV 내보내기 중 오류가 발생했습니다.')
  }
}

// 색상 생성 (차트용)
function generateColors(count) {
  const colors = [
    'rgb(52, 152, 219)', 'rgb(231, 76, 60)', 'rgb(46, 204, 113)', 
    'rgb(241, 196, 15)', 'rgb(155, 89, 182)', 'rgb(230, 126, 34)',
    'rgb(26, 188, 156)', 'rgb(236, 240, 241)', 'rgb(149, 165, 166)', 'rgb(52, 73, 94)'
  ]
  
  const result = []
  for (let i = 0; i < count; i++) {
    result.push(colors[i % colors.length])
  }
  return result
}

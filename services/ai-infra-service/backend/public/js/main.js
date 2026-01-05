// 전역 변수
let cpuChart, memoryChart, errorChart
let containerCpuChart, containerMemoryChart
let podCpuChart, podMemoryChart
let errorLogCountChart

let selectedNode = ''

// API 베이스 경로 - 현재 경로 기준으로 설정
const API_BASE = window.location.origin + (window.location.pathname.startsWith('/monitoring') ? '/monitoring/api/monitoring' : '/api/monitoring')

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  initializeCharts()
  setupLinks() // 링크 설정을 먼저 실행
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
  
  // 스크롤 시 활성 섹션 하이라이트 (throttling으로 성능 개선)
  let scrollTimeout = null
  window.addEventListener('scroll', () => {
    if (scrollTimeout) {
      return
    }
    
    scrollTimeout = setTimeout(() => {
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
      
      scrollTimeout = null
    }, 100) // 100ms마다 한 번만 실행
  })
}

// 차트 초기화
function initializeCharts() {
  // 존재하는 차트만 초기화
  // CPU 차트 (리소스 사용률) - 제거됨
  const cpuChartEl = document.getElementById('cpuChart')
  if (cpuChartEl) {
    const cpuCtx = cpuChartEl.getContext('2d')
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
  }
  
  // 메모리 차트 (리소스 사용률) - 제거됨
  const memoryChartEl = document.getElementById('memoryChart')
  if (memoryChartEl) {
    const memoryCtx = memoryChartEl.getContext('2d')
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
  }
  
  // Container CPU 차트 - 제거됨
  const containerCpuChartEl = document.getElementById('containerCpuChart')
  if (containerCpuChartEl) {
    const containerCpuCtx = containerCpuChartEl.getContext('2d')
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
  }
  
  // Container Memory 차트 - 제거됨
  const containerMemoryChartEl = document.getElementById('containerMemoryChart')
  if (containerMemoryChartEl) {
    const containerMemoryCtx = containerMemoryChartEl.getContext('2d')
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
  }
  
  // Pod CPU 차트 - 제거됨
  const podCpuChartEl = document.getElementById('podCpuChart')
  if (podCpuChartEl) {
    const podCpuCtx = podCpuChartEl.getContext('2d')
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
  }
  
  // Pod Memory 차트 - 제거됨
  const podMemoryChartEl = document.getElementById('podMemoryChart')
  if (podMemoryChartEl) {
    const podMemoryCtx = podMemoryChartEl.getContext('2d')
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
  }
  
  // 에러 차트 - 제거됨
  const errorChartEl = document.getElementById('errorChart')
  if (errorChartEl) {
    const errorCtx = errorChartEl.getContext('2d')
  
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
  }
  
  // 에러 로그 수 차트 - 제거됨
  const errorLogCountChartEl = document.getElementById('errorLogCountChart')
  if (errorLogCountChartEl) {
    const errorLogCountCtx = errorLogCountChartEl.getContext('2d')
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
  
  // Logs Error Trend 차트 초기화
  const logsErrorTrendChartEl = document.getElementById('logsErrorTrendChart')
  if (logsErrorTrendChartEl) {
    const logsErrorTrendCtx = logsErrorTrendChartEl.getContext('2d')
    window.logsErrorTrendChart = new Chart(logsErrorTrendCtx, {
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
            title: {
              display: true,
              text: 'Error Log Count'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Time'
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          title: {
            display: true,
            text: '서비스별 Error Log Count 추이'
          }
        }
      }
    })
  }
  
  // Overview 추이 차트 초기화
  const overviewTrendsChartEl = document.getElementById('overviewTrendsChart')
  if (overviewTrendsChartEl) {
    const overviewTrendsCtx = overviewTrendsChartEl.getContext('2d')
    window.overviewTrendsChart = new Chart(overviewTrendsCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'RPS',
          data: [],
          borderColor: 'rgb(52, 152, 219)',
          backgroundColor: 'rgba(52, 152, 219, 0.1)',
          tension: 0.4,
          yAxisID: 'y'
        }, {
          label: 'p95 Latency (ms)',
          data: [],
          borderColor: 'rgb(231, 76, 60)',
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          tension: 0.4,
          yAxisID: 'y1'
        }, {
          label: '5xx Error Rate (%)',
          data: [],
          borderColor: 'rgb(155, 89, 182)',
          backgroundColor: 'rgba(155, 89, 182, 0.1)',
          tension: 0.4,
          yAxisID: 'y1'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true,
            title: {
              display: true,
              text: 'RPS'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            beginAtZero: true,
            title: {
              display: true,
              text: 'Latency (ms) / Error Rate (%)'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    })
  }
}

// 초기 데이터 로드
async function loadInitialData() {
  try {
    // 핵심 데이터 먼저 로드
    await Promise.all([
      loadOverview(),
      loadServices(),
      loadPods(),
      loadAlerts()
    ])
    
    setupPodsTopNTabs()
    
    // 무거운 작업은 별도로 비동기 처리 (UI 블로킹 방지)
    setTimeout(() => {
      loadLogs().catch(err => console.error('Error loading logs:', err))
    }, 500)
    
    setTimeout(() => {
      loadTraces().catch(err => console.error('Error loading traces:', err))
    }, 1000)
  } catch (error) {
    console.error('Error loading initial data:', error)
  }
}

// 이벤트 리스너 설정
function setupEventListeners() {
  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    loadInitialData()
  })
  
  document.getElementById('nodeSelect')?.addEventListener('change', (e) => {
    selectedNode = e.target.value
    updateAllMetrics()
  })
  
  document.getElementById('analyzeBtn')?.addEventListener('click', runAIAnalysis)
  document.getElementById('exportCSVBtn')?.addEventListener('click', exportMetricsToCSV)
  
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
  
  // Services 필터
  document.getElementById('servicesNamespaceFilter')?.addEventListener('change', loadServices)
  document.getElementById('servicesSortFilter')?.addEventListener('change', loadServices)
  
  // Pods 필터
  document.getElementById('podsStatusFilter')?.addEventListener('change', loadPods)
  document.getElementById('podsNamespaceFilter')?.addEventListener('change', loadPods)
  
  // Logs 검색 및 필터
  document.getElementById('logsSearchBtn')?.addEventListener('click', loadLogs)
  document.getElementById('logsTimeFilter')?.addEventListener('change', loadLogs)
  document.getElementById('logsServiceFilter')?.addEventListener('change', loadLogs)
  document.getElementById('logsLevelFilter')?.addEventListener('change', loadLogs)
  
  // Traces 검색 및 필터
  document.getElementById('tracesSearchBtn')?.addEventListener('click', loadTraces)
  document.getElementById('tracesTimeFilter')?.addEventListener('change', loadTraces)
  document.getElementById('tracesServiceFilter')?.addEventListener('change', loadTraces)
  
  // Replica 상세 보기
  document.getElementById('viewReplicaDetails')?.addEventListener('click', () => {
    document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })
  })
  
  // 모든 알람 보기
  document.getElementById('viewAllAlerts')?.addEventListener('click', () => {
    document.getElementById('alerts')?.scrollIntoView({ behavior: 'smooth' })
  })
  
  // Pods Top N 탭
  setupPodsTopNTabs()
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

// 외부 링크 로드 (제거됨 - setupLinks로 통합)
async function loadExternalLinks() {
  // 이 함수는 더 이상 사용하지 않음
}

// 모든 메트릭 업데이트
async function updateAllMetrics() {
  try {
    // 성능 개선: 차트 업데이트는 제외하고 핵심 데이터만 업데이트
    await Promise.all([
      loadOverview(),
      loadServices(),
      loadPods(),
      loadAlerts()
    ])
    // Logs와 Traces는 별도로 처리 (차트 업데이트가 무거움)
    loadLogs().catch(err => console.error('Error loading logs:', err))
    loadTraces().catch(err => console.error('Error loading traces:', err))
  } catch (error) {
    console.error('Error updating metrics:', error)
  }
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

// Links 설정
function setupLinks() {
  // Grafana (EC2 Public IP)
  const grafanaLink = document.getElementById('grafanaLink')
  if (grafanaLink) {
    grafanaLink.setAttribute('href', 'http://43.200.143.174:3000')
    console.log('Grafana link set to:', grafanaLink.href)
  } else {
    console.error('Grafana link element not found')
  }
  // Prometheus (EC2 Public IP)
  const prometheusLink = document.getElementById('prometheusLink')
  if (prometheusLink) {
    prometheusLink.setAttribute('href', 'http://43.200.143.174:9090')
    console.log('Prometheus link set to:', prometheusLink.href)
  } else {
    console.error('Prometheus link element not found')
  }
  // CloudWatch
  const cloudwatchLink = document.getElementById('cloudwatchLink')
  if (cloudwatchLink) cloudwatchLink.setAttribute('href', 'https://console.aws.amazon.com/cloudwatch/')
  // ALB 타겟 그룹
  const albTargetGroupLink = document.getElementById('albTargetGroupLink')
  if (albTargetGroupLink) albTargetGroupLink.setAttribute('href', 'https://console.aws.amazon.com/ec2/v2/home?region=ap-northeast-2#TargetGroups:')
  // RDS Performance Insights
  const rdsPerformanceLink = document.getElementById('rdsPerformanceLink')
  if (rdsPerformanceLink) rdsPerformanceLink.setAttribute('href', 'https://console.aws.amazon.com/rds/home?region=ap-northeast-2#performance-insights:')
  // CloudTrail
  const cloudtrailLink = document.getElementById('cloudtrailLink')
  if (cloudtrailLink) cloudtrailLink.setAttribute('href', 'https://console.aws.amazon.com/cloudtrail/home?region=ap-northeast-2')
  // GitLab
  const gitlabLink = document.getElementById('gitlabLink')
  if (gitlabLink) gitlabLink.setAttribute('href', 'http://43.200.134.128/')
  // ECR
  const ecrLink = document.getElementById('ecrLink')
  if (ecrLink) ecrLink.setAttribute('href', 'https://console.aws.amazon.com/ecr/repositories?region=ap-northeast-2')
}

// Overview 데이터 로드
async function loadOverview() {
  try {
    const response = await fetch(`${API_BASE}/metrics/overview`)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const data = await response.json()
    console.log('📊 Overview API Response:', {
      url: `${API_BASE}/metrics/overview`,
      status: response.status,
      data: {
        latency: data.latency,
        traffic: data.traffic,
        errorRate: data.errorRate,
        availability: data.availability
      }
    })
    
    // 가용성 업데이트
    const availabilityEl = document.getElementById('availability')
    if (availabilityEl) {
      availabilityEl.textContent = `${data.availability?.successRate || 0}%`
    }
    
    // 지연 업데이트
    const latencyP95El = document.getElementById('latencyP95')
    const latencyP95ValueEl = document.getElementById('latencyP95Value')
    const latencyP99El = document.getElementById('latencyP99')
    const latencyP99ValueEl = document.getElementById('latencyP99Value')
    const latencyValue = data.latency?.p95 || 0
    if (latencyP95El) latencyP95El.textContent = `${latencyValue}ms`
    if (latencyP95ValueEl) latencyP95ValueEl.textContent = `${latencyValue}`
    if (latencyP99ValueEl) {
      const p99Value = data.latency?.p99 || 0
      latencyP99ValueEl.textContent = `${p99Value}`
    }
    
    // 에러율 업데이트
    const error5xxEl = document.getElementById('error5xx')
    const error5xxValueEl = document.getElementById('errorRate5xxValue')
    const error4xxEl = document.getElementById('error4xx')
    const error4xxValueEl = document.getElementById('errorRate4xxValue')
    const error5xxValue = data.errorRate?.error5xx || 0
    const error4xxValue = data.errorRate?.error4xx || 0
    if (error5xxEl) error5xxEl.textContent = `${error5xxValue}%`
    if (error5xxValueEl) error5xxValueEl.textContent = `${error5xxValue}`
    if (error4xxValueEl) error4xxValueEl.textContent = `${error4xxValue}`
    
    // 트래픽 업데이트
    const rpsEl = document.getElementById('rps')
    const rpsValueEl = document.getElementById('rpsValue')
    const rpsValue = data.traffic?.rps || 0
    if (rpsEl) rpsEl.textContent = `${rpsValue}`
    if (rpsValueEl) rpsValueEl.textContent = `${rpsValue}`
    
    // 포화도 업데이트
    const cpuAvgEl = document.getElementById('cpuAvg')
    const memAvgEl = document.getElementById('memAvg')
    if (cpuAvgEl) cpuAvgEl.textContent = `${data.saturation?.cpuAvg || 0}%`
    if (memAvgEl) memAvgEl.textContent = `${data.saturation?.memAvg || 0}%`
    
    // Replica 상태 업데이트
    const replicaHealthyEl = document.getElementById('replicaHealthy')
    const replicaUnhealthyEl = document.getElementById('replicaUnhealthy')
    if (replicaHealthyEl) replicaHealthyEl.textContent = `${data.replica?.healthy || 0}`
    if (replicaUnhealthyEl) replicaUnhealthyEl.textContent = `${data.replica?.unhealthy || 0}`
    
    // 추이 차트 업데이트
    updateOverviewTrendsChart(data)
  } catch (error) {
    console.error('Error loading overview:', error)
  }
}

// Services 데이터 로드
async function loadServices() {
  try {
    const namespaceFilter = document.getElementById('servicesNamespaceFilter')?.value || ''
    const sortFilter = document.getElementById('servicesSortFilter')?.value || 'name'
    
    let url = `${API_BASE}/metrics/services`
    const params = []
    if (namespaceFilter) params.push(`namespace=${namespaceFilter}`)
    if (sortFilter) params.push(`sort=${sortFilter}`)
    if (params.length > 0) url += '?' + params.join('&')
    
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const services = await response.json()
    
    // Services 테이블 업데이트
    const tbody = document.querySelector('#servicesTable tbody')
    if (!tbody) return
    
    tbody.innerHTML = ''
    
    if (services.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;">서비스가 없습니다.</td></tr>'
      return
    }
    
    services.forEach(service => {
      const row = document.createElement('tr')
      row.innerHTML = `
        <td>${service.namespace || '-'}</td>
        <td><a href="#" onclick="loadServiceDetail('${service.namespace}', '${service.name}'); return false;">${service.name}</a></td>
        <td>${service.rps || 0}</td>
        <td>${service.latencyP95 || 0}ms</td>
        <td>${service.errorRate5xx || 0}% / ${service.errorRate4xx || 0}%</td>
        <td>${service.replica?.available || 0} / ${service.replica?.desired || 0}</td>
        <td>${service.restart?.['1h'] || 0} / ${service.restart?.['24h'] || 0}</td>
        <td>${service.cpu || 0}%</td>
        <td>${service.mem || 0}%</td>
      `
      tbody.appendChild(row)
    })
  } catch (error) {
    console.error('Error loading services:', error)
  }
}

// Pods 데이터 로드
async function loadPods() {
  try {
    const statusFilter = document.getElementById('podsStatusFilter')?.value || ''
    const namespaceFilter = document.getElementById('podsNamespaceFilter')?.value || ''
    
    let url = `${API_BASE}/metrics/pods`
    const params = []
    if (statusFilter) params.push(`status=${statusFilter}`)
    if (namespaceFilter) params.push(`namespace=${namespaceFilter}`)
    if (params.length > 0) url += '?' + params.join('&')
    
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const pods = await response.json()
    
    // Pods 테이블 업데이트
    const tbody = document.querySelector('#podsTable tbody')
    if (!tbody) return
    
    tbody.innerHTML = ''
    
    if (pods.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Pod가 없습니다.</td></tr>'
      return
    }
    
    pods.forEach(pod => {
      const row = document.createElement('tr')
      row.innerHTML = `
        <td>${pod.namespace || '-'}</td>
        <td>${pod.name || '-'}</td>
        <td>${pod.status || '-'}</td>
        <td>${pod.restarts || 0}</td>
        <td>${pod.cpu || 0}%</td>
        <td>${pod.mem || 0}%</td>
        <td>${pod.node || '-'}</td>
      `
      tbody.appendChild(row)
    })
    
    // Top N 업데이트
    updatePodsTopN(pods)
  } catch (error) {
    console.error('Error loading pods:', error)
  }
}

// Logs 데이터 로드
async function loadLogs() {
  try {
    const timeFilter = document.getElementById('logsTimeFilter')?.value || '24h'
    const serviceFilter = document.getElementById('logsServiceFilter')?.value || ''
    const levelFilter = document.getElementById('logsLevelFilter')?.value || ''
    
    // 시간 범위 계산
    const end = new Date()
    let start = new Date()
    if (timeFilter === '1h') {
      start = new Date(end.getTime() - 60 * 60 * 1000)
    } else if (timeFilter === '6h') {
      start = new Date(end.getTime() - 6 * 60 * 60 * 1000)
    } else {
      start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
    }
    
    let url = `${API_BASE}/errors/app?start=${start.toISOString()}&end=${end.toISOString()}&limit=50`
    if (serviceFilter) url += `&namespace=${serviceFilter}`
    
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const logs = await response.json()
    console.log('📋 Logs API Response:', {
      url,
      status: response.status,
      count: logs?.length || 0,
      sample: logs?.slice(0, 3) || []
    })
    
    // 최근 에러 로그 테이블 업데이트
    const tbody = document.getElementById('logsTableBody')
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">로딩 중...</td></tr>'
      
      if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">에러 로그가 없습니다.</td></tr>'
      } else {
        logs.forEach(log => {
          // 레벨 필터 적용
          if (levelFilter && log.level !== levelFilter) return
          
          const row = document.createElement('tr')
          row.innerHTML = `
            <td>${new Date(log.timestamp).toLocaleString()}</td>
            <td>${log.service || log.namespace || '-'}</td>
            <td><span class="log-level level-${(log.level || 'error').toLowerCase()}">${log.level || 'ERROR'}</span></td>
            <td>${escapeHtml(log.message || 'No message')}</td>
          `
          tbody.appendChild(row)
        })
      }
    }
    
    // Top Exception 업데이트
    const topExceptionsUrl = `${API_BASE}/errors/app?start=${start.toISOString()}&end=${end.toISOString()}&limit=50`
    const topExceptionsResponse = await fetch(topExceptionsUrl)
    if (topExceptionsResponse.ok) {
      const allLogs = await topExceptionsResponse.json()
      updateTopExceptionsList(allLogs)
    }
    
    // 서비스별 Error Log Count 추이 차트 업데이트 (비동기로 처리하여 성능 개선)
    setTimeout(() => {
      updateLogsErrorTrendChart(start, end)
    }, 100)
  } catch (error) {
    console.error('Error loading logs:', error)
    const tbody = document.getElementById('logsTableBody')
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: #e74c3c;">로그를 불러오는 중 오류가 발생했습니다: ${error.message}</td></tr>`
    }
  }
}

// Traces 데이터 로드
async function loadTraces() {
  try {
    const timeFilter = document.getElementById('tracesTimeFilter')?.value || '1h'
    const serviceFilter = document.getElementById('tracesServiceFilter')?.value || ''
    
    // 시간 범위 계산
    const end = new Date()
    let start = new Date()
    if (timeFilter === '1h') {
      start = new Date(end.getTime() - 60 * 60 * 1000)
    } else if (timeFilter === '6h') {
      start = new Date(end.getTime() - 6 * 60 * 60 * 1000)
    } else {
      start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
    }
    
    // Slow Traces Top 10
    const slowTracesList = document.getElementById('slowTracesTop10List')
    if (slowTracesList) {
      slowTracesList.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">로딩 중...</p>'
      try {
        const slowUrl = `${API_BASE}/traces/slow?start=${start.toISOString()}&end=${end.toISOString()}&limit=10`
        const slowResponse = await fetch(slowUrl)
        if (slowResponse.ok) {
          const slowTraces = await slowResponse.json()
          console.log('🐌 Slow Traces API Response:', {
            url: slowUrl,
            status: slowResponse.status,
            count: slowTraces?.length || 0,
            sample: slowTraces?.slice(0, 2) || []
          })
          if (slowTraces && slowTraces.length > 0) {
            updateTracesList(slowTracesList, slowTraces, 'slow')
          } else {
            slowTracesList.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">느린 트레이스가 없습니다.</p>'
          }
        } else {
          const errorText = await slowResponse.text()
          console.error('Slow traces API error:', slowResponse.status, errorText)
          slowTracesList.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">느린 트레이스가 없습니다.</p>'
        }
      } catch (error) {
        console.error('Error loading slow traces:', error)
        slowTracesList.innerHTML = `<p style="padding: 20px; text-align: center; color: #e74c3c;">느린 트레이스를 불러오는 중 오류가 발생했습니다: ${error.message}</p>`
      }
    }
    
    // Error Traces Top 10
    const errorTracesList = document.getElementById('errorTracesTop10List')
    if (errorTracesList) {
      errorTracesList.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">로딩 중...</p>'
      try {
        const errorUrl = `${API_BASE}/traces/error?start=${start.toISOString()}&end=${end.toISOString()}&limit=10`
        const errorResponse = await fetch(errorUrl)
        if (errorResponse.ok) {
          const errorTraces = await errorResponse.json()
          console.log('❌ Error Traces API Response:', {
            url: errorUrl,
            status: errorResponse.status,
            count: errorTraces?.length || 0,
            sample: errorTraces?.slice(0, 2) || []
          })
          if (errorTraces && errorTraces.length > 0) {
            updateTracesList(errorTracesList, errorTraces, 'error')
          } else {
            errorTracesList.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">에러 트레이스가 없습니다.</p>'
          }
        } else {
          const errorText = await errorResponse.text()
          console.error('Error traces API error:', errorResponse.status, errorText)
          errorTracesList.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">에러 트레이스가 없습니다.</p>'
        }
      } catch (error) {
        console.error('Error loading error traces:', error)
        errorTracesList.innerHTML = `<p style="padding: 20px; text-align: center; color: #e74c3c;">에러 트레이스를 불러오는 중 오류가 발생했습니다: ${error.message}</p>`
      }
    }
    
  } catch (error) {
    console.error('Error loading traces:', error)
  }
}

// Traces 리스트 업데이트
function updateTracesList(listElement, traces, type) {
  if (!listElement) return
  
  listElement.innerHTML = ''
  
  if (!traces || traces.length === 0) {
    listElement.innerHTML = `<p style="padding: 20px; text-align: center; color: #999;">${type === 'slow' ? '느린' : '에러'} 트레이스가 없습니다.</p>`
    return
  }
  
  traces.forEach((trace, index) => {
    const item = document.createElement('div')
    item.className = 'trace-item'
    const duration = trace.duration ? `${(trace.duration / 1000000).toFixed(2)}ms` : '-'
    const traceId = trace.traceID || trace.traceId || 'unknown'
    item.innerHTML = `
      <div class="trace-header">
        <span class="trace-rank">#${index + 1}</span>
        <span class="trace-id">${traceId.substring(0, 16)}...</span>
        <span class="trace-duration">${duration}</span>
      </div>
      <div class="trace-service">${trace.serviceName || trace.service || 'unknown'}</div>
      <div class="trace-time">${trace.startTimeUnixNano ? new Date(trace.startTimeUnixNano / 1000000).toLocaleString() : '-'}</div>
    `
    item.addEventListener('click', () => {
      loadTraceDetail(traceId)
    })
    listElement.appendChild(item)
  })
}

// Trace 상세 조회
async function loadTraceDetail(traceId) {
  try {
    const response = await fetch(`${API_BASE}/traces/${traceId}`)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const trace = await response.json()
    
    // Trace Detail 섹션 표시
    const detailSection = document.getElementById('tracesDetail')
    if (detailSection) {
      detailSection.style.display = 'block'
      detailSection.scrollIntoView({ behavior: 'smooth' })
      
      const detailContent = document.getElementById('tracesDetailContent')
      if (detailContent) {
        detailContent.innerHTML = `<pre>${JSON.stringify(trace, null, 2)}</pre>`
      }
    }
  } catch (error) {
    console.error('Error loading trace detail:', error)
    alert(`트레이스 상세 정보를 불러오는 중 오류가 발생했습니다: ${error.message}`)
  }
}

// Top Exceptions 리스트 업데이트
function updateTopExceptionsList(logs) {
  const topExceptionsList = document.getElementById('topExceptionsList')
  if (!topExceptionsList) return
  
  // 에러 메시지별 그룹핑 및 카운트
  const messageCounts = {}
  logs.forEach(log => {
    const message = log.message || 'No message'
    if (!messageCounts[message]) {
      messageCounts[message] = {
        message: message,
        count: 0,
        level: log.level || 'error',
        lastOccurred: log.timestamp
      }
    }
    messageCounts[message].count++
    if (log.timestamp > messageCounts[message].lastOccurred) {
      messageCounts[message].lastOccurred = log.timestamp
    }
  })
  
  // 빈도순 정렬 후 Top 10
  const topExceptions = Object.values(messageCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  
  topExceptionsList.innerHTML = ''
  
  if (topExceptions.length === 0) {
    topExceptionsList.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">Exception이 없습니다.</p>'
    return
  }
  
  topExceptions.forEach((exception, index) => {
    const item = document.createElement('div')
    item.className = 'exception-item'
    item.innerHTML = `
      <div class="exception-rank">#${index + 1}</div>
      <div class="exception-content">
        <div class="exception-header">
          <span class="exception-count">${exception.count}회 발생</span>
          <span class="exception-level level-${exception.level.toLowerCase()}">${exception.level}</span>
          <span class="exception-time">최근: ${new Date(exception.lastOccurred).toLocaleString()}</span>
        </div>
        <div class="exception-message">${escapeHtml(exception.message)}</div>
      </div>
    `
    topExceptionsList.appendChild(item)
  })
}

// Logs Error Trend 차트 업데이트
async function updateLogsErrorTrendChart(start, end) {
  if (!window.logsErrorTrendChart) {
    return
  }
  
  try {
    // 서비스 목록 가져오기
    const servicesResponse = await fetch(`${API_BASE}/metrics/services`)
    if (!servicesResponse.ok) return
    
    const services = await servicesResponse.json()
    
    // 각 서비스별 에러 로그 수 가져오기
    const datasets = []
    const colors = [
      'rgb(231, 76, 60)',   // 빨강
      'rgb(52, 152, 219)',  // 파랑
      'rgb(46, 204, 113)',  // 초록
      'rgb(241, 196, 15)',  // 노랑
      'rgb(155, 89, 182)',  // 보라
      'rgb(230, 126, 34)',  // 주황
      'rgb(26, 188, 156)',  // 청록
      'rgb(149, 165, 166)', // 회색
      'rgb(52, 73, 94)',    // 진한 회색
      'rgb(192, 57, 43)'    // 진한 빨강
    ]
    
    // 모든 서비스 가져오기 (frontend, core, ai-integration 네임스페이스)
    const allServices = services.filter(s => 
      s.namespace === 'bravo-frontend-ns' || 
      s.namespace === 'bravo-core-ns' || 
      s.namespace === 'bravo-ai-integration-ns'
    )
    
    if (allServices.length === 0) {
      console.warn('No services found in target namespaces')
      return
    }
    
    // 에러 로그 수 기준으로 서비스 정렬 (상위 5개 선택)
    console.log('Checking error log counts for all services to determine top 5...')
    
    // 재시도 함수
    const fetchWithRetry = async (url, retries = 2, delay = 500) => {
      for (let i = 0; i < retries; i++) {
        try {
          const response = await fetch(url)
          if (response.ok) {
            return await response.json()
          } else if (response.status === 429 && i < retries - 1) {
            const waitTime = delay * Math.pow(2, i)
            await new Promise(resolve => setTimeout(resolve, waitTime))
            continue
          } else {
            return [] // 에러 발생 시 빈 배열 반환
          }
        } catch (error) {
          if (i === retries - 1) return []
          const waitTime = delay * Math.pow(2, i)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
      }
      return []
    }
    
    // 각 서비스의 에러 로그 총합 확인 (빠른 카운트만)
    const serviceErrorCounts = []
    for (let i = 0; i < allServices.length; i++) {
      const service = allServices[i]
      try {
        const quickCountUrl = `${API_BASE}/errors/log-count?start=${start.toISOString()}&end=${end.toISOString()}&source=app&service=${encodeURIComponent(service.name)}`
        const counts = await fetchWithRetry(quickCountUrl)
        
        // 총 에러 로그 수 계산
        const totalErrors = counts.reduce((sum, [time, count]) => sum + (count || 0), 0)
        
        serviceErrorCounts.push({
          name: service.name,
          namespace: service.namespace,
          errorCount: totalErrors
        })
        
        // 다음 요청 전 딜레이 (rate limit 방지)
        if (i < allServices.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      } catch (error) {
        console.warn(`Error checking log count for ${service.name}:`, error.message)
        serviceErrorCounts.push({
          name: service.name,
          namespace: service.namespace,
          errorCount: 0
        })
      }
    }
    
    // 에러 로그 수 기준으로 내림차순 정렬
    serviceErrorCounts.sort((a, b) => b.errorCount - a.errorCount)
    
    // 상위 5개 서비스 선택
    const topServices = serviceErrorCounts.slice(0, 5)
    const serviceNames = topServices.map(s => s.name)
    
    console.log('Top 5 services by error count:', topServices.map(s => `${s.name} (${s.errorCount} errors)`))
    console.log('Loading detailed logs for services:', serviceNames)
    
    // 모든 서비스의 시간 범위를 맞추기 위해 먼저 시간 범위 생성 (5분 단위로 샘플링하여 성능 개선)
    const timeRange = []
    const interval = (end.getTime() - start.getTime()) / (5 * 60 * 1000) // 5분 단위
    for (let i = 0; i <= interval; i++) {
      const time = start.getTime() + i * 5 * 60000
      timeRange.push(time)
    }
    
    // 각 서비스별 에러 로그 수 가져오기 (순차 처리로 rate limit 방지)
    const serviceDataMap = new Map()
    
    // 상세 데이터 로드를 위한 재시도 함수 (더 많은 재시도)
    const fetchDetailedWithRetry = async (url, retries = 3, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          const response = await fetch(url)
          if (response.ok) {
            return await response.json()
          } else if (response.status === 429 && i < retries - 1) {
            // Rate limit 에러인 경우 대기 후 재시도
            const waitTime = delay * Math.pow(2, i) // Exponential backoff
            console.log(`Rate limit hit, waiting ${waitTime}ms before retry ${i + 1}/${retries}`)
            await new Promise(resolve => setTimeout(resolve, waitTime))
            continue
          } else {
            const errorText = await response.text()
            throw new Error(`HTTP ${response.status}: ${errorText}`)
          }
        } catch (error) {
          if (i === retries - 1) throw error
          const waitTime = delay * Math.pow(2, i)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
      }
    }
    
    // 순차적으로 요청 (각 요청 사이에 500ms 딜레이)
    for (let i = 0; i < serviceNames.length; i++) {
      const serviceName = serviceNames[i]
      try {
        const logCountUrl = `${API_BASE}/errors/log-count?start=${start.toISOString()}&end=${end.toISOString()}&source=app&service=${encodeURIComponent(serviceName)}`
        
        const counts = await fetchDetailedWithRetry(logCountUrl)
        
        // 시간별 데이터를 맵으로 변환
        const countMap = new Map()
        counts.forEach(([time, count]) => {
          countMap.set(time, count)
        })
        
        // 시간 범위에 맞춰 데이터 배열 생성 (없는 시간은 0)
        const data = timeRange.map(time => countMap.get(time) || 0)
        
        // 데이터가 있는 경우에만 추가 (모든 값이 0이 아닌 경우)
        const hasData = data.some(count => count > 0)
        if (hasData || counts.length > 0) {
          serviceDataMap.set(serviceName, data)
          console.log(`Loaded logs for ${serviceName}: ${counts.length} data points`)
        } else {
          console.log(`No log data found for ${serviceName}`)
        }
        
        // 다음 요청 전 딜레이 (rate limit 방지)
        if (i < serviceNames.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      } catch (error) {
        console.error(`Error loading log count for ${serviceName}:`, error.message)
      }
    }
    
    // 차트 데이터셋 생성
    serviceDataMap.forEach((data, serviceName) => {
      const index = serviceNames.indexOf(serviceName)
      if (index >= 0) {
        datasets.push({
          label: serviceName,
          data: data,
          borderColor: colors[index % colors.length],
          backgroundColor: colors[index % colors.length].replace('rgb', 'rgba').replace(')', ', 0.1)'),
          tension: 0.4
        })
      }
    })
    
    // 라벨 설정 (시간 범위)
    if (timeRange.length > 0) {
      window.logsErrorTrendChart.data.labels = timeRange.map(time => new Date(time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))
    }
    
    // 차트 데이터셋 업데이트
    window.logsErrorTrendChart.data.datasets = datasets
    
    // 데이터가 없을 때도 차트 업데이트 (빈 차트 표시)
    if (datasets.length === 0) {
      console.warn('No log data available for any service')
      // 빈 데이터셋이라도 차트를 업데이트하여 "데이터 없음" 상태 표시
    }
    
    window.logsErrorTrendChart.update('none') // 애니메이션 없이 업데이트하여 성능 개선
  } catch (error) {
    console.error('Error updating logs error trend chart:', error)
  }
}

// Alerts 데이터 로드
async function loadAlerts() {
  try {
    // 타임아웃 설정 (5초로 단축)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(`${API_BASE}/alerts/firing`, {
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      // 에러가 발생해도 빈 배열로 처리 (Alertmanager가 없을 수 있음)
      const firingAlertsList = document.getElementById('firingAlertsList')
      const alertsTableBody = document.getElementById('firingAlertsTableBody')
      if (firingAlertsList) {
        firingAlertsList.innerHTML = '<p style="padding: 10px; text-align: center; color: #999;">현재 FIRING 알람이 없습니다.</p>'
      }
      if (alertsTableBody) {
        alertsTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #999;">현재 FIRING 알람이 없습니다.</td></tr>'
      }
      return
    }
    
    const alerts = await response.json()
    console.log('📢 Alerts API Response:', {
      url: `${API_BASE}/alerts/firing`,
      status: response.status,
      count: alerts?.length || 0,
      sample: alerts?.slice(0, 2) || []
    })
    
    // Overview의 Alerts 리스트 업데이트
    const firingAlertsList = document.getElementById('firingAlertsList')
    if (firingAlertsList) {
      firingAlertsList.innerHTML = ''
      if (!alerts || alerts.length === 0) {
        firingAlertsList.innerHTML = '<p style="padding: 10px; text-align: center; color: #999;">현재 FIRING 알람이 없습니다.</p>'
      } else {
        alerts.slice(0, 5).forEach(alert => {
          const item = document.createElement('div')
          item.className = 'alert-item'
          const severity = alert.labels?.severity || alert.severity || 'warning'
          const name = alert.labels?.alertname || alert.name || 'Unknown'
          const message = alert.annotations?.description || alert.annotations?.summary || alert.message || 'No message'
          item.innerHTML = `
            <div class="alert-header">
              <span class="alert-severity severity-${severity}">${severity.toUpperCase()}</span>
              <span class="alert-name">${name}</span>
            </div>
            <div class="alert-message">${message}</div>
          `
          firingAlertsList.appendChild(item)
        })
      }
    }
    
    // Alerts 섹션의 테이블 업데이트
    const alertsTableBody = document.getElementById('firingAlertsTableBody')
    if (alertsTableBody) {
      alertsTableBody.innerHTML = ''
      if (!alerts || alerts.length === 0) {
        alertsTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #999;">현재 FIRING 알람이 없습니다.</td></tr>'
      } else {
        alerts.forEach(alert => {
          const row = document.createElement('tr')
          const severity = alert.labels?.severity || alert.severity || 'warning'
          const name = alert.labels?.alertname || alert.name || 'Unknown'
          const service = alert.labels?.service || alert.labels?.instance || '-'
          const message = alert.annotations?.description || alert.annotations?.summary || alert.message || 'No message'
          const startsAt = alert.startsAt || alert.activeAt || new Date().toISOString()
          row.innerHTML = `
            <td>${new Date(startsAt).toLocaleString()}</td>
            <td>${service}</td>
            <td><span class="alert-severity severity-${severity}">${severity.toUpperCase()}</span></td>
            <td>${message}</td>
          `
          alertsTableBody.appendChild(row)
        })
      }
    }
  } catch (error) {
    console.error('Error loading alerts:', error)
    // 타임아웃이나 네트워크 에러는 조용히 처리 (Alertmanager가 없을 수 있음)
    if (error.name === 'AbortError' || error.message.includes('timeout') || error.message.includes('Failed to fetch')) {
      const firingAlertsList = document.getElementById('firingAlertsList')
      const alertsTableBody = document.getElementById('firingAlertsTableBody')
      if (firingAlertsList) {
        firingAlertsList.innerHTML = '<p style="padding: 10px; text-align: center; color: #999;">현재 FIRING 알람이 없습니다.</p>'
      }
      if (alertsTableBody) {
        alertsTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #999;">현재 FIRING 알람이 없습니다.</td></tr>'
      }
    } else {
      const firingAlertsList = document.getElementById('firingAlertsList')
      const alertsTableBody = document.getElementById('firingAlertsTableBody')
      if (firingAlertsList) {
        firingAlertsList.innerHTML = `<p style="padding: 20px; text-align: center; color: #e74c3c;">알람을 불러오는 중 오류가 발생했습니다: ${error.message}</p>`
      }
      if (alertsTableBody) {
        alertsTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: #e74c3c;">알람을 불러오는 중 오류가 발생했습니다: ${error.message}</td></tr>`
      }
    }
  }
}

// Service Detail 로드
async function loadServiceDetail(namespace, serviceName) {
  try {
    const response = await fetch(`${API_BASE}/metrics/services/${namespace}/${serviceName}`)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const data = await response.json()
    
    // Service Detail 섹션 표시
    document.getElementById('service-detail')?.scrollIntoView({ behavior: 'smooth' })
    
    // Service Detail 내용 업데이트
    const detailContent = document.getElementById('serviceDetailContent')
    if (detailContent) {
      detailContent.innerHTML = `
        <h3>${serviceName} (${namespace})</h3>
        <pre>${JSON.stringify(data, null, 2)}</pre>
      `
    }
  } catch (error) {
    console.error('Error loading service detail:', error)
  }
}

// Pods Top N 업데이트
function updatePodsTopN(pods) {
  // CPU Top 5
  const cpuTop5 = [...pods].sort((a, b) => (b.cpu || 0) - (a.cpu || 0)).slice(0, 5)
  const cpuTop5List = document.getElementById('podsCpuTop5')
  if (cpuTop5List) {
    cpuTop5List.innerHTML = cpuTop5.map((pod, i) => 
      `<div>${i + 1}. ${pod.name} - ${pod.cpu || 0}%</div>`
    ).join('') || '<div>데이터 없음</div>'
  }
  
  // Mem Top 5
  const memTop5 = [...pods].sort((a, b) => (b.mem || 0) - (a.mem || 0)).slice(0, 5)
  const memTop5List = document.getElementById('podsMemTop5')
  if (memTop5List) {
    memTop5List.innerHTML = memTop5.map((pod, i) => 
      `<div>${i + 1}. ${pod.name} - ${pod.mem || 0}%</div>`
    ).join('') || '<div>데이터 없음</div>'
  }
  
  // Restart Top 5
  const restartTop5 = [...pods].sort((a, b) => (b.restarts || 0) - (a.restarts || 0)).slice(0, 5)
  const restartTop5List = document.getElementById('podsRestartTop5')
  if (restartTop5List) {
    restartTop5List.innerHTML = restartTop5.map((pod, i) => 
      `<div>${i + 1}. ${pod.name} - ${pod.restarts || 0}회</div>`
    ).join('') || '<div>데이터 없음</div>'
  }
}

// Overview 추이 차트 업데이트
function updateOverviewTrendsChart(data) {
  if (!window.overviewTrendsChart || !window.overviewTrendsChart.data) {
    return
  }
  
  const chart = window.overviewTrendsChart
  const labels = chart.data.labels || []
  const now = new Date().toLocaleTimeString()
  
  // 데이터 추가
  chart.data.labels.push(now)
  chart.data.datasets[0].data.push(data.traffic?.rps || 0)
  chart.data.datasets[1].data.push(data.latency?.p95 || 0)
  chart.data.datasets[2].data.push(data.errorRate?.error5xx || 0)
  
  // 최대 20개 데이터만 유지
  if (chart.data.labels.length > 20) {
    chart.data.labels.shift()
    chart.data.datasets.forEach(dataset => dataset.data.shift())
  }
  
  chart.update()
}

// Pods Top N 탭 설정
function setupPodsTopNTabs() {
  const tabs = document.querySelectorAll('.pods-topn-tab')
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      tabs.forEach(t => t.classList.remove('active'))
      this.classList.add('active')
      
      const targetId = this.dataset.target
      const contents = document.querySelectorAll('.pods-topn-content')
      contents.forEach(c => c.style.display = 'none')
      document.getElementById(targetId)?.style.setProperty('display', 'block')
    })
  })
}

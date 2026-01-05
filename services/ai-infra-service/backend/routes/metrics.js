import express from 'express'
import prometheusService from '../services/prometheus.js'
import kubernetesService from '../services/kubernetes.js'

const router = express.Router()

// 클러스터 개요
router.get('/cluster/overview', async (req, res) => {
  try {
    const overview = await kubernetesService.getClusterOverview()
    res.json(overview)
  } catch (error) {
    console.error('Error getting cluster overview:', error)
    res.status(500).json({ error: error.message })
  }
})

// 노드 목록
router.get('/nodes', async (req, res) => {
  try {
    const nodes = await kubernetesService.getNodes()
    res.json(nodes)
  } catch (error) {
    console.error('Error getting nodes:', error)
    res.status(500).json({ error: error.message })
  }
})

// 특정 노드 상세 정보
router.get('/nodes/:node', async (req, res) => {
  try {
    const { node } = req.params
    const nodeInfo = await kubernetesService.getNodeDetails(node)
    res.json(nodeInfo)
  } catch (error) {
    console.error('Error getting node details:', error)
    res.status(500).json({ error: error.message })
  }
})

// 특정 노드의 Pod 목록
router.get('/nodes/:node/pods', async (req, res) => {
  try {
    const { node } = req.params
    const pods = await kubernetesService.getNodePods(node)
    res.json(pods)
  } catch (error) {
    console.error('Error getting node pods:', error)
    res.status(500).json({ error: error.message })
  }
})

// 노드 메트릭
router.get('/nodes/:node/metrics', async (req, res) => {
  try {
    const { node } = req.params
    const { start, end } = req.query
    const metrics = await prometheusService.getNodeMetrics(node, start, end)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting node metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

// Pod 목록 (CPU/Mem 메트릭 포함)
router.get('/pods', async (req, res) => {
  try {
    const { namespace, node, status } = req.query
    const pods = await kubernetesService.getPods({ namespace, node, status })
    
    // Prometheus에서 Pod별 CPU/Mem 메트릭 수집
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - 300000) // 5분 전
    
    const [cpuMetrics, memMetrics] = await Promise.all([
      prometheusService.getPodCPUMetrics(node, startTime.toISOString(), endTime.toISOString(), '15s').catch((err) => {
        console.error('Error getting CPU metrics:', err.message)
        return []
      }),
      prometheusService.getPodMemoryMetrics(node, startTime.toISOString(), endTime.toISOString(), '15s').catch((err) => {
        console.error('Error getting Memory metrics:', err.message)
        return []
      })
    ])
    
    console.log(`Found ${cpuMetrics.length} CPU metrics and ${memMetrics.length} Memory metrics for ${pods.length} pods`)
    
    // 메트릭을 Map으로 변환 (pod 이름을 키로, 부분 매칭도 지원)
    const cpuMap = new Map()
    cpuMetrics.forEach(metric => {
      const podName = metric.name
      const lastValue = metric.data && metric.data.length > 0 ? parseFloat(metric.data[metric.data.length - 1][1]) : 0
      // CPU는 이미 %로 계산되어 있음 (limit 대비)
      cpuMap.set(podName, lastValue)
      // 부분 매칭을 위해 짧은 이름도 추가 (예: auth-service-abc123 -> auth-service)
      const shortName = podName.split('-').slice(0, -1).join('-')
      if (shortName && !cpuMap.has(shortName)) {
        cpuMap.set(shortName, lastValue)
      }
    })
    
    const memMap = new Map()
    memMetrics.forEach(metric => {
      const podName = metric.name
      const lastValue = metric.data && metric.data.length > 0 ? parseFloat(metric.data[metric.data.length - 1][1]) : 0
      // Memory는 이미 %로 계산되어 있음 (limit 대비)
      memMap.set(podName, lastValue)
      // 부분 매칭을 위해 짧은 이름도 추가
      const shortName = podName.split('-').slice(0, -1).join('-')
      if (shortName && !memMap.has(shortName)) {
        memMap.set(shortName, lastValue)
      }
    })
    
    // Pod 데이터에 메트릭 추가 (정확한 이름 매칭 우선, 없으면 부분 매칭 시도)
    const podsWithMetrics = pods.map(pod => {
      let cpu = cpuMap.get(pod.name) || 0
      let mem = memMap.get(pod.name) || 0
      
      // 정확한 매칭이 없으면 부분 매칭 시도
      if (cpu === 0 && pod.name) {
        const podBaseName = pod.name.split('-').slice(0, -1).join('-')
        cpu = cpuMap.get(podBaseName) || 0
      }
      if (mem === 0 && pod.name) {
        const podBaseName = pod.name.split('-').slice(0, -1).join('-')
        mem = memMap.get(podBaseName) || 0
      }
      
      const oomKilled = pod.status === 'Failed' && pod.restartCount > 0 // 간단한 추정
      
      return {
        ...pod,
        cpu: parseFloat(cpu.toFixed(2)),
        mem: parseFloat(mem.toFixed(2)),
        oomKilled
      }
    })
    
    res.json(podsWithMetrics)
  } catch (error) {
    console.error('Error getting pods:', error)
    res.status(500).json({ error: error.message })
  }
})

// 특정 Pod 상세 정보
router.get('/pods/:namespace/:pod', async (req, res) => {
  try {
    const { namespace, pod } = req.params
    const podInfo = await kubernetesService.getPodDetails(namespace, pod)
    res.json(podInfo)
  } catch (error) {
    console.error('Error getting pod details:', error)
    res.status(500).json({ error: error.message })
  }
})

// 실시간 메트릭
router.get('/realtime', async (req, res) => {
  try {
    const { node } = req.query
    const metrics = await prometheusService.getRealtimeMetrics(node)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting realtime metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

// 과거 메트릭 (시계열)
router.get('/history', async (req, res) => {
  try {
    const { node, start, end, step } = req.query
    const metrics = await prometheusService.getHistoryMetrics(node, start, end, step)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting history metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

// Container CPU 사용률 (시계열) - /container/cpu와 /containers/cpu 모두 지원
router.get('/container/cpu', async (req, res) => {
  try {
    const { node, start, end, step = '15s' } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const metrics = await prometheusService.getContainerCPUMetrics(node, start, end, step)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting container CPU metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/containers/cpu', async (req, res) => {
  try {
    const { node, start, end, step = '15s' } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const metrics = await prometheusService.getContainerCPUMetrics(node, start, end, step)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting container CPU metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

// Container Memory 사용률 (시계열) - /container/memory와 /containers/memory 모두 지원
router.get('/container/memory', async (req, res) => {
  try {
    const { node, start, end, step = '15s' } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const metrics = await prometheusService.getContainerMemoryMetrics(node, start, end, step)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting container memory metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/containers/memory', async (req, res) => {
  try {
    const { node, start, end, step = '15s' } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const metrics = await prometheusService.getContainerMemoryMetrics(node, start, end, step)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting container memory metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

// Pod CPU 사용률 (시계열) - /pod/cpu와 /pods/cpu 모두 지원
router.get('/pod/cpu', async (req, res) => {
  try {
    const { node, start, end, step = '15s' } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const metrics = await prometheusService.getPodCPUMetrics(node, start, end, step)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting pod CPU metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/pods/cpu', async (req, res) => {
  try {
    const { node, start, end, step = '15s' } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const metrics = await prometheusService.getPodCPUMetrics(node, start, end, step)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting pod CPU metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

// Pod Memory 사용률 (시계열) - /pod/memory와 /pods/memory 모두 지원
router.get('/pod/memory', async (req, res) => {
  try {
    const { node, start, end, step = '15s' } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const metrics = await prometheusService.getPodMemoryMetrics(node, start, end, step)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting pod memory metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/pods/memory', async (req, res) => {
  try {
    const { node, start, end, step = '15s' } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const metrics = await prometheusService.getPodMemoryMetrics(node, start, end, step)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting pod memory metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

// 리소스 사용률 (노드 선택에 따라 클러스터 또는 특정 노드)
router.get('/resource-usage', async (req, res) => {
  try {
    const { node, start, end, step = '15s' } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const metrics = await prometheusService.getClusterMetrics(start, end, node, step)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting resource usage metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

// Overview 메인 요약 데이터
router.get('/overview', async (req, res) => {
  try {
    const { start, end } = req.query
    const startTime = start ? new Date(start) : new Date(Date.now() - 3600000) // 기본 1시간 전
    const endTime = end ? new Date(end) : new Date()

    // 가용성, 지연, 에러율, 트래픽 데이터 수집
    const [clusterOverview, resourceUsage] = await Promise.all([
      kubernetesService.getClusterOverview(),
      prometheusService.getResourceUsageTimeline(null, startTime.toISOString(), endTime.toISOString())
    ])

    // 가용성 계산 (성공률)
    let errorBreakdownData = null
    try {
      errorBreakdownData = await prometheusService.get5xxErrorBreakdown(startTime.toISOString(), endTime.toISOString())
    } catch (error) {
      console.warn('Error getting error breakdown:', error)
    }
    
    const totalRequests = errorBreakdownData?.total || 0
    const error5xx = errorBreakdownData?.application?.count || 0
    const successRate = totalRequests > 0 ? ((totalRequests - error5xx) / totalRequests * 100).toFixed(2) : 100

    // 지연 데이터 (p95, p99), RPS, 4xx 에러율 수집
    const overallMetrics = await prometheusService.getOverallMetrics(startTime.toISOString(), endTime.toISOString())
    const latencyP95 = overallMetrics.latencyP95
    const latencyP99 = overallMetrics.latencyP99
    const rps = overallMetrics.rps
    const errorRate4xx = overallMetrics.errorRate4xx

    // 에러율
    const errorRate5xx = totalRequests > 0 ? (error5xx / totalRequests * 100).toFixed(2) : 0

    // 포화도 (CPU/Mem 평균)
    const cpuAvg = resourceUsage?.cpu?.average || 0
    const memAvg = resourceUsage?.memory?.average || 0

    // Top 3 서비스 (CPU 기준)
    const services = await kubernetesService.getServices()
    const servicesWithCpu = await Promise.all(services.slice(0, 10).map(async (service) => {
      try {
        const resourceMetrics = await prometheusService.getServiceResourceMetrics(
          service.name,
          service.namespace,
          startTime.toISOString(),
          endTime.toISOString()
        )
        return {
          name: service.name,
          namespace: service.namespace,
          cpu: resourceMetrics.cpu
        }
      } catch (error) {
        return null
      }
    }))
    const top3Services = servicesWithCpu
      .filter(s => s !== null && s.cpu > 0)
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 3)

    // Replica 상태
    const deployments = await kubernetesService.getDeployments()
    let replicaHealthy = 0
    let replicaUnhealthy = 0
    const replicaUnhealthyServices = []

    for (const dep of deployments) {
      if (dep.available === dep.desired) {
        replicaHealthy++
      } else {
        replicaUnhealthy++
        replicaUnhealthyServices.push(dep.name)
      }
    }

    res.json({
      availability: {
        successRate: parseFloat(successRate),
        error5xxRate: parseFloat(errorRate5xx)
      },
      latency: {
        p95: latencyP95,
        p99: latencyP99
      },
      errorRate: {
        error5xx: parseFloat(errorRate5xx),
        error4xx: parseFloat(errorRate4xx)
      },
      traffic: {
        rps: rps,
        note: '내부만'
      },
      saturation: {
        cpuAvg: parseFloat(cpuAvg.toFixed(2)),
        memAvg: parseFloat(memAvg.toFixed(2)),
        top3Services: top3Services
      },
      replica: {
        healthy: replicaHealthy,
        unhealthy: replicaUnhealthy,
        unhealthyServices: replicaUnhealthyServices
      },
      trends: {
        // 추이 데이터는 별도 엔드포인트에서 제공
        start: startTime.toISOString(),
        end: endTime.toISOString()
      }
    })
  } catch (error) {
    console.error('Error getting overview:', error)
    res.status(500).json({ error: error.message })
  }
})

// Services 테이블 데이터
router.get('/services', async (req, res) => {
  try {
    const { namespace, sort } = req.query
    const startTime = new Date(Date.now() - 3600000) // 1시간 전
    const endTime = new Date()

    // 모든 서비스 가져오기
    const services = await kubernetesService.getServices()
    const deployments = await kubernetesService.getDeployments()

    // 서비스별 메트릭 수집
    const servicesData = await Promise.all(services.map(async (service) => {
      if (namespace && service.namespace !== namespace) {
        return null
      }

      const deployment = deployments.find(d => 
        d.namespace === service.namespace && 
        d.name === service.name
      )

      // Pod 메트릭 수집
      const pods = await kubernetesService.getPods({ 
        namespace: service.namespace,
        labelSelector: `app=${service.name}`
      })

      // Prometheus에서 서비스 메트릭 수집
      const serviceMetrics = await prometheusService.getServiceMetrics(
        service.name,
        service.namespace,
        startTime.toISOString(),
        endTime.toISOString()
      )
      
      // Prometheus에서 서비스 리소스 메트릭 수집
      const resourceMetrics = await prometheusService.getServiceResourceMetrics(
        service.name,
        service.namespace,
        startTime.toISOString(),
        endTime.toISOString()
      )

      // Restart 계산
      let restart1h = 0
      let restart24h = 0
      if (pods.length > 0) {
        pods.forEach(pod => {
          const restartCount = pod.restartCount || 0
          // TODO: 실제로는 Pod 이벤트에서 시간별 restart 계산 필요
          restart24h += restartCount
        })
      }

      return {
        name: service.name,
        namespace: service.namespace,
        rps: serviceMetrics.rps,
        latencyP95: serviceMetrics.latencyP95,
        errorRate5xx: serviceMetrics.errorRate5xx,
        errorRate4xx: serviceMetrics.errorRate4xx,
        replica: {
          desired: deployment?.desired || 0,
          available: deployment?.available || 0
        },
        restart: {
          '1h': restart1h,
          '24h': restart24h
        },
        cpu: resourceMetrics.cpu,
        mem: resourceMetrics.mem
      }
    }))

    // null 제거 및 정렬
    const filteredData = servicesData.filter(s => s !== null)
    
    if (sort) {
      const [field, order] = sort.split('-')
      filteredData.sort((a, b) => {
        let aVal, bVal
        if (field === 'p95') {
          aVal = a.latencyP95
          bVal = b.latencyP95
        } else if (field === '5xx') {
          aVal = a.errorRate5xx
          bVal = b.errorRate5xx
        } else if (field === 'cpu') {
          aVal = a.cpu
          bVal = b.cpu
        } else if (field === 'mem') {
          aVal = a.mem
          bVal = b.mem
        } else if (field === 'replica') {
          aVal = a.replica.desired - a.replica.available
          bVal = b.replica.desired - b.replica.available
        }
        return order === 'desc' ? bVal - aVal : aVal - bVal
      })
    }

    res.json(filteredData)
  } catch (error) {
    console.error('Error getting services:', error)
    res.status(500).json({ error: error.message })
  }
})

// Service Detail 데이터
router.get('/services/:namespace/:service', async (req, res) => {
  try {
    const { namespace, service } = req.params
    const { start, end } = req.query
    const startTime = start ? new Date(start) : new Date(Date.now() - 86400000) // 기본 24시간 전
    const endTime = end ? new Date(end) : new Date()

    // 서비스 정보
    const services = await kubernetesService.getServices()
    const serviceInfo = services.find(s => s.namespace === namespace && s.name === service)

    if (!serviceInfo) {
      return res.status(404).json({ error: 'Service not found' })
    }

    // Deployment 정보
    const deployments = await kubernetesService.getDeployments()
    const deployment = deployments.find(d => d.namespace === namespace && d.name === service)

    // Pod 목록
    const pods = await kubernetesService.getPods({ namespace, labelSelector: `app=${service}` })

    // 골든 시그널 데이터 (임시)
    const goldenSignals = {
      rps: [],
      latencyP95: [],
      latencyP99: [],
      errorRate4xx: [],
      errorRate5xx: []
    }

    // Replica 상태
    const replicaStatus = {
      desired: deployment?.desired || 0,
      available: deployment?.available || 0,
      pending: pods.filter(p => p.status === 'Pending').length,
      failed: pods.filter(p => p.status === 'Failed').length
    }

    // 리소스 사용량
    const cpuAvg = 0 // TODO: Prometheus에서 수집
    const memAvg = 0 // TODO: Prometheus에서 수집

    // Top Pod 3
    const topPods = pods.slice(0, 3).map(pod => ({
      name: pod.name,
      cpu: 0, // TODO: Prometheus에서 수집
      mem: 0 // TODO: Prometheus에서 수집
    }))

    res.json({
      service: {
        name: service,
        namespace: namespace
      },
      goldenSignals,
      slowApis: [], // TODO: Prometheus에서 수집
      errorApis: [], // TODO: Prometheus에서 수집
      replicaStatus,
      resources: {
        cpuAvg,
        memAvg,
        topPods
      },
      errorLogCount: [], // TODO: Loki에서 수집
      topExceptions: [], // TODO: Loki에서 수집
      slowTraces: [], // TODO: Tempo에서 수집
      errorTraces: [] // TODO: Tempo에서 수집
    })
  } catch (error) {
    console.error('Error getting service detail:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router


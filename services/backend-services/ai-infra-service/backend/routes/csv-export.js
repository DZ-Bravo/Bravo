import express from 'express'
import prometheusService from '../services/prometheus.js'
import kubernetesService from '../services/kubernetes.js'
import lokiService from '../services/loki.js'
import healthcheckService from '../services/healthcheck.js'

const router = express.Router()

// 전체 모니터링 데이터 CSV 다운로드
router.get('/metrics', async (req, res) => {
  try {
    const { node, start, end } = req.query
    const startDate = new Date(start)
    const endDate = new Date(end)
    
    // 1. 클러스터 개요
    const clusterOverview = await kubernetesService.getClusterOverview()
    const nodes = await kubernetesService.getNodes()
    
    // 2. 리소스 사용률 (node가 'all'이면 null 전달)
    const resourceUsageNode = node && node !== 'all' ? node : null
    const resourceUsage = await prometheusService.getResourceUsageTimeline(resourceUsageNode, startDate, endDate)
    
    // 3. Container/Pod 메트릭
    const [containerCPU, containerMemory, podCPU, podMemory] = await Promise.all([
      prometheusService.getContainerCPUMetrics(node || null, startDate, endDate).catch(() => []),
      prometheusService.getContainerMemoryMetrics(node || null, startDate, endDate).catch(() => []),
      prometheusService.getPodCPUMetrics(node || null, startDate, endDate).catch(() => []),
      prometheusService.getPodMemoryMetrics(node || null, startDate, endDate).catch(() => [])
    ])
    
    // 4. 에러 분석
    const [errorBreakdown, topErrors] = await Promise.all([
      prometheusService.get5xxErrorBreakdown(startDate, endDate).catch(() => ({
        haproxy: { count: 0, percentage: '0' },
        gateway: { count: 0, percentage: '0' },
        application: { count: 0, percentage: '0' },
        downstream: { count: 0, percentage: '0' },
        total: 0
      })),
      lokiService.getTopErrorMessages(startDate.toISOString(), endDate.toISOString(), 10).catch(() => [])
    ])
    
    // 5. 헬스체크 상태
    const healthcheck = await healthcheckService.getHealthcheckStatus().catch(() => ({
      hasErrors: false,
      errors: []
    }))
    
    // CSV 생성 (node가 없으면 'all'로 설정)
    const csvNode = node && node !== 'all' ? node : 'all'
    const csv = generateComprehensiveCSV({
      clusterOverview,
      nodes,
      resourceUsage,
      containerCPU,
      containerMemory,
      podCPU,
      podMemory,
      errorBreakdown,
      topErrors,
      healthcheck,
      node: csvNode,
      startDate,
      endDate
    })
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="monitoring-data-${node || 'cluster'}-${new Date().toISOString().split('T')[0]}.csv"`)
    res.send('\ufeff' + csv) // UTF-8 BOM 추가 (엑셀에서 한글 깨짐 방지)
  } catch (error) {
    console.error('Error generating comprehensive CSV:', error)
    res.status(500).json({ error: error.message })
  }
})

// 종합 CSV 생성 함수
function generateComprehensiveCSV({ clusterOverview, nodes, resourceUsage, containerCPU, containerMemory, podCPU, podMemory, errorBreakdown, topErrors, healthcheck, node, startDate, endDate }) {
  let csv = ''
  
  // 섹션 1: 클러스터 개요
  csv += '=== 클러스터 개요 ===\n'
  csv += '항목,값\n'
  csv += `노드 총 개수,${clusterOverview.nodes.total}\n`
  csv += `노드 Ready 개수,${clusterOverview.nodes.ready}\n`
  csv += `Pod 총 개수,${clusterOverview.pods.total}\n`
  csv += `Pod Running 개수,${clusterOverview.pods.running}\n`
  csv += `Pod Failed 개수,${clusterOverview.pods.failed}\n`
  csv += `Pod Pending 개수,${clusterOverview.pods.pending}\n`
  csv += '\n'
  
  // 섹션 2: 노드 정보
  csv += '=== 노드 정보 ===\n'
  csv += '노드명,IP,역할,상태,OS,Kernel,Container Runtime,Kubelet Version\n'
  nodes.forEach(n => {
    csv += `${n.name},${n.ip || ''},${n.role || ''},${n.status || ''},${n.os || ''},${n.kernel || ''},${n.containerRuntime || ''},${n.kubeletVersion || ''}\n`
  })
  csv += '\n'
  
  // 섹션 3: 리소스 사용률 (시계열)
  csv += '=== 리소스 사용률 (시계열) ===\n'
  csv += '시간,노드,CPU 사용률(%),Memory 사용률(%),CPU 평균(%),CPU 피크(%),Memory 평균(%),Memory 피크(%)\n'
  
  // resourceUsage 구조: { cpu: { current, average, peak, timeline: [{ timestamp, value }] }, memory: { ... } }
  if (resourceUsage.cpu && resourceUsage.cpu.timeline && resourceUsage.cpu.timeline.length > 0) {
    const cpuTimeline = resourceUsage.cpu.timeline
    const memoryTimeline = resourceUsage.memory && resourceUsage.memory.timeline ? resourceUsage.memory.timeline : []
    const cpuAvg = resourceUsage.cpu.average ? resourceUsage.cpu.average.toFixed(2) : '0'
    const cpuPeak = resourceUsage.cpu.peak ? resourceUsage.cpu.peak.toFixed(2) : '0'
    const memAvg = resourceUsage.memory && resourceUsage.memory.average ? resourceUsage.memory.average.toFixed(2) : '0'
    const memPeak = resourceUsage.memory && resourceUsage.memory.peak ? resourceUsage.memory.peak.toFixed(2) : '0'
    
    cpuTimeline.forEach((cpuPoint, index) => {
      const memoryPoint = memoryTimeline[index]
      const timestamp = new Date(cpuPoint.timestamp * 1000).toISOString()
      const cpuValue = cpuPoint.value.toFixed(2)
      const memoryValue = memoryPoint ? memoryPoint.value.toFixed(2) : '0'
      
      if (index === 0) {
        // 첫 번째 행에만 평균/피크 포함
        csv += `${timestamp},${node},${cpuValue},${memoryValue},${cpuAvg},${cpuPeak},${memAvg},${memPeak}\n`
      } else {
        csv += `${timestamp},${node},${cpuValue},${memoryValue},,,\n`
      }
    })
  } else if (resourceUsage.cpu && resourceUsage.cpu.current !== undefined) {
    // timeline이 없는 경우 현재값만
    const cpuValue = resourceUsage.cpu.current.toFixed(2)
    const memoryValue = resourceUsage.memory && resourceUsage.memory.current ? resourceUsage.memory.current.toFixed(2) : '0'
    const cpuAvg = resourceUsage.cpu.average ? resourceUsage.cpu.average.toFixed(2) : '0'
    const cpuPeak = resourceUsage.cpu.peak ? resourceUsage.cpu.peak.toFixed(2) : '0'
    const memAvg = resourceUsage.memory && resourceUsage.memory.average ? resourceUsage.memory.average.toFixed(2) : '0'
    const memPeak = resourceUsage.memory && resourceUsage.memory.peak ? resourceUsage.memory.peak.toFixed(2) : '0'
    
    csv += `${startDate.toISOString()},${node},${cpuValue},${memoryValue},${cpuAvg},${cpuPeak},${memAvg},${memPeak}\n`
  } else {
    csv += `${startDate.toISOString()},${node},0,0,0,0,0,0\n`
  }
  csv += '\n'
  
  // 섹션 4: Container CPU Top 5
  csv += '=== Container CPU 사용량 Top 5 ===\n'
  csv += '순위,Namespace,Pod,Container,현재 CPU 사용량(cores),피크 CPU 사용량(cores)\n'
  const containerCPUTop5 = containerCPU
    .filter(c => c.data && c.data.length > 0)
    .map(c => ({
      ...c,
      current: parseFloat(c.data[c.data.length - 1][1]),
      peak: Math.max(...c.data.map(d => parseFloat(d[1])))
    }))
    .sort((a, b) => b.current - a.current)
    .slice(0, 5)
  
  containerCPUTop5.forEach((c, index) => {
    csv += `${index + 1},${c.namespace},${c.pod},${c.name},${c.current.toFixed(4)},${c.peak.toFixed(4)}\n`
  })
  csv += '\n'
  
  // 섹션 5: Container Memory Top 5
  csv += '=== Container Memory 사용량 Top 5 ===\n'
  csv += '순위,Namespace,Pod,Container,현재 Memory 사용량(MB),피크 Memory 사용량(MB)\n'
  const containerMemoryTop5 = containerMemory
    .filter(c => c.usageBytesData && c.usageBytesData.length > 0)
    .map(c => {
      const currentBytes = parseFloat(c.usageBytesData[c.usageBytesData.length - 1][1])
      const peakBytes = Math.max(...c.usageBytesData.map(d => parseFloat(d[1])))
      return {
        ...c,
        current: currentBytes / 1024 / 1024, // MB
        peak: peakBytes / 1024 / 1024 // MB
      }
    })
    .sort((a, b) => b.current - a.current)
    .slice(0, 5)
  
  containerMemoryTop5.forEach((c, index) => {
    csv += `${index + 1},${c.namespace},${c.pod},${c.name},${c.current.toFixed(2)},${c.peak.toFixed(2)}\n`
  })
  csv += '\n'
  
  // 섹션 6: Pod CPU Top 5
  csv += '=== Pod CPU 사용량 Top 5 ===\n'
  csv += '순위,Namespace,Pod,현재 CPU 사용량(cores),피크 CPU 사용량(cores)\n'
  const podCPUTop5 = podCPU
    .filter(p => p.data && p.data.length > 0)
    .map(p => ({
      ...p,
      current: parseFloat(p.data[p.data.length - 1][1]),
      peak: Math.max(...p.data.map(d => parseFloat(d[1])))
    }))
    .sort((a, b) => b.current - a.current)
    .slice(0, 5)
  
  podCPUTop5.forEach((p, index) => {
    csv += `${index + 1},${p.namespace},${p.name},${p.current.toFixed(4)},${p.peak.toFixed(4)}\n`
  })
  csv += '\n'
  
  // 섹션 7: Pod Memory Top 5
  csv += '=== Pod Memory 사용량 Top 5 ===\n'
  csv += '순위,Namespace,Pod,현재 Memory 사용량(MB),피크 Memory 사용량(MB)\n'
  const podMemoryTop5 = podMemory
    .filter(p => p.usageBytesData && p.usageBytesData.length > 0)
    .map(p => {
      const currentBytes = parseFloat(p.usageBytesData[p.usageBytesData.length - 1][1])
      const peakBytes = Math.max(...p.usageBytesData.map(d => parseFloat(d[1])))
      return {
        ...p,
        current: currentBytes / 1024 / 1024, // MB
        peak: peakBytes / 1024 / 1024 // MB
      }
    })
    .sort((a, b) => b.current - a.current)
    .slice(0, 5)
  
  podMemoryTop5.forEach((p, index) => {
    csv += `${index + 1},${p.namespace},${p.name},${p.current.toFixed(2)},${p.peak.toFixed(2)}\n`
  })
  csv += '\n'
  
  // 섹션 8: 5XX 에러 분석
  csv += '=== 5XX 에러 단계별 분류 ===\n'
  csv += '단계,에러 수,비율(%)\n'
  csv += `HAProxy,${errorBreakdown.haproxy.count},${errorBreakdown.haproxy.percentage}\n`
  csv += `Gateway,${errorBreakdown.gateway.count},${errorBreakdown.gateway.percentage}\n`
  csv += `Application,${errorBreakdown.application.count},${errorBreakdown.application.percentage}\n`
  csv += `Downstream,${errorBreakdown.downstream.count},${errorBreakdown.downstream.percentage}\n`
  csv += `전체,${errorBreakdown.total},100.0\n`
  csv += '\n'
  
  // 섹션 9: Top 에러 메시지
  csv += '=== Top 10 에러 메시지 ===\n'
  csv += '순위,에러 메시지,발생 횟수,Namespace,Service,최근 발생 시간\n'
  topErrors.forEach((error, index) => {
    const message = (error.message || '').replace(/,/g, ';').replace(/\n/g, ' ').replace(/\r/g, '')
    csv += `${index + 1},"${message}",${error.count},${error.namespace || ''},${error.service || ''},${new Date(error.latestTimestamp).toISOString()}\n`
  })
  csv += '\n'
  
  // 섹션 10: 헬스체크 상태
  csv += '=== 헬스체크 상태 ===\n'
  csv += `상태,${healthcheck.hasErrors ? 'Critical' : 'Healthy'}\n`
  csv += `체크된 Pod 수,${healthcheck.checkedPods || 0}\n`
  csv += `에러 발생 Pod 수,${healthcheck.errors ? healthcheck.errors.length : 0}\n`
  csv += '\n'
  
  if (healthcheck.errors && healthcheck.errors.length > 0) {
    csv += '=== 헬스체크 에러 상세 ===\n'
    csv += 'Pod,Node,에러 메시지,발생 시간\n'
    healthcheck.errors.forEach(podError => {
      podError.errors.forEach(error => {
        const message = (error.message || '').replace(/,/g, ';').replace(/\n/g, ' ').replace(/\r/g, '')
        csv += `${podError.pod},${podError.node},"${message}",${error.timestamp || ''}\n`
      })
    })
  }
  
  return csv
}

// 노드 메트릭 CSV 다운로드 (기존 호환성 유지)
router.get('/nodes/metrics', async (req, res) => {
  try {
    const { node, start, end } = req.query
    const startDate = new Date(start)
    const endDate = new Date(end)
    
    const resourceUsage = await prometheusService.getResourceUsageTimeline(node || null, startDate, endDate)
    const nodes = await kubernetesService.getNodes()
    
    // 간단한 노드 메트릭 CSV 생성
    let csv = '시간,노드명,IP,CPU 사용률(%),메모리 사용률(%)\n'
    
    if (resourceUsage.cpu && resourceUsage.cpu.timeline && resourceUsage.cpu.timeline.length > 0) {
      resourceUsage.cpu.timeline.forEach((cpuPoint, index) => {
        const memoryPoint = resourceUsage.memory && resourceUsage.memory.timeline && resourceUsage.memory.timeline[index]
        const timestamp = new Date(cpuPoint.timestamp * 1000).toISOString()
        const nodeName = node || 'all'
        const nodeInfo = nodes.find(n => n.name === nodeName) || {}
        const cpuValue = cpuPoint.value.toFixed(2)
        const memoryValue = memoryPoint ? memoryPoint.value.toFixed(2) : '0'
        
        csv += `${timestamp},${nodeName},${nodeInfo.ip || ''},${cpuValue},${memoryValue}\n`
      })
    } else {
      // timeline이 없는 경우 현재값만
      const nodeName = node || 'all'
      const nodeInfo = nodes.find(n => n.name === nodeName) || {}
      const cpuValue = resourceUsage.cpu && resourceUsage.cpu.current ? resourceUsage.cpu.current.toFixed(2) : '0'
      const memoryValue = resourceUsage.memory && resourceUsage.memory.current ? resourceUsage.memory.current.toFixed(2) : '0'
      csv += `${startDate.toISOString()},${nodeName},${nodeInfo.ip || ''},${cpuValue},${memoryValue}\n`
    }
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="node-metrics-${Date.now()}.csv"`)
    res.send('\ufeff' + csv)
  } catch (error) {
    console.error('Error generating node metrics CSV:', error)
    res.status(500).json({ error: error.message })
  }
})

// Pod 메트릭 CSV 다운로드 (기존 호환성 유지)
router.get('/pods/metrics', async (req, res) => {
  try {
    const { namespace, node, start, end } = req.query
    const startDate = new Date(start)
    const endDate = new Date(end)
    
    const [podCPU, podMemory] = await Promise.all([
      prometheusService.getPodCPUMetrics(node || null, startDate, endDate).catch(() => []),
      prometheusService.getPodMemoryMetrics(node || null, startDate, endDate).catch(() => [])
    ])
    
    let csv = '시간,Namespace,Pod,CPU 사용량(cores),Memory 사용량(MB)\n'
    
    // Pod CPU/Memory 데이터를 시간별로 정렬하여 출력
    const timeMap = new Map()
    
    podCPU.forEach(pod => {
      if (pod.data && pod.data.length > 0) {
        pod.data.forEach(([timestamp, value]) => {
          if (!timeMap.has(timestamp)) {
            timeMap.set(timestamp, {})
          }
          const timeData = timeMap.get(timestamp)
          timeData[`${pod.namespace}/${pod.name}/cpu`] = value
        })
      }
    })
    
    podMemory.forEach(pod => {
      if (pod.usageBytesData && pod.usageBytesData.length > 0) {
        pod.usageBytesData.forEach(([timestamp, value]) => {
          if (!timeMap.has(timestamp)) {
            timeMap.set(timestamp, {})
          }
          const timeData = timeMap.get(timestamp)
          timeData[`${pod.namespace}/${pod.name}/memory`] = value / 1024 / 1024 // MB
        })
      }
    })
    
    // 시간순으로 정렬
    const sortedTimes = Array.from(timeMap.keys()).sort((a, b) => a - b)
    
    sortedTimes.forEach(timestamp => {
      const timeData = timeMap.get(timestamp)
      Object.keys(timeData).forEach(key => {
        const [namespace, pod, type] = key.split('/')
        const value = timeData[key]
        const timestampISO = new Date(timestamp * 1000).toISOString()
        csv += `${timestampISO},${namespace},${pod},${type === 'cpu' ? value.toFixed(4) : value.toFixed(2)}\n`
      })
    })
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="pod-metrics-${Date.now()}.csv"`)
    res.send('\ufeff' + csv)
  } catch (error) {
    console.error('Error generating pod metrics CSV:', error)
    res.status(500).json({ error: error.message })
  }
})

// 서비스 메트릭 CSV 다운로드 (기존 호환성 유지)
router.get('/services/metrics', async (req, res) => {
  try {
    const { start, end } = req.query
    const startDate = new Date(start)
    const endDate = new Date(end)
    
    const errorBreakdown = await prometheusService.get5xxErrorBreakdown(startDate, endDate).catch(() => ({
      haproxy: { count: 0, percentage: '0' },
      gateway: { count: 0, percentage: '0' },
      application: { count: 0, percentage: '0' },
      downstream: { count: 0, percentage: '0' },
      total: 0
    }))
    
    let csv = '단계,에러 수,비율(%)\n'
    csv += `HAProxy,${errorBreakdown.haproxy.count},${errorBreakdown.haproxy.percentage}\n`
    csv += `Gateway,${errorBreakdown.gateway.count},${errorBreakdown.gateway.percentage}\n`
    csv += `Application,${errorBreakdown.application.count},${errorBreakdown.application.percentage}\n`
    csv += `Downstream,${errorBreakdown.downstream.count},${errorBreakdown.downstream.percentage}\n`
    csv += `전체,${errorBreakdown.total},100.0\n`
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="service-metrics-${Date.now()}.csv"`)
    res.send('\ufeff' + csv)
  } catch (error) {
    console.error('Error generating service metrics CSV:', error)
    res.status(500).json({ error: error.message })
  }
})

// 전체 메트릭 CSV 다운로드 (기존 호환성 유지 - /metrics와 동일)
router.get('/all', async (req, res) => {
  try {
    const { node, start, end } = req.query
    const startDate = new Date(start)
    const endDate = new Date(end)
    
    // /metrics와 동일한 로직
    const clusterOverview = await kubernetesService.getClusterOverview()
    const nodes = await kubernetesService.getNodes()
    const resourceUsage = await prometheusService.getResourceUsageTimeline(node || null, startDate, endDate)
    
    const [containerCPU, containerMemory, podCPU, podMemory] = await Promise.all([
      prometheusService.getContainerCPUMetrics(node || null, startDate, endDate).catch(() => []),
      prometheusService.getContainerMemoryMetrics(node || null, startDate, endDate).catch(() => []),
      prometheusService.getPodCPUMetrics(node || null, startDate, endDate).catch(() => []),
      prometheusService.getPodMemoryMetrics(node || null, startDate, endDate).catch(() => [])
    ])
    
    const [errorBreakdown, topErrors] = await Promise.all([
      prometheusService.get5xxErrorBreakdown(startDate, endDate).catch(() => ({
        haproxy: { count: 0, percentage: '0' },
        gateway: { count: 0, percentage: '0' },
        application: { count: 0, percentage: '0' },
        downstream: { count: 0, percentage: '0' },
        total: 0
      })),
      lokiService.getTopErrorMessages(startDate.toISOString(), endDate.toISOString(), 10).catch(() => [])
    ])
    
    const healthcheck = await healthcheckService.getHealthcheckStatus().catch(() => ({
      hasErrors: false,
      errors: []
    }))
    
    const csv = generateComprehensiveCSV({
      clusterOverview,
      nodes,
      resourceUsage,
      containerCPU,
      containerMemory,
      podCPU,
      podMemory,
      errorBreakdown,
      topErrors,
      healthcheck,
      node: node || 'all',
      startDate,
      endDate
    })
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="all-metrics-${Date.now()}.csv"`)
    res.send('\ufeff' + csv)
  } catch (error) {
    console.error('Error generating all metrics CSV:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router

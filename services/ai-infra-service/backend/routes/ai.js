import express from 'express'
import bedrockAnalysisService from '../services/bedrock-analysis.js'
import prometheusService from '../services/prometheus.js'
import lokiService from '../services/loki.js'
import kubernetesService from '../services/kubernetes.js'
import healthcheckService from '../services/healthcheck.js'

const router = express.Router()

// AI 분석 요청
router.post('/analyze', async (req, res) => {
  try {
    const { node, namespace, service, timeRange } = req.body
    
    // 시간 범위 설정 (기본: 최근 1시간)
    const end = new Date()
    const start = timeRange?.start ? new Date(timeRange.start) : new Date(end.getTime() - 60 * 60 * 1000) // 기본 1시간
    
    // 1. 클러스터 개요
    const clusterOverview = await kubernetesService.getClusterOverview()
    
    // 2. 리소스 사용률 (시계열 데이터)
    const resourceUsage = await prometheusService.getResourceUsageTimeline(node || null, start, end)
    
    // 3. Container/Pod 메트릭
    const [containerCPU, containerMemory, podCPU, podMemory] = await Promise.all([
      prometheusService.getContainerCPUMetrics(node || null, start, end),
      prometheusService.getContainerMemoryMetrics(node || null, start, end),
      prometheusService.getPodCPUMetrics(node || null, start, end),
      prometheusService.getPodMemoryMetrics(node || null, start, end)
    ])
    
    // Container/Pod Top 5 및 임계치 초과 항목 추출
    const containerCPUData = extractTopAndThreshold(containerCPU, 'cpu', { warning: 0.7, critical: 0.85 })
    const containerMemoryData = extractTopAndThreshold(containerMemory, 'memory', { warning: 1073741824, critical: 2147483648 }) // 1GB, 2GB (임시)
    const podCPUData = extractTopAndThreshold(podCPU, 'cpu', { warning: 0.7, critical: 0.85 })
    const podMemoryData = extractTopAndThreshold(podMemory, 'memory', { warning: 1073741824, critical: 2147483648 })
    
    // 4. 에러 분석
    const [errorBreakdown, errorTimeline, topErrors, serviceErrors] = await Promise.all([
      prometheusService.get5xxErrorBreakdown(start, end).catch(err => {
        console.error('Error getting error breakdown:', err)
        return { haproxy: { count: 0, percentage: '0' }, gateway: { count: 0, percentage: '0' }, application: { count: 0, percentage: '0' }, downstream: { count: 0, percentage: '0' }, total: 0 }
      }),
      lokiService.getErrorLogCountOverTime(start.toISOString(), end.toISOString(), 'app').catch(err => {
        console.error('Error getting error timeline:', err)
        return []
      }),
      lokiService.getTopErrorMessages(start.toISOString(), end.toISOString(), 10).catch(err => {
        console.error('Error getting top errors:', err)
        return []
      }),
      lokiService.getServiceErrors(start.toISOString(), end.toISOString(), 30).catch(err => {
        console.error('Error getting service errors:', err)
        return []
      })
    ])
    
    // 5. 금일 5XX 에러 카운트 (errorBreakdown.total 사용)
    const errorCount = errorBreakdown.total || 0
    
    // 6. 헬스체크 상태
    const healthcheck = await healthcheckService.getHealthcheckStatus()
    
    // 데이터 구조화
    const analysisData = {
      cluster: {
        nodes: clusterOverview.nodes,
        pods: clusterOverview.pods,
        errorCount: errorCount ? parseFloat(errorCount) : 0
      },
      resourceUsage: {
        node: node || 'all',
        ...resourceUsage
      },
      containers: {
        cpu: containerCPUData,
        memory: containerMemoryData
      },
      pods: {
        cpu: podCPUData,
        memory: podMemoryData
      },
      errors: {
        breakdown: errorBreakdown,
        timeline: errorTimeline || [],
        topErrors: topErrors || [],
        recentErrors: serviceErrors || []
      },
      healthcheck: {
        status: healthcheck.hasErrors ? 'critical' : 'healthy',
        errors: healthcheck.errors || [],
        lastChecked: new Date().toISOString()
      },
      context: {
        selectedNode: node || 'all',
        timeRange: {
          start: start.toISOString(),
          end: end.toISOString(),
          duration: `${Math.floor((end - start) / (60 * 60 * 1000))}h`
        },
        analysisTime: new Date().toISOString()
      }
    }
    
    // Bedrock Agent로 분석 요청
    const analysis = await bedrockAnalysisService.requestAnalysis(analysisData)
    
    res.json(analysis)
  } catch (error) {
    console.error('Error in AI analysis:', error)
    res.status(500).json({ error: error.message })
  }
})

// Container/Pod 메트릭에서 Top 5 및 임계치 초과 항목 추출
function extractTopAndThreshold(items, type, thresholds) {
  // 현재 사용량 계산 (최근 값 사용)
  const itemsWithUsage = items.map(item => {
    const latestValue = item.data && item.data.length > 0 
      ? parseFloat(item.data[item.data.length - 1][1]) 
      : 0
    const peakValue = item.data && item.data.length > 0
      ? Math.max(...item.data.map(d => parseFloat(d[1])))
      : 0
    
    // 메모리의 경우 bytes를 GB로 변환
    const displayValue = type === 'memory' ? latestValue / (1024 * 1024 * 1024) : latestValue
    const displayPeak = type === 'memory' ? peakValue / (1024 * 1024 * 1024) : peakValue
    
    return {
      name: item.name,
      namespace: item.namespace,
      pod: item.pod || undefined,
      node: item.node || undefined,
      currentUsage: displayValue,
      peakUsage: displayPeak,
      trend: 'stable' // 추세 분석은 나중에 구현 가능
    }
  })
  
  // Top 5 (사용량 높은 순)
  const top5 = itemsWithUsage
    .sort((a, b) => b.currentUsage - a.currentUsage)
    .slice(0, 5)
  
  // 임계치 초과 항목
  const overThreshold = itemsWithUsage.filter(item => {
    const warning = type === 'cpu' ? thresholds.warning : (thresholds.warning / (1024 * 1024 * 1024))
    return item.currentUsage > warning
  }).map(item => ({
    ...item,
    threshold: type === 'cpu' ? thresholds.warning : (thresholds.warning / (1024 * 1024 * 1024))
  }))
  
  return {
    top5,
    overThreshold
  }
}

export default router


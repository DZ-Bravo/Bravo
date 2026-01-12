import express from 'express'
import bedrockAnalysisService from '../services/bedrock-analysis.js'
import prometheusService from '../services/prometheus.js'
import lokiService from '../services/loki.js'
import tempoService from '../services/tempo.js'
import kubernetesService from '../services/kubernetes.js'
import healthcheckService from '../services/healthcheck.js'

const router = express.Router()

// AI 분석 요청
router.post('/analyze', async (req, res) => {
  // 타임아웃 설정 (5분)
  req.setTimeout(300000)
  res.setTimeout(300000)
  
  const requestStart = Date.now()
  console.log('='.repeat(80))
  console.log('🚀 AI Analysis request started at', new Date().toISOString())
  console.log('Request body:', JSON.stringify(req.body, null, 2))
  console.log('='.repeat(80))
  
  try {
    const { node, namespace, service, timeRange } = req.body
    
    // 시간 범위 설정 (기본: 최근 1시간)
    const end = new Date()
    const start = timeRange?.start ? new Date(timeRange.start) : new Date(end.getTime() - 60 * 60 * 1000) // 기본 1시간
    
    console.log('Starting data collection...')
    const dataCollectionStart = Date.now()
    
    // 1. 클러스터 개요
    console.log('Fetching cluster overview...')
    const clusterOverview = await kubernetesService.getClusterOverview()
    console.log('Cluster overview fetched in', Date.now() - dataCollectionStart, 'ms')
    
    // 2. 리소스 사용률 (시계열 데이터)
    console.log('Fetching resource usage...')
    const resourceUsageStart = Date.now()
    const resourceUsage = await prometheusService.getResourceUsageTimeline(node || null, start, end)
    console.log('Resource usage fetched in', Date.now() - resourceUsageStart, 'ms')
    
    // 3. Container/Pod 메트릭
    console.log('Fetching container/pod metrics...')
    const metricsStart = Date.now()
    const [containerCPU, containerMemory, podCPU, podMemory] = await Promise.all([
      prometheusService.getContainerCPUMetrics(node || null, start, end),
      prometheusService.getContainerMemoryMetrics(node || null, start, end),
      prometheusService.getPodCPUMetrics(node || null, start, end),
      prometheusService.getPodMemoryMetrics(node || null, start, end)
    ])
    console.log('Container/pod metrics fetched in', Date.now() - metricsStart, 'ms')
    
    // Container/Pod Top 5 및 임계치 초과 항목 추출
    const containerCPUData = extractTopAndThreshold(containerCPU, 'cpu', { warning: 0.7, critical: 0.85 })
    const containerMemoryData = extractTopAndThreshold(containerMemory, 'memory', { warning: 1073741824, critical: 2147483648 }) // 1GB, 2GB (임시)
    const podCPUData = extractTopAndThreshold(podCPU, 'cpu', { warning: 0.7, critical: 0.85 })
    const podMemoryData = extractTopAndThreshold(podMemory, 'memory', { warning: 1073741824, critical: 2147483648 })
    
    // 4. 에러 분석
    console.log('Fetching error data...')
    const errorStart = Date.now()
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
    console.log('Error data fetched in', Date.now() - errorStart, 'ms')
    
    // 5. 금일 5XX 에러 카운트 (errorBreakdown.total 사용)
    const errorCount = errorBreakdown.total || 0
    
    // 6. 로그 분석 (상세 로그 데이터)
    console.log('Fetching log data...')
    const logStart = Date.now()
    const [recentLogs, logStats] = await Promise.all([
      lokiService.getServiceErrors(start.toISOString(), end.toISOString(), 50).catch(err => {
        console.error('Error getting recent logs:', err)
        return []
      }),
      Promise.resolve({
        totalErrorLogs: serviceErrors.length,
        uniqueServices: new Set(serviceErrors.map(e => e.service || e.namespace)).size,
        logLevels: {
          error: serviceErrors.filter(e => e.level === 'error').length,
          warning: serviceErrors.filter(e => e.level === 'warning').length,
          info: serviceErrors.filter(e => e.level === 'info').length
        }
      })
    ])
    console.log('Log data fetched in', Date.now() - logStart, 'ms')
    
    // 7. 트레이스 분석
    console.log('Fetching trace data...')
    const traceStart = Date.now()
    const [slowTraces, errorTraces, traceStats] = await Promise.all([
      tempoService.searchTraces('', start.toISOString(), end.toISOString()).catch(err => {
        console.error('Error getting slow traces:', err)
        return []
      }).then(traces => {
        // Duration 기준으로 정렬 (durationMs가 있는 경우)
        return traces
          .filter(t => t.durationMs && t.durationMs > 1000) // 1초 이상인 트레이스만
          .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
          .slice(0, 10)
          .map(t => ({
            traceId: t.traceID || t.traceId,
            service: t.rootServiceName || 'unknown',
            duration: t.durationMs || 0,
            startTime: t.startTimeUnixNano ? new Date(parseInt(t.startTimeUnixNano) / 1000000).toISOString() : null
          }))
      }),
      tempoService.searchTraces('', start.toISOString(), end.toISOString()).catch(err => {
        console.error('Error getting error traces:', err)
        return []
      }).then(traces => {
        // 에러 트레이스 필터링
        return traces
          .filter(t => t.tags?.error === 'true' || t.tags?.status_code >= 400 || t.statusCode >= 400 || t.error === true)
          .sort((a, b) => {
            const aTime = a.startTimeUnixNano || a.startTime || 0
            const bTime = b.startTimeUnixNano || b.startTime || 0
            return bTime - aTime
          })
          .slice(0, 10)
          .map(t => ({
            traceId: t.traceID || t.traceId,
            service: t.rootServiceName || 'unknown',
            duration: t.durationMs || 0,
            startTime: t.startTimeUnixNano ? new Date(parseInt(t.startTimeUnixNano) / 1000000).toISOString() : null,
            error: true,
            statusCode: t.tags?.status_code || t.statusCode
          }))
      }),
      tempoService.searchTraces('', start.toISOString(), end.toISOString()).catch(err => {
        console.error('Error getting trace stats:', err)
        return []
      }).then(traces => {
        const services = new Set(traces.map(t => t.rootServiceName).filter(Boolean))
        const totalTraces = traces.length
        const errorTracesCount = traces.filter(t => t.tags?.error === 'true' || t.tags?.status_code >= 400 || t.statusCode >= 400).length
        const avgDuration = traces.length > 0 
          ? traces.reduce((sum, t) => sum + (t.durationMs || 0), 0) / traces.length 
          : 0
        
        return {
          totalTraces,
          errorTracesCount,
          uniqueServices: services.size,
          services: Array.from(services),
          avgDuration: Math.round(avgDuration),
          slowTracesCount: traces.filter(t => t.durationMs && t.durationMs > 1000).length
        }
      })
    ])
    console.log('Trace data fetched in', Date.now() - traceStart, 'ms')
    
    // 8. 헬스체크 상태
    console.log('Fetching healthcheck status...')
    const healthcheckStart = Date.now()
    const healthcheck = await healthcheckService.getHealthcheckStatus()
    console.log('Healthcheck fetched in', Date.now() - healthcheckStart, 'ms')
    
    const dataCollectionEnd = Date.now()
    console.log('Data collection completed in', dataCollectionEnd - dataCollectionStart, 'ms')
    
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
      logs: {
        recent: recentLogs || [],
        stats: logStats,
        topMessages: topErrors || []
      },
      traces: {
        slow: slowTraces || [],
        errors: errorTraces || [],
        stats: traceStats || {}
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
    
    console.log('Calling Bedrock Agent...')
    const bedrockStart = Date.now()
    
    // Bedrock Agent로 분석 요청
    const analysis = await bedrockAnalysisService.requestAnalysis(analysisData)
    
    const bedrockEnd = Date.now()
    const totalTime = Date.now() - requestStart
    console.log(`Bedrock Agent call completed in ${bedrockEnd - bedrockStart}ms`)
    console.log(`Total request time: ${totalTime}ms`)
    
    res.json(analysis)
  } catch (error) {
    const totalTime = Date.now() - requestStart
    console.error('Error in AI analysis:', error)
    console.error('Error occurred after', totalTime, 'ms')
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack?.substring(0, 500)
    })
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


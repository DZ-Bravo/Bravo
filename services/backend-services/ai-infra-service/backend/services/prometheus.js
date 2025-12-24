import axios from 'axios'

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus.bravo-monitoring-ns:9090'

// Prometheus 쿼리 실행
async function queryPrometheus(query) {
  try {
    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
      params: { query }
    })
    return response.data.data.result
  } catch (error) {
    console.error('Prometheus query error:', error)
    throw error
  }
}

// Prometheus range query 실행
async function queryRange(query, start, end, step = '15s') {
  try {
    // ISO 문자열을 Unix 타임스탬프로 변환
    const startTs = typeof start === 'string' ? Math.floor(new Date(start).getTime() / 1000) : start
    const endTs = typeof end === 'string' ? Math.floor(new Date(end).getTime() / 1000) : end
    
    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
      params: {
        query,
        start: startTs,
        end: endTs,
        step
      }
    })
    
    if (response.data.status === 'success') {
      return response.data.data.result
    } else {
      throw new Error(response.data.error || 'Query failed')
    }
  } catch (error) {
    console.error('Prometheus query_range error:', error.message, 'Query:', query)
    throw error
  }
}

// 노드 CPU 사용률
async function getNodeCPU(nodeName) {
  const query = nodeName 
    ? `100 - (avg(rate(node_cpu_seconds_total{mode="idle",instance=~"${nodeName}.*"}[5m])) * 100)`
    : `100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`
  return queryPrometheus(query)
}

// 노드 메모리 사용률
async function getNodeMemory(nodeName) {
  const query = nodeName
    ? `(1 - (node_memory_MemAvailable_bytes{instance=~"${nodeName}.*"} / node_memory_MemTotal_bytes{instance=~"${nodeName}.*"})) * 100`
    : `(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100`
  return queryPrometheus(query)
}

// 실시간 메트릭
async function getRealtimeMetrics(nodeName) {
  const [cpu, memory, errorRate] = await Promise.all([
    getNodeCPU(nodeName),
    getNodeMemory(nodeName),
    get5xxErrorRate()
  ])
  
  return {
    cpu: cpu[0]?.value[1] || '0',
    memory: memory[0]?.value[1] || '0',
    errorRate: errorRate || '0'
  }
}

// 5xx 에러율
async function get5xxErrorRate() {
  const query = `sum(rate(istio_requests_total{response_code=~"5.."}[5m]))`
  const result = await queryPrometheus(query)
  return result[0]?.value[1] || '0'
}

// 5xx 에러 단계별 분류
async function get5xxErrorBreakdown(startTime, endTime) {
  // Prometheus rate() 함수는 고정된 duration을 사용 (5분 또는 1시간)
  // ISO 문자열이 전달되면 Date 객체로 변환, 그렇지 않으면 기본값 사용
  const timeRange = '[5m]' // rate() 함수의 기본 duration
  
  try {
    // 1. HAProxy 레벨 (메트릭이 존재하지 않을 수 있으므로 기본값 반환)
    let haproxyErrors = []
    try {
      const haproxyQuery = `sum(rate(haproxy_backend_http_responses_total{code=~"5.."}${timeRange}))`
      haproxyErrors = await queryPrometheus(haproxyQuery)
    } catch (e) {
      console.warn('HAProxy metrics not available:', e.message)
    }
    
    // 2. Istio Gateway 레벨
    let gatewayErrors = []
    try {
      const gatewayQuery = `sum(rate(istio_requests_total{source_workload="istio-ingressgateway",response_code=~"5.."}${timeRange}))`
      gatewayErrors = await queryPrometheus(gatewayQuery)
    } catch (e) {
      console.warn('Gateway metrics not available:', e.message)
    }
    
    // 3. Application 레벨
    let appErrors = []
    try {
      const appQuery = `sum(rate(istio_requests_total{destination_workload_namespace=~"bravo-.*",response_code=~"5.."}${timeRange}))`
      appErrors = await queryPrometheus(appQuery)
    } catch (e) {
      console.warn('Application metrics not available:', e.message)
    }
    
    // 4. Downstream 레벨
    let downstreamErrors = []
    try {
      const downstreamQuery = `sum(rate(istio_requests_total{response_code=~"5..",response_flags=~"UF|UO|DC|NR|UH"}${timeRange}))`
      downstreamErrors = await queryPrometheus(downstreamQuery)
    } catch (e) {
      console.warn('Downstream metrics not available:', e.message)
    }
    
    const totalHAProxy = parseFloat(haproxyErrors[0]?.value[1] || 0)
    const totalGateway = parseFloat(gatewayErrors[0]?.value[1] || 0)
    const totalApp = parseFloat(appErrors[0]?.value[1] || 0)
    const totalDownstream = parseFloat(downstreamErrors[0]?.value[1] || 0)
    const total = totalHAProxy + totalGateway + totalApp + totalDownstream
    
    return {
      haproxy: {
        count: totalHAProxy,
        percentage: total > 0 ? (totalHAProxy / total * 100).toFixed(1) : '0'
      },
      gateway: {
        count: totalGateway,
        percentage: total > 0 ? (totalGateway / total * 100).toFixed(1) : '0'
      },
      application: {
        count: totalApp,
        percentage: total > 0 ? (totalApp / total * 100).toFixed(1) : '0'
      },
      downstream: {
        count: totalDownstream,
        percentage: total > 0 ? (totalDownstream / total * 100).toFixed(1) : '0'
      },
      total
    }
  } catch (error) {
    console.error('Error in get5xxErrorBreakdown:', error)
    // 에러 발생 시 기본값 반환
    return {
      haproxy: { count: 0, percentage: '0' },
      gateway: { count: 0, percentage: '0' },
      application: { count: 0, percentage: '0' },
      downstream: { count: 0, percentage: '0' },
      total: 0
    }
  }
}

// 노드 메트릭 (시계열)
async function getNodeMetrics(nodeName, start, end) {
  const step = '15s'
  
  // CPU 쿼리 수정: rate()는 range query에서도 작동하지만, 100% 기준으로 계산
  // node_cpu_seconds_total은 모든 CPU 코어의 누적 시간이므로, idle이 아닌 것을 합산
  const cpuQuery = nodeName
    ? `(1 - avg(rate(node_cpu_seconds_total{mode="idle",instance=~"${nodeName}:.*"}[5m]))) * 100`
    : `(1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))) * 100`
  
  const memoryQuery = nodeName
    ? `(1 - (avg(node_memory_MemAvailable_bytes{instance=~"${nodeName}:.*"}) / avg(node_memory_MemTotal_bytes{instance=~"${nodeName}:.*"}))) * 100`
    : `(1 - (avg(node_memory_MemAvailable_bytes) / avg(node_memory_MemTotal_bytes))) * 100`
  
  try {
    const [cpu, memory] = await Promise.all([
      queryRange(cpuQuery, start, end, step).catch(err => {
        console.error('CPU query error:', err.message, 'Query:', cpuQuery)
        return []
      }),
      queryRange(memoryQuery, start, end, step).catch(err => {
        console.error('Memory query error:', err.message, 'Query:', memoryQuery)
        return []
      })
    ])
    
    return { cpu, memory }
  } catch (error) {
    console.error('Error in getNodeMetrics:', error)
    return { cpu: [], memory: [] }
  }
}

// 과거 메트릭 (시계열)
async function getHistoryMetrics(nodeName, start, end, step = '15s') {
  return getNodeMetrics(nodeName, start, end)
}

// 서비스별 에러 통계
async function getServiceErrorStats(startTime, endTime) {
  const timeRange = endTime && startTime ? `[${Math.floor((endTime - startTime) / 1000)}s]` : '[1h]'
  const query = `sum(rate(istio_requests_total{response_code=~"5.."}${timeRange})) by (destination_service_name)`
  const result = await queryPrometheus(query)
  
  return result.map(r => ({
    service: r.metric.destination_service_name,
    count: parseFloat(r.value[1])
  }))
}

// Container CPU 사용률 (시계열) - Prometheus cAdvisor 메트릭 사용
async function getContainerCPUMetrics(nodeName, start, end, step = '15s') {
  try {
    // Prometheus에서 container_cpu_usage_seconds_total 메트릭 쿼리
    // rate()를 사용하여 CPU 사용률 계산 (초당 사용량, cores 단위)
    let query = 'sum(rate(container_cpu_usage_seconds_total{container!="POD",container!=""}[5m])) by (namespace,pod,container)'
    
    if (nodeName) {
      query = `sum(rate(container_cpu_usage_seconds_total{container!="POD",container!="",kubernetes_node="${nodeName}"}[5m])) by (namespace,pod,container)`
    }
    
    const results = await queryRange(query, start, end, step)
    
    // 결과를 그룹화하여 시계열 데이터 형식으로 변환
    const containerMap = {}
    
    results.forEach(result => {
      const namespace = result.metric.namespace || 'default'
      const pod = result.metric.pod || ''
      const container = result.metric.container || ''
      const key = `${namespace}/${pod}/${container}`
      
      if (!containerMap[key]) {
        containerMap[key] = {
          name: container,
          namespace: namespace,
          pod: pod,
          data: []
        }
      }
      
      // CPU 사용률을 percentage로 변환하려면 전체 CPU 코어 수로 나눠야 하지만,
      // 여기서는 cores 단위로 그대로 사용 (프론트엔드에서 처리)
      if (result.values && result.values.length > 0) {
        containerMap[key].data = result.values.map(v => [v[0], parseFloat(v[1])])
      }
    })
    
    return Object.values(containerMap)
  } catch (error) {
    console.error('Error getting container CPU metrics:', error)
    return []
  }
}

// Container Memory 사용률 (시계열) - Prometheus cAdvisor 메트릭 사용
async function getContainerMemoryMetrics(nodeName, start, end, step = '15s') {
  try {
    // 사용량과 limit을 함께 가져오기
    const usageQuery = nodeName
      ? 'sum(container_memory_working_set_bytes{container!="POD",name!=""}) by (namespace,pod,container)'
      : 'sum(container_memory_working_set_bytes{container!="POD",name!=""}) by (namespace,pod,container)'
    
    // limit 정보 가져오기 (kube_pod_container_resource_limits 사용)
    const limitQuery = nodeName
      ? 'sum(container_spec_memory_limit_bytes{container!="POD",container!=""}) by (namespace,pod,container)'
      : 'sum(container_spec_memory_limit_bytes{container!="POD",container!=""}) by (namespace,pod,container)'
    
    const [usageResults, limitResults] = await Promise.all([
      queryRange(usageQuery, start, end, step).catch(err => {
        console.warn('Container memory usage query failed:', err.message)
        return []
      }),
      queryPrometheus(limitQuery).catch(err => {
        console.warn('Container memory limit query failed:', err.message)
        return []
      })
    ])
    
    // limit 정보를 Map으로 변환 (namespace/pod/container를 키로)
    const limitMap = new Map()
    limitResults.forEach(result => {
      const namespace = result.metric.namespace || 'default'
      const pod = result.metric.pod || ''
      const container = result.metric.container || ''
      const key = `${namespace}/${pod}/${container}`
      const limitBytes = parseFloat(result.value[1])
      if (limitBytes > 0) {
        limitMap.set(key, limitBytes)
      }
    })
    
    // 결과를 그룹화하여 시계열 데이터 형식으로 변환
    const containerMap = {}
    
    usageResults.forEach(result => {
      const namespace = result.metric.namespace || 'default'
      const pod = result.metric.pod || ''
      const container = result.metric.container || ''
      const key = `${namespace}/${pod}/${container}`
      
      if (!containerMap[key]) {
        containerMap[key] = {
          name: container,
          namespace: namespace,
          pod: pod,
          data: []
        }
      }
      
      const limitBytes = limitMap.get(key) || 0
      
      // Memory 사용률(%) 계산: (사용량 / limit) * 100
      // limit이 없으면 0 반환 (표시 안 함)
      if (result.values && result.values.length > 0) {
        containerMap[key].data = result.values.map(v => {
          const usageBytes = parseFloat(v[1])
          const usagePercent = limitBytes > 0 ? (usageBytes / limitBytes * 100) : 0
          return [v[0], usagePercent]
        })
        // 원본 bytes 값도 저장 (리스트/Top 5에서 MB 표시용)
        containerMap[key].usageBytesData = result.values.map(v => [v[0], parseFloat(v[1])])
        containerMap[key].limitBytes = limitBytes
      }
    })
    
    return Object.values(containerMap)
  } catch (error) {
    console.error('Error getting container memory metrics:', error)
    return []
  }
}

// Pod CPU 사용률 (시계열) - Prometheus cAdvisor 메트릭 사용 (컨테이너 집계)
async function getPodCPUMetrics(nodeName, start, end, step = '15s') {
  try {
    // Prometheus에서 container_cpu_usage_seconds_total 메트릭을 Pod별로 집계
    let query = 'sum(rate(container_cpu_usage_seconds_total{container!="POD",name!=""}[5m])) by (namespace,pod)'
    
    if (nodeName) {
      query = `sum(rate(container_cpu_usage_seconds_total{container!="POD",name!="",instance=~"${nodeName}"}[5m])) by (namespace,pod)`
    }
    
    const results = await queryRange(query, start, end, step)
    
    // 결과를 Pod별로 그룹화
    const podMap = {}
    
    results.forEach(result => {
      const namespace = result.metric.namespace || 'default'
      const pod = result.metric.pod || ''
      const key = `${namespace}/${pod}`
      
      if (!podMap[key]) {
        podMap[key] = {
          name: pod,
          namespace: namespace,
          data: []
        }
      }
      
      // CPU 사용률 (cores 단위)
      if (result.values && result.values.length > 0) {
        podMap[key].data = result.values.map(v => [v[0], parseFloat(v[1])])
      }
    })
    
    return Object.values(podMap)
  } catch (error) {
    console.error('Error getting pod CPU metrics:', error)
    return []
  }
}

// Pod Memory 사용률 (시계열) - Prometheus cAdvisor 메트릭 사용 (컨테이너 집계)
async function getPodMemoryMetrics(nodeName, start, end, step = '15s') {
  try {
    // 사용량과 limit을 함께 가져오기
    const usageQuery = nodeName
      ? 'sum(container_memory_working_set_bytes{container!="POD",name!=""}) by (namespace,pod)'
      : 'sum(container_memory_working_set_bytes{container!="POD",name!=""}) by (namespace,pod)'
    
    // Pod의 모든 컨테이너 limit 합계
    const limitQuery = nodeName
      ? 'sum(container_spec_memory_limit_bytes{container!="POD",container!=""}) by (namespace,pod)'
      : 'sum(container_spec_memory_limit_bytes{container!="POD",container!=""}) by (namespace,pod)'
    
    const [usageResults, limitResults] = await Promise.all([
      queryRange(usageQuery, start, end, step).catch(err => {
        console.warn('Pod memory usage query failed:', err.message)
        return []
      }),
      queryPrometheus(limitQuery).catch(err => {
        console.warn('Pod memory limit query failed:', err.message)
        return []
      })
    ])
    
    // limit 정보를 Map으로 변환 (namespace/pod를 키로)
    const limitMap = new Map()
    limitResults.forEach(result => {
      const namespace = result.metric.namespace || 'default'
      const pod = result.metric.pod || ''
      const key = `${namespace}/${pod}`
      const limitBytes = parseFloat(result.value[1])
      if (limitBytes > 0) {
        limitMap.set(key, limitBytes)
      }
    })
    
    // 결과를 Pod별로 그룹화
    const podMap = {}
    
    usageResults.forEach(result => {
      const namespace = result.metric.namespace || 'default'
      const pod = result.metric.pod || ''
      const key = `${namespace}/${pod}`
      
      if (!podMap[key]) {
        podMap[key] = {
          name: pod,
          namespace: namespace,
          data: []
        }
      }
      
      const limitBytes = limitMap.get(key) || 0
      
      // Memory 사용률(%) 계산: (사용량 / limit) * 100
      // limit이 없으면 0 반환 (표시 안 함)
      if (result.values && result.values.length > 0) {
        podMap[key].data = result.values.map(v => {
          const usageBytes = parseFloat(v[1])
          const usagePercent = limitBytes > 0 ? (usageBytes / limitBytes * 100) : 0
          return [v[0], usagePercent]
        })
        // 원본 bytes 값도 저장 (리스트/Top 5에서 MB 표시용)
        podMap[key].usageBytesData = result.values.map(v => [v[0], parseFloat(v[1])])
        podMap[key].limitBytes = limitBytes
      }
    })
    
    return Object.values(podMap)
  } catch (error) {
    console.error('Error getting pod memory metrics:', error)
    return []
  }
}

// 클러스터 전체 CPU/메모리 사용률 (시계열) - 노드 선택에 따라
async function getClusterMetrics(start, end, nodeName, step = '15s') {
  // getNodeMetrics의 파라미터 순서: (nodeName, start, end)
  return getNodeMetrics(nodeName, start, end)
}

// 리소스 사용률 시계열 데이터 (AI 분석용)
async function getResourceUsageTimeline(nodeName, start, end, step = '15s') {
  try {
    const [cpuResults, memoryResults] = await Promise.all([
      queryRange(
        nodeName
          ? `100 - (avg(rate(node_cpu_seconds_total{mode="idle",instance=~"${nodeName}.*"}[5m])) * 100)`
          : `100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`,
        start,
        end,
        step
      ),
      queryRange(
        nodeName
          ? `(1 - (node_memory_MemAvailable_bytes{instance=~"${nodeName}.*"} / node_memory_MemTotal_bytes{instance=~"${nodeName}.*"})) * 100`
          : `(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100`,
        start,
        end,
        step
      )
    ])

    const cpuTimeline = cpuResults[0]?.values || []
    const memoryTimeline = memoryResults[0]?.values || []

    // 평균 및 피크 계산
    const cpuValues = cpuTimeline.map(v => parseFloat(v[1])).filter(v => !isNaN(v))
    const memoryValues = memoryTimeline.map(v => parseFloat(v[1])).filter(v => !isNaN(v))

    const cpuAverage = cpuValues.length > 0 ? cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length : 0
    const cpuPeak = cpuValues.length > 0 ? Math.max(...cpuValues) : 0
    const cpuCurrent = cpuValues.length > 0 ? cpuValues[cpuValues.length - 1] : 0

    const memoryAverage = memoryValues.length > 0 ? memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length : 0
    const memoryPeak = memoryValues.length > 0 ? Math.max(...memoryValues) : 0
    const memoryCurrent = memoryValues.length > 0 ? memoryValues[memoryValues.length - 1] : 0

    return {
      cpu: {
        current: cpuCurrent,
        average: cpuAverage,
        peak: cpuPeak,
        threshold: { warning: 70, critical: 85 },
        timeline: cpuTimeline.slice(-20).map(v => ({ timestamp: parseInt(v[0]), value: parseFloat(v[1]) })) // 최근 20개만
      },
      memory: {
        current: memoryCurrent,
        average: memoryAverage,
        peak: memoryPeak,
        threshold: { warning: 75, critical: 90 },
        timeline: memoryTimeline.slice(-20).map(v => ({ timestamp: parseInt(v[0]), value: parseFloat(v[1]) })) // 최근 20개만
      }
    }
  } catch (error) {
    console.error('Error getting resource usage timeline:', error)
    return {
      cpu: { current: 0, average: 0, peak: 0, threshold: { warning: 70, critical: 85 }, timeline: [] },
      memory: { current: 0, average: 0, peak: 0, threshold: { warning: 75, critical: 90 }, timeline: [] }
    }
  }
}

export default {
  queryPrometheus,
  queryRange,
  getRealtimeMetrics,
  getNodeMetrics,
  getHistoryMetrics,
  get5xxErrorBreakdown,
  get5xxErrorRate,
  getServiceErrorStats,
  getContainerCPUMetrics,
  getContainerMemoryMetrics,
  getPodCPUMetrics,
  getPodMemoryMetrics,
  getClusterMetrics,
  getResourceUsageTimeline
}


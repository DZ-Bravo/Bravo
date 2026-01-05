import axios from 'axios'
import kubernetesService from './kubernetes.js'

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://43.200.143.174:9090'

// Prometheus 쿼리 실행
async function queryPrometheus(query) {
  try {
    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
      params: { query },
      timeout: 10000
    })
    if (response.data.status !== 'success') {
      console.warn(`⚠️ Prometheus query returned non-success status: ${response.data.status}`, query)
      return []
    }
    return response.data.data.result || []
  } catch (error) {
    console.error('❌ Prometheus query error:', error.message, 'Query:', query)
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

// 5xx 에러율 (애플리케이션 메트릭 사용)
async function get5xxErrorRate() {
  const query = `sum(rate(http_requests_total{status_code=~"5..",kubernetes_namespace=~"bravo-.*"}[5m]))`
  const result = await queryPrometheus(query).catch(() => [{ value: [0, '0'] }])
  return result[0]?.value[1] || '0'
}

// 5xx 에러 단계별 분류 (애플리케이션 메트릭 사용)
async function get5xxErrorBreakdown(startTime, endTime) {
  // Prometheus rate() 함수는 고정된 duration을 사용 (5분 또는 1시간)
  // ISO 문자열이 전달되면 Date 객체로 변환, 그렇지 않으면 기본값 사용
  const timeRange = '[5m]' // rate() 함수의 기본 duration
  
  try {
    // 애플리케이션 레벨 5xx 에러 수집 - service 레이블로 먼저 시도
    let appErrors = []
    try {
      // service 레이블이 있는 메트릭 먼저 시도
      let appQuery = `sum(rate(http_requests_total{service=~".+",status_code=~"5.."}${timeRange}))`
      appErrors = await queryPrometheus(appQuery).catch(() => [])
      
      // 결과가 없으면 kubernetes_namespace로 시도
      if (!appErrors || appErrors.length === 0 || !appErrors[0]?.value?.[1] || parseFloat(appErrors[0].value[1]) === 0) {
        appQuery = `sum(rate(http_requests_total{kubernetes_namespace=~"bravo-.*",status_code=~"5.."}${timeRange}))`
        appErrors = await queryPrometheus(appQuery).catch(() => [])
      }
      
      // 그래도 없으면 전체 시도
      if (!appErrors || appErrors.length === 0 || !appErrors[0]?.value?.[1] || parseFloat(appErrors[0].value[1]) === 0) {
        appQuery = `sum(rate(http_requests_total{status_code=~"5.."}${timeRange}))`
        appErrors = await queryPrometheus(appQuery).catch(() => [])
      }
    } catch (e) {
      console.warn('Application metrics not available:', e.message)
    }
    
    const totalApp = parseFloat(appErrors[0]?.value[1] || 0)
    const total = totalApp
    
    return {
      application: {
        count: totalApp,
        percentage: total > 0 ? (totalApp / total * 100).toFixed(1) : '0'
      },
      total
    }
  } catch (error) {
    console.error('Error in get5xxErrorBreakdown:', error)
    // 에러 발생 시 기본값 반환
    return {
      application: { count: 0, percentage: '0' },
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

// 서비스별 에러 통계 (애플리케이션 메트릭 사용)
async function getServiceErrorStats(startTime, endTime) {
  const timeRange = endTime && startTime ? `[${Math.floor((endTime - startTime) / 1000)}s]` : '[1h]'
  const query = `sum(rate(http_requests_total{status_code=~"5..",kubernetes_namespace=~"bravo-.*"}${timeRange})) by (service)`
  const result = await queryPrometheus(query).catch(() => [])
  
  return result.map(r => ({
    service: r.metric.service || 'unknown',
    count: parseFloat(r.value[1])
  }))
}

// Container CPU 사용률 (시계열) - Prometheus cAdvisor 메트릭 사용
async function getContainerCPUMetrics(nodeName, start, end, step = '15s') {
  try {
    // Prometheus에서 container_cpu_usage_seconds_total 메트릭 쿼리
    // rate()를 사용하여 CPU 사용률 계산 (초당 사용량, cores 단위)
    // namespace와 pod label이 있는 메트릭만 사용
    let query = 'sum(rate(container_cpu_usage_seconds_total{namespace=~"bravo-.*",pod!=""}[5m])) by (namespace,pod,container_name)'
    
    if (nodeName) {
      query = `sum(rate(container_cpu_usage_seconds_total{namespace=~"bravo-.*",pod!="",instance=~"${nodeName}"}[5m])) by (namespace,pod,container_name)`
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
    // namespace와 pod label이 있는 메트릭만 사용
    const usageQuery = nodeName
      ? 'sum(container_memory_working_set_bytes{namespace=~"bravo-.*",pod!=""}) by (namespace,pod,container_name)'
      : 'sum(container_memory_working_set_bytes{namespace=~"bravo-.*",pod!=""}) by (namespace,pod,container_name)'
    
    // limit 정보 가져오기
    const limitQuery = nodeName
      ? 'sum(container_spec_memory_limit_bytes{namespace=~"bravo-.*",pod!=""}) by (namespace,pod,container_name)'
      : 'sum(container_spec_memory_limit_bytes{namespace=~"bravo-.*",pod!=""}) by (namespace,pod,container_name)'
    
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
      const container = result.metric.container_name || result.metric.container || ''
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
      const container = result.metric.container_name || result.metric.container || ''
      const key = `${namespace}/${pod}/${container}`
      
      if (!containerMap[key]) {
        containerMap[key] = {
          name: container || 'unknown',
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
    // namespace label이 없을 수 있으므로 pod 이름 패턴으로 필터링
    // 먼저 namespace로 시도, 없으면 pod 이름 패턴 사용
    let usageQuery = 'sum(rate(container_cpu_usage_seconds_total{namespace=~"bravo-.*",container!="POD",container!=""}[5m])) by (pod)'
    let limitQuery = 'sum(container_spec_cpu_quota{namespace=~"bravo-.*",container!="POD",container!=""} / 100000) by (pod)'
    
    // Fallback: namespace label 없이 pod 이름 패턴으로 필터링
    let usageQueryFallback = 'sum(rate(container_cpu_usage_seconds_total{pod=~"auth-service-.*|community-service-.*|mountain-service-.*|notice-service-.*|notification-service-.*|schedule-service-.*|stamp-service-.*|store-service-.*|ai-service-.*|chatbot-service-.*|ai-infra-service-.*|frontend-.*",container!="POD",container!=""}[5m])) by (pod)'
    let limitQueryFallback = 'sum(container_spec_cpu_quota{pod=~"auth-service-.*|community-service-.*|mountain-service-.*|notice-service-.*|notification-service-.*|schedule-service-.*|stamp-service-.*|store-service-.*|ai-service-.*|chatbot-service-.*|ai-infra-service-.*|frontend-.*",container!="POD",container!=""} / 100000) by (pod)'
    
    // 최종 fallback: 모든 컨테이너 (필터링 최소화)
    let usageQueryFinalFallback = 'sum(rate(container_cpu_usage_seconds_total{container!="POD",container!=""}[5m])) by (pod)'
    let limitQueryFinalFallback = 'sum(container_spec_cpu_quota{container!="POD",container!=""} / 100000) by (pod)'
    
    if (nodeName) {
      usageQuery = `sum(rate(container_cpu_usage_seconds_total{namespace=~"bravo-.*",container!="POD",container!="",instance=~"${nodeName}.*"}[5m])) by (pod)`
      limitQuery = `sum(container_spec_cpu_quota{namespace=~"bravo-.*",container!="POD",container!="",instance=~"${nodeName}.*"} / 100000) by (pod)`
      usageQueryFallback = `sum(rate(container_cpu_usage_seconds_total{pod=~"auth-service-.*|community-service-.*|mountain-service-.*|notice-service-.*|notification-service-.*|schedule-service-.*|stamp-service-.*|store-service-.*|ai-service-.*|chatbot-service-.*|ai-infra-service-.*|frontend-.*",container!="POD",container!="",instance=~"${nodeName}.*"}[5m])) by (pod)`
      limitQueryFallback = `sum(container_spec_cpu_quota{pod=~"auth-service-.*|community-service-.*|mountain-service-.*|notice-service-.*|notification-service-.*|schedule-service-.*|stamp-service-.*|store-service-.*|ai-service-.*|chatbot-service-.*|ai-infra-service-.*|frontend-.*",container!="POD",container!="",instance=~"${nodeName}.*"} / 100000) by (pod)`
      usageQueryFinalFallback = `sum(rate(container_cpu_usage_seconds_total{container!="POD",container!="",instance=~"${nodeName}.*"}[5m])) by (pod)`
      limitQueryFinalFallback = `sum(container_spec_cpu_quota{container!="POD",container!="",instance=~"${nodeName}.*"} / 100000) by (pod)`
    }
    
    // 먼저 namespace 쿼리 시도
    let [usageResults, limitResults] = await Promise.all([
      queryRange(usageQuery, start, end, step).catch(async (err) => {
        console.warn('Pod CPU usage query (namespace) failed, trying fallback:', err.message)
        // Fallback 1: pod 이름 패턴
        return queryRange(usageQueryFallback, start, end, step).catch(async (err2) => {
          console.warn('Pod CPU usage query (pod pattern) failed, trying final fallback:', err2.message)
          // Fallback 2: 모든 컨테이너
          return queryRange(usageQueryFinalFallback, start, end, step).catch(() => [])
        })
      }),
      queryPrometheus(limitQuery).catch(async (err) => {
        console.warn('Pod CPU limit query (namespace) failed, trying fallback:', err.message)
        // Fallback 1: pod 이름 패턴
        return queryPrometheus(limitQueryFallback).catch(async (err2) => {
          console.warn('Pod CPU limit query (pod pattern) failed, trying final fallback:', err2.message)
          // Fallback 2: 모든 컨테이너
          return queryPrometheus(limitQueryFinalFallback).catch(() => [])
        })
      })
    ])
    
    // 결과가 없으면 fallback 쿼리 직접 시도
    if (usageResults.length === 0) {
      console.log('No results from namespace query, trying fallback pod name pattern')
      usageResults = await queryRange(usageQueryFallback, start, end, step).catch(async () => {
        console.log('Trying final fallback: all containers')
        return queryRange(usageQueryFinalFallback, start, end, step).catch(() => [])
      })
    }
    if (limitResults.length === 0) {
      limitResults = await queryPrometheus(limitQueryFallback).catch(async () => {
        return queryPrometheus(limitQueryFinalFallback).catch(() => [])
      })
    }
    
    console.log(`getPodCPUMetrics: Found ${usageResults.length} usage results and ${limitResults.length} limit results`)
    
    // limit 정보를 Map으로 변환 (pod를 키로)
    const limitMap = new Map()
    limitResults.forEach(result => {
      const pod = result.metric.pod || ''
      if (!pod) return
      const limitCores = parseFloat(result.value[1])
      if (limitCores > 0) {
        limitMap.set(pod, limitCores)
      }
    })
    
    // 결과를 Pod별로 그룹화
    const podMap = {}
    
    usageResults.forEach(result => {
      const pod = result.metric.pod || ''
      if (!pod) return
      
      if (!podMap[pod]) {
        podMap[pod] = {
          name: pod,
          namespace: result.metric.namespace || 'unknown',
          data: []
        }
      }
      
      const limitCores = limitMap.get(pod) || 1 // 기본값 1 core
      
      // CPU 사용률 (%) 계산: (사용량 cores / limit cores) * 100
      if (result.values && result.values.length > 0) {
        podMap[pod].data = result.values.map(v => {
          const usageCores = parseFloat(v[1])
          const cpuPercent = limitCores > 0 ? (usageCores / limitCores) * 100 : 0
          return [v[0], cpuPercent]
        })
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
    // namespace label이 없을 수 있으므로 fallback 쿼리 준비
    let usageQuery = 'sum(container_memory_working_set_bytes{namespace=~"bravo-.*",container!="POD",container!=""}) by (pod)'
    let limitQuery = 'sum(container_spec_memory_limit_bytes{namespace=~"bravo-.*",container!="POD",container!=""}) by (pod)'
    
    // Fallback: namespace label 없이 pod 이름 패턴으로 필터링
    let usageQueryFallback = 'sum(container_memory_working_set_bytes{pod=~"auth-service-.*|community-service-.*|mountain-service-.*|notice-service-.*|notification-service-.*|schedule-service-.*|stamp-service-.*|store-service-.*|ai-service-.*|chatbot-service-.*|ai-infra-service-.*|frontend-.*",container!="POD",container!=""}) by (pod)'
    let limitQueryFallback = 'sum(container_spec_memory_limit_bytes{pod=~"auth-service-.*|community-service-.*|mountain-service-.*|notice-service-.*|notification-service-.*|schedule-service-.*|stamp-service-.*|store-service-.*|ai-service-.*|chatbot-service-.*|ai-infra-service-.*|frontend-.*",container!="POD",container!=""}) by (pod)'
    
    // 최종 fallback: 모든 컨테이너
    let usageQueryFinalFallback = 'sum(container_memory_working_set_bytes{container!="POD",container!=""}) by (pod)'
    let limitQueryFinalFallback = 'sum(container_spec_memory_limit_bytes{container!="POD",container!=""}) by (pod)'
    
    if (nodeName) {
      usageQuery = `sum(container_memory_working_set_bytes{namespace=~"bravo-.*",container!="POD",container!="",instance=~"${nodeName}.*"}) by (pod)`
      limitQuery = `sum(container_spec_memory_limit_bytes{namespace=~"bravo-.*",container!="POD",container!="",instance=~"${nodeName}.*"}) by (pod)`
      usageQueryFallback = `sum(container_memory_working_set_bytes{pod=~"auth-service-.*|community-service-.*|mountain-service-.*|notice-service-.*|notification-service-.*|schedule-service-.*|stamp-service-.*|store-service-.*|ai-service-.*|chatbot-service-.*|ai-infra-service-.*|frontend-.*",container!="POD",container!="",instance=~"${nodeName}.*"}) by (pod)`
      limitQueryFallback = `sum(container_spec_memory_limit_bytes{pod=~"auth-service-.*|community-service-.*|mountain-service-.*|notice-service-.*|notification-service-.*|schedule-service-.*|stamp-service-.*|store-service-.*|ai-service-.*|chatbot-service-.*|ai-infra-service-.*|frontend-.*",container!="POD",container!="",instance=~"${nodeName}.*"}) by (pod)`
      usageQueryFinalFallback = `sum(container_memory_working_set_bytes{container!="POD",container!="",instance=~"${nodeName}.*"}) by (pod)`
      limitQueryFinalFallback = `sum(container_spec_memory_limit_bytes{container!="POD",container!="",instance=~"${nodeName}.*"}) by (pod)`
    }
    
    // 먼저 namespace 쿼리 시도
    let [usageResults, limitResults] = await Promise.all([
      queryRange(usageQuery, start, end, step).catch(async (err) => {
        console.warn('Pod memory usage query (namespace) failed, trying fallback:', err.message)
        // Fallback 1: pod 이름 패턴
        return queryRange(usageQueryFallback, start, end, step).catch(async (err2) => {
          console.warn('Pod memory usage query (pod pattern) failed, trying final fallback:', err2.message)
          // Fallback 2: 모든 컨테이너
          return queryRange(usageQueryFinalFallback, start, end, step).catch(() => [])
        })
      }),
      queryPrometheus(limitQuery).catch(async (err) => {
        console.warn('Pod memory limit query (namespace) failed, trying fallback:', err.message)
        // Fallback 1: pod 이름 패턴
        return queryPrometheus(limitQueryFallback).catch(async (err2) => {
          console.warn('Pod memory limit query (pod pattern) failed, trying final fallback:', err2.message)
          // Fallback 2: 모든 컨테이너
          return queryPrometheus(limitQueryFinalFallback).catch(() => [])
        })
      })
    ])
    
    // 결과가 없으면 fallback 쿼리 직접 시도
    if (usageResults.length === 0) {
      console.log('No results from namespace query, trying fallback pod name pattern')
      usageResults = await queryRange(usageQueryFallback, start, end, step).catch(async () => {
        console.log('Trying final fallback: all containers')
        return queryRange(usageQueryFinalFallback, start, end, step).catch(() => [])
      })
    }
    if (limitResults.length === 0) {
      limitResults = await queryPrometheus(limitQueryFallback).catch(async () => {
        return queryPrometheus(limitQueryFinalFallback).catch(() => [])
      })
    }
    
    console.log(`getPodMemoryMetrics: Found ${usageResults.length} usage results and ${limitResults.length} limit results`)
    
    // limit 정보를 Map으로 변환 (pod를 키로)
    const limitMap = new Map()
    limitResults.forEach(result => {
      const pod = result.metric.pod || ''
      if (!pod) return
      const limitBytes = parseFloat(result.value[1])
      if (limitBytes > 0) {
        limitMap.set(pod, limitBytes)
      }
    })
    
    // 결과를 Pod별로 그룹화
    const podMap = {}
    
    usageResults.forEach(result => {
      const pod = result.metric.pod || ''
      if (!pod) return
      
      if (!podMap[pod]) {
        podMap[pod] = {
          name: pod,
          namespace: result.metric.namespace || 'unknown',
          data: []
        }
      }
      
      const limitBytes = limitMap.get(pod) || 0
      
      // Memory 사용률(%) 계산: (사용량 / limit) * 100
      // limit이 없으면 0 반환 (표시 안 함)
      if (result.values && result.values.length > 0) {
        podMap[pod].data = result.values.map(v => {
          const usageBytes = parseFloat(v[1])
          const usagePercent = limitBytes > 0 ? (usageBytes / limitBytes * 100) : 0
          return [v[0], usagePercent]
        })
        // 원본 bytes 값도 저장 (리스트/Top 5에서 MB 표시용)
        podMap[pod].usageBytesData = result.values.map(v => [v[0], parseFloat(v[1])])
        podMap[pod].limitBytes = limitBytes
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

// FIRING 알람 가져오기
async function getFiringAlerts() {
  try {
    // Prometheus 알람 규칙 API 사용 (Alertmanager 대신)
    // Prometheus는 알람 규칙을 평가하고 상태를 제공함
    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/rules?type=alert`, {
      timeout: 5000
    })
    
    if (response.data.status !== 'success') {
      console.warn('Prometheus rules API returned non-success status')
      return []
    }
    
    const rules = response.data.data.groups || []
    const firingAlerts = []
    
    // 각 알람 규칙 그룹에서 FIRING 상태인 알람 추출
    rules.forEach(group => {
      if (group.rules) {
        group.rules.forEach(rule => {
          // 알람 규칙이고 상태가 firing인 경우
          if (rule.type === 'alerting' && rule.state === 'firing') {
            // 알람 정보 구성
            const alert = {
              labels: rule.labels || {},
              annotations: rule.annotations || {},
              state: rule.state,
              activeAt: rule.activeAt,
              value: rule.value,
              // Alertmanager 형식과 호환되도록 변환
              name: rule.labels?.alertname || rule.name || 'Unknown',
              severity: rule.labels?.severity || 'warning',
              message: rule.annotations?.description || rule.annotations?.summary || rule.annotations?.message || 'No message',
              startsAt: rule.activeAt || new Date().toISOString()
            }
            firingAlerts.push(alert)
          }
        })
      }
    })
    
    console.log(`Found ${firingAlerts.length} firing alerts from Prometheus rules`)
    return firingAlerts
  } catch (error) {
    // Prometheus API 실패 시 빈 배열 반환
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.warn('Prometheus alerts API not available, returning empty alerts:', error.message)
      return []
    }
    console.error('Error getting firing alerts from Prometheus:', error.message)
    return []
  }
}

// 알람 히스토리 가져오기
async function getAlertHistory(start, end) {
  try {
    // Prometheus 알람 규칙에서 현재 상태 확인
    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/rules?type=alert`, {
      timeout: 5000
    })
    
    if (response.data.status !== 'success') {
      return {
        fired: 0,
        resolved: 0,
        currentFiring: 0,
        timeline: []
      }
    }
    
    const rules = response.data.data.groups || []
    const startTime = new Date(start)
    const endTime = new Date(end)
    
    let fired = 0
    let currentFiring = 0
    const firingAlerts = []
    
    // FIRING 알람 수집
    rules.forEach(group => {
      if (group.rules) {
        group.rules.forEach(rule => {
          if (rule.type === 'alerting') {
            const activeAt = rule.activeAt ? new Date(rule.activeAt) : null
            
            if (rule.state === 'firing') {
              currentFiring++
              if (activeAt && activeAt >= startTime && activeAt <= endTime) {
                fired++
              }
              // 타임라인 생성을 위해 알람 정보 저장
              firingAlerts.push({
                name: rule.labels?.alertname || 'Unknown',
                activeAt: activeAt || new Date(),
                state: rule.state
              })
            }
          }
        })
      }
    })
    
    // 타임라인 생성 (1시간 간격으로 24개 포인트)
    const timeline = []
    const intervalMs = 3600000 // 1시간
    const now = new Date()
    
    // 시작 시간을 24시간 전으로 설정
    const timelineStart = new Date(now.getTime() - (23 * intervalMs))
    
    for (let i = 0; i < 24; i++) {
      const timePoint = new Date(timelineStart.getTime() + (i * intervalMs))
      
      // 해당 시간대에 활성화된 알람 수 계산
      // 알람이 시작된 시간이 해당 시간대 이전이고, 아직 해소되지 않은 경우
      const alertsAtTime = firingAlerts.filter(alert => {
        const alertStart = new Date(alert.activeAt)
        // 알람이 해당 시간대 이전에 시작되었고, 현재까지 활성화되어 있는 경우
        return alertStart <= timePoint
      })
      
      timeline.push({
        time: timePoint.toISOString(),
        fired: alertsAtTime.length,
        resolved: 0, // Prometheus API에서는 해소 정보를 제공하지 않음
        firing: alertsAtTime.length
      })
    }
    
    console.log(`📊 Alert History: fired=${fired}, currentFiring=${currentFiring}, timeline.length=${timeline.length}`)
    
    return {
      fired,
      resolved: 0, // Prometheus API에서는 해소 정보를 제공하지 않음
      currentFiring,
      timeline
    }
  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.warn('Prometheus alerts API not available, returning empty history:', error.message)
    } else {
      console.error('Error getting alert history from Prometheus:', error.message)
    }
    return {
      fired: 0,
      resolved: 0,
      currentFiring: 0,
      timeline: []
    }
  }
}

// 서비스별 RPS, Latency (p95, p99), Error Rate 수집 (애플리케이션 메트릭 사용)
async function getServiceMetrics(serviceName, namespace, start, end) {
  try {
    const timeRange = '[5m]'
    
    // service 레이블로 먼저 시도 (kubernetes_namespace는 Prometheus가 자동으로 추가하지 않을 수 있음)
    let rpsQuery = `sum(rate(http_requests_total{service="${serviceName}"}${timeRange}))`
    let rpsResult = await queryPrometheus(rpsQuery).catch(() => [])
    
    // 결과가 없으면 kubernetes_namespace 추가 시도
    if (!rpsResult || rpsResult.length === 0 || !rpsResult[0]?.value?.[1] || parseFloat(rpsResult[0].value[1]) === 0) {
      rpsQuery = `sum(rate(http_requests_total{service="${serviceName}",kubernetes_namespace="${namespace}"}${timeRange}))`
      rpsResult = await queryPrometheus(rpsQuery).catch(() => [{ value: [0, '0'] }])
    }
    const rps = parseFloat(rpsResult[0]?.value[1] || 0)
    
    // p95 Latency (seconds -> milliseconds 변환)
    let p95Query = `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="${serviceName}"}${timeRange})) by (le))`
    let p95Result = await queryPrometheus(p95Query).catch(() => [])
    
    if (!p95Result || p95Result.length === 0 || !p95Result[0]?.value?.[1] || parseFloat(p95Result[0].value[1]) === 0) {
      p95Query = `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="${serviceName}",kubernetes_namespace="${namespace}"}${timeRange})) by (le))`
      p95Result = await queryPrometheus(p95Query).catch(() => [{ value: [0, '0'] }])
    }
    const p95 = parseFloat(p95Result[0]?.value[1] || 0) * 1000 // 초를 밀리초로 변환
    
    // p99 Latency (seconds -> milliseconds 변환)
    let p99Query = `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{service="${serviceName}"}${timeRange})) by (le))`
    let p99Result = await queryPrometheus(p99Query).catch(() => [])
    
    if (!p99Result || p99Result.length === 0 || !p99Result[0]?.value?.[1] || parseFloat(p99Result[0].value[1]) === 0) {
      p99Query = `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{service="${serviceName}",kubernetes_namespace="${namespace}"}${timeRange})) by (le))`
      p99Result = await queryPrometheus(p99Query).catch(() => [{ value: [0, '0'] }])
    }
    const p99 = parseFloat(p99Result[0]?.value[1] || 0) * 1000 // 초를 밀리초로 변환
    
    // 5xx Error Rate (%)
    let error5xxQuery = `sum(rate(http_requests_total{service="${serviceName}",status_code=~"5.."}${timeRange}))`
    let totalQuery = `sum(rate(http_requests_total{service="${serviceName}"}${timeRange}))`
    let [error5xxResult, totalResult] = await Promise.all([
      queryPrometheus(error5xxQuery).catch(() => []),
      queryPrometheus(totalQuery).catch(() => [])
    ])
    
    // 결과가 없으면 kubernetes_namespace 추가 시도
    if ((!error5xxResult || error5xxResult.length === 0) || (!totalResult || totalResult.length === 0)) {
      error5xxQuery = `sum(rate(http_requests_total{service="${serviceName}",kubernetes_namespace="${namespace}",status_code=~"5.."}${timeRange}))`
      totalQuery = `sum(rate(http_requests_total{service="${serviceName}",kubernetes_namespace="${namespace}"}${timeRange}))`
      ;[error5xxResult, totalResult] = await Promise.all([
        queryPrometheus(error5xxQuery).catch(() => [{ value: [0, '0'] }]),
        queryPrometheus(totalQuery).catch(() => [{ value: [0, '0'] }])
      ])
    }
    const error5xx = parseFloat(error5xxResult[0]?.value[1] || 0)
    const total = parseFloat(totalResult[0]?.value[1] || 0)
    const error5xxRate = total > 0 ? (error5xx / total * 100) : 0
    
    // 4xx Error Rate (%)
    let error4xxQuery = `sum(rate(http_requests_total{service="${serviceName}",status_code=~"4.."}${timeRange}))`
    let error4xxResult = await queryPrometheus(error4xxQuery).catch(() => [])
    
    if (!error4xxResult || error4xxResult.length === 0) {
      error4xxQuery = `sum(rate(http_requests_total{service="${serviceName}",kubernetes_namespace="${namespace}",status_code=~"4.."}${timeRange}))`
      error4xxResult = await queryPrometheus(error4xxQuery).catch(() => [{ value: [0, '0'] }])
    }
    const error4xx = parseFloat(error4xxResult[0]?.value[1] || 0)
    const error4xxRate = total > 0 ? (error4xx / total * 100) : 0
    
    return {
      rps: parseFloat(rps.toFixed(2)),
      latencyP95: parseFloat(p95.toFixed(2)),
      latencyP99: parseFloat(p99.toFixed(2)),
      errorRate5xx: parseFloat(error5xxRate.toFixed(2)),
      errorRate4xx: parseFloat(error4xxRate.toFixed(2))
    }
  } catch (error) {
    console.error(`Error getting service metrics for ${serviceName}:`, error)
    return {
      rps: 0,
      latencyP95: 0,
      latencyP99: 0,
      errorRate5xx: 0,
      errorRate4xx: 0
    }
  }
}

// 서비스별 Pod CPU/Mem 평균 계산
async function getServiceResourceMetrics(serviceName, namespace, start, end) {
  try {
    // 서비스의 Pod들 가져오기
    const pods = await kubernetesService.getPods({
      namespace,
      labelSelector: `app=${serviceName}`
    })
    
    if (pods.length === 0) {
      console.log(`No pods found for service ${serviceName} in namespace ${namespace}`)
      return { cpu: 0, mem: 0 }
    }
    
    console.log(`Found ${pods.length} pods for service ${serviceName}:`, pods.map(p => p.name))
    
    // Pod별 CPU/Mem 메트릭 수집
    const [cpuMetrics, memMetrics] = await Promise.all([
      getPodCPUMetrics(null, start, end, '15s').catch((err) => {
        console.error(`Error getting CPU metrics for ${serviceName}:`, err.message)
        return []
      }),
      getPodMemoryMetrics(null, start, end, '15s').catch((err) => {
        console.error(`Error getting Memory metrics for ${serviceName}:`, err.message)
        return []
      })
    ])
    
    console.log(`Retrieved ${cpuMetrics.length} CPU metrics and ${memMetrics.length} Memory metrics`)
    
    // 서비스의 Pod들만 필터링 (pod 이름으로 매칭, 부분 매칭도 지원)
    const servicePodNames = new Set(pods.map(p => p.name))
    const serviceCpuMetrics = cpuMetrics.filter(m => {
      // 정확한 매칭
      if (servicePodNames.has(m.name)) return true
      // 부분 매칭: pod 이름이 서비스 이름으로 시작하는지 확인
      return pods.some(p => m.name.startsWith(p.name.split('-').slice(0, -1).join('-')))
    })
    const serviceMemMetrics = memMetrics.filter(m => {
      // 정확한 매칭
      if (servicePodNames.has(m.name)) return true
      // 부분 매칭: pod 이름이 서비스 이름으로 시작하는지 확인
      return pods.some(p => m.name.startsWith(p.name.split('-').slice(0, -1).join('-')))
    })
    
    console.log(`Matched ${serviceCpuMetrics.length} CPU metrics and ${serviceMemMetrics.length} Memory metrics for service ${serviceName}`)
    
    // CPU 평균 계산 (이미 %로 계산되어 있음)
    let cpuSum = 0
    let cpuCount = 0
    serviceCpuMetrics.forEach(metric => {
      if (metric.data && metric.data.length > 0) {
        const lastValue = parseFloat(metric.data[metric.data.length - 1][1])
        cpuSum += lastValue // 이미 %로 계산되어 있음
        cpuCount++
      }
    })
    const cpuAvg = cpuCount > 0 ? cpuSum / cpuCount : 0
    
    // Mem 평균 계산 (이미 %로 계산되어 있음)
    let memSum = 0
    let memCount = 0
    serviceMemMetrics.forEach(metric => {
      if (metric.data && metric.data.length > 0) {
        const lastValue = parseFloat(metric.data[metric.data.length - 1][1])
        memSum += lastValue // 이미 %로 계산되어 있음
        memCount++
      }
    })
    const memAvg = memCount > 0 ? memSum / memCount : 0
    
    return {
      cpu: parseFloat(cpuAvg.toFixed(2)),
      mem: parseFloat(memAvg.toFixed(2))
    }
  } catch (error) {
    console.error(`Error getting service resource metrics for ${serviceName}:`, error)
    return { cpu: 0, mem: 0 }
  }
}

// 전체 RPS, p95, p99 수집 (Overview용) - 애플리케이션 메트릭 사용
async function getOverallMetrics(start, end) {
  try {
    const timeRange = '[5m]'
    
    // 먼저 메트릭이 실제로 존재하는지 확인
    const metricCheckQuery = `count(http_requests_total)`
    const metricCheck = await queryPrometheus(metricCheckQuery).catch(() => [])
    const metricCount = parseFloat(metricCheck[0]?.value[1] || 0)
    
    if (metricCount === 0) {
      console.warn('⚠️ No http_requests_total metrics found in Prometheus. Check if applications are exposing metrics and Prometheus is scraping them.')
      return {
        rps: 0,
        latencyP95: 0,
        latencyP99: 0,
        errorRate4xx: 0
      }
    }
    
    console.log(`📊 Found ${metricCount} http_requests_total metric series`)
    
    // 전체 RPS - service 레이블로 필터링 (kubernetes_namespace는 Prometheus가 자동으로 추가하지 않을 수 있음)
    // 여러 레이블 조합 시도
    let rpsQuery = `sum(rate(http_requests_total{service=~".+"}${timeRange}))`
    let rpsResult = await queryPrometheus(rpsQuery).catch(() => [])
    
    // service 레이블이 없으면 전체 집계
    if (!rpsResult || rpsResult.length === 0 || !rpsResult[0]?.value?.[1] || parseFloat(rpsResult[0].value[1]) === 0) {
      rpsQuery = `sum(rate(http_requests_total${timeRange}))`
      rpsResult = await queryPrometheus(rpsQuery).catch((err) => {
        console.warn('⚠️ RPS query failed:', err.message)
        return [{ value: [0, '0'] }]
      })
    }
    const rps = parseFloat(rpsResult[0]?.value[1] || 0)
    console.log('📊 RPS Query Result:', { query: rpsQuery, result: rpsResult, rps })
    
    // 전체 p95 - service 레이블로 필터링 시도
    let p95Query = `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service=~".+"}${timeRange})) by (le))`
    let p95Result = await queryPrometheus(p95Query).catch(() => [])
    
    if (!p95Result || p95Result.length === 0 || !p95Result[0]?.value?.[1] || parseFloat(p95Result[0].value[1]) === 0) {
      p95Query = `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket${timeRange})) by (le))`
      p95Result = await queryPrometheus(p95Query).catch((err) => {
        console.warn('⚠️ P95 query failed:', err.message)
        return [{ value: [0, '0'] }]
      })
    }
    const p95 = parseFloat(p95Result[0]?.value[1] || 0) * 1000 // 초를 밀리초로 변환
    console.log('📊 P95 Query Result:', { query: p95Query, result: p95Result, p95 })
    
    // 전체 p99 - service 레이블로 필터링 시도
    let p99Query = `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{service=~".+"}${timeRange})) by (le))`
    let p99Result = await queryPrometheus(p99Query).catch(() => [])
    
    if (!p99Result || p99Result.length === 0 || !p99Result[0]?.value?.[1] || parseFloat(p99Result[0].value[1]) === 0) {
      p99Query = `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket${timeRange})) by (le))`
      p99Result = await queryPrometheus(p99Query).catch((err) => {
        console.warn('⚠️ P99 query failed:', err.message)
        return [{ value: [0, '0'] }]
      })
    }
    const p99 = parseFloat(p99Result[0]?.value[1] || 0) * 1000 // 초를 밀리초로 변환
    console.log('📊 P99 Query Result:', { query: p99Query, result: p99Result, p99 })
    
    // 전체 4xx Error Rate - service 레이블로 필터링 시도
    let error4xxQuery = `sum(rate(http_requests_total{service=~".+",status_code=~"4.."}${timeRange}))`
    let totalQuery = `sum(rate(http_requests_total{service=~".+"}${timeRange}))`
    let error4xxResult, totalResult
    let results = await Promise.all([
      queryPrometheus(error4xxQuery).catch(() => []),
      queryPrometheus(totalQuery).catch(() => [])
    ])
    error4xxResult = results[0]
    totalResult = results[1]
    
    // 결과가 없으면 필터 없이 시도
    if ((!error4xxResult || error4xxResult.length === 0) || (!totalResult || totalResult.length === 0)) {
      error4xxQuery = `sum(rate(http_requests_total{status_code=~"4.."}${timeRange}))`
      totalQuery = `sum(rate(http_requests_total${timeRange}))`
      results = await Promise.all([
        queryPrometheus(error4xxQuery).catch((err) => {
          console.warn('⚠️ 4xx query failed:', err.message)
          return [{ value: [0, '0'] }]
        }),
        queryPrometheus(totalQuery).catch((err) => {
          console.warn('⚠️ Total query failed:', err.message)
          return [{ value: [0, '0'] }]
        })
      ])
      error4xxResult = results[0]
      totalResult = results[1]
    }
    const error4xx = parseFloat(error4xxResult[0]?.value[1] || 0)
    const total = parseFloat(totalResult[0]?.value[1] || 0)
    const error4xxRate = total > 0 ? (error4xx / total * 100) : 0
    
    const result = {
      rps: parseFloat(rps.toFixed(2)),
      latencyP95: parseFloat(p95.toFixed(2)),
      latencyP99: parseFloat(p99.toFixed(2)),
      errorRate4xx: parseFloat(error4xxRate.toFixed(2))
    }
    console.log('📊 Overall Metrics Result:', result)
    
    return result
  } catch (error) {
    console.error('❌ Error getting overall metrics:', error)
    return {
      rps: 0,
      latencyP95: 0,
      latencyP99: 0,
      errorRate4xx: 0
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
  getResourceUsageTimeline,
  getFiringAlerts,
  getAlertHistory,
  getServiceMetrics,
  getServiceResourceMetrics,
  getOverallMetrics
}

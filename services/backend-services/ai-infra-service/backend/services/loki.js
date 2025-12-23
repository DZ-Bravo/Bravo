import axios from 'axios'

const LOKI_URL = process.env.LOKI_URL || 'http://loki.bravo-monitoring-ns:3100'

// Loki 쿼리 실행
async function queryLoki(query, start, end) {
  try {
    const params = {
      query,
      limit: 1000
    }
    
    // start와 end를 nanosecond 타임스탬프로 변환
    if (start) {
      const startTime = typeof start === 'string' ? new Date(start).getTime() : (start instanceof Date ? start.getTime() : start)
      if (!isNaN(startTime)) {
        params.start = startTime * 1000000 // nanoseconds
      }
    }
    if (end) {
      const endTime = typeof end === 'string' ? new Date(end).getTime() : (end instanceof Date ? end.getTime() : end)
      if (!isNaN(endTime)) {
        params.end = endTime * 1000000 // nanoseconds
      }
    }
    
    const response = await axios.get(`${LOKI_URL}/loki/api/v1/query_range`, { params })
    return response.data.data.result || []
  } catch (error) {
    console.error('Loki query error:', error.message, 'Query:', query, 'Start:', start, 'End:', end)
    throw error
  }
}

// 금일 에러 로그
async function getTodayErrors() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  
  const query = '{namespace=~"bravo-.*"} |= "error" | json | status_code=~"5.."'
  const results = await queryLoki(query, start, end)
  
  return parseLogResults(results)
}

// 전날 에러 로그
async function getYesterdayErrors() {
  const start = new Date()
  start.setDate(start.getDate() - 1)
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setDate(end.getDate() - 1)
  end.setHours(23, 59, 59, 999)
  
  const query = '{namespace=~"bravo-.*"} |= "error" | json | status_code=~"5.."'
  const results = await queryLoki(query, start, end)
  
  return parseLogResults(results)
}

// 최근 에러 로그
async function getRecentErrors(limit = 10) {
  const end = new Date()
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000) // 24시간 전
  
  const query = '{namespace=~"bravo-.*"} |= "error" | json | status_code=~"5.."'
  const results = await queryLoki(query, start, end)
  
  const parsed = parseLogResults(results)
  return parsed.slice(0, limit)
}

// 최근 로그 (일반)
async function getRecentLogs(limit = 50) {
  const end = new Date()
  const start = new Date(end.getTime() - 1 * 60 * 60 * 1000) // 1시간 전
  
  const query = '{namespace=~"bravo-.*"}'
  const results = await queryLoki(query, start, end)
  
  return parseLogResults(results).slice(0, limit)
}

// 특정 시간대 로그
async function getLogsByTimestamp(timestamp) {
  const targetTime = new Date(timestamp)
  const start = new Date(targetTime.getTime() - 5 * 60 * 1000) // 5분 전
  const end = new Date(targetTime.getTime() + 5 * 60 * 1000) // 5분 후
  
  const query = '{namespace=~"bravo-.*"}'
  const results = await queryLoki(query, start, end)
  
  return parseLogResults(results)
}

// 로그 결과 파싱
function parseLogResults(results) {
  const logs = []
  
  if (!results || !Array.isArray(results)) {
    return logs
  }
  
  results.forEach(stream => {
    if (!stream || !stream.values || !Array.isArray(stream.values)) {
      return
    }
    
    stream.values.forEach(([timestamp, message]) => {
      try {
        const logEntry = JSON.parse(message)
        logs.push({
          timestamp: parseInt(timestamp) / 1000000, // nanoseconds to milliseconds
          message: logEntry.message || message,
          level: logEntry.level,
          service: logEntry.service || stream.stream?.pod || 'unknown',
          namespace: stream.stream?.namespace || 'unknown'
        })
      } catch (e) {
        logs.push({
          timestamp: parseInt(timestamp) / 1000000,
          message: message || 'No message',
          namespace: stream.stream?.namespace || 'unknown'
        })
      }
    })
  })
  
  // 시간순 정렬 (최신순)
  return logs.sort((a, b) => b.timestamp - a.timestamp)
}

// Loki 에러 로그 (job="loki")
async function getLokiErrors(start, end, limit = 50) {
  const query = '{job="loki"} |= "error"'
  const results = await queryLoki(query, start, end)
  const parsed = parseLogResults(results)
  return parsed.slice(0, limit)
}

// Promtail 에러 로그 (job="promtail")
async function getPromtailErrors(start, end, limit = 50) {
  const query = '{job="promtail"} |= "error"'
  const results = await queryLoki(query, start, end)
  const parsed = parseLogResults(results)
  return parsed.slice(0, limit)
}

// 앱 에러 로그 (namespace 기반)
async function getAppErrors(start, end, namespace, limit = 50) {
  const namespaceFilter = namespace ? `namespace="${namespace}"` : 'namespace=~"bravo-.*"'
  const query = `{${namespaceFilter}} |= "error" | json | level="error"`
  const results = await queryLoki(query, start, end)
  const parsed = parseLogResults(results)
  return parsed.slice(0, limit)
}

// 시간별 에러 로그 수 (그래프용)
async function getErrorLogCountOverTime(start, end, source = 'app') {
  // LogQL을 사용하여 시간별 카운트 집계
  // 간단하게 최근 로그를 가져와서 시간별로 그룹화
  let query
  if (source === 'loki') {
    query = '{job="loki"} |= "error"'
  } else if (source === 'promtail') {
    query = '{job="promtail"} |= "error"'
  } else {
    query = '{namespace=~"bravo-.*"} |= "error"'
  }
  
  const results = await queryLoki(query, start, end)
  
  // 시간별 그룹화 (1분 단위)
  const timeGroups = {}
  results.forEach(stream => {
    stream.values.forEach(([timestamp, message]) => {
      const time = parseInt(timestamp) / 1000000 // nanoseconds to milliseconds
      const minute = Math.floor(time / 60000) * 60000 // 1분 단위로 반올림
      
      if (!timeGroups[minute]) {
        timeGroups[minute] = 0
      }
      timeGroups[minute]++
    })
  })
  
  // 배열로 변환 (시간순 정렬)
  return Object.entries(timeGroups)
    .map(([time, count]) => [parseInt(time), count])
    .sort((a, b) => a[0] - b[0])
}

// Namespace/서비스별 최근 에러 로그
async function getServiceErrors(start, end, limit = 50) {
  // namespace와 pod 레이블을 포함한 에러 로그 쿼리
  const query = '{namespace=~"bravo-.*"} |= "error"'
  const results = await queryLoki(query, start, end)
  
  const logs = []
  
  if (!results || !Array.isArray(results)) {
    return logs
  }
  
  results.forEach(stream => {
    if (!stream || !stream.values || !Array.isArray(stream.values)) {
      return
    }
    
    const namespace = stream.stream?.namespace || 'unknown'
    const pod = stream.stream?.pod || 'unknown'
    const container = stream.stream?.container || 'unknown'
    
    stream.values.forEach(([timestamp, message]) => {
      try {
        const logEntry = JSON.parse(message)
        logs.push({
          timestamp: parseInt(timestamp) / 1000000, // nanoseconds to milliseconds
          message: logEntry.message || message,
          level: logEntry.level || 'error',
          namespace: namespace,
          service: pod,
          container: container
        })
      } catch (e) {
        // JSON 파싱 실패 시 원본 메시지 사용
        logs.push({
          timestamp: parseInt(timestamp) / 1000000,
          message: message || 'No message',
          level: 'error',
          namespace: namespace,
          service: pod,
          container: container
        })
      }
    })
  })
  
  // 시간순 정렬 (최신순) 후 limit만큼 반환
  return logs.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit)
}

// Top N 에러 메시지 (빈도순)
async function getTopErrorMessages(start, end, topN = 10) {
  const query = '{namespace=~"bravo-.*"} |= "error"'
  const results = await queryLoki(query, start, end)
  
  const messageCounts = {}
  
  if (!results || !Array.isArray(results)) {
    return []
  }
  
  results.forEach(stream => {
    if (!stream || !stream.values || !Array.isArray(stream.values)) {
      return
    }
    
    stream.values.forEach(([timestamp, message]) => {
      try {
        const logEntry = JSON.parse(message)
        const errorMessage = logEntry.message || message || 'No message'
        
        // 에러 메시지를 정규화 (공백 제거, 소문자 변환)
        const normalizedMessage = errorMessage.trim().toLowerCase()
        
        if (!messageCounts[normalizedMessage]) {
          messageCounts[normalizedMessage] = {
            message: errorMessage, // 원본 메시지 보존
            count: 0,
            level: logEntry.level || 'error',
            lastOccurred: parseInt(timestamp) / 1000000
          }
        }
        
        messageCounts[normalizedMessage].count++
        
        // 최신 발생 시간 업데이트
        const msgTime = parseInt(timestamp) / 1000000
        if (msgTime > messageCounts[normalizedMessage].lastOccurred) {
          messageCounts[normalizedMessage].lastOccurred = msgTime
        }
      } catch (e) {
        // JSON 파싱 실패 시 원본 메시지 사용
        const errorMessage = message || 'No message'
        const normalizedMessage = errorMessage.trim().toLowerCase()
        
        if (!messageCounts[normalizedMessage]) {
          messageCounts[normalizedMessage] = {
            message: errorMessage,
            count: 0,
            level: 'error',
            lastOccurred: parseInt(timestamp) / 1000000
          }
        }
        
        messageCounts[normalizedMessage].count++
        
        const msgTime = parseInt(timestamp) / 1000000
        if (msgTime > messageCounts[normalizedMessage].lastOccurred) {
          messageCounts[normalizedMessage].lastOccurred = msgTime
        }
      }
    })
  })
  
  // 빈도순 정렬 (내림차순) 후 Top N 반환
  return Object.values(messageCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)
}

export default {
  queryLoki,
  getTodayErrors,
  getYesterdayErrors,
  getRecentErrors,
  getRecentLogs,
  getLogsByTimestamp,
  getLokiErrors,
  getPromtailErrors,
  getAppErrors,
  getErrorLogCountOverTime,
  getServiceErrors,
  getTopErrorMessages
}


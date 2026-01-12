import axios from 'axios'

const TEMPO_URL = process.env.TEMPO_URL || 'http://tempo.bravo-monitoring-ns:3200'

// 특정 트레이스 조회
async function getTrace(traceId) {
  try {
    const response = await axios.get(`${TEMPO_URL}/api/traces/${traceId}`)
    return response.data
  } catch (error) {
    console.error('Tempo query error:', error)
    throw error
  }
}

// 트레이스 검색
async function searchTraces(query, start, end) {
  try {
    const params = {}
    
    // 쿼리가 있으면 추가
    if (query && query.trim()) {
      params.q = query.trim()
    }
    
    // start와 end를 Unix timestamp (초 단위)로 변환
    if (start) {
      const startTime = typeof start === 'string' ? new Date(start) : start
      if (startTime instanceof Date && !isNaN(startTime.getTime())) {
        params.start = Math.floor(startTime.getTime() / 1000) // 초 단위
      }
    }
    
    if (end) {
      const endTime = typeof end === 'string' ? new Date(end) : end
      if (endTime instanceof Date && !isNaN(endTime.getTime())) {
        params.end = Math.floor(endTime.getTime() / 1000) // 초 단위
      }
    }
    
    // 파라미터가 없으면 빈 객체로 호출 (모든 트레이스)
    const response = await axios.get(`${TEMPO_URL}/api/search`, { 
      params,
      timeout: 5000 // 5초 타임아웃
    })
    
    return response.data.traces || []
  } catch (error) {
    // 400 에러는 쿼리 형식 문제일 수 있으므로 빈 배열 반환
    if (error.response && error.response.status === 400) {
      console.warn('Tempo search query format error, returning empty array')
      return []
    }
    console.error('Tempo search error:', error.message)
    return [] // 에러 발생 시 빈 배열 반환
  }
}

export default {
  getTrace,
  searchTraces
}




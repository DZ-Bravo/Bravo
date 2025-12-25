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
    const params = {
      q: query,
      start: start ? new Date(start).toISOString() : undefined,
      end: end ? new Date(end).toISOString() : undefined
    }
    
    const response = await axios.get(`${TEMPO_URL}/api/search`, { params })
    return response.data.traces || []
  } catch (error) {
    console.error('Tempo search error:', error)
    throw error
  }
}

export default {
  getTrace,
  searchTraces
}



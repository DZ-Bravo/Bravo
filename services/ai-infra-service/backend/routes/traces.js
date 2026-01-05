import express from 'express'
import tempoService from '../services/tempo.js'

const router = express.Router()

// Slow Traces Top 10
router.get('/slow', async (req, res) => {
  try {
    const { start, end, limit = 10 } = req.query
    const startTime = start ? new Date(start) : new Date(Date.now() - 3600000) // 기본 1시간 전
    const endTime = end ? new Date(end) : new Date()
    
    // Tempo에서 모든 트레이스 검색 (빈 쿼리로 전체 검색)
    const query = ''
    let traces = []
    try {
      traces = await tempoService.searchTraces(query, startTime.toISOString(), endTime.toISOString())
    } catch (error) {
      console.error('Tempo search error:', error.message)
      // 에러가 발생해도 빈 배열 반환
      traces = []
    }
    
    // duration 기준으로 정렬하여 상위 N개 반환 (duration이 있는 경우만)
    const sortedTraces = traces
      .filter(t => t.duration || t.durationMs)
      .sort((a, b) => {
        const aDuration = a.duration || a.durationMs || 0
        const bDuration = b.duration || b.durationMs || 0
        return bDuration - aDuration
      })
      .slice(0, parseInt(limit))
    
    res.json(sortedTraces)
  } catch (error) {
    console.error('Error getting slow traces:', error)
    res.status(500).json({ error: error.message })
  }
})

// Error Traces Top 10
router.get('/error', async (req, res) => {
  try {
    const { start, end, limit = 10 } = req.query
    const startTime = start ? new Date(start) : new Date(Date.now() - 3600000) // 기본 1시간 전
    const endTime = end ? new Date(end) : new Date()
    
    // Tempo에서 모든 트레이스 검색 (빈 쿼리로 전체 검색)
    const query = ''
    let traces = []
    try {
      traces = await tempoService.searchTraces(query, startTime.toISOString(), endTime.toISOString())
    } catch (error) {
      console.error('Tempo search error:', error.message)
      // 에러가 발생해도 빈 배열 반환
      traces = []
    }
    
    // 에러 태그가 있거나 status_code가 400 이상인 트레이스 필터링
    const errorTraces = traces.filter(t => {
      return t.tags?.error === 'true' || 
             t.tags?.status_code >= 400 ||
             t.statusCode >= 400 ||
             t.error === true
    })
    
    // 최신순으로 정렬하여 상위 N개 반환
    const sortedTraces = errorTraces
      .sort((a, b) => {
        const aTime = a.startTimeUnixNano || a.startTime || 0
        const bTime = b.startTimeUnixNano || b.startTime || 0
        return bTime - aTime
      })
      .slice(0, parseInt(limit))
    
    res.json(sortedTraces)
  } catch (error) {
    console.error('Error getting error traces:', error)
    res.status(500).json({ error: error.message })
  }
})

// 특정 트레이스 조회
router.get('/:traceId', async (req, res) => {
  try {
    const { traceId } = req.params
    const trace = await tempoService.getTrace(traceId)
    res.json(trace)
  } catch (error) {
    console.error('Error getting trace:', error)
    res.status(500).json({ error: error.message })
  }
})

// 트레이스 검색
router.get('/search', async (req, res) => {
  try {
    const { q, start, end } = req.query
    const startTime = start ? new Date(start) : new Date(Date.now() - 3600000)
    const endTime = end ? new Date(end) : new Date()
    
    const traces = await tempoService.searchTraces(q || '', startTime.toISOString(), endTime.toISOString())
    res.json(traces)
  } catch (error) {
    console.error('Error searching traces:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router

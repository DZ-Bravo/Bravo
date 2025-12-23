import express from 'express'
import prometheusService from '../services/prometheus.js'
import lokiService from '../services/loki.js'

const router = express.Router()

// 금일 에러 목록
router.get('/today', async (req, res) => {
  try {
    const errors = await lokiService.getTodayErrors()
    res.json(errors)
  } catch (error) {
    console.error('Error getting today errors:', error)
    res.status(500).json({ error: error.message })
  }
})

// 전날 에러 목록
router.get('/yesterday', async (req, res) => {
  try {
    const errors = await lokiService.getYesterdayErrors()
    res.json(errors)
  } catch (error) {
    console.error('Error getting yesterday errors:', error)
    res.status(500).json({ error: error.message })
  }
})

// 5xx 에러 분석 (4단계 분류)
router.get('/5xx', async (req, res) => {
  try {
    const { start, end } = req.query
    const analysis = await prometheusService.get5xxErrorBreakdown(start, end)
    res.json(analysis)
  } catch (error) {
    console.error('Error getting 5xx errors:', error)
    res.status(500).json({ error: error.message })
  }
})

// 서비스별 에러 통계
router.get('/services', async (req, res) => {
  try {
    const { start, end } = req.query
    const stats = await prometheusService.getServiceErrorStats(start, end)
    res.json(stats)
  } catch (error) {
    console.error('Error getting service error stats:', error)
    res.status(500).json({ error: error.message })
  }
})

// 최근 에러 목록
router.get('/recent', async (req, res) => {
  try {
    const { limit = 10 } = req.query
    const errors = await lokiService.getRecentErrors(parseInt(limit))
    res.json(errors)
  } catch (error) {
    console.error('Error getting recent errors:', error)
    res.status(500).json({ error: error.message })
  }
})

// Loki 에러 로그
router.get('/loki', async (req, res) => {
  try {
    const { start, end, limit = 50 } = req.query
    const errors = await lokiService.getLokiErrors(start, end, parseInt(limit))
    res.json(errors)
  } catch (error) {
    console.error('Error getting Loki errors:', error)
    res.status(500).json({ error: error.message })
  }
})

// Promtail 에러 로그
router.get('/promtail', async (req, res) => {
  try {
    const { start, end, limit = 50 } = req.query
    const errors = await lokiService.getPromtailErrors(start, end, parseInt(limit))
    res.json(errors)
  } catch (error) {
    console.error('Error getting Promtail errors:', error)
    res.status(500).json({ error: error.message })
  }
})

// 앱 에러 로그
router.get('/app', async (req, res) => {
  try {
    const { start, end, namespace, limit = 50 } = req.query
    const errors = await lokiService.getAppErrors(start, end, namespace, parseInt(limit))
    res.json(errors)
  } catch (error) {
    console.error('Error getting app errors:', error)
    res.status(500).json({ error: error.message })
  }
})

// 시간별 에러 로그 수 (그래프용)
router.get('/log-count', async (req, res) => {
  try {
    const { start, end, source = 'app' } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const counts = await lokiService.getErrorLogCountOverTime(start, end, source)
    res.json(counts)
  } catch (error) {
    console.error('Error getting error log count:', error)
    res.status(500).json({ error: error.message })
  }
})

// Namespace/서비스별 최근 에러 로그
router.get('/service-errors', async (req, res) => {
  try {
    const { start, end, limit = 50 } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const errors = await lokiService.getServiceErrors(start, end, parseInt(limit))
    res.json(errors)
  } catch (error) {
    console.error('Error getting service errors:', error)
    res.status(500).json({ error: error.message })
  }
})

// Top N 에러 메시지
router.get('/top-errors', async (req, res) => {
  try {
    const { start, end, topN = 10 } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const topErrors = await lokiService.getTopErrorMessages(start, end, parseInt(topN))
    res.json(topErrors)
  } catch (error) {
    console.error('Error getting top error messages:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router


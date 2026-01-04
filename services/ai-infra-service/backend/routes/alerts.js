import express from 'express'
import prometheusService from '../services/prometheus.js'

const router = express.Router()

// 현재 FIRING 알람 목록
router.get('/firing', async (req, res) => {
  try {
    // Prometheus 알람 API 호출
    // 실제로는 Prometheus Alertmanager API를 호출해야 함
    // 임시로 빈 배열 반환
    const alerts = await prometheusService.getFiringAlerts()
    res.json(alerts || [])
  } catch (error) {
    console.error('Error getting firing alerts:', error)
    res.status(500).json({ error: error.message })
  }
})

// 알람 히스토리 (최근 24시간)
router.get('/history', async (req, res) => {
  try {
    const { start, end } = req.query
    const startTime = start ? new Date(start) : new Date(Date.now() - 86400000) // 기본 24시간 전
    const endTime = end ? new Date(end) : new Date()

    // Prometheus 알람 히스토리 API 호출
    // 실제로는 Prometheus Alertmanager API를 호출해야 함
    const history = await prometheusService.getAlertHistory(startTime.toISOString(), endTime.toISOString())
    
    res.json({
      fired: history?.fired || 0,
      resolved: history?.resolved || 0,
      currentFiring: history?.currentFiring || 0,
      timeline: history?.timeline || []
    })
  } catch (error) {
    console.error('Error getting alert history:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router

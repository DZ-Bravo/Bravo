import express from 'express'
import healthcheckService from '../services/healthcheck.js'

const router = express.Router()

// 헬스체크 상태 조회
router.get('/status', async (req, res) => {
  try {
    const status = await healthcheckService.getHealthcheckStatus()
    res.json(status)
  } catch (error) {
    console.error('Error getting healthcheck status:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router



import express from 'express'
import reportService from '../services/report.js'

const router = express.Router()

// 보고서 생성 (수동 트리거)
router.post('/generate', async (req, res) => {
  try {
    const { reportType } = req.body // daily, weekly, monthly
    
    if (!['daily', 'weekly', 'monthly'].includes(reportType)) {
      return res.status(400).json({ error: 'Invalid report type' })
    }
    
    // 보고서 생성 (비동기로 처리)
    reportService.generateReport(reportType).catch(error => {
      console.error('Error generating report:', error)
    })
    
    res.json({ 
      message: 'Report generation started',
      reportType 
    })
  } catch (error) {
    console.error('Error starting report generation:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router



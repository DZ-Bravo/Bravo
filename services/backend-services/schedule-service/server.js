// CI/CD 테스트용 주석
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import connectDB from './shared/config/database.js'
import schedulesRoutes from './schedules.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3004

// 미들웨어4
app.use(cors())
app.use(express.json())

// DB 연결
connectDB()

// 라우트
app.use('/api/schedules', schedulesRoutes)

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'schedule-service' })
})

// 서버 시작
app.listen(PORT, () => {
  console.log(`Schedule Service running on port ${PORT}`)
})


// CI/CD 테스트용 주석
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import connectDB from './shared/config/database.js'
import stampRoutes from './stamps.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3010

// 미들웨어4
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// DB 연결
connectDB()

// 라우트
app.use('/api/stamps', stampRoutes)

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'stamp-service' })
})

// 서버 시작
app.listen(PORT, () => {
  console.log(`Stamp Service running on port ${PORT}`)
})


import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import connectDB from './shared/config/database.js'
import noticesRoutes from './notices.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3003

// 미들웨어1
app.use(cors())
app.use(express.json())

// DB 연결
connectDB()

// 라우트
app.use('/api/notices', noticesRoutes)

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notice-service' })
})

// 서버 시작
app.listen(PORT, () => {
  console.log(`Notice Service running on port ${PORT}`)
})


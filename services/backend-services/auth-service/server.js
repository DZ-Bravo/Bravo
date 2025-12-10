import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import connectDB from './shared/config/database.js'
import authRoutes from './auth.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// 미들웨어
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// DB 연결
connectDB()

// 라우트
app.use('/api/auth', authRoutes)

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service' })
})

// 서버 시작
app.listen(PORT, () => {
  console.log(`Auth Service running on port ${PORT}`)
})


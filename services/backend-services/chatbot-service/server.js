// CI/CD 테스트용 주석 - 재추가 3
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import connectDB from './shared/config/database.js'
import chatbotRoutes from './chatbot.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3007

// 미들웨어4
app.use(cors())
app.use(express.json())

// DB 연결
connectDB()

// 라우트
app.use('/api/chatbot', chatbotRoutes)

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'chatbot-service' })
})

// 서버 시작
app.listen(PORT, () => {
  console.log(`Chatbot Service running on port ${PORT}`)
})


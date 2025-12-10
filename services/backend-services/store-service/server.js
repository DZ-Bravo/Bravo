import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import connectDB from './shared/config/database.js'
import storeRoutes from './store.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3006

// 미들웨어
app.use(cors())
app.use(express.json())

// DB 연결
connectDB()

// 라우트
app.use('/api/store', storeRoutes)

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'store-service' })
})

// 서버 시작
app.listen(PORT, () => {
  console.log(`Store Service running on port ${PORT}`)
})


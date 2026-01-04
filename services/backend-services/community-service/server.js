// CI/CD 테스트용 주석 - 재추가 3
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import connectDB from './shared/config/database.js'
import postsRoutes from './posts.js'
import { prometheusMiddleware, metricsHandler } from './shared/utils/prometheus-metrics.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3002
const SERVICE_NAME = 'community-service'

// Prometheus 메트릭 미들웨어 (모든 라우트 앞에)
app.use(prometheusMiddleware(SERVICE_NAME))

// 미들웨어6
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 정적 파일 서빙 (업로드된 이미지)
app.use('/uploads', express.static(join(__dirname, 'uploads'), {
  index: false,
  dotfiles: 'ignore'
}))

// DB 연결
connectDB()

// 라우트
app.use('/api/posts', postsRoutes)

// Prometheus 메트릭 엔드포인트
app.get('/metrics', metricsHandler)

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'community-service' })
})

// 서버 시작
app.listen(PORT, () => {
  console.log(`Community Service running on port ${PORT}`)
})


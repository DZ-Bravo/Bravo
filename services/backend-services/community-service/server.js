// CI/CD 테스트용 주석
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import connectDB from './shared/config/database.js'
import postsRoutes from './posts.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3002

// 미들웨어4
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

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'community-service' })
})

// 서버 시작
app.listen(PORT, () => {
  console.log(`Community Service running on port ${PORT}`)
})


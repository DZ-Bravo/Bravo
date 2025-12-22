// CI/CD 테스트용 주석 - 재추가 3
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import connectDB from './shared/config/database.js'
import authRoutes from './auth.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// 미들웨어6
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 정적 파일 서빙 (업로드된 프로필 이미지)
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const uploadsPath = join(__dirname, 'uploads')
const profilesPath = join(uploadsPath, 'profiles')

// 디렉토리 존재 확인 및 로깅
console.log('=== 정적 파일 서빙 설정 ===')
console.log('__dirname:', __dirname)
console.log('uploadsPath:', uploadsPath)
console.log('profilesPath:', profilesPath)
console.log('uploadsPath exists:', existsSync(uploadsPath))
console.log('profilesPath exists:', existsSync(profilesPath))

// profiles 디렉토리가 없으면 생성
if (!existsSync(profilesPath)) {
  mkdirSync(profilesPath, { recursive: true })
  console.log('profiles 디렉토리 생성됨:', profilesPath)
}

// /app/uploads 경로 서빙
app.use('/uploads', express.static(uploadsPath, {
  index: false,
  dotfiles: 'ignore'
}))

// 루트 /uploads 경로도 서빙 (multer가 루트에 저장하는 경우 대비)
app.use('/uploads', express.static('/uploads', {
  index: false,
  dotfiles: 'ignore'
}))

// 디버깅용: 파일 존재 확인 미들웨어
app.use('/uploads/profiles/:filename', (req, res, next) => {
  const filename = req.params.filename
  const filePath = join(profilesPath, filename)
  
  console.log('프로필 이미지 요청:', filename)
  console.log('파일 경로:', filePath)
  console.log('파일 존재:', existsSync(filePath))
  
  if (!existsSync(filePath)) {
    console.error('파일을 찾을 수 없음:', filePath)
    console.error('profilesPath 내용 확인 필요')
  }
  
  next()
})

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


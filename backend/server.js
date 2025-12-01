import express from 'express'
import cors from 'cors'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import connectDB from './config/database.js'
import { MOUNTAIN_ROUTES, getMountainInfo, getAllMountains } from './utils/mountainRoutes.js'
import authRoutes from './routes/auth.js'
import postsRoutes from './routes/posts.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors())
app.use(express.json())
// express.urlencoded는 multer가 multipart/form-data를 처리할 때 필요하지 않음
// multer가 자동으로 텍스트 필드를 req.body에 추가함
app.use('/uploads', express.static(join(__dirname, 'uploads'))) // 정적 파일 서빙

// MongoDB 연결 (비동기로 처리, 서버 시작은 계속 진행)
connectDB()

// 인증 라우트
app.use('/api/auth', authRoutes)

// 게시글 라우트
app.use('/api/posts', postsRoutes)

// 산 정보 라우트
app.get('/api/mountains', async (req, res) => {
  try {
    const mountains = getAllMountains()
    res.json({ mountains })
  } catch (error) {
    console.error('Error reading mountain codes:', error)
    res.status(500).json({ error: 'Failed to load mountain codes' })
  }
})

// 특정 산의 등산 코스 가져오기
app.get('/api/mountains/:code/courses', async (req, res) => {
  try {
    const { code } = req.params
    const mountainInfo = getMountainInfo(code)
    
    if (!mountainInfo) {
      return res.status(404).json({ error: 'Mountain not found' })
    }

    // Docker 컨테이너 내부에서는 /app/mountain 경로 사용
    // mountainInfo.courseFile은 'mountain/287201304_geojson/...' 형식
    const relativePath = mountainInfo.courseFile.startsWith('mountain/') 
      ? mountainInfo.courseFile.substring('mountain/'.length)
      : mountainInfo.courseFile
    // __dirname은 /app이므로 /app/mountain/... 경로 생성
    const courseFilePath = join('/app', 'mountain', relativePath)
    console.log('Loading course file from:', courseFilePath)
    console.log('__dirname:', __dirname)
    const courseData = JSON.parse(await readFile(courseFilePath, 'utf-8'))
    
    res.json({ 
      code,
      name: mountainInfo.name,
      courses: courseData.features || [courseData]
    })
  } catch (error) {
    console.error('Error loading course data:', error)
    if (mountainInfo) {
      const relativePath = mountainInfo.courseFile.startsWith('mountain/') 
        ? mountainInfo.courseFile.substring('mountain/'.length)
        : mountainInfo.courseFile
      const attemptedPath = join(__dirname, '..', 'mountain', relativePath)
      console.error('Attempted path:', attemptedPath)
    }
    res.status(500).json({ error: 'Failed to load course data', details: error.message })
  }
})

// 특정 산의 등산 지점 가져오기
app.get('/api/mountains/:code/spots', async (req, res) => {
  try {
    const { code } = req.params
    const mountainInfo = getMountainInfo(code)
    
    if (!mountainInfo) {
      return res.status(404).json({ error: 'Mountain not found' })
    }

    // Docker 컨테이너 내부에서는 /app/mountain 경로 사용
    const relativePath = mountainInfo.spotFile.startsWith('mountain/') 
      ? mountainInfo.spotFile.substring('mountain/'.length)
      : mountainInfo.spotFile
    const spotFilePath = join('/app', 'mountain', relativePath)
    console.log('Loading spot file from:', spotFilePath)
    const spotData = JSON.parse(await readFile(spotFilePath, 'utf-8'))
    
    res.json({ 
      code,
      name: mountainInfo.name,
      spots: spotData.features || [spotData]
    })
  } catch (error) {
    console.error('Error loading spot data:', error)
    res.status(500).json({ error: 'Failed to load spot data' })
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`)
})


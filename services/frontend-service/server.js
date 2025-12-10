import express from 'express'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 80

const distPath = join(__dirname, 'dist')
const indexHtmlPath = join(distPath, 'index.html')

// dist 폴더 확인
if (!existsSync(distPath)) {
  console.error(`❌ dist 폴더가 없습니다: ${distPath}`)
  console.error('프론트엔드를 빌드해주세요: npm run build')
}

if (!existsSync(indexHtmlPath)) {
  console.error(`❌ index.html이 없습니다: ${indexHtmlPath}`)
  console.error('프론트엔드를 빌드해주세요: npm run build')
} else {
  console.log(`✅ index.html 확인됨: ${indexHtmlPath}`)
}

// 정적 파일 서빙4
app.use(express.static(distPath, {
  maxAge: '1d',
  etag: true,
  setHeaders: (res, filePath) => {
    // HTML은 항상 최신으로 받도록 캐시 끔
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store')
    }
  }
}))

// API 경로는 제외하고 SPA 라우팅 처리
app.get('*', (req, res, next) => {
  console.log(`[요청 받음] ${req.method} ${req.path}`)
  
  // API 경로는 제외
  if (req.path.startsWith('/api/')) {
    console.log(`[API 경로] ${req.path} -> next()`)
    return next()
  }
  
  // 정적 파일 요청은 제외 (확장자가 있는 경우)
  if (req.path.match(/\.[^/]+$/)) {
    console.log(`[정적 파일] ${req.path} -> next()`)
    return next()
  }
  
  // SPA 라우팅: 모든 경로를 index.html로 리다이렉트
  if (existsSync(indexHtmlPath)) {
    console.log(`[SPA 라우팅] ${req.path} -> index.html (no-cache)`)
    res.setHeader('Cache-Control', 'no-store')
    res.sendFile(indexHtmlPath)
  } else {
    console.error(`[SPA 라우팅] ❌ index.html을 찾을 수 없습니다: ${indexHtmlPath}`)
    res.status(500).send('Frontend build files not found. Please build the frontend.')
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Frontend server running on port ${PORT}`)
  console.log(`📁 Serving from: ${distPath}`)
})


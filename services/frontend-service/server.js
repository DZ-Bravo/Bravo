// CI/CD 테스트용 주석 - 재추가 3
import express from 'express'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 80

const distPath = join(__dirname, 'dist')
const indexHtmlPath = join(distPath, 'index.html')

// dist 폴더 확인1
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

// 환경 변수를 HTML에 주입하는 함수
function injectEnvToHtml(html) {
  // 즉시 실행되는 인라인 스크립트로 환경 변수 설정 (가장 먼저 실행되도록)
  const envScript = `<script>
      (function() {
        window.__RUNTIME_ENV__ = {
          VITE_KAKAO_MAP_API_KEY: ${JSON.stringify(process.env.VITE_KAKAO_MAP_API_KEY || '')},
          VITE_CESIUM_ACCESS_TOKEN: ${JSON.stringify(process.env.VITE_CESIUM_ACCESS_TOKEN || '')}
        };
        console.log('[환경 변수 주입] window.__RUNTIME_ENV__ 설정 완료:', window.__RUNTIME_ENV__);
      })();
    </script>`
  // <head> 태그 바로 다음에 스크립트 삽입 (가장 먼저 실행되도록)
  // <head> 다음에 오는 공백이나 줄바꿈을 고려하여 정확히 매칭
  return html.replace(/<head[^>]*>/, (match) => match + envScript)
}

// 정적 파일 서빙 (HTML 파일 제외)
app.use(express.static(distPath, {
  maxAge: '1d',
  etag: true,
  setHeaders: (res, filePath) => {
    // HTML은 항상 최신으로 받도록 캐시 끔
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store')
    }
  },
  // HTML 파일은 정적 파일 미들웨어에서 제외
  index: false
}))

// 루트 경로와 HTML 파일 요청 처리 (환경 변수 주입)
app.get('/', (req, res) => {
  console.log(`[요청 받음] ${req.method} ${req.path} -> index.html (환경 변수 주입)`)
  res.setHeader('Cache-Control', 'no-store')
  
  if (existsSync(indexHtmlPath)) {
    let html = readFileSync(indexHtmlPath, 'utf-8')
    html = injectEnvToHtml(html)
    res.send(html)
  } else {
    console.error(`[SPA 라우팅] ❌ index.html을 찾을 수 없습니다: ${indexHtmlPath}`)
    res.status(500).send('Frontend build files not found. Please build the frontend.')
  }
})

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
    
    // 런타임 환경 변수를 HTML에 주입
    let html = readFileSync(indexHtmlPath, 'utf-8')
    html = injectEnvToHtml(html)
    
    res.send(html)
  } else {
    console.error(`[SPA 라우팅] ❌ index.html을 찾을 수 없습니다: ${indexHtmlPath}`)
    res.status(500).send('Frontend build files not found. Please build the frontend.')
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Frontend server running on port ${PORT}`)
  console.log(`📁 Serving from: ${distPath}`)
})


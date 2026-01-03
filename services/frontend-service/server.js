// CI/CD 테스트용 주석 - 재추가 3
import express from 'express'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, readFileSync } from 'fs'
import http from 'http'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 80

const distPath = join(__dirname, 'dist')
const indexHtmlPath = join(distPath, 'index.html')

// JSON 및 URL-encoded 본문 파싱 미들웨어 (FormData가 아닌 경우에만)
// FormData는 multer로만 파싱 가능하므로, 프록시에서 그대로 전달해야 함
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || ''
  // FormData (multipart/form-data)인 경우 파싱하지 않고 그대로 전달
  if (contentType.includes('multipart/form-data')) {
    return next()
  }
  // JSON 또는 URL-encoded인 경우에만 파싱
  express.json({ limit: '10mb' })(req, res, (err) => {
    if (err) return next(err)
    express.urlencoded({ extended: true, limit: '10mb' })(req, res, next)
  })
})

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
  // 환경 변수 디버깅
  const cognitoUserPoolId = process.env.VITE_COGNITO_USER_POOL_ID || process.env.COGNITO_USER_POOL_ID || ''
  const cognitoClientId = process.env.VITE_COGNITO_CLIENT_ID || process.env.COGNITO_CLIENT_ID || ''
  console.log('[환경 변수 주입] Cognito 환경 변수 확인:', {
    VITE_COGNITO_USER_POOL_ID: process.env.VITE_COGNITO_USER_POOL_ID ? '있음' : '없음',
    COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID ? '있음' : '없음',
    VITE_COGNITO_CLIENT_ID: process.env.VITE_COGNITO_CLIENT_ID ? '있음' : '없음',
    COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID ? '있음' : '없음',
    최종값: { UserPoolId: cognitoUserPoolId ? cognitoUserPoolId.substring(0, 20) + '...' : '없음', ClientId: cognitoClientId ? cognitoClientId.substring(0, 10) + '...' : '없음' }
  })
  
  // 즉시 실행되는 인라인 스크립트로 환경 변수 설정 (가장 먼저 실행되도록)
  const envScript = `<script>
      (function() {
        window.__RUNTIME_ENV__ = {
          VITE_KAKAO_MAP_API_KEY: ${JSON.stringify(process.env.VITE_KAKAO_MAP_API_KEY || '')},
          VITE_CESIUM_ACCESS_TOKEN: ${JSON.stringify(process.env.VITE_CESIUM_ACCESS_TOKEN || '')},
          VITE_COGNITO_USER_POOL_ID: ${JSON.stringify(cognitoUserPoolId)},
          VITE_COGNITO_CLIENT_ID: ${JSON.stringify(cognitoClientId)}
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

// JSON 및 URL-encoded 본문 파싱 미들웨어 (FormData가 아닌 경우에만)
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || ''
  // FormData (multipart/form-data)인 경우 파싱하지 않고 그대로 전달
  if (contentType.includes('multipart/form-data')) {
    return next()
  }
  // JSON 또는 URL-encoded인 경우에만 파싱
  express.json({ limit: '10mb' })(req, res, next)
})

app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || ''
  // FormData (multipart/form-data)인 경우 파싱하지 않고 그대로 전달
  if (contentType.includes('multipart/form-data')) {
    return next()
  }
  // URL-encoded인 경우에만 파싱
  express.urlencoded({ extended: true, limit: '10mb' })(req, res, next)
})

// API 프록시 미들웨어
const backendServices = [
  { path: '/api/auth', host: 'auth-service.bravo-core-ns.svc.cluster.local', port: 3001 },
  { path: '/api/posts', host: 'community-service.bravo-core-ns.svc.cluster.local', port: 3002 },
  { path: '/api/community', host: 'community-service.bravo-core-ns.svc.cluster.local', port: 3002 },
  { path: '/api/user', host: 'user-service.bravo-core-ns.svc.cluster.local', port: 3002 },
  { path: '/api/utils', host: 'mountain-service.bravo-core-ns.svc.cluster.local', port: 3008 }, // imgbb-url 엔드포인트
  { path: '/api/mountains', host: 'mountain-service.bravo-core-ns.svc.cluster.local', port: 3008 },
  { path: '/api/mountain', host: 'mountain-service.bravo-core-ns.svc.cluster.local', port: 3008 },
  { path: '/api/courses', host: 'mountain-service.bravo-core-ns.svc.cluster.local', port: 3008 },
  { path: '/api/course', host: 'mountain-service.bravo-core-ns.svc.cluster.local', port: 3008 },
  { path: '/api/cctv', host: 'mountain-service.bravo-core-ns.svc.cluster.local', port: 3008 },
  { path: '/api/stamp', host: 'stamp-service.bravo-core-ns.svc.cluster.local', port: 3007 },
  { path: '/api/notifications', host: 'notification-service.bravo-core-ns.svc.cluster.local', port: 3005 },
  { path: '/api/notification', host: 'notification-service.bravo-core-ns.svc.cluster.local', port: 3005 },
  { path: '/api/notices', host: 'notice-service.bravo-core-ns.svc.cluster.local', port: 3003 },
  { path: '/api/schedules', host: 'schedule-service.bravo-core-ns.svc.cluster.local', port: 3004 },
  { path: '/api/store', host: 'store-service.bravo-core-ns.svc.cluster.local', port: 3006 },
  { path: '/api/chatbot', host: 'chatbot-service.bravo-ai-integration-ns.svc.cluster.local', port: 3007 },
  { path: '/api/ai', host: 'ai-service.bravo-ai-integration-ns.svc.cluster.local', port: 3009 },
]

// 프론트엔드 라우트 목록 (API로 프록시하지 않음)
const frontendRoutes = ['/store', '/mypage', '/community', '/mountain', '/mountains-map', '/login', '/signup', '/notice', '/stamps', '/ai-course', '/search', '/auth/success']

app.use((req, res, next) => {
  // 프론트엔드 라우트는 API 프록시에서 제외
  if (frontendRoutes.some(route => req.path === route || req.path.startsWith(route + '/'))) {
    return next()
  }
  
  // /uploads 경로는 community-service로 프록시
  if (req.path.startsWith('/uploads')) {
    const backend = { host: 'community-service.bravo-core-ns.svc.cluster.local', port: 3002 }
    const backendPath = req.path
    const queryString = req.url.includes('?') ? '?' + req.url.split('?')[1] : ''
    
    console.log(`[프록시] ${req.method} ${req.path} -> ${backend.host}:${backend.port}${backendPath}${queryString}`)
    
    const options = {
      hostname: backend.host,
      port: backend.port,
      path: backendPath + queryString,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${backend.host}:${backend.port}`,
      },
      timeout: 30000,
    }

    const proxyReq = http.request(options, (proxyRes) => {
      console.log(`[프록시 응답] ${req.method} ${req.path} -> ${proxyRes.statusCode}`)
      res.writeHead(proxyRes.statusCode, proxyRes.headers)
      proxyRes.pipe(res)
    })

    proxyReq.on('error', (err) => {
      console.error(`[프록시 에러] ${req.method} ${req.path} -> ${err.message}`)
      if (!res.headersSent) {
        res.status(502).json({ error: 'Backend service unavailable', details: err.message })
      }
    })

    proxyReq.on('timeout', () => {
      console.error(`[프록시 타임아웃] ${req.method} ${req.path} -> 30초 초과`)
      proxyReq.destroy()
      if (!res.headersSent) {
        res.status(504).json({ error: 'Gateway Timeout', details: 'Backend service did not respond within 30 seconds' })
      }
    })

    req.pipe(proxyReq)
    return
  }

  const isApiPath = req.path.startsWith('/api/') || 
                    (req.path.startsWith('/auth') && req.path !== '/auth/success' && !req.path.startsWith('/auth/success/')) ||
                    req.path.startsWith('/posts') ||
                    req.path.startsWith('/notices') ||
                    req.path.startsWith('/schedules') ||
                    req.path.startsWith('/notifications') ||
                    req.path.startsWith('/mountains') ||
                    req.path.startsWith('/courses') ||
                    req.path.startsWith('/cctv') ||
                    req.path.startsWith('/stamps') ||
                    req.path.startsWith('/chatbot') ||
                    req.path.startsWith('/ai')

  if (!isApiPath) {
    return next()
  }

  // 백엔드 서비스 찾기 (긴 경로부터 매칭)
  const sortedServices = [...backendServices].sort((a, b) => b.path.length - a.path.length)
  const backend = sortedServices.find(svc => req.path.startsWith(svc.path)) || backendServices[0]
  
  // 각 서비스별 경로 처리:
  // - auth-service: /api/auth prefix로 마운트 → 경로 그대로 전달
  // - community-service: /api/posts prefix로 마운트 → 경로 그대로 전달
  // - store-service: /api/store prefix로 마운트 → 경로 그대로 전달
  // - mountain-service: 직접 라우트 정의 (/api/courses, /api/mountains, /api/utils) → 경로 그대로 전달
  // - notification-service: 직접 라우트 정의 → 경로 그대로 전달
  // - notice-service: /api/notices prefix로 마운트 → 경로 그대로 전달
  // - 기타 서비스: path를 제거하고 나머지만 전달
  const servicesWithFullPath = ['/api/auth', '/api/posts', '/api/community', '/api/store', '/api/utils', '/api/mountains', '/api/mountain', '/api/courses', '/api/course', '/api/cctv', '/api/notifications', '/api/notification', '/api/notices', '/api/schedules', '/api/chatbot', '/api/ai']
  const backendPath = servicesWithFullPath.some(path => req.path.startsWith(path)) ? req.path : (req.path.replace(backend.path, '') || '/')
  const queryString = req.url.includes('?') ? '?' + req.url.split('?')[1] : ''
  
  console.log(`[프록시] ${req.method} ${req.path} -> ${backend.host}:${backend.port}${backendPath}${queryString}`)
  
  const options = {
    hostname: backend.host,
    port: backend.port,
    path: backendPath + queryString,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${backend.host}:${backend.port}`,
    },
    timeout: 30000, // 30초 타임아웃
  }

  const proxyReq = http.request(options, (proxyRes) => {
    console.log(`[프록시 응답] ${req.method} ${req.path} -> ${proxyRes.statusCode}`)
    res.writeHead(proxyRes.statusCode, proxyRes.headers)
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    console.error(`[프록시 에러] ${req.method} ${req.path} -> ${err.message}`)
    if (!res.headersSent) {
      res.status(502).json({ error: 'Backend service unavailable', details: err.message })
    }
  })

  proxyReq.on('timeout', () => {
    console.error(`[프록시 타임아웃] ${req.method} ${req.path} -> 30초 초과`)
    proxyReq.destroy()
    if (!res.headersSent) {
      res.status(504).json({ error: 'Gateway Timeout', details: 'Backend service did not respond within 30 seconds' })
    }
  })

  // 요청 본문 처리
  const contentType = req.headers['content-type'] || ''
  console.log(`[프록시 본문 처리] Content-Type: ${contentType}`)
  
  if (contentType.includes('multipart/form-data')) {
    // FormData는 그대로 파이프로 전달 (파일 업로드 포함)
    // express.json()과 express.urlencoded()가 본문을 소비하지 않도록 이미 처리됨
    console.log(`[프록시] FormData 감지, req.pipe()로 전달`)
    req.pipe(proxyReq)
  } else if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    // JSON 요청인 경우
    const body = JSON.stringify(req.body || {})
    proxyReq.setHeader('Content-Type', 'application/json')
    proxyReq.setHeader('Content-Length', Buffer.byteLength(body))
    proxyReq.write(body)
    proxyReq.end()
  } else {
    req.pipe(proxyReq)
  }
})

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


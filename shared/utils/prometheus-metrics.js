import client from 'prom-client'

// Prometheus 메트릭 레지스트리
const register = new client.Registry()

// 기본 메트릭 수집 (CPU, Memory 등)
client.collectDefaultMetrics({ register })

// HTTP 요청 메트릭
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
})

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service']
})

const httpRequestErrors = new client.Counter({
  name: 'http_request_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'status_code', 'service']
})

// 메트릭 등록
register.registerMetric(httpRequestDuration)
register.registerMetric(httpRequestTotal)
register.registerMetric(httpRequestErrors)

// Express 미들웨어
export function prometheusMiddleware(serviceName) {
  return (req, res, next) => {
    const start = Date.now()
    const route = req.route ? req.route.path : req.path
    
    // 응답 종료 시 메트릭 수집
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000 // 초 단위
      const statusCode = res.statusCode
      const method = req.method
      
      // 라벨 값 정규화 (동적 파라미터 제거)
      const normalizedRoute = normalizeRoute(route || req.path)
      
      // 메트릭 기록
      httpRequestDuration.observe(
        { method, route: normalizedRoute, status_code: statusCode, service: serviceName },
        duration
      )
      
      httpRequestTotal.inc({
        method,
        route: normalizedRoute,
        status_code: statusCode,
        service: serviceName
      })
      
      // 4xx, 5xx 에러 카운트
      if (statusCode >= 400) {
        httpRequestErrors.inc({
          method,
          route: normalizedRoute,
          status_code: statusCode,
          service: serviceName
        })
      }
    })
    
    next()
  }
}

// 라우트 정규화 (동적 파라미터를 :id 같은 형태로 변환)
function normalizeRoute(path) {
  if (!path) return 'unknown'
  
  // 숫자나 UUID를 :id로 변환
  return path
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/[0-9a-f]{24}/gi, '/:id') // MongoDB ObjectId
}

// /metrics 엔드포인트 핸들러
export async function metricsHandler(req, res) {
  try {
    res.set('Content-Type', register.contentType)
    res.end(await register.metrics())
  } catch (error) {
    res.status(500).end(error.message)
  }
}

export { register, httpRequestDuration, httpRequestTotal, httpRequestErrors }

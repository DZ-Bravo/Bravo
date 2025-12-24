import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 환경 변수는 ConfigMap/Secret에서 자동으로 주입됨
const PORT = process.env.PORT || 3011

const app = express()

// 미들웨어
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 정적 파일 서빙 (프론트엔드)
const publicPath = join(__dirname, 'public')
app.use(express.static(publicPath))

// API 라우트
import metricsRoutes from './routes/metrics.js'
import errorsRoutes from './routes/errors.js'
import aiRoutes from './routes/ai.js'
import reportsRoutes from './routes/reports.js'
import csvRoutes from './routes/csv-export.js'
import kialiRoutes from './routes/kiali-links.js'
import healthcheckRoutes from './routes/healthcheck.js'

// /api/monitoring 경로 지원 (Istio Gateway에서 /api/monitoring으로 라우팅)
app.use('/api/monitoring/metrics', metricsRoutes)
app.use('/api/monitoring/errors', errorsRoutes)
app.use('/api/monitoring/ai', aiRoutes)
app.use('/api/monitoring/reports', reportsRoutes)
app.use('/api/monitoring/csv', csvRoutes)
app.use('/api/monitoring/kiali', kialiRoutes)
app.use('/api/monitoring/healthcheck', healthcheckRoutes)

// 기존 /api 경로도 지원 (내부 접근용)
app.use('/api/metrics', metricsRoutes)
app.use('/api/errors', errorsRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/csv', csvRoutes)
app.use('/api/kiali', kialiRoutes)
app.use('/api/healthcheck', healthcheckRoutes)
app.use('/api/healthcheck', healthcheckRoutes)

// 네임스페이스, 서비스, 이벤트 등 추가 라우트
import kubernetesService from './services/kubernetes.js'

// /api/monitoring 경로 지원
app.get('/api/monitoring/namespaces', async (req, res) => {
  try {
    const api = kubernetesService.getK8sApi()
    const response = await api.listNamespace()
    const namespaces = response.body.items
      .filter(ns => ns.metadata.name?.startsWith('bravo-'))
      .map(ns => ({ name: ns.metadata.name }))
    res.json(namespaces)
  } catch (error) {
    console.error('Error getting namespaces:', error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/monitoring/services', async (req, res) => {
  try {
    const services = await kubernetesService.getServices()
    res.json(services)
  } catch (error) {
    console.error('Error getting services:', error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/monitoring/events', async (req, res) => {
  try {
    const { namespace, type } = req.query
    const response = namespace
      ? await kubernetesService.k8sApi.listNamespacedEvent(namespace)
      : await kubernetesService.k8sApi.listEventForAllNamespaces()
    
    let events = response.body.items
    if (type) {
      events = events.filter(e => e.type === type)
    }
    
    const recentEvents = events
      .sort((a, b) => new Date(b.firstTimestamp) - new Date(a.firstTimestamp))
      .slice(0, 50)
      .map(e => ({
        name: e.metadata.name,
        namespace: e.metadata.namespace,
        type: e.type,
        reason: e.reason,
        message: e.message,
        firstTimestamp: e.firstTimestamp,
        lastTimestamp: e.lastTimestamp
      }))
    
    res.json(recentEvents)
  } catch (error) {
    console.error('Error getting events:', error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/monitoring/grafana/links', (req, res) => {
  const GRAFANA_URL = process.env.GRAFANA_URL || 'http://grafana.bravo-monitoring-ns:3000'
  res.json({
    baseUrl: GRAFANA_URL,
    dashboard: `${GRAFANA_URL}/d`,
    explore: `${GRAFANA_URL}/explore`
  })
})

// Grafana 링크 생성 (특정 노드/Pod)
app.get('/api/monitoring/grafana/links/node/:node', (req, res) => {
  const GRAFANA_URL = process.env.GRAFANA_URL || 'http://grafana.bravo-monitoring-ns:3000'
  const { node } = req.params
  res.json({
    link: `${GRAFANA_URL}/explore?orgId=1&left=["now-1h","now","Prometheus",{"expr":"node_cpu_seconds_total{instance=~\"${node}.*\"}"}]`
  })
})

app.get('/api/monitoring/grafana/links/pod/:namespace/:pod', (req, res) => {
  const GRAFANA_URL = process.env.GRAFANA_URL || 'http://grafana.bravo-monitoring-ns:3000'
  const { namespace, pod } = req.params
  res.json({
    link: `${GRAFANA_URL}/explore?orgId=1&left=["now-1h","now","Prometheus",{"expr":"container_cpu_usage_seconds_total{pod=\"${pod}\",namespace=\"${namespace}\"}"}]`
  })
})

// 기존 /api 경로도 지원 (내부 접근용)
app.get('/api/namespaces', async (req, res) => {
  try {
    const api = kubernetesService.getK8sApi()
    const response = await api.listNamespace()
    const namespaces = response.body.items
      .filter(ns => ns.metadata.name?.startsWith('bravo-'))
      .map(ns => ({ name: ns.metadata.name }))
    res.json(namespaces)
  } catch (error) {
    console.error('Error getting namespaces:', error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/services', async (req, res) => {
  try {
    const services = await kubernetesService.getServices()
    res.json(services)
  } catch (error) {
    console.error('Error getting services:', error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/grafana/links', (req, res) => {
  const GRAFANA_URL = process.env.GRAFANA_URL || 'http://grafana.bravo-monitoring-ns:3000'
  res.json({
    baseUrl: GRAFANA_URL,
    dashboard: `${GRAFANA_URL}/d`,
    explore: `${GRAFANA_URL}/explore`
  })
})

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'ai-infra-service',
    timestamp: new Date().toISOString()
  })
})

// 루트 경로는 프론트엔드로
app.get('/', (req, res) => {
  res.sendFile(join(publicPath, 'index.html'))
})

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// 서버 시작
app.listen(PORT, '0.0.0.0', () => {
  console.log(`AI Infra Service running on port ${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
})


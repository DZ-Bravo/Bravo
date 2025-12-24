import express from 'express'
import prometheusService from '../services/prometheus.js'
import kubernetesService from '../services/kubernetes.js'

const router = express.Router()

// 클러스터 개요
router.get('/cluster/overview', async (req, res) => {
  try {
    const overview = await kubernetesService.getClusterOverview()
    res.json(overview)
  } catch (error) {
    console.error('Error getting cluster overview:', error)
    res.status(500).json({ error: error.message })
  }
})

// 노드 목록
router.get('/nodes', async (req, res) => {
  try {
    const nodes = await kubernetesService.getNodes()
    res.json(nodes)
  } catch (error) {
    console.error('Error getting nodes:', error)
    res.status(500).json({ error: error.message })
  }
})

// 특정 노드 상세 정보
router.get('/nodes/:node', async (req, res) => {
  try {
    const { node } = req.params
    const nodeInfo = await kubernetesService.getNodeDetails(node)
    res.json(nodeInfo)
  } catch (error) {
    console.error('Error getting node details:', error)
    res.status(500).json({ error: error.message })
  }
})

// 특정 노드의 Pod 목록
router.get('/nodes/:node/pods', async (req, res) => {
  try {
    const { node } = req.params
    const pods = await kubernetesService.getNodePods(node)
    res.json(pods)
  } catch (error) {
    console.error('Error getting node pods:', error)
    res.status(500).json({ error: error.message })
  }
})

// 노드 메트릭
router.get('/nodes/:node/metrics', async (req, res) => {
  try {
    const { node } = req.params
    const { start, end } = req.query
    const metrics = await prometheusService.getNodeMetrics(node, start, end)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting node metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

// Pod 목록
router.get('/pods', async (req, res) => {
  try {
    const { namespace, node, status } = req.query
    const pods = await kubernetesService.getPods({ namespace, node, status })
    res.json(pods)
  } catch (error) {
    console.error('Error getting pods:', error)
    res.status(500).json({ error: error.message })
  }
})

// 특정 Pod 상세 정보
router.get('/pods/:namespace/:pod', async (req, res) => {
  try {
    const { namespace, pod } = req.params
    const podInfo = await kubernetesService.getPodDetails(namespace, pod)
    res.json(podInfo)
  } catch (error) {
    console.error('Error getting pod details:', error)
    res.status(500).json({ error: error.message })
  }
})

// 실시간 메트릭
router.get('/realtime', async (req, res) => {
  try {
    const { node } = req.query
    const metrics = await prometheusService.getRealtimeMetrics(node)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting realtime metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

// 과거 메트릭 (시계열)
router.get('/history', async (req, res) => {
  try {
    const { node, start, end, step } = req.query
    const metrics = await prometheusService.getHistoryMetrics(node, start, end, step)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting history metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

// Container CPU 사용률 (시계열)
router.get('/containers/cpu', async (req, res) => {
  try {
    const { node, start, end, step = '15s' } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const metrics = await prometheusService.getContainerCPUMetrics(node, start, end, step)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting container CPU metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

// Container Memory 사용률 (시계열)
router.get('/containers/memory', async (req, res) => {
  try {
    const { node, start, end, step = '15s' } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const metrics = await prometheusService.getContainerMemoryMetrics(node, start, end, step)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting container memory metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

// Pod CPU 사용률 (시계열)
router.get('/pods/cpu', async (req, res) => {
  try {
    const { node, start, end, step = '15s' } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const metrics = await prometheusService.getPodCPUMetrics(node, start, end, step)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting pod CPU metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

// Pod Memory 사용률 (시계열)
router.get('/pods/memory', async (req, res) => {
  try {
    const { node, start, end, step = '15s' } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const metrics = await prometheusService.getPodMemoryMetrics(node, start, end, step)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting pod memory metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

// 리소스 사용률 (노드 선택에 따라 클러스터 또는 특정 노드)
router.get('/resource-usage', async (req, res) => {
  try {
    const { node, start, end, step = '15s' } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters are required' })
    }
    const metrics = await prometheusService.getClusterMetrics(start, end, node, step)
    res.json(metrics)
  } catch (error) {
    console.error('Error getting resource usage metrics:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router


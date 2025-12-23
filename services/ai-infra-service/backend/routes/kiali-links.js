import express from 'express'

const router = express.Router()

const KIALI_BASE_URL = process.env.KIALI_URL || 'http://192.168.0.244:20001/kiali'

// Kiali 링크 생성 함수
function generateKialiLink(type, params) {
  switch(type) {
    case 'service':
      return `${KIALI_BASE_URL}/console/namespaces/${params.namespace}/services/${params.service}`
    
    case 'namespace':
      return `${KIALI_BASE_URL}/console/namespaces/${params.namespace}/graph`
    
    case 'graph':
      const namespaces = params.namespaces ? params.namespaces.join(',') : 'bravo-core-ns,bravo-ai-integration-ns'
      return `${KIALI_BASE_URL}/console/graph/namespaces?namespaces=${namespaces}`
    
    case 'workload':
      return `${KIALI_BASE_URL}/console/namespaces/${params.namespace}/workloads/${params.workload}`
    
    default:
      return KIALI_BASE_URL
  }
}

// 서비스별 Kiali 링크
router.get('/service/:namespace/:service', (req, res) => {
  const { namespace, service } = req.params
  const link = generateKialiLink('service', { namespace, service })
  res.json({ link })
})

// 네임스페이스별 Kiali 링크
router.get('/namespace/:namespace', (req, res) => {
  const { namespace } = req.params
  const link = generateKialiLink('namespace', { namespace })
  res.json({ link })
})

// 그래프 뷰 링크
router.get('/graph', (req, res) => {
  const { namespaces } = req.query
  const namespacesList = namespaces ? namespaces.split(',') : null
  const link = generateKialiLink('graph', { namespaces: namespacesList })
  res.json({ link })
})

// 워크로드 링크
router.get('/workload/:namespace/:workload', (req, res) => {
  const { namespace, workload } = req.params
  const link = generateKialiLink('workload', { namespace, workload })
  res.json({ link })
})

export default router


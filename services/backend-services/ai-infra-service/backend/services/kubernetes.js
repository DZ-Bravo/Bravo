import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const k8s = require('@kubernetes/client-node')

// Lazy initialization
let kc = null
let k8sApi = null
let metricsApi = null

function getK8sApi() {
  if (!k8sApi) {
    if (!kc) {
      kc = new k8s.KubeConfig()
      kc.loadFromDefault()
    }
    k8sApi = kc.makeApiClient(k8s.CoreV1Api)
  }
  return k8sApi
}

function getMetricsApi() {
  if (!metricsApi) {
    if (!kc) {
      kc = new k8s.KubeConfig()
      kc.loadFromDefault()
    }
    try {
      // Metrics API는 k8s 객체에서 직접 가져오기 시도
      const MetricsApi = k8s.MetricsV1beta1Api || k8s.MetricsApi
      if (MetricsApi) {
        metricsApi = kc.makeApiClient(MetricsApi)
      } else {
        // Metrics API가 없으면 null 반환 (메트릭 기능 비활성화)
        console.warn('Metrics API not available, metrics features will be disabled')
        return null
      }
    } catch (error) {
      console.error('Error initializing Metrics API:', error)
      return null
    }
  }
  return metricsApi
}

// 클러스터 개요
async function getClusterOverview() {
  try {
    const api = getK8sApi()
    const [nodes, pods] = await Promise.all([
      api.listNode(),
      api.listPodForAllNamespaces()
    ])
    
    const nodeCount = nodes.body.items.length
    const readyNodes = nodes.body.items.filter(n => 
      n.status.conditions?.some(c => c.type === 'Ready' && c.status === 'True')
    ).length
    
    const podCount = pods.body.items.length
    const runningPods = pods.body.items.filter(p => p.status.phase === 'Running').length
    const failedPods = pods.body.items.filter(p => p.status.phase === 'Failed').length
    const pendingPods = pods.body.items.filter(p => p.status.phase === 'Pending').length
    
    return {
      nodes: {
        total: nodeCount,
        ready: readyNodes
      },
      pods: {
        total: podCount,
        running: runningPods,
        failed: failedPods,
        pending: pendingPods
      }
    }
  } catch (error) {
    console.error('Error getting cluster overview:', error)
    throw error
  }
}

// 노드 목록
async function getNodes() {
  try {
    const api = getK8sApi()
    const response = await api.listNode()
    return response.body.items.map(node => ({
      name: node.metadata.name,
      ip: node.status.addresses?.find(a => a.type === 'InternalIP')?.address,
      role: node.metadata.labels['node-role.kubernetes.io/control-plane'] ? 'control-plane' : 'worker',
      status: node.status.conditions?.find(c => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady',
      os: node.status.nodeInfo.osImage,
      kernel: node.status.nodeInfo.kernelVersion,
      containerRuntime: node.status.nodeInfo.containerRuntimeVersion,
      kubeletVersion: node.status.nodeInfo.kubeletVersion
    }))
  } catch (error) {
    console.error('Error getting nodes:', error)
    throw error
  }
}

// 특정 노드 상세 정보
async function getNodeDetails(nodeName) {
  try {
    const api = getK8sApi()
    const node = await api.readNode(nodeName)
    const pods = await api.listPodForAllNamespaces(
      undefined,
      undefined,
      undefined,
      `spec.nodeName=${nodeName}`
    )
    
    return {
      name: node.body.metadata.name,
      ip: node.body.status.addresses?.find(a => a.type === 'InternalIP')?.address,
      role: node.body.metadata.labels['node-role.kubernetes.io/control-plane'] ? 'control-plane' : 'worker',
      status: node.body.status.conditions?.find(c => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady',
      os: node.body.status.nodeInfo.osImage,
      kernel: node.body.status.nodeInfo.kernelVersion,
      containerRuntime: node.body.status.nodeInfo.containerRuntimeVersion,
      kubeletVersion: node.body.status.nodeInfo.kubeletVersion,
      capacity: {
        cpu: node.body.status.capacity?.cpu,
        memory: node.body.status.capacity?.memory
      },
      allocatable: {
        cpu: node.body.status.allocatable?.cpu,
        memory: node.body.status.allocatable?.memory
      },
      podCount: pods.body.items.length
    }
  } catch (error) {
    console.error('Error getting node details:', error)
    throw error
  }
}

// 특정 노드의 Pod 목록
async function getNodePods(nodeName) {
  try {
    const api = getK8sApi()
    const response = await api.listPodForAllNamespaces(
      undefined,
      undefined,
      undefined,
      `spec.nodeName=${nodeName}`
    )
    
    return response.body.items.map(pod => ({
      name: pod.metadata.name,
      namespace: pod.metadata.namespace,
      status: pod.status.phase,
      restartCount: pod.status.containerStatuses?.reduce((sum, cs) => sum + cs.restartCount, 0) || 0
    }))
  } catch (error) {
    console.error('Error getting node pods:', error)
    throw error
  }
}

// Pod 목록 (필터링 가능)
async function getPods({ namespace, node, status } = {}) {
  try {
    const api = getK8sApi()
    const response = namespace
      ? await api.listNamespacedPod(namespace)
      : await api.listPodForAllNamespaces()
    
    let pods = response.body.items
    
    // 필터링
    if (node) {
      pods = pods.filter(p => p.spec.nodeName === node)
    }
    if (status) {
      pods = pods.filter(p => p.status.phase === status)
    }
    
    return pods.map(pod => ({
      name: pod.metadata.name,
      namespace: pod.metadata.namespace,
      node: pod.spec.nodeName,
      status: pod.status.phase,
      restartCount: pod.status.containerStatuses?.reduce((sum, cs) => sum + cs.restartCount, 0) || 0,
      createdAt: pod.metadata.creationTimestamp
    }))
  } catch (error) {
    console.error('Error getting pods:', error)
    throw error
  }
}

// 특정 Pod 상세 정보
async function getPodDetails(namespace, podName) {
  try {
    const api = getK8sApi()
    const pod = await api.readNamespacedPod(podName, namespace)
    
    return {
      name: pod.body.metadata.name,
      namespace: pod.body.metadata.namespace,
      node: pod.body.spec.nodeName,
      status: pod.body.status.phase,
      ip: pod.body.status.podIP,
      restartCount: pod.body.status.containerStatuses?.reduce((sum, cs) => sum + cs.restartCount, 0) || 0,
      containers: pod.body.spec.containers.map(c => ({
        name: c.name,
        image: c.image,
        resources: c.resources
      })),
      createdAt: pod.body.metadata.creationTimestamp
    }
  } catch (error) {
    console.error('Error getting pod details:', error)
    throw error
  }
}

// 서비스 목록
async function getServices() {
  try {
    const api = getK8sApi()
    const response = await api.listServiceForAllNamespaces()
    return response.body.items
      .filter(svc => svc.metadata.namespace?.startsWith('bravo-'))
      .map(svc => ({
        name: svc.metadata.name,
        namespace: svc.metadata.namespace,
        type: svc.spec.type,
        clusterIP: svc.spec.clusterIP
      }))
  } catch (error) {
    console.error('Error getting services:', error)
    throw error
  }
}

export default {
  getK8sApi,
  getMetricsApi,
  getClusterOverview,
  getNodes,
  getNodeDetails,
  getNodePods,
  getPods,
  getPodDetails,
  getServices
}

import kubernetesService from './kubernetes.js'

// Container CPU/Memory 메트릭을 Kubernetes Metrics API로 가져오기
async function getContainerMetricsFromK8s(nodeName, start, end) {
  try {
    const metricsApi = kubernetesService.getMetricsApi()
    if (!metricsApi) {
      console.warn('Metrics API not available')
      return []
    }
    const k8sApi = kubernetesService.getK8sApi()
    
    // 모든 Pod 목록 가져오기
    const podsResponse = await k8sApi.listPodForAllNamespaces()
    let pods = podsResponse.body.items
    
    // 노드 필터링
    if (nodeName) {
      pods = pods.filter(p => p.spec.nodeName === nodeName)
    }
    
    const containers = []
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000
    
    // 각 Pod의 메트릭 가져오기
    for (const pod of pods.slice(0, 50)) { // 최대 50개만
      try {
        const metrics = await metricsApi.readNamespacedPodMetrics(
          pod.metadata.name,
          pod.metadata.namespace
        )
        
        metrics.body.containers.forEach(container => {
          // CPU: nanoCores를 cores로 변환
          let cpuCores = 0
          if (container.usage?.cpu) {
            const cpuStr = container.usage.cpu
            if (cpuStr.endsWith('n')) {
              cpuCores = parseInt(cpuStr.replace('n', '')) / 1000000000
            } else if (cpuStr.endsWith('m')) {
              cpuCores = parseInt(cpuStr.replace('m', '')) / 1000
            } else {
              cpuCores = parseFloat(cpuStr) || 0
            }
          }
          
          // Memory: bytes로 변환
          let memoryBytes = 0
          if (container.usage?.memory) {
            const memStr = container.usage.memory
            if (memStr.endsWith('Ki')) {
              memoryBytes = parseInt(memStr.replace('Ki', '')) * 1024
            } else if (memStr.endsWith('Mi')) {
              memoryBytes = parseInt(memStr.replace('Mi', '')) * 1024 * 1024
            } else if (memStr.endsWith('Gi')) {
              memoryBytes = parseInt(memStr.replace('Gi', '')) * 1024 * 1024 * 1024
            } else {
              memoryBytes = parseInt(memStr) || 0
            }
          }
          
          containers.push({
            name: container.name,
            namespace: pod.metadata.namespace,
            pod: pod.metadata.name,
            node: pod.spec.nodeName,
            cpu: cpuCores,
            memory: memoryBytes,
            timestamp: now
          })
        })
      } catch (err) {
        // 개별 Pod 메트릭 읽기 실패는 무시
        console.warn(`Failed to get metrics for pod ${pod.metadata.namespace}/${pod.metadata.name}:`, err.message)
      }
    }
    
    return containers
  } catch (error) {
    console.error('Error getting container metrics from K8s:', error)
    return []
  }
}

// Pod CPU/Memory 메트릭을 Kubernetes Metrics API로 가져오기 (컨테이너 집계)
async function getPodMetricsFromK8s(nodeName, start, end) {
  try {
    const metricsApi = kubernetesService.getMetricsApi()
    if (!metricsApi) {
      console.warn('Metrics API not available')
      return []
    }
    const k8sApi = kubernetesService.getK8sApi()
    
    // 모든 Pod 목록 가져오기
    const podsResponse = await k8sApi.listPodForAllNamespaces()
    let pods = podsResponse.body.items
    
    // 노드 필터링
    if (nodeName) {
      pods = pods.filter(p => p.spec.nodeName === nodeName)
    }
    
    const podMetrics = []
    const now = Date.now()
    
    // 각 Pod의 메트릭 가져오기
    for (const pod of pods.slice(0, 50)) { // 최대 50개만
      try {
        const metrics = await metricsApi.readNamespacedPodMetrics(
          pod.metadata.name,
          pod.metadata.namespace
        )
        
        // 컨테이너별 CPU/Memory 합계
        let totalCpu = 0
        let totalMemory = 0
        
        metrics.body.containers.forEach(container => {
          // CPU: nanoCores를 cores로 변환
          let cpuCores = 0
          if (container.usage?.cpu) {
            const cpuStr = container.usage.cpu
            if (cpuStr.endsWith('n')) {
              cpuCores = parseInt(cpuStr.replace('n', '')) / 1000000000
            } else if (cpuStr.endsWith('m')) {
              cpuCores = parseInt(cpuStr.replace('m', '')) / 1000
            } else {
              cpuCores = parseFloat(cpuStr) || 0
            }
          }
          
          // Memory: bytes로 변환
          let memoryBytes = 0
          if (container.usage?.memory) {
            const memStr = container.usage.memory
            if (memStr.endsWith('Ki')) {
              memoryBytes = parseInt(memStr.replace('Ki', '')) * 1024
            } else if (memStr.endsWith('Mi')) {
              memoryBytes = parseInt(memStr.replace('Mi', '')) * 1024 * 1024
            } else if (memStr.endsWith('Gi')) {
              memoryBytes = parseInt(memStr.replace('Gi', '')) * 1024 * 1024 * 1024
            } else {
              memoryBytes = parseInt(memStr) || 0
            }
          }
          
          totalCpu += cpuCores
          totalMemory += memoryBytes
        })
        
        podMetrics.push({
          name: pod.metadata.name,
          namespace: pod.metadata.namespace,
          node: pod.spec.nodeName,
          cpu: totalCpu,
          memory: totalMemory,
          timestamp: now
        })
      } catch (err) {
        // 개별 Pod 메트릭 읽기 실패는 무시
        console.warn(`Failed to get metrics for pod ${pod.metadata.namespace}/${pod.metadata.name}:`, err.message)
      }
    }
    
    return podMetrics
  } catch (error) {
    console.error('Error getting pod metrics from K8s:', error)
    return []
  }
}

export default {
  getContainerMetricsFromK8s,
  getPodMetricsFromK8s
}


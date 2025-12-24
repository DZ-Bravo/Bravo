import kubernetesService from './kubernetes.js'

// 헬스체크 상태 조회 (로그 기반)
async function getHealthcheckStatus() {
  try {
    const k8sApi = kubernetesService.getK8sApi()
    
    // healthcheck Pod 목록 조회
    const response = await k8sApi.listNamespacedPod(
      'bravo-ai-integration-ns',
      undefined,
      undefined,
      undefined,
      undefined,
      'app=healthcheck'
    )
    
    const pods = response.body.items
    const errors = []
    
    // 각 Pod의 로그를 읽어서 최근 에러 확인 (최근 100줄)
    for (const pod of pods) {
      try {
        const logResponse = await k8sApi.readNamespacedPodLog(
          pod.metadata.name,
          'bravo-ai-integration-ns',
          'healthcheck',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          100 // tailLines: 최근 100줄
        )
        
        const logText = logResponse.body
        const logLines = logText.split('\n').filter(line => line.trim().length > 0)
        
        // ERROR, 실패, FAIL 등이 포함된 라인 찾기 (최근 것만)
        const errorLines = logLines
          .filter(line => {
            const upperLine = line.toUpperCase()
            return upperLine.includes('ERROR') || 
                   upperLine.includes('실패') || 
                   upperLine.includes('FAIL') ||
                   upperLine.includes('DOWN') ||
                   upperLine.includes('CRITICAL')
          })
          .slice(-10) // 최근 10개만
        
        if (errorLines.length > 0) {
          errors.push({
            pod: pod.metadata.name,
            node: pod.spec.nodeName,
            errors: errorLines.map(line => {
              // 로그에서 타임스탬프와 메시지 추출
              const timestampMatch = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/)
              let message = line
              
              // ERROR:, 실패:, FAIL 등 패턴으로 메시지 추출
              const errorMatch = line.match(/(ERROR|실패|FAIL|DOWN|CRITICAL)[:\s]+(.+)/i)
              if (errorMatch && errorMatch[2]) {
                message = errorMatch[2].trim()
              } else if (line.includes('ERROR:')) {
                const match = line.match(/ERROR:\s*(.+)/i)
                if (match) message = match[1].trim()
              }
              
              return {
                timestamp: timestampMatch ? timestampMatch[1] : new Date().toISOString(),
                message: message
              }
            })
          })
        }
      } catch (podError) {
        console.error(`Error reading logs from pod ${pod.metadata.name}:`, podError.message)
        // 개별 Pod 로그 읽기 실패는 무시하고 계속 진행
      }
    }
    
    return {
      hasErrors: errors.length > 0,
      errors,
      checkedPods: pods.length
    }
  } catch (error) {
    console.error('Error getting healthcheck status:', error)
    throw error
  }
}

export default {
  getHealthcheckStatus
}


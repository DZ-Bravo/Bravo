import prometheusService from './prometheus.js'
import kubernetesService from './kubernetes.js'
import alertService from './alert.js'

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

// Slack 알람 전송
async function sendSlackAlert(level, alertData) {
  if (!SLACK_WEBHOOK_URL) {
    console.warn('SLACK_WEBHOOK_URL not configured, skipping alert')
    return false
  }
  
  try {
    await alertService.sendSlackAlert(level, alertData)
    return true
  } catch (error) {
    console.error('Failed to send Slack alert:', error.message)
    return false
  }
}

// Prometheus에서 과거 N분간의 메트릭이 임계치를 초과했는지 확인
async function checkMetricExceededDuration(serviceName, namespace, metricType, threshold, durationMinutes) {
  try {
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - durationMinutes * 60 * 1000)
    
    // Prometheus 쿼리 생성
    let query = ''
    if (metricType === 'cpu') {
      // CPU 사용률: 서비스의 모든 Pod의 평균 CPU 사용률
      query = `avg(avg_over_time(container_cpu_usage_seconds_total{namespace="${namespace}",pod=~"${serviceName}.*",container!="POD"}[5m])) * 100`
    } else if (metricType === 'memory') {
      // Memory 사용률: 서비스의 모든 Pod의 평균 Memory 사용률
      query = `avg((avg_over_time(container_memory_working_set_bytes{namespace="${namespace}",pod=~"${serviceName}.*",container!="POD"}[5m]) / avg_over_time(container_spec_memory_limit_bytes{namespace="${namespace}",pod=~"${serviceName}.*",container!="POD"}[5m])) * 100)`
    } else if (metricType === 'errorRate') {
      // 5xx 에러율
      query = `avg_over_time((sum(rate(http_requests_total{service="${serviceName}",status_code=~"5.."}[5m])) / sum(rate(http_requests_total{service="${serviceName}"}[5m]))) * 100[5m])`
    }
    
    if (!query) return false
    
    // Prometheus에서 과거 N분간의 데이터 확인
    const results = await prometheusService.queryRange(query, startTime.toISOString(), endTime.toISOString(), '1m')
    
    if (!results || results.length === 0) return false
    
    // 모든 데이터 포인트가 임계치를 초과했는지 확인
    // 최소 durationMinutes 개의 데이터 포인트가 있어야 함
    const dataPoints = results.flatMap(r => r.values || [])
    if (dataPoints.length < durationMinutes) return false
    
    // 모든 포인트가 임계치 초과
    const allExceeded = dataPoints.every(point => {
      const value = parseFloat(point[1])
      return !isNaN(value) && value > threshold
    })
    
    return allExceeded
  } catch (error) {
    console.warn(`Failed to check metric duration for ${serviceName}:`, error.message)
    return false
  }
}

// 1. 가용성 급락 (P1): 5xx 비율 5% 이상 5분간 지속
async function checkAvailabilityDrop(services) {
  const alerts = []
  
  for (const service of services) {
    const errorRate5xx = service.errorRate5xx || 0
    
    // 현재 5xx 비율이 5% 이상이고, 5분간 지속되었는지 확인
    if (errorRate5xx >= 5) {
      const isDurationMet = await checkMetricExceededDuration(
        service.name,
        service.namespace,
        'errorRate',
        5,  // 5% 임계치
        5   // 5분간 지속
      )
      
      if (isDurationMet) {
        const sent = await sendSlackAlert('CRITICAL', {
          metric: '가용성 급락 (5xx 비율 증가)',
          currentValue: `${errorRate5xx}%`,
          threshold: '5%',
          service: service.name,
          namespace: service.namespace,
          message: `서비스 ${service.name}의 5xx 에러율이 ${errorRate5xx}%로 5분간 지속되었습니다.`,
          grafanaLink: `https://grafana.hiker-cloud.site`
        })
        
        if (sent) {
          alerts.push({
            type: 'availability',
            service: service.name,
            namespace: service.namespace,
            level: 'CRITICAL',
            value: errorRate5xx
          })
        }
      }
    }
  }
  
  return alerts
}

// 2. Replica 부족 (P1): available < desired (5분)
// Kubernetes Deployment 상태는 kube-state-metrics로 확인
// 간단하게 현재 상태만 확인 (연속 체크는 CronJob 주기로 처리)
async function checkReplicaShortage(services) {
  const alerts = []
  
  for (const service of services) {
    const desired = service.replica?.desired || 0
    const available = service.replica?.available || 0
    
    // Replica 부족 상태 확인
    if (desired > 0 && available < desired) {
      // kube-state-metrics를 통해 과거 5분간의 상태 확인
      // 간단하게 현재 상태만 확인 (실제로는 kube-state-metrics의 deployment 메트릭 활용 가능)
      const sent = await sendSlackAlert('CRITICAL', {
        metric: 'Replica 부족',
        currentValue: `${available} / ${desired}`,
        threshold: `${desired}`,
        service: service.name,
        namespace: service.namespace,
        message: `서비스 ${service.name}의 Replica가 부족합니다. (Available: ${available}, Desired: ${desired})`,
        grafanaLink: `https://grafana.hiker-cloud.site`
      })
      
      if (sent) {
        alerts.push({
          type: 'replica',
          service: service.name,
          namespace: service.namespace,
          level: 'CRITICAL',
          value: `${available}/${desired}`
        })
      }
    }
  }
  
  return alerts
}

// 3. CPU 임계치 (P2/P1): 70% 초과 10분 / 90% 초과 5분
async function checkCPUThreshold(services) {
  const alerts = []
  
  for (const service of services) {
    const cpu = service.cpu || 0
    
    if (cpu > 90) {
      // P1: 90% 초과 5분간 지속 확인
      const isDurationMet = await checkMetricExceededDuration(
        service.name,
        service.namespace,
        'cpu',
        90, // 90% 임계치
        5   // 5분간 지속
      )
      
      if (isDurationMet) {
        const sent = await sendSlackAlert('CRITICAL', {
          metric: 'CPU 사용률 (P1)',
          currentValue: `${cpu}%`,
          threshold: '90%',
          service: service.name,
          namespace: service.namespace,
          message: `서비스 ${service.name}의 CPU 사용률이 ${cpu}%로 90%를 5분간 초과했습니다.`,
          grafanaLink: `https://grafana.hiker-cloud.site`
        })
        
        if (sent) {
          alerts.push({ type: 'cpu-p1', service: service.name, namespace: service.namespace, level: 'CRITICAL', value: cpu })
        }
      }
    } else if (cpu > 70) {
      // P2: 70% 초과 10분간 지속 확인
      const isDurationMet = await checkMetricExceededDuration(
        service.name,
        service.namespace,
        'cpu',
        70, // 70% 임계치
        10  // 10분간 지속
      )
      
      if (isDurationMet) {
        const sent = await sendSlackAlert('WARNING', {
          metric: 'CPU 사용률 (P2)',
          currentValue: `${cpu}%`,
          threshold: '70%',
          service: service.name,
          namespace: service.namespace,
          message: `서비스 ${service.name}의 CPU 사용률이 ${cpu}%로 70%를 10분간 초과했습니다.`,
          grafanaLink: `https://grafana.hiker-cloud.site`
        })
        
        if (sent) {
          alerts.push({ type: 'cpu-p2', service: service.name, namespace: service.namespace, level: 'WARNING', value: cpu })
        }
      }
    }
  }
  
  return alerts
}

// 4. Memory 임계치 (P2/P1): 70% 초과 10분 / 90% 초과 5분
async function checkMemoryThreshold(services) {
  const alerts = []
  
  for (const service of services) {
    const mem = service.mem || 0
    
    if (mem > 90) {
      // P1: 90% 초과 5분간 지속 확인
      const isDurationMet = await checkMetricExceededDuration(
        service.name,
        service.namespace,
        'memory',
        90, // 90% 임계치
        5   // 5분간 지속
      )
      
      if (isDurationMet) {
        const sent = await sendSlackAlert('CRITICAL', {
          metric: 'Memory 사용률 (P1)',
          currentValue: `${mem}%`,
          threshold: '90%',
          service: service.name,
          namespace: service.namespace,
          message: `서비스 ${service.name}의 Memory 사용률이 ${mem}%로 90%를 5분간 초과했습니다.`,
          grafanaLink: `https://grafana.hiker-cloud.site`
        })
        
        if (sent) {
          alerts.push({ type: 'memory-p1', service: service.name, namespace: service.namespace, level: 'CRITICAL', value: mem })
        }
      }
    } else if (mem > 70) {
      // P2: 70% 초과 10분간 지속 확인
      const isDurationMet = await checkMetricExceededDuration(
        service.name,
        service.namespace,
        'memory',
        70, // 70% 임계치
        10  // 10분간 지속
      )
      
      if (isDurationMet) {
        const sent = await sendSlackAlert('WARNING', {
          metric: 'Memory 사용률 (P2)',
          currentValue: `${mem}%`,
          threshold: '70%',
          service: service.name,
          namespace: service.namespace,
          message: `서비스 ${service.name}의 Memory 사용률이 ${mem}%로 70%를 10분간 초과했습니다.`,
          grafanaLink: `https://grafana.hiker-cloud.site`
        })
        
        if (sent) {
          alerts.push({ type: 'memory-p2', service: service.name, namespace: service.namespace, level: 'WARNING', value: mem })
        }
      }
    }
  }
  
  return alerts
}

// 메인 알람 체크 함수
async function checkAllAlerts() {
  console.log('🔔 Starting alert check...', new Date().toISOString())
  
  if (!SLACK_WEBHOOK_URL) {
    console.warn('⚠️ SLACK_WEBHOOK_URL not configured, alerts will not be sent')
  }
  
  try {
    // 서비스 목록 및 메트릭 수집
    const startTime = new Date(Date.now() - 3600000) // 1시간 전
    const endTime = new Date()
    
    const services = await kubernetesService.getServices()
    const deployments = await kubernetesService.getDeployments()
    
    // 서비스별 메트릭 수집
    const servicesWithMetrics = await Promise.all(services.map(async (service) => {
      const deployment = deployments.find(d => 
        d.namespace === service.namespace && 
        d.name === service.name
      )
      
      if (!deployment) return null
      
      // Prometheus에서 서비스 메트릭 수집
      const serviceMetrics = await prometheusService.getServiceMetrics(
        service.name,
        service.namespace,
        startTime.toISOString(),
        endTime.toISOString()
      ).catch(() => ({ rps: 0, latencyP95: 0, errorRate5xx: 0, errorRate4xx: 0 }))
      
      // Prometheus에서 서비스 리소스 메트릭 수집
      const resourceMetrics = await prometheusService.getServiceResourceMetrics(
        service.name,
        service.namespace,
        startTime.toISOString(),
        endTime.toISOString()
      ).catch(() => ({ cpu: 0, mem: 0 }))
      
      return {
        name: service.name,
        namespace: service.namespace,
        errorRate5xx: serviceMetrics.errorRate5xx || 0,
        replica: {
          desired: deployment?.desired || 0,
          available: deployment?.available || 0
        },
        cpu: resourceMetrics.cpu || 0,
        mem: resourceMetrics.mem || 0
      }
    }))
    
    const validServices = servicesWithMetrics.filter(s => s !== null)
    
    console.log(`📊 Checking ${validServices.length} services...`)
    
    // 각 알람 조건 체크
    const availabilityAlerts = await checkAvailabilityDrop(validServices)
    const replicaAlerts = await checkReplicaShortage(validServices)
    const cpuAlerts = await checkCPUThreshold(validServices)
    const memoryAlerts = await checkMemoryThreshold(validServices)
    
    const totalAlerts = availabilityAlerts.length + replicaAlerts.length + cpuAlerts.length + memoryAlerts.length
    
    console.log(`✅ Alert check completed:`)
    console.log(`   - Availability alerts: ${availabilityAlerts.length}`)
    console.log(`   - Replica alerts: ${replicaAlerts.length}`)
    console.log(`   - CPU alerts: ${cpuAlerts.length}`)
    console.log(`   - Memory alerts: ${memoryAlerts.length}`)
    console.log(`   - Total alerts sent: ${totalAlerts}`)
    
    if (totalAlerts > 0) {
      console.log('📢 Alerts sent to Slack')
    }
    
  } catch (error) {
    console.error('❌ Error during alert check:', error)
    process.exit(1)
  }
}

// 스크립트 실행
checkAllAlerts()
  .then(() => {
    console.log('✅ Alert check script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Alert check script failed:', error)
    process.exit(1)
  })

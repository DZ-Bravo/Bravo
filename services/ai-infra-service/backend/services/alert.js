import axios from 'axios'

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

// 임계치 설정
const THRESHOLDS = {
  CPU_WARNING: parseFloat(process.env.CPU_THRESHOLD_WARNING || '70'),
  CPU_CRITICAL: parseFloat(process.env.CPU_THRESHOLD_CRITICAL || '85'),
  MEMORY_WARNING: parseFloat(process.env.MEMORY_THRESHOLD_WARNING || '75'),
  MEMORY_CRITICAL: parseFloat(process.env.MEMORY_THRESHOLD_CRITICAL || '90'),
  ERROR_RATE_WARNING: parseFloat(process.env.ERROR_RATE_THRESHOLD_WARNING || '0.5'),
  ERROR_RATE_CRITICAL: parseFloat(process.env.ERROR_RATE_THRESHOLD_CRITICAL || '2.0'),
  LATENCY_WARNING: parseFloat(process.env.LATENCY_THRESHOLD_WARNING || '500'),
  LATENCY_CRITICAL: parseFloat(process.env.LATENCY_THRESHOLD_CRITICAL || '2000'),
  DISK_WARNING: parseFloat(process.env.DISK_THRESHOLD_WARNING || '75'),
  DISK_CRITICAL: parseFloat(process.env.DISK_THRESHOLD_CRITICAL || '90')
}

// Slack 알람 전송
async function sendSlackAlert(level, alertData) {
  if (!SLACK_WEBHOOK_URL) {
    console.warn('SLACK_WEBHOOK_URL not configured, skipping alert')
    return
  }
  
  const color = level === 'CRITICAL' ? 'danger' : 'warning'
  
  const payload = {
    attachments: [{
      color: color,
      title: `[${level}] HIKER 인프라 모니터링 알람`,
      fields: [
        {
          title: '발생 시간',
          value: new Date().toISOString(),
          short: true
        },
        {
          title: '노드/Pod',
          value: alertData.node || alertData.pod || 'N/A',
          short: true
        },
        {
          title: '메트릭',
          value: `${alertData.metric}: ${alertData.currentValue} (임계치: ${alertData.threshold})`,
          short: false
        },
        {
          title: 'Grafana 링크',
          value: alertData.grafanaLink || 'N/A',
          short: false
        }
      ],
      footer: 'HIKER 인프라 모니터링',
      ts: Math.floor(Date.now() / 1000)
    }]
  }
  
  try {
    await axios.post(SLACK_WEBHOOK_URL, payload)
    console.log(`Slack alert sent: ${level} - ${alertData.metric}`)
  } catch (error) {
    console.error('Error sending Slack alert:', error)
  }
}

// 메트릭 체크 및 알람 발송
async function checkMetrics(metrics) {
  const alerts = []
  
  // CPU 체크
  if (metrics.cpu > THRESHOLDS.CPU_CRITICAL) {
    await sendSlackAlert('CRITICAL', {
      metric: 'CPU 사용률',
      currentValue: `${metrics.cpu}%`,
      threshold: `${THRESHOLDS.CPU_CRITICAL}%`,
      node: metrics.node,
      grafanaLink: metrics.grafanaLink
    })
    alerts.push({ level: 'CRITICAL', metric: 'CPU', value: metrics.cpu })
  } else if (metrics.cpu > THRESHOLDS.CPU_WARNING) {
    await sendSlackAlert('WARNING', {
      metric: 'CPU 사용률',
      currentValue: `${metrics.cpu}%`,
      threshold: `${THRESHOLDS.CPU_WARNING}%`,
      node: metrics.node,
      grafanaLink: metrics.grafanaLink
    })
    alerts.push({ level: 'WARNING', metric: 'CPU', value: metrics.cpu })
  }
  
  // Memory 체크
  if (metrics.memory > THRESHOLDS.MEMORY_CRITICAL) {
    await sendSlackAlert('CRITICAL', {
      metric: '메모리 사용률',
      currentValue: `${metrics.memory}%`,
      threshold: `${THRESHOLDS.MEMORY_CRITICAL}%`,
      node: metrics.node,
      grafanaLink: metrics.grafanaLink
    })
    alerts.push({ level: 'CRITICAL', metric: 'Memory', value: metrics.memory })
  } else if (metrics.memory > THRESHOLDS.MEMORY_WARNING) {
    await sendSlackAlert('WARNING', {
      metric: '메모리 사용률',
      currentValue: `${metrics.memory}%`,
      threshold: `${THRESHOLDS.MEMORY_WARNING}%`,
      node: metrics.node,
      grafanaLink: metrics.grafanaLink
    })
    alerts.push({ level: 'WARNING', metric: 'Memory', value: metrics.memory })
  }
  
  // 5xx Error Rate 체크
  if (metrics.errorRate > THRESHOLDS.ERROR_RATE_CRITICAL) {
    await sendSlackAlert('CRITICAL', {
      metric: '5xx 에러율',
      currentValue: `${metrics.errorRate}%`,
      threshold: `${THRESHOLDS.ERROR_RATE_CRITICAL}%`,
      grafanaLink: metrics.grafanaLink
    })
    alerts.push({ level: 'CRITICAL', metric: 'ErrorRate', value: metrics.errorRate })
  } else if (metrics.errorRate > THRESHOLDS.ERROR_RATE_WARNING) {
    await sendSlackAlert('WARNING', {
      metric: '5xx 에러율',
      currentValue: `${metrics.errorRate}%`,
      threshold: `${THRESHOLDS.ERROR_RATE_WARNING}%`,
      grafanaLink: metrics.grafanaLink
    })
    alerts.push({ level: 'WARNING', metric: 'ErrorRate', value: metrics.errorRate })
  }
  
  return alerts
}

export default {
  sendSlackAlert,
  checkMetrics,
  THRESHOLDS
}



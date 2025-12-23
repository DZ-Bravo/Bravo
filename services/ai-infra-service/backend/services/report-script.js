// 보고서 생성 스크립트 (CronJob에서 실행)
// 사용법: node /app/services/report-script.js daily|weekly|monthly

import reportService from './report.js'

const reportType = process.argv[2]

if (!['daily', 'weekly', 'monthly'].includes(reportType)) {
  console.error('Usage: node services/report-script.js [daily|weekly|monthly]')
  process.exit(1)
}

reportService.generateReport(reportType)
  .then(() => {
    console.log(`${reportType} report generated successfully`)
    process.exit(0)
  })
  .catch(error => {
    console.error('Error generating report:', error)
    process.exit(1)
  })


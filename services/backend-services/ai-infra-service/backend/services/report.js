import puppeteer from 'puppeteer'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'
import bedrockReportService from './bedrock-report.js'
import prometheusService from './prometheus.js'
import kubernetesService from './kubernetes.js'
import lokiService from './loki.js'
import { WebClient } from '@slack/web-api'
import AWS from 'aws-sdk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const slack = new WebClient(process.env.SLACK_BOT_TOKEN)
const SLACK_CHANNEL = process.env.SLACK_CHANNEL

// AWS SES 설정
const ses = new AWS.SES({ 
  region: process.env.AWS_SES_REGION || 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

// 보고서 데이터 수집
async function collectReportData(reportType) {
  const now = new Date()
  let startTime, endTime
  
  if (reportType === 'daily') {
    startTime = new Date(now)
    startTime.setHours(0, 0, 0, 0)
    endTime = new Date(now)
    endTime.setHours(23, 59, 59, 999)
  } else if (reportType === 'weekly') {
    // 지난 주 일요일 ~ 토요일
    startTime = getLastSunday()
    endTime = new Date(startTime)
    endTime.setDate(endTime.getDate() + 6)
    endTime.setHours(23, 59, 59, 999)
  } else if (reportType === 'monthly') {
    // 지난 달 1일 ~ 마지막 날
    startTime = getLastMonthStart()
    endTime = getLastMonthEnd()
  }
  
  // 데이터 수집
  const nodes = await kubernetesService.getNodes()
  const errors = await prometheusService.get5xxErrorBreakdown(
    startTime.toISOString(),
    endTime.toISOString()
  )
  
  return {
    reportType,
    periodStart: startTime,
    periodEnd: endTime,
    generatedAt: new Date(),
    nodes,
    errors
  }
}

// 지난 주 일요일
function getLastSunday() {
  const date = new Date()
  const day = date.getDay()
  const diff = date.getDate() - day - 7
  const lastSunday = new Date(date.setDate(diff))
  lastSunday.setHours(0, 0, 0, 0)
  return lastSunday
}

// 지난 달 시작
function getLastMonthStart() {
  const date = new Date()
  date.setMonth(date.getMonth() - 1)
  date.setDate(1)
  date.setHours(0, 0, 0, 0)
  return date
}

// 지난 달 끝
function getLastMonthEnd() {
  const date = new Date()
  date.setDate(0) // 현재 달의 0일 = 지난 달의 마지막 날
  date.setHours(23, 59, 59, 999)
  return date
}

// HTML 템플릿 생성
function generateHTMLTemplate(reportData, reportType) {
  // TODO: 실제 HTML 템플릿 생성 (Chart.js 포함)
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>HIKER 인프라 모니터링 보고서 - ${reportType}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>
  <h1>HIKER 인프라 모니터링 ${reportType} 보고서</h1>
  <p>보고 기간: ${reportData.periodStart.toISOString()} ~ ${reportData.periodEnd.toISOString()}</p>
  <p>생성 일시: ${reportData.generatedAt.toISOString()}</p>
</body>
</html>
  `
}

// PDF 생성
async function generatePDF(htmlContent) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
  
  const page = await browser.newPage()
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' })
  
  // Chart.js 렌더링 대기
  await page.waitForTimeout(2000)
  
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' }
  })
  
  await browser.close()
  
  return pdfBuffer
}

// Slack으로 보고서 전송
async function sendReportToSlack(pdfBuffer, reportType, periodStart, periodEnd, summary) {
  const fileName = `hiker-infra-report-${reportType}-${new Date().toISOString().split('T')[0]}.pdf`
  const tempPath = `/tmp/${fileName}`
  
  await fs.writeFile(tempPath, pdfBuffer)
  
  try {
    const result = await slack.files.upload({
      channels: SLACK_CHANNEL,
      file: await fs.readFile(tempPath),
      filename: fileName,
      title: `HIKER 인프라 모니터링 ${reportType} 보고서`,
      initial_comment: `
HIKER 인프라 모니터링 ${reportType} 보고서가 생성되었습니다.

보고 기간: ${periodStart.toISOString()} ~ ${periodEnd.toISOString()}

주요 내용:
- 총 5XX 에러: ${summary.totalErrors || 0}건
- 임계치 초과 알람: ${summary.alerts || 0}건

PDF 파일을 확인하세요.
      `
    })
    
    console.log(`Slack에 보고서 전송 완료: ${result.file?.id}`)
  } finally {
    await fs.unlink(tempPath)
  }
}

// Raw Email 메시지 생성 (PDF 첨부용)
async function createRawEmailMessage(from, to, subject, pdfBuffer, fileName) {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  const message = [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    `<h2>HIKER 인프라 모니터링 보고서</h2>`,
    `<p>보고서 PDF 파일이 첨부되어 있습니다.</p>`,
    ``,
    `--${boundary}`,
    `Content-Type: application/pdf`,
    `Content-Transfer-Encoding: base64`,
    `Content-Disposition: attachment; filename="${fileName}"`,
    ``,
    pdfBuffer.toString('base64'),
    ``,
    `--${boundary}--`
  ].join('\r\n')
  
  return Buffer.from(message)
}

// SES로 보고서 이메일 전송
async function sendReportToSES(pdfBuffer, reportType, periodStart, periodEnd, summary, recipientEmails) {
  const fileName = `hiker-infra-report-${reportType}-${new Date().toISOString().split('T')[0]}.pdf`
  
  // SES 직접 사용 (nodemailer 대신)
  const rawMessage = await createRawEmailMessage(
    process.env.AWS_SES_FROM_EMAIL || 'monitoring@hiker-cloud.site',
    recipientEmails,
    `HIKER 인프라 모니터링 ${reportType} 보고서 - ${new Date().toISOString().split('T')[0]}`,
    pdfBuffer,
    fileName
  )
  
  const params = {
    Source: process.env.AWS_SES_FROM_EMAIL || 'monitoring@hiker-cloud.site',
    Destinations: recipientEmails,
    RawMessage: {
      Data: rawMessage
    }
  }
  
  await ses.sendRawEmail(params).promise()
  console.log(`SES를 통해 보고서 이메일 전송 완료: ${recipientEmails.join(', ')}`)
}

// 보고서 생성 및 전송
async function generateReport(reportType) {
  console.log(`Generating ${reportType} report...`)
  
  // 1. 데이터 수집
  const reportData = await collectReportData(reportType)
  
  // 2. 요약 정보 생성
  const summary = {
    totalErrors: reportData.errors?.total || 0,
    alerts: 0 // TODO: 알람 통계 추가
  }
  
  // 3. HTML 템플릿 생성
  const htmlContent = generateHTMLTemplate(reportData, reportType)
  
  // 4. PDF 생성
  const pdfBuffer = await generatePDF(htmlContent)
  
  // 5. 전송
  const teamEmails = process.env.TEAM_EMAILS ? 
    process.env.TEAM_EMAILS.split(',').map(e => e.trim()) : 
    []
  
  // Slack 전송
  await sendReportToSlack(
    pdfBuffer,
    reportType,
    reportData.periodStart,
    reportData.periodEnd,
    summary
  )
  
  // SES 이메일 전송
  if (teamEmails.length > 0) {
    await sendReportToSES(
      pdfBuffer,
      reportType,
      reportData.periodStart,
      reportData.periodEnd,
      summary,
      teamEmails
    )
  }
  
  console.log(`${reportType} report generated and sent successfully`)
}

export default {
  generateReport
}

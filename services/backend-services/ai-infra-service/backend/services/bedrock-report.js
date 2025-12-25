// AWS SDK v3 Bedrock Agent Runtime 사용
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// Bedrock Agent Runtime은 별도 패키지에서 제공
const bedrockAgentRuntime = require('@aws-sdk/client-bedrock-agent-runtime')
const BedrockAgentRuntimeClient = bedrockAgentRuntime.BedrockAgentRuntimeClient
const InvokeAgentCommand = bedrockAgentRuntime.InvokeAgentCommand

if (!BedrockAgentRuntimeClient || !InvokeAgentCommand) {
  throw new Error('Failed to import BedrockAgentRuntimeClient or InvokeAgentCommand from @aws-sdk/client-bedrock-agent-runtime')
}

const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2'
const BEDROCK_REPORT_AGENT_ID = process.env.BEDROCK_REPORT_AGENT_ID
const BEDROCK_REPORT_AGENT_ALIAS_ID = process.env.BEDROCK_REPORT_AGENT_ALIAS_ID

const bedrockClient = new BedrockAgentRuntimeClient({ 
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

// 보고서 생성용 AI 요청
async function generateReportContent({ reportType, reportData }) {
  if (!BEDROCK_REPORT_AGENT_ID || !BEDROCK_REPORT_AGENT_ALIAS_ID) {
    throw new Error('Bedrock Report Agent ID not configured')
  }
  
  try {
    console.log('Preparing data for Bedrock Agent...')
    
    // 보고서 데이터를 JSON 형식으로 준비
    // Bedrock Agent의 프롬프트가 이 데이터를 받아서 보고서를 생성함
    const inputData = {
      reportType: reportType, // "daily", "weekly", "monthly"
      data: {
        clusterOverview: reportData.clusterOverview || {},
        nodes: reportData.nodes || [],
        resourceUsage: reportData.resourceUsage || { cpu: {}, memory: {} },
        containerCPU: (reportData.containerCPU || []).slice(0, 10).map(c => ({
          namespace: c.namespace,
          pod: c.pod,
          name: c.name,
          current: c.current || (c.data && c.data.length > 0 ? parseFloat(c.data[c.data.length - 1][1]) : 0),
          peak: c.peak || (c.data ? Math.max(...c.data.map(d => parseFloat(d[1]))) : 0)
        })),
        containerMemory: (reportData.containerMemory || []).slice(0, 10).map(c => {
          const currentBytes = c.usageBytesData && c.usageBytesData.length > 0 
            ? parseFloat(c.usageBytesData[c.usageBytesData.length - 1][1]) 
            : 0
          const peakBytes = c.usageBytesData 
            ? Math.max(...c.usageBytesData.map(d => parseFloat(d[1]))) 
            : 0
          return {
            namespace: c.namespace,
            pod: c.pod,
            name: c.name,
            current: (currentBytes / 1024 / 1024).toFixed(2), // MB
            peak: (peakBytes / 1024 / 1024).toFixed(2) // MB
          }
        }),
        podCPU: (reportData.podCPU || []).slice(0, 10).map(p => ({
          namespace: p.namespace,
          name: p.name,
          current: p.current || (p.data && p.data.length > 0 ? parseFloat(p.data[p.data.length - 1][1]) : 0),
          peak: p.peak || (p.data ? Math.max(...p.data.map(d => parseFloat(d[1]))) : 0)
        })),
        podMemory: (reportData.podMemory || []).slice(0, 10).map(p => {
          const currentBytes = p.usageBytesData && p.usageBytesData.length > 0 
            ? parseFloat(p.usageBytesData[p.usageBytesData.length - 1][1]) 
            : 0
          const peakBytes = p.usageBytesData 
            ? Math.max(...p.usageBytesData.map(d => parseFloat(d[1]))) 
            : 0
          return {
            namespace: p.namespace,
            name: p.name,
            current: (currentBytes / 1024 / 1024).toFixed(2), // MB
            peak: (peakBytes / 1024 / 1024).toFixed(2) // MB
          }
        }),
        errors: reportData.errors || {
          haproxy: { count: 0, percentage: '0' },
          gateway: { count: 0, percentage: '0' },
          application: { count: 0, percentage: '0' },
          downstream: { count: 0, percentage: '0' },
          total: 0
        },
        topErrors: (reportData.topErrors || []).slice(0, 10),
        healthcheck: reportData.healthcheck || { hasErrors: false, errors: [], checkedPods: 0 },
        periodStart: reportData.periodStart ? reportData.periodStart.toISOString() : new Date().toISOString(),
        periodEnd: reportData.periodEnd ? reportData.periodEnd.toISOString() : new Date().toISOString(),
        generatedAt: reportData.generatedAt ? reportData.generatedAt.toISOString() : new Date().toISOString()
      }
    }
    
    console.log(`Sending data to Bedrock Agent (${BEDROCK_REPORT_AGENT_ID})...`)
    console.log(`Report type: ${reportType}, Data keys: ${Object.keys(inputData.data).join(', ')}`)
    
    // JSON 문자열로 변환하여 Bedrock Agent에 전달
    const input = JSON.stringify(inputData, null, 2)
    console.log(`Input data size: ${input.length} bytes`)
    
    const command = new InvokeAgentCommand({
      agentId: BEDROCK_REPORT_AGENT_ID,
      agentAliasId: BEDROCK_REPORT_AGENT_ALIAS_ID,
      sessionId: generateSessionId(),
      inputText: input
    })
    
    console.log('Invoking Bedrock Agent...')
    const response = await bedrockClient.send(command)
    console.log('Bedrock Agent response received, processing stream...')
    
    // 스트리밍 응답 처리
    let result = ''
    let chunkCount = 0
    for await (const chunk of response.completion) {
      if (chunk.chunk?.bytes) {
        const text = new TextDecoder().decode(chunk.chunk.bytes)
        result += text
        chunkCount++
      }
    }
    
    console.log(`Bedrock Agent response completed. Received ${chunkCount} chunks, total length: ${result.length} bytes`)
    
    if (!result || result.trim().length === 0) {
      throw new Error('Bedrock Agent returned empty response')
    }
    
    return result
  } catch (error) {
    console.error('Bedrock Report Agent error:', error)
    throw error
  }
}

// 세션 ID 생성
function generateSessionId() {
  return `report-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export default {
  generateReportContent
}


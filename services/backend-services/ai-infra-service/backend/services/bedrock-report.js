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
    // 보고서 데이터 준비 (프롬프트는 Agent에서 관리)
    const inputData = {
      reportType,
      data: reportData
    }
    
    const input = JSON.stringify(inputData)
    
    const command = new InvokeAgentCommand({
      agentId: BEDROCK_REPORT_AGENT_ID,
      agentAliasId: BEDROCK_REPORT_AGENT_ALIAS_ID,
      sessionId: generateSessionId(),
      inputText: input
    })
    
    const response = await bedrockClient.send(command)
    
    // 스트리밍 응답 처리
    let result = ''
    for await (const chunk of response.completion) {
      if (chunk.chunk?.bytes) {
        const text = new TextDecoder().decode(chunk.chunk.bytes)
        result += text
      }
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


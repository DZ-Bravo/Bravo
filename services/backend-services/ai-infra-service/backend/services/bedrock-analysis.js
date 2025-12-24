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
const BEDROCK_ANALYSIS_AGENT_ID = process.env.BEDROCK_ANALYSIS_AGENT_ID
const BEDROCK_ANALYSIS_AGENT_ALIAS_ID = process.env.BEDROCK_ANALYSIS_AGENT_ALIAS_ID

const bedrockClient = new BedrockAgentRuntimeClient({ 
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

// AI 분석 요청
async function requestAnalysis(analysisData) {
  if (!BEDROCK_ANALYSIS_AGENT_ID || !BEDROCK_ANALYSIS_AGENT_ALIAS_ID) {
    throw new Error('Bedrock Agent ID not configured')
  }
  
  try {
    // 입력 데이터를 JSON 문자열로 변환 (프롬프트는 Agent에서 관리)
    const input = JSON.stringify(analysisData, null, 2)
    
    const command = new InvokeAgentCommand({
      agentId: BEDROCK_ANALYSIS_AGENT_ID,
      agentAliasId: BEDROCK_ANALYSIS_AGENT_ALIAS_ID,
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
    
    return {
      analysis: result,
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    console.error('Bedrock Agent error:', error)
    throw error
  }
}

// 세션 ID 생성
function generateSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export default {
  requestAnalysis
}


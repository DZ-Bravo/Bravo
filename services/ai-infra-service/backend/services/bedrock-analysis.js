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
  },
  requestHandler: {
    requestTimeout: 300000 // 5분 타임아웃
  }
})

// AI 분석 요청
async function requestAnalysis(analysisData) {
  if (!BEDROCK_ANALYSIS_AGENT_ID || !BEDROCK_ANALYSIS_AGENT_ALIAS_ID) {
    throw new Error('Bedrock Agent ID not configured')
  }
  
  try {
    // 입력 데이터 구조 검증
    const dataKeys = Object.keys(analysisData)
    console.log('Bedrock Agent input data keys:', dataKeys)
    console.log('Logs data:', {
      recent: analysisData.logs?.recent?.length || 0,
      stats: analysisData.logs?.stats,
      topMessages: analysisData.logs?.topMessages?.length || 0
    })
    console.log('Traces data:', {
      slow: analysisData.traces?.slow?.length || 0,
      errors: analysisData.traces?.errors?.length || 0,
      stats: analysisData.traces?.stats
    })
    
    // 입력 데이터를 JSON 문자열로 변환 (프롬프트는 Agent에서 관리)
    const input = JSON.stringify(analysisData, null, 2)
    console.log('Bedrock Agent input size:', input.length, 'characters')
    
    const command = new InvokeAgentCommand({
      agentId: BEDROCK_ANALYSIS_AGENT_ID,
      agentAliasId: BEDROCK_ANALYSIS_AGENT_ALIAS_ID,
      sessionId: generateSessionId(),
      inputText: input
    })
    
    console.log('Sending request to Bedrock Agent...')
    const bedrockRequestStart = Date.now()
    
    let response
    try {
      response = await bedrockClient.send(command)
      console.log('Bedrock Agent response received, starting stream processing...')
    } catch (sendError) {
      const sendTime = Date.now() - bedrockRequestStart
      console.error(`Bedrock Agent send error after ${sendTime}ms:`, {
        message: sendError.message,
        name: sendError.name,
        code: sendError.code,
        $metadata: sendError.$metadata
      })
      throw sendError
    }
    
    // 스트리밍 응답 처리 (타임아웃 포함)
    let result = ''
    let chunkCount = 0
    const streamTimeout = 240000 // 4분 (전체 타임아웃보다 짧게)
    const streamStartTime = Date.now()
    let lastChunkTime = Date.now()
    const chunkTimeout = 60000 // 청크 간 최대 대기 시간 60초
    
    try {
      console.log('Starting to read stream...')
      
      for await (const chunk of response.completion) {
        const now = Date.now()
        chunkCount++
        lastChunkTime = now
        
        // 청크 간 타임아웃 체크
        if (now - streamStartTime > streamTimeout) {
          console.error(`Stream timeout after ${now - streamStartTime}ms, chunks received: ${chunkCount}`)
          throw new Error(`Bedrock Agent stream timeout after ${streamTimeout}ms`)
        }
        
        if (chunk.chunk?.bytes) {
          const text = new TextDecoder().decode(chunk.chunk.bytes)
          result += text
          console.log(`Chunk ${chunkCount}: ${text.length} bytes, total: ${result.length} chars`)
        } else {
          console.log(`Chunk ${chunkCount}: no bytes, chunk type:`, Object.keys(chunk))
        }
        
        // 주기적으로 진행 상황 로그
        if (chunkCount % 5 === 0) {
          console.log(`Stream progress: ${chunkCount} chunks, ${result.length} chars, ${now - streamStartTime}ms elapsed`)
        }
      }
      
      const totalTime = Date.now() - bedrockRequestStart
      console.log(`✅ Bedrock Agent stream completed: ${chunkCount} chunks, ${result.length} chars, ${totalTime}ms total`)
      
      if (!result || result.length === 0) {
        console.warn('⚠️ Bedrock Agent returned empty result!')
      }
      
      return {
        analysis: result,
        timestamp: new Date().toISOString()
      }
    } catch (streamError) {
      const totalTime = Date.now() - bedrockRequestStart
      const timeSinceLastChunk = Date.now() - lastChunkTime
      console.error(`❌ Bedrock Agent stream error after ${totalTime}ms (${timeSinceLastChunk}ms since last chunk):`, {
        message: streamError.message,
        name: streamError.name,
        code: streamError.code,
        stack: streamError.stack?.substring(0, 500)
      })
      throw streamError
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


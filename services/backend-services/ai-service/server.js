import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import connectDB from './shared/config/database.js'
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3009

// 미들웨어
app.use(cors())
app.use(express.json())

// DB 연결3
connectDB()

// AWS Bedrock Agent Runtime 클라이언트
const bedrockClient = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION || 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

const AGENT_ID = process.env.BEDROCK_AGENT_ID
const AGENT_ALIAS_ID = process.env.BEDROCK_AGENT_ALIAS_ID

// AI 등산코스 추천
app.post('/api/ai/recommend-course', async (req, res) => {
  try {
    const { userPreferences, location, difficulty } = req.body
    
    if (!AGENT_ID || !AGENT_ALIAS_ID) {
      return res.status(500).json({ error: 'AI 서비스가 설정되지 않았습니다.' })
    }
    
    const prompt = `등산 코스를 추천해주세요. 
위치: ${location || '전국'}
난이도: ${difficulty || '중급'}
선호사항: ${userPreferences || '없음'}`

    const command = new InvokeAgentCommand({
      agentId: AGENT_ID,
      agentAliasId: AGENT_ALIAS_ID,
      sessionId: `ai-recommend-${Date.now()}`,
      inputText: prompt,
      enableTrace: false
    })
    
    const response = await bedrockClient.send(command)
    
    let assistantResponse = ''
    if (response.completion) {
      for await (const chunk of response.completion) {
        if (chunk.chunk?.bytes) {
          const chunkText = new TextDecoder().decode(chunk.chunk.bytes)
          assistantResponse += chunkText
        }
      }
    }
    
    res.json({
      recommendation: assistantResponse || '추천을 생성할 수 없습니다.'
    })
  } catch (error) {
    console.error('AI 코스 추천 오류:', error)
    res.status(500).json({ error: error.message })
  }
})

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ai-service' })
})

// 서버 시작
app.listen(PORT, () => {
  console.log(`AI Service running on port ${PORT}`)
})


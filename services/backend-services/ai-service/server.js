// CI/CD 테스트용 주석 - 재추가 2
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import connectDB from './shared/config/database.js'
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime'
import fs from 'fs'
import path from 'path'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3009

// 미들웨어
app.use(cors())
app.use(express.json())

// DB 연결5
connectDB()

// AWS Bedrock Agent Runtime 클라이언트
const bedrockClient = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION || 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

const AGENT_ID = process.env.BEDROCK_COURSE_AGENT_ID
const AGENT_ALIAS_ID = process.env.BEDROCK_COURSE_AGENT_ALIAS_ID

// AI 등산코스 추천
app.post('/api/ai/recommend-course', async (req, res) => {
  try {
    const { userInput } = req.body
    
    if (!userInput) {
      return res.status(400).json({ error: '사용자 입력이 필요합니다.' })
    }
    
    if (!AGENT_ID || !AGENT_ALIAS_ID) {
      return res.status(500).json({ error: 'AI 서비스가 설정되지 않았습니다.' })
    }

    const command = new InvokeAgentCommand({
      agentId: AGENT_ID,
      agentAliasId: AGENT_ALIAS_ID,
      sessionId: `ai-recommend-${Date.now()}`,
      inputText: userInput,
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

// ---- Mountain code lookup using KB jsonl (tmp_kb_courses_by_course.jsonl) ----
let kbCourseMap = null

function loadKbCourseMap() {
  if (kbCourseMap) return kbCourseMap
  const map = new Map()
  try {
    const kbPath = path.join(process.cwd(), '..', 'tmp_kb_courses_by_course.jsonl')
    if (fs.existsSync(kbPath)) {
      const content = fs.readFileSync(kbPath, 'utf-8')
      const lines = content.split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const obj = JSON.parse(line)
          const name = obj.mountain_name
          const code = obj.mountain_code
          if (name && code) {
            map.set(name.trim(), String(code))
            // 괄호 제거 이름도 보조 키로 저장
            const nameWithoutParen = name.split('(')[0].trim()
            if (nameWithoutParen) {
              map.set(nameWithoutParen, String(code))
            }
          }
        } catch (_) {
          // ignore malformed line
        }
      }
      kbCourseMap = map
      console.log(`[ai-service] KB course map loaded: ${map.size} entries`)
    } else {
      console.warn('[ai-service] KB course file not found:', kbPath)
      kbCourseMap = new Map()
    }
  } catch (e) {
    console.error('[ai-service] Failed to load KB course map:', e.message)
    kbCourseMap = new Map()
  }
  return kbCourseMap
}

// 산 코드 조회 API (KB 파일 기반)
app.get('/api/ai/mountain-code', (req, res) => {
  try {
    const { name } = req.query
    if (!name) {
      return res.status(400).json({ error: 'name is required' })
    }
    const map = loadKbCourseMap()
    const target = name.trim()
    const targetWithoutParen = target.split('(')[0].trim()

    const code =
      map.get(target) ||
      map.get(targetWithoutParen) ||
      null

    if (!code) {
      return res.status(404).json({ error: 'not found' })
    }

    return res.json({ code })
  } catch (e) {
    console.error('mountain-code lookup error:', e)
    return res.status(500).json({ error: 'internal error' })
  }
})


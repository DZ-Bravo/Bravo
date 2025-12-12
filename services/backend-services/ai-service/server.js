// CI/CD 테스트용 주석 - 재추가 3
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import connectDB from './shared/config/database.js'
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime'
import fs from 'fs'
import path from 'path'

// docker-compose에서 env_file로 환경변수 주입되므로 dotenv.config()는 선택적
// 로컬 개발 시를 위해 .env 파일도 읽도록 설정
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3009

// 미들웨어
app.use(cors())
app.use(express.json())

// DB 연결6
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

const EQUIPMENT_AGENT_ID = process.env.VITE_EQUIPMENT_AGENT_ID || process.env.BEDROCK_EQUIPMENT_AGENT_ID
const EQUIPMENT_AGENT_ALIAS_ID = process.env.VITE_EQUIPMENT_ALIAS_ID || process.env.BEDROCK_EQUIPMENT_ALIAS_ID
console.log('[DEBUG] EQUIPMENT_AGENT_ID', EQUIPMENT_AGENT_ID)
console.log('[DEBUG] EQUIPMENT_AGENT_ALIAS_ID', EQUIPMENT_AGENT_ALIAS_ID)

// tmp_products.jsonl 로드 및 캐시
let productsMap = null

function loadProductsMap() {
  if (productsMap) return productsMap
  productsMap = new Map()
  try {
    // 컨테이너 내부 경로 (볼륨 마운트된 파일)
    const productsPath = path.join(process.cwd(), 'tmp_products.jsonl')
    // 호스트 경로 (로컬 개발 시)
    const productsPathAlt = path.join(process.cwd(), '..', 'tmp_products.jsonl')
    const finalPath = fs.existsSync(productsPath) ? productsPath : (fs.existsSync(productsPathAlt) ? productsPathAlt : null)
    if (finalPath) {
      const content = fs.readFileSync(finalPath, 'utf-8')
      const lines = content.split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const product = JSON.parse(line)
          const title = product.title?.trim()
          if (title && product.url) {
            // 정확한 title로 매핑
            productsMap.set(title, product.url)
          }
        } catch (_) {
          // ignore malformed line
        }
      }
      console.log(`[ai-service] Products map loaded: ${productsMap.size} entries`)
    } else {
      console.warn('[ai-service] Products file not found at:', productsPath, 'or', productsPathAlt)
      productsMap = new Map()
    }
  } catch (e) {
    console.error('[ai-service] Failed to load products map:', e.message)
    productsMap = new Map()
  }
  return productsMap
}

// title로 제품 URL 찾기 (부분 매칭 포함)
function findProductUrl(title, brand) {
  if (!title) {
    console.log('[findProductUrl] title이 없음')
    return null
  }
  const map = loadProductsMap()
  const searchTitle = title.trim()
  
  console.log(`[findProductUrl] 검색 시작 - title: "${searchTitle}", brand: "${brand || ''}"`)
  console.log(`[findProductUrl] Products map 크기: ${map.size}`)
  
  // 1. 정확한 매칭
  if (map.has(searchTitle)) {
    const url = map.get(searchTitle)
    console.log(`[findProductUrl] 정확한 매칭 성공: "${searchTitle}" -> ${url}`)
    return url
  }
  
  // 2. 부분 매칭 (title이 mapTitle에 포함되어 있는지 확인)
  // AI 응답의 title이 더 짧을 수 있으므로, mapTitle이 searchTitle을 포함하는지 확인
  for (const [mapTitle, url] of map.entries()) {
    if (mapTitle.includes(searchTitle)) {
      console.log(`[findProductUrl] 부분 매칭 성공: "${searchTitle}" -> "${mapTitle}" -> ${url}`)
      return url
    }
  }
  
  // 3. 반대 방향 매칭 (searchTitle이 mapTitle을 포함하는 경우)
  for (const [mapTitle, url] of map.entries()) {
    if (searchTitle.includes(mapTitle)) {
      console.log(`[findProductUrl] 역방향 매칭 성공: "${searchTitle}" -> "${mapTitle}" -> ${url}`)
      return url
    }
  }
  
  // 4. brand + title 조합으로 찾기
  if (brand) {
    const brandTitle = `${brand} ${searchTitle}`
    if (map.has(brandTitle)) {
      const url = map.get(brandTitle)
      console.log(`[findProductUrl] 브랜드+제목 정확 매칭 성공: "${brandTitle}" -> ${url}`)
      return url
    }
    for (const [mapTitle, url] of map.entries()) {
      if (mapTitle.includes(brandTitle) || mapTitle.includes(searchTitle)) {
        console.log(`[findProductUrl] 브랜드+제목 부분 매칭 성공: "${brandTitle}" -> "${mapTitle}" -> ${url}`)
        return url
      }
    }
  }
  
  console.log(`[findProductUrl] 매칭 실패: "${searchTitle}"`)
  return null
}

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

// AI 등산장비 추천
app.post('/api/ai/recommend-equipment', async (req, res) => {
  try {
    const { userInput } = req.body
    
    if (!userInput) {
      return res.status(400).json({ error: '사용자 입력이 필요합니다.' })
    }
    
    if (!EQUIPMENT_AGENT_ID || !EQUIPMENT_AGENT_ALIAS_ID) {
      return res.status(500).json({ error: '장비 추천 Agent ID 또는 Alias ID 환경변수가 설정되지 않았습니다.' })
    }

    const command = new InvokeAgentCommand({
      agentId: EQUIPMENT_AGENT_ID,
      agentAliasId: EQUIPMENT_AGENT_ALIAS_ID,
      sessionId: `ai-equipment-${Date.now()}`,
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
    
    // 응답에서 JSON 추출 시도
    let recommendations = []
    let recommendationText = assistantResponse
    
    // 텍스트 내에 JSON 블록이 있는지 확인 (예: {..."products":[...]...})
    const jsonMatch = assistantResponse.match(/\{[\s\S]*"products"[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.products && Array.isArray(parsed.products)) {
          recommendations = parsed.products.map((product, idx) => {
            const aiTitle = product.title || ''
            const aiBrand = product.brand || ''
            // tmp_products.jsonl에서 완전한 URL 찾기
            const fullUrl = findProductUrl(aiTitle, aiBrand) || product.url || ''
            console.log(`[장비 추천] 제품 ${idx + 1}: title="${aiTitle}", brand="${aiBrand}", URL="${fullUrl}"`)
            return {
              id: idx + 1,
              title: aiTitle,
              brand: aiBrand,
              category: product.category || '',
              price: product.price || '',
              url: fullUrl,
              reason: product.reason || product.description || ''
            }
          })
          // JSON 부분 제거하여 순수 텍스트만 남김
          recommendationText = assistantResponse.replace(jsonMatch[0], '').trim()
        }
      } catch (parseError) {
        console.log('JSON 파싱 실패:', parseError.message)
      }
    }
    
    // 직접 JSON인 경우 (위에서 찾지 못했을 때만)
    if (recommendations.length === 0) {
      try {
        const parsed = JSON.parse(assistantResponse)
        if (Array.isArray(parsed)) {
          recommendations = parsed
        } else if (parsed.recommendations && Array.isArray(parsed.recommendations)) {
          recommendations = parsed.recommendations
        } else if (parsed.products && Array.isArray(parsed.products)) {
          recommendations = parsed.products.map((product, idx) => {
            const aiTitle = product.title || ''
            const aiBrand = product.brand || ''
            // tmp_products.jsonl에서 완전한 URL 찾기
            const fullUrl = findProductUrl(aiTitle, aiBrand) || product.url || ''
            console.log(`[장비 추천] 제품 ${idx + 1}: title="${aiTitle}", brand="${aiBrand}", URL="${fullUrl}"`)
            return {
              id: idx + 1,
              title: aiTitle,
              brand: aiBrand,
              category: product.category || '',
              price: product.price || '',
              url: fullUrl,
              reason: product.reason || product.description || ''
            }
          })
        }
      } catch (parseError) {
        // JSON이 아닌 경우 그대로 처리
      }
    }
    
    res.json({
      recommendation: recommendationText || '추천을 생성할 수 없습니다.',
      recommendations: recommendations
    })
  } catch (error) {
    console.error('AI 장비 추천 오류:', error)
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


// CI/CD 테스트용 주석 - 재추가 2
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import connectDB from './shared/config/database.js'
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime'
import mongoose from 'mongoose'
import { authenticateCognitoToken } from './shared/utils/cognito-auth.js'
import { prometheusMiddleware, metricsHandler } from './shared/utils/prometheus-metrics.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3009
const SERVICE_NAME = 'ai-service'

// Prometheus 메트릭 미들웨어 (모든 라우트 앞에)
app.use(prometheusMiddleware(SERVICE_NAME))

// 미들웨어
app.use(cors())
app.use(express.json())

// Prometheus 메트릭 엔드포인트
app.get('/metrics', metricsHandler)

// DB 연결4
connectDB()

// AWS Bedrock Agent Runtime 클라이언트
const bedrockClient = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION || 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

const COURSE_AGENT_ID = process.env.BEDROCK_COURSE_AGENT_ID
const COURSE_AGENT_ALIAS_ID = process.env.BEDROCK_COURSE_AGENT_ALIAS_ID
const EQUIPMENT_AGENT_ID = process.env.VITE_EQUIPMENT_AGENT_ID
const EQUIPMENT_AGENT_ALIAS_ID = process.env.VITE_EQUIPMENT_ALIAS_ID

// 디버깅: 환경 변수 확인
console.log('=== 환경 변수 확인 ===')
console.log('COURSE_AGENT_ID:', COURSE_AGENT_ID ? '설정됨' : '없음')
console.log('COURSE_AGENT_ALIAS_ID:', COURSE_AGENT_ALIAS_ID ? '설정됨' : '없음')
console.log('EQUIPMENT_AGENT_ID:', EQUIPMENT_AGENT_ID ? '설정됨' : '없음')
console.log('EQUIPMENT_AGENT_ALIAS_ID:', EQUIPMENT_AGENT_ALIAS_ID ? '설정됨' : '없음')
console.log('===================')

// AI 등산코스 추천
app.post('/api/ai/recommend-course', authenticateCognitoToken, async (req, res) => {
  try {
    const { userInput, userPreferences, location, difficulty } = req.body
    
    if (!COURSE_AGENT_ID || !COURSE_AGENT_ALIAS_ID) {
      return res.status(500).json({ error: 'AI 서비스가 설정되지 않았습니다.' })
    }
    
    // userInput이 있으면 우선 사용, 없으면 기존 방식 사용
    const prompt = userInput || `등산 코스를 추천해주세요. 
위치: ${location || '전국'}
난이도: ${difficulty || '중급'}
선호사항: ${userPreferences || '없음'}`

    const command = new InvokeAgentCommand({
      agentId: COURSE_AGENT_ID,
      agentAliasId: COURSE_AGENT_ALIAS_ID,
      sessionId: `ai-recommend-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      inputText: prompt,
      enableTrace: false
    })
    
    console.log('[AI 코스 추천] Bedrock Agent 호출 시작:', { agentId: COURSE_AGENT_ID, prompt: prompt.substring(0, 100) })
    
    let response
    try {
      response = await bedrockClient.send(command)
      console.log('[AI 코스 추천] Bedrock Agent 응답 받음:', { hasCompletion: !!response.completion })
    } catch (bedrockError) {
      console.error('[AI 코스 추천] Bedrock Agent 호출 오류:', bedrockError)
      // 에러 객체에서 원본 응답 확인
      if (bedrockError.$response) {
        console.error('[AI 코스 추천] Bedrock 원본 응답:', JSON.stringify(bedrockError.$response, null, 2))
      }
      throw bedrockError
    }
    
    let assistantResponse = ''
    try {
      if (response.completion) {
        for await (const chunk of response.completion) {
          if (chunk.chunk?.bytes) {
            const chunkText = new TextDecoder().decode(chunk.chunk.bytes)
            assistantResponse += chunkText
          } else if (chunk.chunk?.text) {
            // text 형식도 지원
            assistantResponse += chunk.chunk.text
          }
        }
      } else {
        console.warn('[AI 코스 추천] response.completion이 없습니다. response:', JSON.stringify(response, null, 2))
      }
    } catch (streamError) {
      console.error('[AI 코스 추천] 스트림 처리 오류:', streamError)
      // 스트림 오류가 발생해도 지금까지 받은 응답이 있으면 사용
      if (assistantResponse.trim()) {
        console.log('[AI 코스 추천] 부분 응답 사용:', assistantResponse.substring(0, 100))
      } else {
        throw streamError
      }
    }
    
    if (!assistantResponse || !assistantResponse.trim()) {
      console.error('[AI 코스 추천] 빈 응답 받음')
      return res.status(500).json({ error: 'AI가 응답을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.' })
    }
    
    console.log('[AI 코스 추천] 응답 생성 완료, 길이:', assistantResponse.length)
    res.json({
      recommendation: assistantResponse
    })
  } catch (error) {
    console.error('[AI 코스 추천] 전체 오류:', error)
    console.error('[AI 코스 추천] 오류 스택:', error.stack)
    
    // 사용자 친화적인 에러 메시지
    let errorMessage = 'AI 코스 추천 중 오류가 발생했습니다.'
    if (error.message && error.message.includes('parse')) {
      errorMessage = 'AI 응답 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
    } else if (error.message) {
      errorMessage = error.message
    }
    
    res.status(500).json({ error: errorMessage })
  }
})

// AI 등산장비 추천
app.post('/api/ai/recommend-equipment', authenticateCognitoToken, async (req, res) => {
  try {
    const { userInput } = req.body
    
    if (!EQUIPMENT_AGENT_ID || !EQUIPMENT_AGENT_ALIAS_ID) {
      return res.status(500).json({ error: 'AI 장비 추천 서비스가 설정되지 않았습니다.' })
    }
    
    if (!userInput || !userInput.trim()) {
      return res.status(400).json({ error: '조건을 입력해주세요.' })
    }

    const command = new InvokeAgentCommand({
      agentId: EQUIPMENT_AGENT_ID,
      agentAliasId: EQUIPMENT_AGENT_ALIAS_ID,
      sessionId: `equipment-recommend-${Date.now()}`,
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
    
    // 디버깅: 원본 응답 로그
    console.log('=== 장비 추천 Bedrock 원본 응답 ===')
    console.log('응답 길이:', assistantResponse.length)
    console.log('응답 앞 500자:', assistantResponse.substring(0, 500))
    console.log('================================')
    
    // 응답을 파싱하여 구조화된 데이터로 변환
    let recommendations = []
    
    try {
      // 1. JSON 형식인지 확인 (여러 줄에 걸친 JSON도 처리)
      let jsonText = assistantResponse.trim()
      
      // JSON 코드 블록이 있는 경우 추출 (```json ... ```)
      const jsonBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (jsonBlockMatch) {
        jsonText = jsonBlockMatch[1].trim()
      }
      
      // JSON 객체나 배열 찾기
      const jsonMatch = jsonText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          console.log('JSON 파싱 성공:', typeof parsed)
          
          if (Array.isArray(parsed)) {
            recommendations = parsed
          } else if (parsed.recommendations && Array.isArray(parsed.recommendations)) {
            recommendations = parsed.recommendations
          } else if (parsed.items && Array.isArray(parsed.items)) {
            recommendations = parsed.items
          } else if (parsed.products && Array.isArray(parsed.products)) {
            recommendations = parsed.products
          } else {
            // 단일 객체인 경우 배열로 변환
            recommendations = [parsed]
          }
          
          console.log('파싱된 추천 개수:', recommendations.length)
        } catch (jsonParseError) {
          console.log('JSON 파싱 실패, 텍스트 파싱 시도:', jsonParseError.message)
          throw jsonParseError
        }
      } else {
        // JSON이 아닌 경우 텍스트 파싱
        console.log('JSON 형식이 아님, 텍스트 파싱 시도')
        
        // 여러 줄로 나뉜 추천 항목 파싱
        const lines = assistantResponse.split('\n').filter(line => line.trim())
        
        // 각 줄을 추천 항목으로 변환
        recommendations = lines
          .filter(line => {
            // 빈 줄이나 특수 문자만 있는 줄 제외
            const trimmed = line.trim()
            return trimmed.length > 0 && !trimmed.match(/^[-\d\.\s]+$/)
          })
          .map((line, index) => {
            const trimmed = line.trim()
            
            // 제품명 추출 (예: "블랙야크 여성 히마 부츠 GTX#2 BK 추천해요.")
            let title = trimmed
            // "추천해요", "추천" 같은 단어 제거
            title = title.replace(/\s*추천(해요|합니다|드립니다)?\.?\s*$/i, '').trim()
            
            return {
              id: index + 1,
              title: title || trimmed,
              brand: '', // Bedrock Agent가 브랜드를 별도로 제공하지 않으면 비어있음
              category: '',
              price: '',
              url: '',
              reason: trimmed
            }
          })
      }
      
      // 추천 항목이 비어있으면 원본 텍스트를 하나의 항목으로
      if (recommendations.length === 0) {
        recommendations = [{
          id: 1,
          title: assistantResponse.substring(0, 100) || 'AI 추천 결과',
          brand: '',
          category: '',
          price: '',
          url: '',
          reason: assistantResponse || '추천을 생성할 수 없습니다.'
        }]
      }
      
      // 각 추천 항목의 필수 필드 보장
      recommendations = recommendations.map((item, index) => {
        // Bedrock Agent 응답에서 온 URL도 example.com 필터링
        const rawUrl = item.url || item.link || item.productUrl || ''
        const filteredUrl = (rawUrl && !rawUrl.includes('example.com') && rawUrl.startsWith('http')) 
          ? rawUrl 
          : ''
        
        return {
          id: item.id || index + 1,
          title: item.title || item.name || item.product || '제품명 없음',
          brand: item.brand || item.manufacturer || '',
          category: item.category || item.type || '',
          price: item.price || item.cost || '',
          url: filteredUrl,
          reason: item.reason || item.description || item.explanation || item.title || ''
        }
      })
      
      // DB에서 브랜드와 제품명으로 URL 검색
      if (mongoose.connection.readyState === 1) {
        console.log('=== DB에서 상품 URL 검색 시작 ===')
        const db = mongoose.connection.db
        const categories = ['shoes', 'top', 'bottom', 'goods']
        
        // 각 추천 항목에 대해 DB 검색
        for (let i = 0; i < recommendations.length; i++) {
          const item = recommendations[i]
          const searchTitle = item.title || ''
          const searchBrand = item.brand || ''
          
          if (!searchTitle) continue
          
          console.log(`[${i + 1}] 검색 중: title="${searchTitle}", brand="${searchBrand}"`)
          
          // 색상 코드나 추가 정보 제거하여 핵심 제품명 추출
          // 예: "샬레 포르테 보아 v3 (R9)" → "샬레 포르테 보아 v3"
          // 예: "샬레 포르테 보아 v3 (C8) (Charcoal)" → "샬레 포르테 보아 v3"
          const normalizeTitle = (title) => {
            // 괄호와 그 안의 내용 제거 (색상 코드 등)
            return title.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
          }
          
          const normalizedSearchTitle = normalizeTitle(searchTitle)
          console.log(`[${i + 1}] 정규화된 검색어: "${normalizedSearchTitle}"`)
          
          // 각 카테고리에서 검색
          for (const category of categories) {
            try {
              const collection = db.collection(category)
              
              // 1차: 정규화된 제품명으로 검색 (색상 코드 제거)
              let titleRegex = new RegExp(normalizedSearchTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
              let query = { title: titleRegex }
              
              // 브랜드가 있으면 브랜드도 검색 조건에 추가
              if (searchBrand) {
                const brandRegex = new RegExp(searchBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
                query.$and = [
                  { title: titleRegex },
                  {
                    $or: [
                      { brand: brandRegex },
                      { brandName: brandRegex },
                      { manufacturer: brandRegex }
                    ]
                  }
                ]
              }
              
              let product = await collection.findOne(query)
              
              // 2차: 1차 검색 실패 시 원본 제품명으로도 검색
              if (!product) {
                console.log(`[${i + 1}] 정규화 검색 실패, 원본 제품명으로 재검색: "${searchTitle}"`)
                titleRegex = new RegExp(searchTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
                query = { title: titleRegex }
                if (searchBrand) {
                  const brandRegex = new RegExp(searchBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
                  query.$and = [
                    { title: titleRegex },
                    {
                      $or: [
                        { brand: brandRegex },
                        { brandName: brandRegex },
                        { manufacturer: brandRegex }
                      ]
                    }
                  ]
                }
                product = await collection.findOne(query)
              }
              
              // 3차: 키워드 기반 검색 (핵심 단어들 추출)
              if (!product && normalizedSearchTitle) {
                console.log(`[${i + 1}] 원본 검색 실패, 키워드 기반 검색 시도`)
                const keywords = normalizedSearchTitle.split(/\s+/).filter(k => k.length > 1)
                if (keywords.length >= 2) {
                  // 최소 2개 이상의 키워드가 모두 포함되는 제품 검색
                  const keywordRegex = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
                  titleRegex = new RegExp(keywordRegex, 'i')
                  query = { title: titleRegex }
                  if (searchBrand) {
                    const brandRegex = new RegExp(searchBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
                    query.$and = [
                      { title: titleRegex },
                      {
                        $or: [
                          { brand: brandRegex },
                          { brandName: brandRegex },
                          { manufacturer: brandRegex }
                        ]
                      }
                    ]
                  }
                  product = await collection.findOne(query)
                }
              }
              
              if (product) {
                console.log(`[${i + 1}] ✅ 제품 찾음 (${category}): "${product.title || 'N/A'}"`)
                
                // URL 찾기 (여러 필드명 시도)
                const productUrl = product.url || product.link || product.productUrl || product.product_link || ''
                
                console.log(`[${i + 1}] 제품 URL 필드 확인: url="${product.url || '없음'}", link="${product.link || '없음'}", productUrl="${product.productUrl || '없음'}", product_link="${product.product_link || '없음'}"`)
                console.log(`[${i + 1}] 최종 productUrl: "${productUrl}"`)
                
                // example.com URL 필터링 (유효하지 않은 URL)
                if (productUrl && !productUrl.includes('example.com') && productUrl.startsWith('http')) {
                  console.log(`[${i + 1}] ✅ URL 찾음 (${category}): ${productUrl.substring(0, 100)}`)
                  recommendations[i].url = productUrl
                  
                  // 브랜드 정보도 업데이트
                  if (!recommendations[i].brand && (product.brand || product.brandName || product.manufacturer)) {
                    recommendations[i].brand = product.brand || product.brandName || product.manufacturer || ''
                  }
                  
                  // 가격 정보도 업데이트
                  if (!recommendations[i].price && product.price) {
                    recommendations[i].price = product.price
                  }
                  
                  // 카테고리 정보도 업데이트
                  if (!recommendations[i].category) {
                    recommendations[i].category = category
                  }
                  
                  break // 찾았으면 다음 카테고리 검색 안 함
                } else {
                  if (!productUrl) {
                    console.log(`[${i + 1}] ⚠️  제품 찾았지만 URL 필드가 모두 비어있음: "${product.title || 'N/A'}"`)
                  } else if (productUrl.includes('example.com')) {
                    console.log(`[${i + 1}] ⚠️  제품 찾았지만 example.com URL임: ${productUrl.substring(0, 100)}`)
                  } else if (!productUrl.startsWith('http')) {
                    console.log(`[${i + 1}] ⚠️  제품 찾았지만 유효하지 않은 URL 형식: ${productUrl.substring(0, 100)}`)
                  }
                }
              } else {
                console.log(`[${i + 1}] ❌ 제품 검색 실패 (${category}): 검색어="${normalizedSearchTitle}"`)
              }
            } catch (error) {
              console.warn(`${category} 컬렉션 검색 오류:`, error.message)
            }
          }
        }
        console.log('=== DB 검색 완료 ===')
      } else {
        console.warn('MongoDB 연결되지 않음 - DB 검색 건너뜀')
      }
      
    } catch (parseError) {
      console.error('장비 추천 파싱 오류:', parseError)
      console.error('원본 응답:', assistantResponse)
      
      // 파싱 실패 시 원본 텍스트를 그대로 반환
      recommendations = [{
        id: 1,
        title: assistantResponse.substring(0, 100) || 'AI 추천 결과',
        brand: '',
        category: '',
        price: '',
        url: '',
        reason: assistantResponse || '추천을 생성할 수 없습니다.'
      }]
    }
    
    res.json({
      recommendations: recommendations.length > 0 ? recommendations : [{
        id: 1,
        title: 'AI 추천 결과',
        brand: '',
        category: '',
        price: '',
        url: '',
        reason: assistantResponse || '추천을 생성할 수 없습니다.'
      }]
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


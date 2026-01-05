// CI/CD 테스트용 주석 - 재추가 2
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import connectDB from './shared/config/database.js'
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime'
import mongoose from 'mongoose'
import { authenticateCognitoToken } from './shared/utils/cognito-auth.js'
import { prometheusMiddleware, metricsHandler } from './shared/utils/prometheus-metrics.js'
import axios from 'axios'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3009
const SERVICE_NAME = 'ai-service'

// Prometheus 메트릭 미들웨어 (모든 라우트 앞에)
app.use(prometheusMiddleware(SERVICE_NAME))

// 미들웨어
app.use(cors({
  origin: ['https://www.hiker-cloud.site', 'https://hiker-cloud.site', 'http://localhost:3000'],
  credentials: true
}))
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
  },
  requestHandler: {
    requestTimeout: 60000, // 60초 타임아웃
    httpsAgent: {
      keepAlive: true
    }
  }
})

const COURSE_AGENT_ID = process.env.BEDROCK_COURSE_AGENT_ID
const COURSE_AGENT_ALIAS_ID = process.env.BEDROCK_COURSE_AGENT_ALIAS_ID
const EQUIPMENT_AGENT_ID = process.env.VITE_EQUIPMENT_AGENT_ID
const EQUIPMENT_AGENT_ALIAS_ID = process.env.VITE_EQUIPMENT_ALIAS_ID
const PRODUCT_AGENT_ID = process.env.BEDROCK_PRODUCT_AGENT_ID
const PRODUCT_AGENT_ALIAS_ID = process.env.BEDROCK_PRODUCT_AGENT_ALIAS_ID

// 디버깅: 환경 변수 확인
console.log('=== 환경 변수 확인 ===')
console.log('COURSE_AGENT_ID:', COURSE_AGENT_ID ? '설정됨' : '없음')
console.log('COURSE_AGENT_ALIAS_ID:', COURSE_AGENT_ALIAS_ID ? '설정됨' : '없음')
console.log('EQUIPMENT_AGENT_ID:', EQUIPMENT_AGENT_ID ? '설정됨' : '없음')
console.log('EQUIPMENT_AGENT_ALIAS_ID:', EQUIPMENT_AGENT_ALIAS_ID ? '설정됨' : '없음')
console.log('PRODUCT_AGENT_ID:', PRODUCT_AGENT_ID ? '설정됨' : '없음')
console.log('PRODUCT_AGENT_ALIAS_ID:', PRODUCT_AGENT_ALIAS_ID ? '설정됨' : '없음')
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
      // 타임아웃 설정 (60초)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Bedrock Agent 호출 타임아웃 (60초 초과)')), 60000)
      })
      
      response = await Promise.race([
        bedrockClient.send(command),
        timeoutPromise
      ])
      console.log('[AI 코스 추천] Bedrock Agent 응답 받음:', { 
        hasCompletion: !!response.completion,
        responseKeys: Object.keys(response || {})
      })
    } catch (bedrockError) {
      console.error('[AI 코스 추천] Bedrock Agent 호출 오류:', bedrockError)
      // 에러 객체에서 원본 응답 확인 (순환 참조 방지)
      if (bedrockError.$response) {
        try {
          const responseInfo = {
            httpStatusCode: bedrockError.$response.httpStatusCode,
            requestId: bedrockError.$response.requestId,
            extendedRequestId: bedrockError.$response.extendedRequestId
          }
          console.error('[AI 코스 추천] Bedrock 응답 정보:', JSON.stringify(responseInfo, null, 2))
          
          // 원본 응답 본문 확인 시도
          if (bedrockError.$response.body) {
            try {
              const bodyText = await bedrockError.$response.body.text()
              console.error('[AI 코스 추천] Bedrock 원본 응답 본문:', bodyText.substring(0, 1000))
            } catch (e) {
              console.error('[AI 코스 추천] 응답 본문 읽기 실패:', e.message)
            }
          }
        } catch (e) {
          console.error('[AI 코스 추천] Bedrock 에러 메시지:', bedrockError.message || bedrockError.toString())
        }
      }
      
      // 파싱 오류인 경우 응답이 실제로 왔을 수 있으므로 재시도하지 않고 에러 반환
      if (bedrockError.message && bedrockError.message.includes('parse')) {
        console.error('[AI 코스 추천] 파싱 오류 - Bedrock Agent 응답 형식 문제 가능성')
        throw new Error('AI 응답 형식 오류가 발생했습니다. Bedrock Agent 설정을 확인해주세요.')
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
    // 순환 참조 방지를 위해 에러 정보만 추출
    const errorInfo = {
      message: error.message || error.toString(),
      name: error.name,
      stack: error.stack
    }
    console.error('[AI 코스 추천] 전체 오류:', errorInfo)
    
    // 사용자 친화적인 에러 메시지
    let errorMessage = 'AI 코스 추천 중 오류가 발생했습니다.'
    if (error.message && error.message.includes('parse')) {
      errorMessage = 'AI 응답 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
    } else if (error.message && error.message.includes('security token')) {
      errorMessage = 'AWS 인증 오류가 발생했습니다. 관리자에게 문의해주세요.'
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

    console.log('[장비 추천] Bedrock Agent 호출 시작:', { 
      agentId: EQUIPMENT_AGENT_ID, 
      agentAliasId: EQUIPMENT_AGENT_ALIAS_ID,
      region: process.env.AWS_REGION,
      hasCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
      prompt: userInput.substring(0, 100)
    })
    
    const command = new InvokeAgentCommand({
      agentId: EQUIPMENT_AGENT_ID,
      agentAliasId: EQUIPMENT_AGENT_ALIAS_ID,
      sessionId: `equipment-recommend-${Date.now()}`,
      inputText: userInput,
      enableTrace: false
    })
    
    let response
    try {
      response = await bedrockClient.send(command)
      console.log('[장비 추천] Bedrock Agent 응답 받음:', { hasCompletion: !!response.completion })
    } catch (bedrockError) {
      console.error('[장비 추천] Bedrock Agent 호출 오류:', {
        message: bedrockError.message,
        name: bedrockError.name,
        httpStatusCode: bedrockError.$metadata?.httpStatusCode,
        requestId: bedrockError.$metadata?.requestId
      })
      throw bedrockError
    }
    
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
    // 순환 참조 방지를 위해 에러 정보만 추출
    const errorInfo = {
      message: error.message || error.toString(),
      name: error.name,
      stack: error.stack
    }
    console.error('AI 장비 추천 오류:', errorInfo)
    
    // 사용자 친화적인 에러 메시지
    let errorMessage = 'AI 장비 추천 중 오류가 발생했습니다.'
    if (error.message && error.message.includes('security token')) {
      errorMessage = 'AWS 인증 오류가 발생했습니다. 관리자에게 문의해주세요.'
    } else if (error.message) {
      errorMessage = error.message
    }
    
    res.status(500).json({ error: errorMessage })
  }
})

// AI 상품 추천 (Hiker_product_recommendation Agent)
app.post('/api/ai/recommend-product', authenticateCognitoToken, async (req, res) => {
  try {
    const { userInput } = req.body
    
    if (!PRODUCT_AGENT_ID || !PRODUCT_AGENT_ALIAS_ID) {
      return res.status(500).json({ error: 'AI 상품 추천 서비스가 설정되지 않았습니다.' })
    }
    
    if (!userInput || !userInput.trim()) {
      return res.status(400).json({ error: '조건을 입력해주세요.' })
    }

    console.log('[상품 추천] Bedrock Agent 호출 시작:', { 
      agentId: PRODUCT_AGENT_ID, 
      agentAliasId: PRODUCT_AGENT_ALIAS_ID,
      prompt: userInput.substring(0, 100)
    })
    
    const command = new InvokeAgentCommand({
      agentId: PRODUCT_AGENT_ID,
      agentAliasId: PRODUCT_AGENT_ALIAS_ID,
      sessionId: `product-recommend-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      inputText: userInput,
      enableTrace: false
    })
    
    let response
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Bedrock Agent 호출 타임아웃 (60초 초과)')), 60000)
      })
      
      response = await Promise.race([
        bedrockClient.send(command),
        timeoutPromise
      ])
      console.log('[상품 추천] Bedrock Agent 응답 받음:', { hasCompletion: !!response.completion })
    } catch (bedrockError) {
      console.error('[상품 추천] Bedrock Agent 호출 오류:', {
        message: bedrockError.message,
        name: bedrockError.name,
        httpStatusCode: bedrockError.$metadata?.httpStatusCode,
        requestId: bedrockError.$metadata?.requestId
      })
      throw bedrockError
    }
    
    // 스트리밍 응답 처리
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
    console.log('=== 상품 추천 Bedrock 원본 응답 ===')
    console.log('응답 길이:', assistantResponse.length)
    console.log('응답 앞 500자:', assistantResponse.substring(0, 500))
    console.log('================================')
    
    // JSON 파싱
    let productData = null
    try {
      // JSON 코드 블록 추출 (```json ... ``` 또는 ``` ... ```)
      let jsonText = assistantResponse.trim()
      const jsonBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (jsonBlockMatch) {
        jsonText = jsonBlockMatch[1].trim()
      }
      
      // JSON 객체 찾기
      const jsonMatch = jsonText.match(/(\{[\s\S]*\})/)
      if (jsonMatch) {
        productData = JSON.parse(jsonMatch[0])
        console.log('[상품 추천] JSON 파싱 성공')
      } else {
        throw new Error('JSON 형식을 찾을 수 없습니다.')
      }
    } catch (parseError) {
      console.error('[상품 추천] JSON 파싱 실패:', parseError.message)
      console.error('원본 응답:', assistantResponse)
      return res.status(500).json({ 
        error: 'AI 응답 형식 오류가 발생했습니다.',
        message: '응답을 JSON 형식으로 파싱할 수 없습니다.'
      })
    }
    
    // 응답 형식 검증 및 변환
    if (!productData || !productData.products || !Array.isArray(productData.products)) {
      console.error('[상품 추천] 응답 형식 오류:', productData)
      return res.status(500).json({ 
        error: 'AI 응답 형식이 올바르지 않습니다.',
        message: 'products 배열이 없습니다.'
      })
    }
    
    // products 배열 검증 및 정리
    const products = productData.products.map((product, index) => {
      // 필수 필드 검증
      if (!product.title || !product.brand || !product.category || !product.price) {
        console.warn(`[상품 추천] 필수 필드 누락 (인덱스 ${index}):`, product)
      }
      
      return {
        title: product.title || '상품명 없음',
        brand: product.brand || '',
        category: product.category || '',
        price: product.price || '',
        url: product.url || '',
        reason: product.reason || ''
      }
    })
    
    // Store Service API를 사용하여 상품 URL 및 정보 검색 (Elasticsearch 사용)
    console.log('=== Store Service API로 상품 검색 시작 ===')
    const STORE_API_URL = process.env.STORE_API_URL || 'http://store-service.bravo-core-ns.svc.cluster.local:3006'
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i]
      const searchTitle = product.title || ''
      const searchBrand = product.brand || ''
      
      if (!searchTitle || searchTitle === '상품명 없음') continue
      
      // 검색 쿼리 구성 (제품명 + 브랜드)
      let searchQuery = searchTitle
      if (searchBrand) {
        searchQuery = `${searchBrand} ${searchTitle}`
      }
      
      console.log(`[${i + 1}] Store Service 검색 중: "${searchQuery}"`)
      
      try {
        // Store Service API 호출
        const searchResponse = await axios.get(`${STORE_API_URL}/api/store/search`, {
          params: {
            q: searchQuery,
            limit: 10,
            category: product.category || null
          },
          timeout: 5000
        })
        
        console.log(`[${i + 1}] Store Service 응답:`, {
          status: searchResponse.status,
          productsCount: searchResponse.data?.products?.length || 0
        })
        
        if (searchResponse.status === 200 && searchResponse.data && searchResponse.data.products) {
          const foundProducts = searchResponse.data.products
          console.log(`[${i + 1}] 검색 결과 ${foundProducts.length}개 상품 발견`)
          
          // 가장 유사한 제품 찾기 (제품명과 브랜드 매칭)
          let bestMatch = null
          let bestScore = 0
          
          for (const foundProduct of foundProducts) {
            let score = 0
            
            // 제품명 매칭 점수
            const foundTitle = (foundProduct.title || '').toLowerCase()
            const searchTitleLower = searchTitle.toLowerCase()
            if (foundTitle.includes(searchTitleLower) || searchTitleLower.includes(foundTitle)) {
              score += 10
            }
            
            // 브랜드 매칭 점수
            if (searchBrand) {
              const foundBrand = (foundProduct.brand || '').toLowerCase()
              const searchBrandLower = searchBrand.toLowerCase()
              if (foundBrand.includes(searchBrandLower) || searchBrandLower.includes(foundBrand)) {
                score += 5
              }
            }
            
            if (score > bestScore) {
              bestScore = score
              bestMatch = foundProduct
            }
          }
          
          console.log(`[${i + 1}] 최고 매칭 점수: ${bestScore}`, bestMatch ? `(제품: ${bestMatch.title})` : '(매칭 없음)')
          
          if (bestMatch && bestScore >= 5) {
            console.log(`[${i + 1}] ✅ 제품 찾음: "${bestMatch.title || 'N/A'}" (점수: ${bestScore})`)
            
            // URL 업데이트
            const productUrl = bestMatch.url || bestMatch.link || bestMatch.productUrl || bestMatch.product_link || ''
            console.log(`[${i + 1}] URL 필드 확인:`, {
              url: bestMatch.url || '없음',
              link: bestMatch.link || '없음',
              productUrl: bestMatch.productUrl || '없음',
              product_link: bestMatch.product_link || '없음',
              최종URL: productUrl || '없음'
            })
            
            if (productUrl && !productUrl.includes('example.com') && productUrl.startsWith('http')) {
              products[i].url = productUrl
              console.log(`[${i + 1}] ✅ URL 업데이트: ${productUrl.substring(0, 100)}`)
            } else {
              console.log(`[${i + 1}] ⚠️  URL이 없거나 유효하지 않음:`, productUrl || '빈 문자열')
            }
            
            // 브랜드, 가격, 카테고리 정보 업데이트
            if (!products[i].brand && bestMatch.brand) {
              products[i].brand = bestMatch.brand
            }
            
            if (!products[i].price && bestMatch.price) {
              products[i].price = bestMatch.price.toString()
            }
            
            if (!products[i].category && bestMatch.category) {
              products[i].category = bestMatch.category
            }
            
            // 제품명도 정확한 것으로 업데이트
            if (bestMatch.title) {
              products[i].title = bestMatch.title
            }
          } else {
            console.log(`[${i + 1}] ⚠️  유사한 제품을 찾지 못함 (최고 점수: ${bestScore})`)
          }
        }
      } catch (error) {
        console.error(`[${i + 1}] Store Service 검색 오류:`, error.message)
        if (error.response) {
          console.error(`[${i + 1}] 응답 상태:`, error.response.status, '데이터:', error.response.data)
        }
        if (error.code) {
          console.error(`[${i + 1}] 에러 코드:`, error.code)
        }
      }
    }
    
    console.log('=== Store Service 검색 완료 ===')
    
    // 최종 응답
    res.json({
      query_summary: productData.query_summary || '',
      products: products
    })
    
  } catch (error) {
    console.error('[상품 추천] 오류:', error)
    
    let errorMessage = 'AI 상품 추천 중 오류가 발생했습니다.'
    if (error.message && error.message.includes('security token')) {
      errorMessage = 'AWS 인증 오류가 발생했습니다. 관리자에게 문의해주세요.'
    } else if (error.message) {
      errorMessage = error.message
    }
    
    res.status(500).json({ error: errorMessage })
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


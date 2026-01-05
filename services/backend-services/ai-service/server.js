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
import AWS from 'aws-sdk'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3009
const SERVICE_NAME = 'ai-service'

// S3 클라이언트 설정
const s3 = new AWS.S3({
  region: process.env.AWS_REGION || 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

const S3_BUCKET = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET || 'bravo-ai-data-bucket'
const S3_PRODUCT_PREFIX = 'data/product/'

console.log(`[S3 초기화] 버킷: ${S3_BUCKET}, 경로: ${S3_PRODUCT_PREFIX}`)

// S3에서 상품 데이터 검색 함수
async function searchProductsFromS3(searchTitle, searchBrand, category = null) {
  try {
    console.log(`[S3 검색] 제품명: "${searchTitle}", 브랜드: "${searchBrand}", 카테고리: ${category || '전체'}`)
    
    // S3에서 product/ 폴더의 모든 파일 목록 가져오기
    const listParams = {
      Bucket: S3_BUCKET,
      Prefix: S3_PRODUCT_PREFIX
    }
    
    console.log(`[S3 검색] listObjectsV2 호출:`, listParams)
    const objects = await s3.listObjectsV2(listParams).promise()
    console.log(`[S3 검색] listObjectsV2 응답:`, {
      KeyCount: objects.KeyCount,
      IsTruncated: objects.IsTruncated,
      ContentsCount: objects.Contents ? objects.Contents.length : 0
    })
    
    if (!objects.Contents || objects.Contents.length === 0) {
      console.log(`[S3 검색] ${S3_PRODUCT_PREFIX} 폴더에 파일이 없습니다.`)
      return []
    }
    
    console.log(`[S3 검색] ${objects.Contents.length}개 파일 발견`)
    console.log(`[S3 검색] 첫 5개 파일:`, objects.Contents.slice(0, 5).map(obj => obj.Key))
    
    // 각 파일에서 상품 데이터 읽기
    const products = []
    const categories = category ? [category] : ['shoes', 'top', 'bottom', 'goods']
    
    for (const obj of objects.Contents) {
      const key = obj.Key
      
      // JSON 파일과 CSV 파일 처리
      const isJson = key.endsWith('.json')
      const isCsv = key.endsWith('.csv')
      if (!isJson && !isCsv) continue
      
      // 메타데이터 파일은 스킵
      if (key.includes('.metadata.')) continue
      
      // CSV 파일은 카테고리 필터링 스킵 (파일 내부에서 필터링)
      // JSON 파일만 경로 기반 카테고리 필터링
      if (category && isJson) {
        // 카테고리 매핑: '용품' -> 'goods'
        const categoryMap = {
          '용품': 'goods',
          'goods': 'goods',
          '등산화': 'shoes',
          'shoes': 'shoes',
          '상의': 'top',
          'top': 'top',
          '하의': 'bottom',
          'bottom': 'bottom'
        }
        const mappedCategory = categoryMap[category] || category
        
        const categoryInPath = categories.find(cat => {
          const catMatch = key.includes(`/${cat}/`) || key.includes(`_${cat}_`) || key.includes(`/${cat}.`) || key.includes(`_${cat}.`)
          return catMatch
        })
        
        // 카테고리 매칭이 안 되어도 일단 확인 (로깅용)
        if (!categoryInPath) {
          console.log(`[S3 검색] 카테고리 필터링: ${key}는 ${category}(${mappedCategory})와 매칭 안 됨, 스킵`)
          continue
        } else {
          console.log(`[S3 검색] 카테고리 매칭: ${key}는 ${category}(${mappedCategory})와 매칭됨`)
        }
      } else if (isCsv) {
        console.log(`[S3 검색] CSV 파일 발견: ${key}, 카테고리 필터링은 파일 내부에서 수행`)
      }
      
      try {
        const getObjectParams = {
          Bucket: S3_BUCKET,
          Key: key
        }
        
        const data = await s3.getObject(getObjectParams).promise()
        const fileContent = data.Body.toString('utf-8')
        
        let items = []
        
        if (isCsv) {
          // CSV 파일 파싱 (따옴표 내부 줄바꿈 처리)
          console.log(`[S3 검색] CSV 파일 ${key} 읽기 성공, 크기: ${fileContent.length} bytes`)
          
          // CSV 파싱 함수 (따옴표 내부 줄바꿈 고려)
          function parseCSV(csvText) {
            const rows = []
            let currentRow = []
            let currentField = ''
            let inQuotes = false
            let i = 0
            
            while (i < csvText.length) {
              const char = csvText[i]
              const nextChar = csvText[i + 1]
              
              if (char === '"') {
                if (inQuotes && nextChar === '"') {
                  // 이스케이프된 따옴표 ("")
                  currentField += '"'
                  i += 2
                  continue
                } else {
                  // 따옴표 시작/끝
                  inQuotes = !inQuotes
                  i++
                  continue
                }
              }
              
              if (char === ',' && !inQuotes) {
                // 필드 구분자
                currentRow.push(currentField.trim())
                currentField = ''
                i++
                continue
              }
              
              if ((char === '\n' || char === '\r') && !inQuotes) {
                // 행 구분자 (따옴표 밖에서만)
                if (char === '\r' && nextChar === '\n') {
                  i += 2 // \r\n 건너뛰기
                } else {
                  i++ // \n 건너뛰기
                }
                
                // 현재 행이 비어있지 않으면 추가
                if (currentField.trim() || currentRow.length > 0) {
                  currentRow.push(currentField.trim())
                  if (currentRow.some(f => f.length > 0)) {
                    rows.push(currentRow)
                  }
                  currentRow = []
                  currentField = ''
                }
                continue
              }
              
              // 일반 문자
              currentField += char
              i++
            }
            
            // 마지막 필드와 행 처리
            if (currentField.trim() || currentRow.length > 0) {
              currentRow.push(currentField.trim())
              if (currentRow.some(f => f.length > 0)) {
                rows.push(currentRow)
              }
            }
            
            return rows
          }
          
          const rows = parseCSV(fileContent)
          if (rows.length === 0) {
            console.log(`[S3 검색] CSV 파일이 비어있습니다.`)
            continue
          }
          
          // 헤더 파싱
          const headers = rows[0].map(h => h.trim().replace(/^"|"$/g, ''))
          console.log(`[S3 검색] CSV 헤더 (${headers.length}개):`, headers.slice(0, 15))
          
          // 데이터 행 파싱
          let skipCount = 0
          for (let i = 1; i < rows.length; i++) {
            const values = rows[i]
            
            // 컬럼 수가 맞지 않으면 스킵
            if (values.length !== headers.length) {
              skipCount++
              // 처음 3개만 로그
              if (skipCount <= 3) {
                console.warn(`[S3 검색] CSV 행 ${i}의 컬럼 수가 헤더와 다름: ${values.length} vs ${headers.length}, 스킵`)
              }
              continue
            }
            
            const item = {}
            headers.forEach((header, idx) => {
              item[header] = (values[idx] || '').trim()
            })
            items.push(item)
          }
          
          if (skipCount > 3) {
            console.log(`[S3 검색] 추가로 ${skipCount - 3}개 행이 컬럼 수 불일치로 스킵됨 (총 ${skipCount}개)`)
          }
          
          console.log(`[S3 검색] CSV에서 ${items.length}개 항목 파싱 완료`)
          if (items.length > 0) {
            console.log(`[S3 검색] 첫 번째 항목 키:`, Object.keys(items[0]).slice(0, 20))
          }
        } else {
          // JSON 파일 파싱
          const content = JSON.parse(fileContent)
          console.log(`[S3 검색] JSON 파일 ${key} 읽기 성공, 타입: ${Array.isArray(content) ? '배열' : '객체'}, 항목 수: ${Array.isArray(content) ? content.length : 1}`)
          
          // 배열인 경우와 객체인 경우 처리
          items = Array.isArray(content) ? content : [content]
          
          // 첫 번째 항목의 키 확인 (디버깅)
          if (items.length > 0) {
            console.log(`[S3 검색] 첫 번째 항목 키:`, Object.keys(items[0]).slice(0, 20))
          }
        }
        
        for (const item of items) {
          // CSV의 경우 카테고리 필터링
          if (category && isCsv) {
            const categoryMap = {
              '용품': 'goods',
              'goods': 'goods',
              '등산화': 'shoes',
              'shoes': 'shoes',
              '상의': 'top',
              'top': 'top',
              '하의': 'bottom',
              'bottom': 'bottom'
            }
            const mappedCategory = categoryMap[category] || category
            const itemCategory = (item.category || item.type || item.category_name || '').toLowerCase()
            if (itemCategory && itemCategory !== mappedCategory && !itemCategory.includes(mappedCategory) && mappedCategory !== itemCategory) {
              continue // 카테고리가 맞지 않으면 스킵
            }
          }
          
          const title = (item.title || item.name || item.product_name || item.productName || '').toLowerCase()
          const brand = (item.brand || item.brandName || item.manufacturer || item.brand_name || '').toLowerCase()
          const searchTitleLower = searchTitle.toLowerCase()
          const searchBrandLower = searchBrand.toLowerCase()
          
          // 제품명과 브랜드 매칭 확인 (더 유연한 매칭)
          let score = 0
          
          // 제품명 매칭: 키워드 기반 매칭
          if (title && searchTitleLower) {
            const titleWords = searchTitleLower.split(/\s+/).filter(w => w.length > 1)
            const matchedWords = titleWords.filter(word => title.includes(word))
            if (matchedWords.length > 0) {
              score += (matchedWords.length / titleWords.length) * 10 // 매칭된 단어 비율에 따라 점수
            }
            // 전체 포함 여부도 확인
            if (title.includes(searchTitleLower) || searchTitleLower.includes(title)) {
              score = Math.max(score, 10)
            }
          }
          
          // 브랜드 매칭
          if (brand && searchBrandLower) {
            if (brand.includes(searchBrandLower) || searchBrandLower.includes(brand)) {
              score += 5
            }
          }
          
          // 최소 점수 3점 이상이면 포함 (더 관대한 매칭)
          if (score >= 3) {
            // 모든 가능한 URL 필드명 확인
            const productUrl = item.url || item.link || item.productUrl || item.product_link || item.productLink || item.product_url || item.href || item.hyperlink || item.webUrl || item.web_url || item.purchaseUrl || item.purchase_url || ''
            
            console.log(`[S3 검색] 매칭 상품 발견: "${item.title || item.name}" (점수: ${score.toFixed(1)})`)
            console.log(`[S3 검색] URL 필드 확인:`, {
              url: item.url || '없음',
              link: item.link || '없음',
              productUrl: item.productUrl || '없음',
              product_link: item.product_link || '없음',
              productLink: item.productLink || '없음',
              product_url: item.product_url || '없음',
              href: item.href || '없음',
              hyperlink: item.hyperlink || '없음',
              webUrl: item.webUrl || '없음',
              web_url: item.web_url || '없음',
              purchaseUrl: item.purchaseUrl || '없음',
              purchase_url: item.purchase_url || '없음',
              최종URL: productUrl || '없음',
              전체키: Object.keys(item).filter(k => k.toLowerCase().includes('url') || k.toLowerCase().includes('link') || k.toLowerCase().includes('href'))
            })
            
            products.push({
              ...item,
              title: item.title || item.name || item.product_name || item.productName || '',
              brand: item.brand || item.brandName || item.manufacturer || item.brand_name || '',
              url: productUrl,
              price: item.price || item.cost || item.priceValue || item.price_value || 0,
              category: item.category || item.type || item.category_name || '',
              _score: score
            })
          }
        }
      } catch (error) {
        console.warn(`[S3 검색] 파일 ${key} 읽기 실패:`, error.message)
      }
    }
    
    // 점수 순으로 정렬
    products.sort((a, b) => (b._score || 0) - (a._score || 0))
    
    console.log(`[S3 검색] ${products.length}개 매칭 상품 발견`)
    return products.slice(0, 10) // 최대 10개만 반환
    
  } catch (error) {
    console.error('[S3 검색] 오류:', error.message)
    console.error('[S3 검색] 오류 스택:', error.stack)
    if (error.code) {
      console.error('[S3 검색] 오류 코드:', error.code)
    }
    if (error.statusCode) {
      console.error('[S3 검색] HTTP 상태 코드:', error.statusCode)
    }
    return []
  }
}

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
        
        // 텍스트를 "브랜드:" 또는 빈 줄로 구분하여 항목 추출
        const sections = assistantResponse.split(/\n\s*\n|\n(?=브랜드:)/i)
        
        recommendations = sections
          .filter(section => {
            const trimmed = section.trim()
            return trimmed.length > 0 && trimmed.includes('브랜드:')
          })
          .map((section, index) => {
            const trimmed = section.trim()
            
            // 브랜드 추출: "브랜드: 블랙야크" 형식
            const brandMatch = trimmed.match(/브랜드:\s*([^\n]+)/i)
            const brand = brandMatch ? brandMatch[1].trim() : ''
            
            // 카테고리 추출: "카테고리: 용품" 형식
            const categoryMatch = trimmed.match(/카테고리:\s*([^\n]+)/i)
            const category = categoryMatch ? categoryMatch[1].trim() : ''
            
            // 제품명 추출: 브랜드와 카테고리 정보를 제거한 후 첫 번째 문장을 제품명으로
            let title = trimmed
            // "브랜드: ...", "카테고리: ...", "성별: ..." 제거
            title = title.replace(/브랜드:\s*[^\n]+\n?/gi, '')
            title = title.replace(/카테고리:\s*[^\n]+\n?/gi, '')
            title = title.replace(/성별:\s*[^\n]+\n?/gi, '')
            title = title.trim()
            
            // 첫 번째 문장을 제품명으로 (예: "심플하고 실용적인 아웃도어 백팩 25L")
            // 문장 끝(마침표, 줄바꿈)까지 추출
            const firstSentenceMatch = title.match(/^([^\.\n]+(?:\.|$))/)
            if (firstSentenceMatch) {
              title = firstSentenceMatch[1].trim()
              // "용량의", "롤탑형" 같은 설명 제거하고 핵심 제품명만 추출
              // 예: "심플하고 실용적인 아웃도어 백팩 25L" -> "아웃도어 백팩 25L" 또는 "백팩 25L"
              const titleWords = title.split(/\s+/)
              // "백팩", "배낭" 같은 핵심 키워드 찾기
              const backpackIndex = titleWords.findIndex(w => /백팩|배낭|가방/i.test(w))
              if (backpackIndex >= 0) {
                // 핵심 키워드부터 끝까지 또는 용량 정보까지
                title = titleWords.slice(Math.max(0, backpackIndex - 2), backpackIndex + 3).join(' ')
              }
            } else {
              // 문장 구분이 없으면 처음 50자만
              title = title.substring(0, 50).trim()
            }
            
            // reason은 전체 설명 (브랜드, 카테고리 정보 포함)
            const reason = trimmed
            
            return {
              id: index + 1,
              title: title || '제품명 없음',
              brand: brand,
              category: category,
              price: '',
              url: '',
              reason: reason
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
      
      // Store Service API를 사용하여 상품 URL 및 정보 검색 (Elasticsearch 사용)
      console.log('=== Store Service API로 상품 URL 검색 시작 ===')
      const STORE_API_URL = process.env.STORE_API_URL || 'http://store-service.bravo-core-ns.svc.cluster.local:3006'
      
      // MongoDB 검색 대신 Store Service API 사용
      if (false && mongoose.connection.readyState === 1) {
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
      
      // S3에서 직접 상품 데이터 검색
      for (let i = 0; i < recommendations.length; i++) {
        const item = recommendations[i]
        const searchTitle = item.title || ''
        const searchBrand = item.brand || ''
        
        if (!searchTitle) continue
        
        console.log(`[${i + 1}] S3에서 상품 검색 중: 제품명="${searchTitle}", 브랜드="${searchBrand}"`)
        
        try {
          const foundProducts = await searchProductsFromS3(searchTitle, searchBrand, item.category || null)
          
          if (foundProducts && foundProducts.length > 0) {
            const bestMatch = foundProducts[0] // 가장 높은 점수의 제품
            console.log(`[${i + 1}] ✅ S3에서 제품 찾음: "${bestMatch.title || 'N/A'}" (점수: ${bestMatch._score})`)
            
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
              recommendations[i].url = productUrl
              console.log(`[${i + 1}] ✅ URL 업데이트: ${productUrl.substring(0, 100)}`)
            } else {
              console.log(`[${i + 1}] ⚠️  URL이 없거나 유효하지 않음:`, productUrl || '빈 문자열')
            }
            
            // 브랜드, 가격, 카테고리 정보 업데이트
            if (!recommendations[i].brand && bestMatch.brand) {
              recommendations[i].brand = bestMatch.brand
            }
            
            if (!recommendations[i].price && bestMatch.price) {
              recommendations[i].price = bestMatch.price.toString()
            }
            
            if (!recommendations[i].category && bestMatch.category) {
              recommendations[i].category = bestMatch.category
            }
            
            // 제품명도 정확한 것으로 업데이트
            if (bestMatch.title) {
              recommendations[i].title = bestMatch.title
            }
          } else {
            console.log(`[${i + 1}] ⚠️  S3에서 유사한 제품을 찾지 못함`)
          }
        } catch (error) {
          console.error(`[${i + 1}] S3 검색 오류:`, error.message)
        }
      }
      
      console.log('=== Store Service 검색 완료 ===')
      
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
    
    // S3에서 직접 상품 데이터 검색
    console.log('=== S3에서 상품 URL 검색 시작 ===')
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i]
      const searchTitle = product.title || ''
      const searchBrand = product.brand || ''
      
      if (!searchTitle || searchTitle === '상품명 없음') continue
      
      console.log(`[${i + 1}] S3에서 상품 검색 중: 제품명="${searchTitle}", 브랜드="${searchBrand}"`)
      
      try {
        const foundProducts = await searchProductsFromS3(searchTitle, searchBrand, product.category || null)
        
        if (foundProducts && foundProducts.length > 0) {
          const bestMatch = foundProducts[0] // 가장 높은 점수의 제품
          console.log(`[${i + 1}] ✅ S3에서 제품 찾음: "${bestMatch.title || 'N/A'}" (점수: ${bestMatch._score})`)
          console.log(`[${i + 1}] S3 제품 전체 데이터:`, JSON.stringify(bestMatch).substring(0, 500))
          
          // URL 업데이트 (모든 가능한 필드명 확인)
          const productUrl = bestMatch.url || bestMatch.link || bestMatch.productUrl || bestMatch.product_link || bestMatch.productLink || bestMatch.product_url || ''
          console.log(`[${i + 1}] URL 필드 확인:`, {
            url: bestMatch.url || '없음',
            link: bestMatch.link || '없음',
            productUrl: bestMatch.productUrl || '없음',
            product_link: bestMatch.product_link || '없음',
            productLink: bestMatch.productLink || '없음',
            product_url: bestMatch.product_url || '없음',
            최종URL: productUrl || '없음'
          })
          
          if (productUrl && !productUrl.includes('example.com') && productUrl.startsWith('http')) {
            products[i].url = productUrl
            console.log(`[${i + 1}] ✅ URL 업데이트: ${productUrl.substring(0, 100)}`)
          } else {
            console.log(`[${i + 1}] ⚠️  URL이 없거나 유효하지 않음:`, productUrl || '빈 문자열')
            // URL이 없어도 다른 정보는 업데이트
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
          console.log(`[${i + 1}] ⚠️  S3에서 유사한 제품을 찾지 못함`)
        }
      } catch (error) {
        console.error(`[${i + 1}] S3 검색 오류:`, error.message)
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


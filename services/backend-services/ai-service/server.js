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

// 가격 범위 파싱 함수
function parsePriceRange(userInput) {
  if (!userInput) return null
  
  const input = userInput.replace(/,/g, '') // 쉼표 제거
  
  // "1만원 ~ 50만원 이하" 형식 (양쪽 모두 단위가 있는 경우)
  const rangeWithBothUnitsMatch = input.match(/(\d+)\s*(만원|만)\s*[~-]\s*(\d+)\s*(만원|만)\s*이하/i)
  if (rangeWithBothUnitsMatch) {
    const num1 = parseInt(rangeWithBothUnitsMatch[1])
    const num2 = parseInt(rangeWithBothUnitsMatch[3])
    const minPrice = num1 * 10000
    const maxPrice = num2 * 10000
    console.log(`[가격 범위 파싱] "${userInput}" -> min: ${minPrice}, max: ${maxPrice} (범위 이하, 양쪽 단위)`)
    return { minPrice, maxPrice }
  }
  
  // "26 ~ 50만원 이하" 또는 "21~50만원 이하" 같은 패턴 (첫 번째 숫자 뒤에 단위가 없거나, 두 번째 숫자 뒤에만 단위가 있는 경우)
  // 이 경우 두 숫자 모두 만원 단위로 간주
  const rangeWithBelowMatch = input.match(/(\d+)\s*[~-]\s*(\d+)\s*(만원|만)\s*이하/i)
  if (rangeWithBelowMatch) {
    const num1 = parseInt(rangeWithBelowMatch[1])
    const num2 = parseInt(rangeWithBelowMatch[2])
    // 두 숫자 모두 만원 단위로 간주 (첫 번째 숫자 뒤에 단위가 없어도 만원 단위로 처리)
    const minPrice = num1 * 10000
    const maxPrice = num2 * 10000
    console.log(`[가격 범위 파싱] "${userInput}" -> min: ${minPrice}, max: ${maxPrice} (범위 이하)`)
    return { minPrice, maxPrice }
  }
  
  // "21~50만원 이상" 같은 패턴
  const rangeWithAboveMatch = input.match(/(\d+)\s*[~-]\s*(\d+)\s*(만원|만)\s*이상/i)
  if (rangeWithAboveMatch) {
    const num1 = parseInt(rangeWithAboveMatch[1])
    const num2 = parseInt(rangeWithAboveMatch[2])
    const minPrice = num1 * 10000
    const maxPrice = num2 * 10000
    console.log(`[가격 범위 파싱] "${userInput}" -> min: ${minPrice}, max: ${maxPrice} (범위 이상)`)
    return { minPrice, maxPrice }
  }
  
  // 단일 가격 패턴을 먼저 처리 (범위 패턴보다 우선)
  // "10만원 이하", "10만 이하" 같은 패턴
  const singlePriceBelowMatch = input.match(/(\d+)\s*(만원|만)\s*이하/i)
  if (singlePriceBelowMatch) {
    const num = parseInt(singlePriceBelowMatch[1])
    const maxPrice = num * 10000
    console.log(`[가격 범위 파싱] "${userInput}" -> max: ${maxPrice} (단일 가격 이하)`)
    return { minPrice: null, maxPrice }
  }
  
  // "10만원 이상", "10만 이상" 같은 패턴
  const singlePriceAboveMatch = input.match(/(\d+)\s*(만원|만)\s*이상/i)
  if (singlePriceAboveMatch) {
    const num = parseInt(singlePriceAboveMatch[1])
    const minPrice = num * 10000
    console.log(`[가격 범위 파싱] "${userInput}" -> min: ${minPrice} (단일 가격 이상)`)
    return { minPrice, maxPrice: null }
  }
  
  // "500000원 이하" 같은 패턴
  const singlePriceBelowWonMatch = input.match(/(\d+)\s*원\s*이하/i)
  if (singlePriceBelowWonMatch) {
    const num = parseInt(singlePriceBelowWonMatch[1].replace(/,/g, ''))
    const maxPrice = num
    console.log(`[가격 범위 파싱] "${userInput}" -> max: ${maxPrice} (단일 가격 이하, 원 단위)`)
    return { minPrice: null, maxPrice }
  }
  
  // "100000원 이상" 같은 패턴
  const singlePriceAboveWonMatch = input.match(/(\d+)\s*원\s*이상/i)
  if (singlePriceAboveWonMatch) {
    const num = parseInt(singlePriceAboveWonMatch[1].replace(/,/g, ''))
    const minPrice = num
    console.log(`[가격 범위 파싱] "${userInput}" -> min: ${minPrice} (단일 가격 이상, 원 단위)`)
    return { minPrice, maxPrice: null }
  }
  
  const pricePatterns = [
    // 범위 패턴
    /(\d+)\s*[~-]\s*(\d+)\s*(만원|만)/i,  // 21~50만원, 21-50만원
    /(\d+)\s*[~-]\s*(\d+)\s*원/i,  // 210000~500000원
    // 단일 가격 패턴 (이하/이상이 없는 경우)
    /(\d+)\s*(만원|만)/i,  // 50만원
    /(\d+)\s*원/i  // 500000원
  ]
  
  for (const pattern of pricePatterns) {
    const match = input.match(pattern)
    if (match) {
      let minPrice = null
      let maxPrice = null
      
      // 범위 패턴 (두 개의 숫자가 있는 경우)
      if (match[2] && /^\d+$/.test(match[2])) {
        const num1 = parseInt(match[1])
        const num2 = parseInt(match[2])
        const unit = match[3] || ''
        
        if (unit.includes('만')) {
          minPrice = num1 * 10000
          maxPrice = num2 * 10000
        } else {
          minPrice = num1
          maxPrice = num2
        }
      } else {
        // 단일 가격
        const num = parseInt(match[1])
        const unit = match[2] || ''
        
        if (unit.includes('만')) {
          if (input.includes('이하')) {
            maxPrice = num * 10000
          } else if (input.includes('이상')) {
            minPrice = num * 10000
          } else {
            // 정확한 가격 (범위로 처리)
            minPrice = num * 10000 * 0.9
            maxPrice = num * 10000 * 1.1
          }
        } else {
          if (input.includes('이하')) {
            maxPrice = num
          } else if (input.includes('이상')) {
            minPrice = num
          } else {
            minPrice = num * 0.9
            maxPrice = num * 1.1
          }
        }
      }
      
      console.log(`[가격 범위 파싱] "${userInput}" -> min: ${minPrice}, max: ${maxPrice}`)
      return { minPrice, maxPrice }
    }
  }
  
  return null
}

// S3에서 상품 데이터 검색 함수
async function searchProductsFromS3(searchTitle, searchBrand, category = null, originalUserInput = '') {
  try {
    console.log(`[S3 검색] 제품명: "${searchTitle}", 브랜드: "${searchBrand}", 카테고리: ${category || '전체'}`)
    
    // 가격 범위 파싱
    const priceRange = parsePriceRange(originalUserInput)
    
    // "초보자" 키워드 변환: 초보자 관련 키워드를 제품명 검색에 반영
    const normalizeSearchTitle = (title) => {
      if (!title) return title
      const lowerTitle = title.toLowerCase()
      
      // "등산 스틱" -> "등산스틱" 정규화 (공백 제거)
      let normalized = title
      if (lowerTitle.includes('등산') && (lowerTitle.includes('스틱') || lowerTitle.includes('stick'))) {
        normalized = normalized.replace(/\s+/g, '') // 공백 제거
        console.log(`[S3 검색] 등산 스틱 정규화: "${title}" -> "${normalized}"`)
      }
      
      // "초보자" 관련 키워드 감지
      const beginnerKeywords = ['초보자', '초보', '입문', '입문자', '신규', 'beginner', 'novice']
      const hasBeginnerKeyword = beginnerKeywords.some(keyword => normalized.toLowerCase().includes(keyword))
      
      if (hasBeginnerKeyword) {
        // "초보자" 키워드 제거하고 제품명만 추출
        beginnerKeywords.forEach(keyword => {
          normalized = normalized.replace(new RegExp(keyword, 'gi'), '').trim()
        })
        
        // 제품명이 비어있으면 원본 반환
        if (!normalized) return title
        
        console.log(`[S3 검색] 초보자 키워드 감지: "${title}" -> "${normalized}"`)
        return normalized
      }
      
      return normalized
    }
    
    const normalizedSearchTitle = normalizeSearchTitle(searchTitle)
    const searchTitleLower = normalizedSearchTitle.toLowerCase()
    
    // 원본 사용자 입력에서 "초보자" 키워드 감지
    const originalInputLower = (originalUserInput || '').toLowerCase()
    const beginnerKeywords = ['초보자', '초보', '입문', '입문자', '신규', 'beginner', 'novice']
    const hasBeginnerRequest = beginnerKeywords.some(keyword => originalInputLower.includes(keyword))
    
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
          '티셔츠': 'top',
          '셔츠': 'top',
          '재킷': 'top',
          '자켓': 'top',
          '후디': 'top',
          '후드': 'top',
          '하의': 'bottom',
          'bottom': 'bottom',
          '바지': 'bottom',
          '팬츠': 'bottom'
        }
        const mappedCategory = categoryMap[category.toLowerCase()] || category.toLowerCase()
        
        // 경로에서 카테고리 찾기 (더 유연하게)
        const categoryInPath = categories.find(cat => {
          const catMatch = key.includes(`/${cat}/`) || key.includes(`_${cat}_`) || key.includes(`/${cat}.`) || key.includes(`_${cat}.`)
          return catMatch
        })
        
        // 매핑된 카테고리도 경로에서 찾기
        const mappedCategoryInPath = key.includes(`/${mappedCategory}/`) || key.includes(`_${mappedCategory}_`) || key.includes(`/${mappedCategory}.`) || key.includes(`_${mappedCategory}.`)
        
        // 카테고리 매칭이 안 되어도 일단 확인 (로깅용)
        if (!categoryInPath && !mappedCategoryInPath) {
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
        
        // 스틱 검색어 감지 (카테고리 필터링 완화를 위해)
        const stickKeywords = ['스틱', 'stick', '폴', 'pole', '트레킹폴', 'trekking', '등산스틱', '등산 스틱', '등산스틱', 'trekking pole', 'trekkingpole', '트레킹 폴', 'trekking pole']
        const hasStickSearch = stickKeywords.some(k => {
          const kLower = k.toLowerCase()
          return searchTitleLower.includes(kLower) || originalInputLower.includes(kLower)
        })
        
        // 모자 검색어 감지 (카테고리 필터링 완화를 위해)
        const hatKeywords = ['모자', 'hat', 'cap', '캡', '등산모자', '등산 모자', 'baseball cap', 'baseballcap', '볼캡', '볼 캡', '버킷햇', '버킷 햇', 'bucket hat', 'buckethat']
        const hasHatSearch = hatKeywords.some(k => searchTitleLower.includes(k) || originalInputLower.includes(k))
        
        for (const item of items) {
          // CSV의 경우 카테고리 필터링 (더 유연하게)
          // 스틱 또는 모자 검색 시 카테고리 필터링 완화
          if (category && isCsv && !hasStickSearch && !hasHatSearch) {
            const categoryMap = {
              '용품': 'goods',
              'goods': 'goods',
              '등산화': 'shoes',
              'shoes': 'shoes',
              '상의': 'top',
              'top': 'top',
              '티셔츠': 'top',
              '셔츠': 'top',
              '재킷': 'top',
              '자켓': 'top',
              '후디': 'top',
              '후드': 'top',
              '하의': 'bottom',
              'bottom': 'bottom',
              '바지': 'bottom',
              '팬츠': 'bottom'
            }
            const mappedCategory = categoryMap[category.toLowerCase()] || category.toLowerCase()
            const itemCategory = (item.category || item.type || item.category_name || '').toLowerCase()
            
            // 카테고리 매칭: 정확히 일치하거나 포함되거나, 매핑된 카테고리와 일치하는지 확인
            const categoryMatch = itemCategory === mappedCategory || 
                                 itemCategory.includes(mappedCategory) || 
                                 mappedCategory.includes(itemCategory) ||
                                 Object.keys(categoryMap).some(key => 
                                   categoryMap[key] === mappedCategory && itemCategory.includes(key)
                                 )
            
            if (itemCategory && !categoryMatch) {
              console.log(`[S3 검색] CSV 카테고리 필터링: "${itemCategory}" != "${mappedCategory}", 스킵`)
              continue // 카테고리가 맞지 않으면 스킵
            } else if (itemCategory) {
              console.log(`[S3 검색] CSV 카테고리 매칭: "${itemCategory}" == "${mappedCategory}"`)
            }
          } else if (hasStickSearch) {
            // 스틱 검색 시 카테고리 필터링 완전히 제거 (모든 카테고리에서 스틱 검색)
            const itemTitle = (item.title || item.name || '').toLowerCase()
            const itemDesc = (item.description || item.desc || '').toLowerCase()
            const itemHasStick = stickKeywords.some(k => {
              const kLower = k.toLowerCase()
              return itemTitle.includes(kLower) || itemDesc.includes(kLower)
            })
            // 스틱 키워드가 없으면 스킵 (스틱 검색이므로)
            if (!itemHasStick) {
              console.log(`[S3 검색] 스틱 검색: 스틱 키워드 없음, 스킵: "${item.title || item.name}"`)
              continue
            }
            console.log(`[S3 검색] 스틱 검색: 스틱 키워드 발견, 포함: "${item.title || item.name}"`)
          } else if (hasHatSearch) {
            // 모자 검색 시 카테고리 필터링 완화 (용품 카테고리 우선, 하지만 다른 카테고리도 허용)
            const itemCategory = (item.category || item.type || item.category_name || '').toLowerCase()
            if (itemCategory && !itemCategory.includes('goods') && !itemCategory.includes('용품')) {
              // 용품이 아니어도 모자 키워드가 있으면 통과
              const itemTitle = (item.title || item.name || '').toLowerCase()
              const itemDesc = (item.description || item.desc || '').toLowerCase()
              const itemHasHat = hatKeywords.some(k => itemTitle.includes(k) || itemDesc.includes(k))
              if (!itemHasHat) {
                console.log(`[S3 검색] 모자 검색: 용품이 아니고 모자 키워드도 없음, 스킵: "${item.title || item.name}"`)
                continue
              }
            }
          }
          
          const title = (item.title || item.name || item.product_name || item.productName || '').toLowerCase()
          const brand = (item.brand || item.brandName || item.manufacturer || item.brand_name || '').toLowerCase()
          const description = (item.description || item.desc || item.reason || '').toLowerCase()
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
            
            // "등산 스틱" 같은 복합 키워드 처리
            // "등산 스틱" -> "등산스틱", "스틱", "트레킹폴", "폴" 등으로도 매칭
            const stickKeywords = ['스틱', 'stick', '폴', 'pole', '트레킹폴', 'trekking', '등산스틱', '등산 스틱', '등산스틱', 'trekking pole', 'trekkingpole', '트레킹 폴', 'trekking pole']
            const hasStickKeyword = stickKeywords.some(k => {
              const kLower = k.toLowerCase()
              return searchTitleLower.includes(kLower) || originalInputLower.includes(kLower)
            })
            if (hasStickKeyword) {
              const itemHasStick = stickKeywords.some(k => {
                const kLower = k.toLowerCase()
                return title.includes(kLower) || description.includes(kLower) || 
                       (item.title && item.title.toLowerCase().includes(kLower)) ||
                       (item.name && item.name.toLowerCase().includes(kLower))
              })
              if (itemHasStick) {
                score += 20 // 스틱 관련 키워드 매칭 보너스 (점수 증가)
                console.log(`[S3 검색] 스틱 키워드 매칭 보너스: "${item.title || item.name}"`)
              } else {
                // 스틱 검색어가 있지만 제품에 스틱 키워드가 없는 경우에도 기본 점수 부여
                score += 5
                console.log(`[S3 검색] 스틱 검색어 감지, 기본 점수 부여: "${item.title || item.name}"`)
              }
            }
            
            // "모자" 관련 키워드 처리
            // "모자", "hat", "cap", "캡", "등산모자" 등으로 매칭
            const hatKeywords = ['모자', 'hat', 'cap', '캡', '등산모자', '등산 모자', 'baseball cap', 'baseballcap', '볼캡', '볼 캡', '버킷햇', '버킷 햇', 'bucket hat', 'buckethat']
            const hasHatKeyword = hatKeywords.some(k => searchTitleLower.includes(k) || originalInputLower.includes(k))
            if (hasHatKeyword) {
              const itemHasHat = hatKeywords.some(k => {
                const kLower = k.toLowerCase()
                return title.includes(kLower) || description.includes(kLower) || 
                       (item.title && item.title.toLowerCase().includes(kLower)) ||
                       (item.name && item.name.toLowerCase().includes(kLower))
              })
              if (itemHasHat) {
                score += 15 // 모자 관련 키워드 매칭 보너스
                console.log(`[S3 검색] 모자 키워드 매칭 보너스: "${item.title || item.name}"`)
              } else {
                // 모자 검색어가 있지만 제품에 모자 키워드가 없는 경우에도 기본 점수 부여
                score += 3
                console.log(`[S3 검색] 모자 검색어 감지, 기본 점수 부여: "${item.title || item.name}"`)
              }
            }
            
            // "상의" 관련 키워드 처리
            // "상의", "티셔츠", "셔츠", "재킷", "자켓", "후디", "후드" 등으로 매칭
            const topKeywords = ['상의', 'top', '티셔츠', 'tshirt', '셔츠', 'shirt', '재킷', 'jacket', '자켓', '후디', '후드', 'hoodie', '후드티']
            const hasTopKeyword = topKeywords.some(k => searchTitleLower.includes(k) || originalInputLower.includes(k))
            if (hasTopKeyword) {
              const itemHasTop = topKeywords.some(k => title.includes(k) || description.includes(k) || (item.category && item.category.toLowerCase().includes('top')))
              if (itemHasTop) {
                score += 5 // 상의 관련 키워드 매칭 보너스
                console.log(`[S3 검색] 상의 키워드 매칭 보너스: "${item.title || item.name}"`)
              }
            }
          }
          
          // "초보자" 키워드가 있고, 제품 설명이나 제품명에 초보자 관련 키워드가 있으면 보너스 점수
          if (hasBeginnerRequest) {
            const itemText = (title + ' ' + description).toLowerCase()
            const beginnerMatchKeywords = ['초보', '입문', '신규', 'beginner', 'novice', 'light', 'lightweight', '가벼운', '편한', '쉬운', 'easy', 'simple', '심플', '기본', 'basic', 'starter', 'entry']
            const hasBeginnerMatch = beginnerMatchKeywords.some(keyword => itemText.includes(keyword))
            
            if (hasBeginnerMatch) {
              score += 8 // 초보자 관련 키워드 매칭 보너스
              console.log(`[S3 검색] 초보자 키워드 매칭 보너스: "${item.title || item.name}"`)
            } else if (score > 0) {
              // 제품명은 매칭되었지만 초보자 관련 키워드가 없는 경우에도 기본 점수 유지
              score += 2 // 약간의 보너스 (초보자 요청이지만 제품명은 매칭됨)
            } else if (!searchTitleLower || searchTitleLower.length < 2) {
              // 제품명 검색어가 없거나 너무 짧으면 초보자 관련 키워드만 있어도 포함
              if (hasBeginnerMatch) {
                score = 1
                console.log(`[S3 검색] 초보자 키워드만으로 포함: "${item.title || item.name}"`)
              }
            }
          }
          
          // 브랜드 매칭
          if (brand && searchBrandLower) {
            if (brand.includes(searchBrandLower) || searchBrandLower.includes(brand)) {
              score += 5
            }
          }
          
          // 가격 필터링
          if (priceRange) {
            // 가격 필드에서 숫자 추출 (다양한 형식 지원)
            const priceStr = String(item.price || item.cost || item.priceValue || item.price_value || item.price_value || '0').trim()
            
            if (!priceStr || priceStr === '0' || priceStr === '') {
              // 가격 정보가 없으면 필터링에서 제외 (가격 범위가 지정된 경우)
              console.log(`[S3 검색] 가격 정보 없음, 필터링 제외: "${item.title || item.name}"`)
              continue
            }
            
            // 가격 파싱: "50,000원", "50000", "50만원", "50만" 등 다양한 형식 지원
            let cleanPrice = 0
            
            // "만원" 또는 "만" 포함 여부 확인
            if (priceStr.includes('만') || priceStr.match(/\d+\s*만/)) {
              const manMatch = priceStr.match(/(\d+(?:[,.]?\d+)?)\s*만/i)
              if (manMatch) {
                const manValue = parseFloat(manMatch[1].replace(/,/g, ''))
                cleanPrice = manValue * 10000
              }
            } else {
              // 숫자만 추출 (쉼표, 공백, "원" 등 제거)
              const numMatch = priceStr.match(/(\d+(?:[,.]?\d+)?)/)
              if (numMatch) {
                cleanPrice = parseFloat(numMatch[1].replace(/,/g, ''))
              }
            }
            
            if (cleanPrice > 0) {
              // 가격 범위 체크
              let pricePassed = true
              
              if (priceRange.maxPrice !== null && priceRange.maxPrice !== undefined && cleanPrice > priceRange.maxPrice) {
                console.log(`[S3 검색] 가격 범위 초과: ${cleanPrice}원 > ${priceRange.maxPrice}원, 제외: "${item.title || item.name}"`)
                pricePassed = false
              }
              
              if (priceRange.minPrice !== null && priceRange.minPrice !== undefined && cleanPrice < priceRange.minPrice) {
                console.log(`[S3 검색] 가격 범위 미만: ${cleanPrice}원 < ${priceRange.minPrice}원, 제외: "${item.title || item.name}"`)
                pricePassed = false
              }
              
              if (!pricePassed) {
                continue // 가격 범위를 벗어나면 제외
              }
              
              const minPriceStr = priceRange.minPrice !== null && priceRange.minPrice !== undefined ? priceRange.minPrice : 0
              const maxPriceStr = priceRange.maxPrice !== null && priceRange.maxPrice !== undefined ? priceRange.maxPrice : '무제한'
              console.log(`[S3 검색] 가격 범위 통과: ${cleanPrice}원 (범위: ${minPriceStr}~${maxPriceStr}), 제품: "${item.title || item.name}"`)
            } else {
              // 가격을 파싱할 수 없으면 필터링에서 제외
              console.log(`[S3 검색] 가격 파싱 실패: "${priceStr}", 제외: "${item.title || item.name}"`)
              continue
            }
          }
          
          // "초보자" 요청이 있으면 최소 점수 기준을 낮춤 (0점 이상, 즉 모든 제품 포함)
          // 스틱 검색어가 있으면 최소 점수 기준을 낮춤 (1점 이상)
          // 일반 요청은 최소 3점 이상
          const minScore = hasBeginnerRequest ? 0 : (hasStickSearch ? 1 : 3)
          
          // "초보자" 요청이고 제품명 매칭이 없어도, 초보자 관련 키워드가 있으면 포함
          if (hasBeginnerRequest && score === 0) {
            const itemText = (title + ' ' + description).toLowerCase()
            const beginnerMatchKeywords = ['초보', '입문', '신규', 'beginner', 'novice', 'light', 'lightweight', '가벼운', '편한', '쉬운', 'easy', 'simple', '심플', '기본', 'basic']
            const hasBeginnerMatch = beginnerMatchKeywords.some(keyword => itemText.includes(keyword))
            if (hasBeginnerMatch) {
              score = 1 // 초보자 관련 키워드만 있어도 포함
              console.log(`[S3 검색] 초보자 키워드만으로 포함: "${item.title || item.name}"`)
            }
          }
          
          if (score >= minScore) {
            // 모든 가능한 URL 필드명 확인
            const productUrl = item.url || item.link || item.productUrl || item.product_link || item.productLink || item.product_url || item.href || item.hyperlink || item.webUrl || item.web_url || item.purchaseUrl || item.purchase_url || ''
            
            // URL 유효성 검증
            const isValidUrl = (url) => {
              if (!url || typeof url !== 'string' || url.trim() === '') return false
              const urlLower = url.toLowerCase().trim()
              // example.com, localhost, 127.0.0.1, 잘못된 URL 제외
              if (urlLower.includes('example.com') || 
                  urlLower.includes('localhost') || 
                  urlLower.includes('127.0.0.1') ||
                  urlLower.includes('0.0.0.0') ||
                  urlLower.startsWith('http://localhost') ||
                  urlLower.startsWith('https://localhost') ||
                  urlLower.startsWith('http://127.0.0.1') ||
                  urlLower.startsWith('https://127.0.0.1') ||
                  urlLower.startsWith('http://0.0.0.0') ||
                  urlLower.startsWith('https://0.0.0.0') ||
                  !urlLower.startsWith('http://') && !urlLower.startsWith('https://')) {
                return false
              }
              // 기본적인 URL 형식 검증
              try {
                const urlObj = new URL(url)
                return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
              } catch (e) {
                return false
              }
            }
            
            const validUrl = isValidUrl(productUrl) ? productUrl : ''
            
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
              유효한URL: validUrl || '없음',
              전체키: Object.keys(item).filter(k => k.toLowerCase().includes('url') || k.toLowerCase().includes('link') || k.toLowerCase().includes('href'))
            })
            
            // URL이 없거나 유효하지 않으면 제외 (가격 범위 검색이 아닌 경우에만)
            if (!validUrl && priceRange) {
              console.log(`[S3 검색] URL이 없거나 유효하지 않음, 제외: "${item.title || item.name}"`)
              continue
            }
            
            products.push({
              ...item,
              title: item.title || item.name || item.product_name || item.productName || '',
              brand: item.brand || item.brandName || item.manufacturer || item.brand_name || '',
              url: validUrl,
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
    
    // "초보자" 요청이 있으면 더 많은 결과 반환 (최대 20개)
    const maxResults = hasBeginnerRequest ? 20 : 10
    return products.slice(0, maxResults)
    
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

    // "초보자" 키워드 감지
    const userInputLower = userInput.toLowerCase()
    const beginnerKeywords = ['초보자', '초보', '입문', '입문자', '신규', 'beginner', 'novice']
    const hasBeginnerRequest = beginnerKeywords.some(keyword => userInputLower.includes(keyword))
    
    if (hasBeginnerRequest) {
      console.log('[장비 추천] 초보자 요청 감지:', userInput)
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
            
            // 가격 추출: "가격: 50,000원" 또는 "50만원" 형식
            const priceMatch = trimmed.match(/가격[:\s]*([0-9,]+(?:\s*(?:만원|원|만))?)/i) || trimmed.match(/([0-9,]+)\s*(만원|원|만)/i)
            let price = ''
            if (priceMatch) {
              price = priceMatch[1] + (priceMatch[2] || '')
            }
            
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
              price: price || '',
              url: '',
              reason: reason
            }
          })
      }
      
      // 추천 항목이 비어있으면 원본 텍스트를 하나의 항목으로
      // "초보자" 요청이 있으면 "초보자" 키워드로 검색 시도
      if (recommendations.length === 0) {
        if (hasBeginnerRequest) {
          console.log('[장비 추천] Bedrock Agent 응답이 비어있고 초보자 요청이 있음, "초보자" 키워드로 검색 시도')
          // "초보자" 키워드로 기본 추천 항목 생성
          recommendations = [{
            id: 1,
            title: '초보자',
            brand: '',
            category: '',
            price: '',
            url: '',
            reason: '초보자용 장비를 검색 중입니다.'
          }]
        } else {
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
      
      // 사용자 입력에서 "초보자" 키워드 감지
      const userInputLower = (userInput || '').toLowerCase()
      const beginnerKeywords = ['초보자', '초보', '입문', '입문자', '신규', 'beginner', 'novice']
      const hasBeginnerRequest = beginnerKeywords.some(keyword => userInputLower.includes(keyword))
      
      // S3에서 직접 상품 데이터 검색
      for (let i = 0; i < recommendations.length; i++) {
        const item = recommendations[i]
        let searchTitle = item.title || ''
        const searchBrand = item.brand || ''
        
        // "초보자" 요청이 있고 제품명에 "초보자" 키워드가 없으면 보완
        if (hasBeginnerRequest && searchTitle && !beginnerKeywords.some(k => searchTitle.toLowerCase().includes(k))) {
          // 제품명에 "초보자용" 같은 키워드가 없으면 원본 제품명 유지 (S3 검색 로직에서 처리)
          console.log(`[${i + 1}] 초보자 요청 감지, 제품명: "${searchTitle}"`)
        }
        
        // "초보자" 요청이 있고 제품명이 비어있거나 너무 짧으면 카테고리 없이 전체 검색
        if (hasBeginnerRequest && (!searchTitle || searchTitle.length < 2)) {
          // 제품명이 없으면 카테고리 없이 전체 검색 (초보자 관련 제품 찾기)
          searchTitle = ''
          console.log(`[${i + 1}] 제품명이 없어서 카테고리 없이 전체 검색 시도 (초보자 요청)`)
        }
        
        // "초보자" 요청이고 제품명이 있으면, 카테고리 제한 없이 검색
        const searchCategory = hasBeginnerRequest ? null : (item.category || null)
        
        if (!searchTitle && !hasBeginnerRequest) continue
        
        console.log(`[${i + 1}] S3에서 상품 검색 중: 제품명="${searchTitle}", 브랜드="${searchBrand}"`)
        
        try {
          // 원본 검색어(userInput)를 함께 전달하여 "초보자" 키워드 감지
          // "초보자" 요청이면 카테고리 제한 없이 검색
          const foundProducts = await searchProductsFromS3(searchTitle || '', searchBrand, searchCategory, userInput)
          
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
    
    // URL 유효성 검증 함수
    const isValidUrl = (url) => {
      if (!url || typeof url !== 'string' || url.trim() === '') return false
      const urlLower = url.toLowerCase().trim()
      // example.com, localhost, 127.0.0.1, 잘못된 URL 제외
      if (urlLower.includes('example.com') || 
          urlLower.includes('localhost') || 
          urlLower.includes('127.0.0.1') ||
          urlLower.includes('0.0.0.0') ||
          urlLower.startsWith('http://localhost') ||
          urlLower.startsWith('https://localhost') ||
          urlLower.startsWith('http://127.0.0.1') ||
          urlLower.startsWith('https://127.0.0.1') ||
          urlLower.startsWith('http://0.0.0.0') ||
          urlLower.startsWith('https://0.0.0.0') ||
          !urlLower.startsWith('http://') && !urlLower.startsWith('https://')) {
        return false
      }
      // 기본적인 URL 형식 검증
      try {
        const urlObj = new URL(url)
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
      } catch (e) {
        return false
      }
    }
    
    // S3에서 직접 상품 데이터 검색
    console.log('=== S3에서 상품 URL 검색 시작 ===')
    
    const validProducts = []
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i]
      const searchTitle = product.title || ''
      const searchBrand = product.brand || ''
      
      if (!searchTitle || searchTitle === '상품명 없음') continue
      
      console.log(`[${i + 1}] S3에서 상품 검색 중: 제품명="${searchTitle}", 브랜드="${searchBrand}"`)
      
      try {
        // originalUserInput을 전달하여 가격 범위 필터링 활성화
        const foundProducts = await searchProductsFromS3(searchTitle, searchBrand, product.category || null, userInput)
        
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
          
          // URL 유효성 검증
          const validUrl = isValidUrl(productUrl) ? productUrl : ''
          
          // URL이 없거나 유효하지 않으면 제외 (가격 범위 검색인 경우)
          const priceRange = parsePriceRange(userInput)
          if (!validUrl && priceRange) {
            console.log(`[${i + 1}] ⚠️  URL이 없거나 유효하지 않아 제외: "${bestMatch.title || 'N/A'}"`)
            continue
          }
          
          if (validUrl) {
            products[i].url = validUrl
            console.log(`[${i + 1}] ✅ URL 업데이트: ${validUrl.substring(0, 100)}`)
          } else {
            console.log(`[${i + 1}] ⚠️  URL이 없거나 유효하지 않음:`, productUrl || '빈 문자열')
            // 가격 범위 검색이 아니면 URL이 없어도 포함
            if (!priceRange) {
              products[i].url = ''
            } else {
              continue // 가격 범위 검색인 경우 URL이 없으면 제외
            }
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
          
          // URL이 유효한 제품만 validProducts에 추가
          if (validUrl) {
            validProducts.push(products[i])
          }
        } else {
          console.log(`[${i + 1}] ⚠️  S3에서 제품을 찾을 수 없음`)
          // S3에서 찾지 못했지만 Bedrock Agent 응답에 URL이 있으면 포함
          const priceRange = parsePriceRange(userInput)
          if (!priceRange || isValidUrl(products[i].url)) {
            validProducts.push(products[i])
          }
        }
      } catch (error) {
        console.error(`[${i + 1}] S3 검색 오류:`, error.message)
        // 오류가 발생해도 Bedrock Agent 응답에 URL이 있으면 포함
        const priceRange = parsePriceRange(userInput)
        if (!priceRange || isValidUrl(products[i].url)) {
          validProducts.push(products[i])
        }
      }
    }
    
    // 최종 응답: URL이 유효한 제품만 반환 (가격 범위 검색인 경우)
    const priceRange = parsePriceRange(userInput)
    const finalProducts = priceRange 
      ? validProducts.filter(p => isValidUrl(p.url))
      : validProducts.length > 0 ? validProducts : products.filter(p => isValidUrl(p.url) || !p.url)
    
    console.log(`[상품 추천] 최종 제품 수: ${finalProducts.length}개 (원본: ${products.length}개)`)
    
    res.json({
      query_summary: productData.query_summary || userInput,
      products: finalProducts
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


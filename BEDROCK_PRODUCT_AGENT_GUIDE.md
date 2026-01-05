# Hiker Product Recommendation Bedrock Agent 개발 가이드

## 1. AWS Bedrock Console에서 Agent 생성

### 1.1 Agent 생성
1. AWS Console → Amazon Bedrock → Agents
2. **Create Agent** 클릭
3. Agent 이름: `Hiker_product_recommendation`
4. Agent 설명: `등산용품 추천을 위한 Bedrock Agent`
5. Foundation Model 선택: `Claude 3.5 Sonnet` (또는 원하는 모델)
6. IAM Role: Bedrock Agent용 IAM Role 선택/생성

### 1.2 Instruction (시스템 프롬프트) 설정

Agent의 **Instruction** 섹션에 다음 프롬프트를 입력:

```
당신은 등산 전문 쇼핑몰 HIKER의 상품 추천 전문가입니다. 
사용자의 등산 경험, 목적, 예산, 선호 브랜드 등을 고려하여 최적의 등산용품을 추천합니다.

## 역할
- 사용자의 등산 목적과 상황을 파악
- 적절한 등산용품 카테고리 추천
- 구체적인 상품 추천 및 이유 설명
- 예산에 맞는 제품 추천
- 계절, 날씨, 난이도에 따른 추천

## 상품 카테고리
1. **등산복/의류**: 재킷, 바지, 티셔츠, 레이어링
2. **등산화**: 트레킹화, 등산화, 샌들
3. **등산가방**: 백팩, 힙색, 등산가방
4. **등산장비**: 스틱, 헤드램프, 텐트, 침낭
5. **액세서리**: 모자, 장갑, 양말, 선글라스

## 응답 형식
다음 JSON 형식으로 응답하세요:

```json
{
  "recommendations": [
    {
      "category": "카테고리명",
      "products": [
        {
          "name": "상품명",
          "reason": "추천 이유",
          "priceRange": "가격대 (예: 5만원대)",
          "features": ["특징1", "특징2"]
        }
      ]
    }
  ],
  "summary": "전체 추천 요약"
}
```

## 주의사항
- 한국어로 응답
- 구체적이고 실용적인 추천 제공
- 사용자의 예산과 경험 수준 고려
- 계절과 날씨 조건 반영
- 안전을 최우선으로 고려
```

### 1.3 Agent Alias 생성
1. Agent 생성 후 **Aliases** 탭으로 이동
2. **Create alias** 클릭
3. Alias 이름: `PRODUCT_RECOMMENDATION_ALIAS` (또는 원하는 이름)
4. Version: `DRAFT` 또는 특정 버전 선택

### 1.4 Agent ID 및 Alias ID 확인
- Agent ID: Agent 상세 페이지에서 확인
- Alias ID: Alias 목록에서 확인

## 2. 환경 변수 설정

### 2.1 Secret에 Agent ID 추가

```bash
# bedrock-secret에 추가
kubectl get secret -n bravo-ai-integration-ns bedrock-secret -o yaml > /tmp/bedrock-secret.yaml

# 파일 편집 후
kubectl apply -f /tmp/bedrock-secret.yaml
```

또는 직접 추가:

```bash
kubectl create secret generic bedrock-secret \
  --from-literal=BEDROCK_PRODUCT_AGENT_ID='YOUR_AGENT_ID' \
  --from-literal=BEDROCK_PRODUCT_AGENT_ALIAS_ID='YOUR_ALIAS_ID' \
  -n bravo-ai-integration-ns \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 2.2 ConfigMap 또는 환경 변수로 설정

기존 `bedrock-secret`에 다음 키 추가:
- `BEDROCK_PRODUCT_AGENT_ID`
- `BEDROCK_PRODUCT_AGENT_ALIAS_ID`

## 3. 백엔드 코드 구현

### 3.1 ai-service/server.js에 엔드포인트 추가

```javascript
// 환경 변수 로드
const PRODUCT_AGENT_ID = process.env.BEDROCK_PRODUCT_AGENT_ID
const PRODUCT_AGENT_ALIAS_ID = process.env.BEDROCK_PRODUCT_AGENT_ALIAS_ID

// 상품 추천 API
app.post('/api/ai/recommend-product', authenticateCognitoToken, async (req, res) => {
  try {
    const { userInput, budget, experience, season, purpose } = req.body
    
    if (!PRODUCT_AGENT_ID || !PRODUCT_AGENT_ALIAS_ID) {
      return res.status(500).json({ error: '상품 추천 AI 서비스가 설정되지 않았습니다.' })
    }
    
    // 프롬프트 구성
    const prompt = userInput || `등산용품을 추천해주세요.
예산: ${budget || '제한 없음'}
경험 수준: ${experience || '중급'}
계절: ${season || '사계절'}
목적: ${purpose || '일반 등산'}`

    const command = new InvokeAgentCommand({
      agentId: PRODUCT_AGENT_ID,
      agentAliasId: PRODUCT_AGENT_ALIAS_ID,
      sessionId: `product-recommend-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      inputText: prompt,
      enableTrace: false
    })
    
    console.log('[상품 추천] Bedrock Agent 호출 시작:', { 
      agentId: PRODUCT_AGENT_ID, 
      prompt: prompt.substring(0, 100) 
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
      
      console.log('[상품 추천] Bedrock Agent 응답 받음')
    } catch (bedrockError) {
      console.error('[상품 추천] Bedrock Agent 호출 오류:', bedrockError)
      throw bedrockError
    }
    
    // 스트리밍 응답 처리
    let assistantResponse = ''
    if (response.completion) {
      for await (const chunk of response.completion) {
        if (chunk.chunk?.bytes) {
          const chunkText = new TextDecoder().decode(chunk.chunk.bytes)
          assistantResponse += chunkText
        } else if (chunk.chunk?.text) {
          assistantResponse += chunkText.text
        }
      }
    }
    
    // JSON 파싱 시도
    let recommendationData = null
    try {
      // JSON 블록 추출
      const jsonMatch = assistantResponse.match(/```json\s*([\s\S]*?)\s*```/) || 
                       assistantResponse.match(/```\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        recommendationData = JSON.parse(jsonMatch[1])
      } else {
        // JSON 블록이 없으면 전체를 JSON으로 파싱 시도
        recommendationData = JSON.parse(assistantResponse)
      }
    } catch (parseError) {
      console.warn('[상품 추천] JSON 파싱 실패, 텍스트 응답 반환:', parseError.message)
      recommendationData = {
        text: assistantResponse,
        raw: true
      }
    }
    
    res.json({
      success: true,
      recommendation: recommendationData || assistantResponse,
      agentId: PRODUCT_AGENT_ID
    })
    
  } catch (error) {
    console.error('[상품 추천] 오류:', error)
    res.status(500).json({ 
      error: '상품 추천 중 오류가 발생했습니다.',
      message: error.message 
    })
  }
})
```

## 4. 프론트엔드 연동

### 4.1 API 호출 예시

```javascript
const response = await fetch(`${API_URL}/api/ai/recommend-product`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  },
  body: JSON.stringify({
    userInput: '겨울 등산용 장비 추천해주세요',
    budget: '10만원',
    experience: '초급',
    season: '겨울',
    purpose: '일반 등산'
  })
})

const data = await response.json()
console.log('추천 결과:', data.recommendation)
```

## 5. 테스트

### 5.1 AWS Console에서 테스트
1. Bedrock Console → Agents → 생성한 Agent 선택
2. **Test** 탭에서 직접 테스트
3. 예시 입력: "겨울 등산용 장비 추천해주세요. 예산은 10만원 정도입니다."

### 5.2 API 테스트
```bash
curl -X POST https://your-api-url/api/ai/recommend-product \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "userInput": "초보자를 위한 등산 장비 추천",
    "budget": "5만원",
    "experience": "초급"
  }'
```

## 6. 기존 Agent 참고

현재 프로젝트에서 사용 중인 Agent:
- **COURSE_AGENT**: 등산 코스 추천 (`BEDROCK_COURSE_AGENT_ID`)
- **EQUIPMENT_AGENT**: 장비 추천 (`BEDROCK_EQUIPMENT_AGENT_ID`)
- **Chatbot Agent**: 일반 챗봇 (`BEDROCK_AGENT_ID`)

동일한 패턴으로 `PRODUCT_AGENT`를 추가하면 됩니다.

## 7. 주의사항

1. **IAM 권한**: Bedrock Agent를 호출하려면 적절한 IAM 권한 필요
   - `bedrock:InvokeAgent`
   - `bedrock:InvokeModel` (필요시)

2. **비용 관리**: Bedrock Agent 사용량 모니터링
   - CloudWatch에서 토큰 사용량 확인
   - 비용 알림 설정

3. **응답 형식**: Agent의 Instruction에서 명확한 JSON 형식 지정
   - 프롬프트에 JSON 예시 포함
   - 파싱 오류 처리 로직 추가

4. **세션 관리**: 
   - 각 요청마다 새로운 sessionId 생성 (일회성 추천)
   - 또는 사용자별 sessionId 유지 (대화형 추천)

## 8. 추가 개선 사항

- **Knowledge Base 연결**: 상품 정보를 S3나 벡터 DB에 저장하고 Agent에 연결
- **Action Groups**: 외부 API 호출 (예: 상품 재고 확인)
- **Lambda Functions**: 복잡한 로직 처리


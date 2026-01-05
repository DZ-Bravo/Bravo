# Bedrock Agent 응답 형식 요구사항

## 장비 추천 Agent (EQUIPMENT_AGENT_ID)

### 요구되는 응답 형식

Bedrock Agent는 **반드시 JSON 형식**으로 응답해야 하며, 다음 중 하나의 형식을 사용해야 합니다:

#### 형식 1: recommendations 배열
```json
{
  "recommendations": [
    {
      "title": "제품명",
      "brand": "브랜드명",
      "category": "shoes|top|bottom|goods",
      "price": "가격 (예: 152,200)",
      "url": "https://...",
      "reason": "추천 이유"
    }
  ]
}
```

#### 형식 2: items 배열
```json
{
  "items": [
    {
      "title": "제품명",
      "brand": "브랜드명",
      "category": "shoes|top|bottom|goods",
      "price": "가격",
      "url": "https://...",
      "reason": "추천 이유"
    }
  ]
}
```

#### 형식 3: products 배열
```json
{
  "products": [
    {
      "title": "제품명",
      "brand": "브랜드명",
      "category": "shoes|top|bottom|goods",
      "price": "가격",
      "url": "https://...",
      "reason": "추천 이유"
    }
  ]
}
```

#### 형식 4: 직접 배열
```json
[
  {
    "title": "제품명",
    "brand": "브랜드명",
    "category": "shoes|top|bottom|goods",
    "price": "가격",
    "url": "https://...",
    "reason": "추천 이유"
  }
]
```

### 중요 사항

1. **title, brand, category, price는 필수입니다**
   - 이 필드들이 정확해야 Store Service API에서 매칭되는 제품을 찾을 수 있습니다.

2. **url은 선택사항입니다**
   - url이 없거나 example.com인 경우, 백엔드가 Store Service API를 통해 자동으로 검색하여 URL을 찾습니다.

3. **JSON 코드 블록 사용 가능**
   - Agent가 ```json ... ``` 형식으로 응답해도 파싱됩니다.

4. **reason은 추천 이유를 설명하는 필드입니다**
   - 사용자에게 왜 이 제품을 추천하는지 설명합니다.

## 상품 추천 Agent (PRODUCT_AGENT_ID / Hiker_product_recommendation)

### 요구되는 응답 형식

```json
{
  "query_summary": "사용자 요청 요약",
  "products": [
    {
      "title": "상품명",
      "brand": "브랜드명",
      "category": "shoes|top|bottom|goods",
      "price": "92,700",
      "url": "https://...",
      "reason": "추천 이유"
    }
  ]
}
```

### 중요 사항

1. **query_summary**: 사용자의 요청을 요약한 텍스트
2. **products**: 추천 상품 배열
3. **title, brand, category, price는 정확해야 함**
4. **url이 없으면 Store Service API로 자동 검색**

## 백엔드 처리 로직

1. Bedrock Agent 응답을 JSON으로 파싱
2. 각 추천 항목에 대해:
   - title, brand, category, price가 있으면 Store Service API로 검색
   - 매칭되는 제품을 찾으면 URL, 가격, 브랜드 정보 업데이트
   - 매칭 점수 5점 이상이어야 업데이트됨

## Store Service API 검색 로직

- 검색 쿼리: `{brand} {title}` 형식
- 매칭 점수:
  - 제품명 매칭: 10점
  - 브랜드 매칭: 5점
  - 최소 5점 이상이어야 URL 업데이트

## 문제 해결

만약 URL이 계속 없다면:

1. **Bedrock Agent Instruction 확인**
   - Agent가 올바른 JSON 형식으로 응답하도록 Instruction 설정
   - title, brand, category, price가 정확하게 포함되도록 지시

2. **로그 확인**
   - `=== 장비 추천 Bedrock 원본 응답 ===` 로그에서 Agent 응답 형식 확인
   - `Store Service 검색 중` 로그에서 검색 쿼리 확인
   - `제품 찾음` 또는 `유사한 제품을 찾지 못함` 로그 확인

3. **Store Service API 확인**
   - Store Service가 정상 동작하는지 확인
   - Elasticsearch에 해당 제품이 있는지 확인


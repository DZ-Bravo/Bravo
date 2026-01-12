# 검색 플로우 (Search Flow)

## ✅ 실제 구현된 검색 구조

### 1. 사용자 검색 요청 순서

```
1. 사용자 (브라우저)
   ↓
2. Frontend (Home.jsx 또는 SearchResults.jsx)
   - 검색어 입력
   - /search?q={검색어}로 이동
   ↓
3. Frontend → Backend (통합 검색 API)
   GET /api/posts/unified-search?q={검색어}&limit=1000
   ↓
4. Community Service (posts.js)
   - 통합 검색 API 엔드포인트
   - 3가지 검색을 병렬로 수행:
     ├─ 게시글 검색
     ├─ 산 검색
     └─ 상품 검색
   ↓
5. 검색 결과 통합 및 반환
   ↓
6. Frontend에서 결과 표시
```

---

## 2. 상세 검색 플로우

### 2-1. 게시글 검색 (Posts Search)

```
Community Service (/api/posts/unified-search)
  ↓
1. Elasticsearch 클라이언트 확인
  ↓
2-1. Elasticsearch 사용 가능 시:
   ├─ 인덱스: 'posts'
   ├─ 검색 필드: ['title^3', 'content']
   │   └─ title에 3배 가중치 부여
   ├─ Fuzzy Search 쿼리 생성
   ├─ 검색 실행 (최대 100개)
   ├─ MongoDB에서 상세 정보 조회
   │   └─ Post.find({ _id: { $in: postIds } })
   │   └─ populate('author')
   └─ 점수 순으로 정렬
  ↓
2-2. Elasticsearch 실패 시 MongoDB 폴백:
   ├─ Post.find({
   │     $or: [
   │       { title: { $regex: query, $options: 'i' } },
   │       { content: { $regex: query, $options: 'i' } }
   │     ]
   │   })
   └─ 최신순 정렬
  ↓
3. 결과 반환
```

### 2-2. 산 검색 (Mountains Search)

```
Community Service (/api/posts/unified-search)
  ↓
1. Elasticsearch 클라이언트 확인
  ↓
2-1. Elasticsearch 사용 가능 시:
   ├─ 인덱스: 'mountains'
   ├─ 검색 필드: ['name^3', 'location^2', 'description']
   │   └─ name에 3배 가중치 부여
   ├─ Fuzzy Search 쿼리 생성
   ├─ 검색 실행 (최대 100개)
   ├─ 검색어로 필터링 (정확도 향상)
   └─ 시작 부분 일치 우선 정렬
  ↓
2-2. Elasticsearch 실패 시 Mountain Service API 폴백:
   ├─ GET /api/mountains (전체 산 데이터)
   ├─ 클라이언트 측 필터링
   │   └─ mountain.name.includes(searchTerm)
   └─ 시작 부분 일치 우선 정렬
  ↓
3. 결과 반환
```

### 2-3. 상품 검색 (Products Search)

```
Community Service (/api/posts/unified-search)
  ↓
1. Store Service API 직접 호출
   GET /api/store/search?q={검색어}&limit={limit}
   (내부 네트워크: http://store-service:3006)
  ↓
2. Store Service 내부 처리:
   ├─ Elasticsearch 클라이언트 확인
   ├─ 인덱스: 'products'
   ├─ 검색 필드: ['title^3', 'brand^2', 'description']
   │   └─ title에 3배 가중치 부여
   ├─ 카테고리 필터 (선택적)
   ├─ 검색 실행 (최대 50개)
   ├─ MongoDB에서 상세 정보 조회
   │   └─ 각 카테고리 컬렉션에서 조회
   │   └─ 썸네일 정보 추가
   └─ 점수 순으로 정렬
  ↓
3. Elasticsearch 실패 시 MongoDB 폴백:
   ├─ 모든 카테고리 컬렉션 조회
   │   └─ shoes, top, bottom, goods
   ├─ 정규식 검색
   │   └─ { title: { $regex: query, $options: 'i' } }
   └─ 썸네일 정보 추가
  ↓
4. 결과 반환
```

---

## 3. 통합 검색 API 응답 형식

```json
{
  "mountains": [
    {
      "id": "287201304",
      "name": "북한산",
      "code": "287201304",
      "location": "서울특별시 강북구",
      "height": "836m",
      "image": "https://..."
    }
  ],
  "posts": [
    {
      "id": "...",
      "title": "...",
      "content": "...",
      "previewContent": "...",
      "author": { "id": "...", "name": "..." },
      "thumbnailImage": "https://...",
      "date": "2024-01-01",
      "_score": 12.5
    }
  ],
  "products": [
    {
      "id": "...",
      "title": "...",
      "brand": "...",
      "price": 129000,
      "thumbnails": "https://...",
      "category": "shoes",
      "_score": 8.3
    }
  ],
  "total": 150
}
```

---

## 4. 검색 기술 스택

### 4-1. Elasticsearch
- **역할**: 주요 검색 엔진
- **인덱스**:
  - `posts`: 게시글 검색
  - `mountains`: 산 검색
  - `products`: 상품 검색
- **특징**:
  - Fuzzy Search 지원
  - 필드별 가중치 설정 (title^3, brand^2 등)
  - 점수 기반 정렬
  - 타임아웃: 5초

### 4-2. MongoDB (폴백)
- **역할**: Elasticsearch 실패 시 폴백
- **사용**:
  - 게시글: 정규식 검색
  - 산: Mountain Service API 호출
  - 상품: 정규식 검색 (모든 카테고리)

### 4-3. 검색 유틸리티
- **파일**: `services/shared/utils/search.js`
- **함수**:
  - `buildFuzzySearchQuery()`: Fuzzy Search 쿼리 생성
  - `search()`: Elasticsearch 검색 실행
  - `getElasticsearchClient()`: Elasticsearch 클라이언트 반환

---

## 5. 검색 플로우 다이어그램

```
┌─────────────┐
│   사용자    │
│  (브라우저) │
└──────┬──────┘
       │ 검색어 입력
       ↓
┌─────────────────────┐
│   Frontend          │
│  (SearchResults.jsx) │
└──────┬──────────────┘
       │ GET /api/posts/unified-search?q={검색어}
       ↓
┌─────────────────────────────────────┐
│   Community Service                 │
│   (posts.js - unified-search)       │
└──────┬──────────────────────────────┘
       │
       ├─────────────────┬─────────────────┐
       ↓                 ↓                 ↓
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ 게시글 검색 │  │  산 검색    │  │ 상품 검색    │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                 │
       ├─ Elasticsearch │                 │
       │  (posts 인덱스)│                 │
       │                │                 │
       ├─ MongoDB 폴백  │                 │
       │  (정규식 검색) │                 │
       │                │                 │
       │                ├─ Elasticsearch  │
       │                │  (mountains 인덱스)
       │                │                 │
       │                ├─ Mountain API   │
       │                │  폴백           │
       │                │                 │
       │                │                 ├─ Store Service API
       │                │                 │  (내부 호출)
       │                │                 │
       │                │                 ├─ Elasticsearch
       │                │                 │  (products 인덱스)
       │                │                 │
       │                │                 └─ MongoDB 폴백
       │                │                    (정규식 검색)
       │                │
       └────────────────┴─────────────────┘
                        │
                        ↓
              ┌─────────────────┐
              │  결과 통합       │
              │  { mountains,    │
              │    posts,        │
              │    products }    │
              └────────┬─────────┘
                       │
                       ↓
              ┌─────────────────┐
              │   Frontend       │
              │   결과 표시       │
              └─────────────────┘
```

---

## 6. 검색 최적화 전략

### 6-1. 성능 최적화
- **Elasticsearch 우선 사용**: 빠른 검색 속도
- **결과 제한**: 
  - 게시글: 최대 100개
  - 산: 최대 100개
  - 상품: 최대 50개
- **타임아웃 설정**: 5초
- **폴백 메커니즘**: Elasticsearch 실패 시 MongoDB로 자동 전환

### 6-2. 검색 정확도 향상
- **필드별 가중치**: 
  - 제목(title): 3배
  - 브랜드(brand): 2배
  - 위치(location): 2배
- **정확 매칭 우선**: `exactMatch: true`
- **시작 부분 일치 우선 정렬**: 검색어로 시작하는 결과 우선 표시

### 6-3. 사용자 경험
- **통합 검색**: 한 번의 요청으로 산, 게시글, 상품 모두 검색
- **최근 검색어 저장**: localStorage에 최근 10개 저장
- **로딩 상태 표시**: 검색 중 로딩 인디케이터
- **폴백 처리**: 검색 실패 시에도 결과 표시

---

## 7. 주요 엔드포인트

### 7-1. 통합 검색 API
```
GET /api/posts/unified-search
Query Parameters:
  - q: 검색어 (필수)
  - limit: 결과 제한 (기본값: 1000)
```

### 7-2. 게시글 검색 API
```
GET /api/posts/search
Query Parameters:
  - q: 검색어 (필수)
  - page: 페이지 번호 (기본값: 1)
  - limit: 페이지당 결과 수 (기본값: 20)
```

### 7-3. 상품 검색 API
```
GET /api/store/search
Query Parameters:
  - q: 검색어 (필수)
  - page: 페이지 번호 (기본값: 1)
  - limit: 페이지당 결과 수 (기본값: 20)
  - category: 카테고리 필터 (선택적)
```

---

## 8. 검색 플로우 요약

```
1. 사용자가 검색어 입력
   ↓
2. Frontend에서 통합 검색 API 호출
   ↓
3. Community Service에서 3가지 검색 병렬 수행:
   ├─ 게시글: Elasticsearch → MongoDB 폴백
   ├─ 산: Elasticsearch → Mountain API 폴백
   └─ 상품: Store Service API → Elasticsearch → MongoDB 폴백
   ↓
4. 결과 통합 및 반환
   ↓
5. Frontend에서 결과 표시
```

---

## ✅ 핵심 포인트

1. **통합 검색**: 한 번의 API 호출로 산, 게시글, 상품 모두 검색
2. **Elasticsearch 우선**: 빠른 검색을 위해 Elasticsearch 사용
3. **폴백 메커니즘**: Elasticsearch 실패 시 MongoDB 또는 API로 자동 전환
4. **성능 최적화**: 결과 수 제한, 타임아웃 설정
5. **검색 정확도**: 필드별 가중치, 정확 매칭 우선



# 검색 데이터 플로우 (MongoDB → Monstache → Elasticsearch → Backend → Frontend)

## ✅ 전체 검색 데이터 플로우

### 1. 데이터 저장 및 인덱싱 플로우 (쓰기)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1단계: 데이터 생성/수정/삭제                                    │
└─────────────────────────────────────────────────────────────────┘

사용자가 게시글 작성/수정/삭제
  ↓
Backend Service (Community Service)
  ├─ POST /api/posts (게시글 작성)
  ├─ PUT /api/posts/:id (게시글 수정)
  └─ DELETE /api/posts/:id (게시글 삭제)
  ↓
MongoDB (hiking.posts 컬렉션)
  ├─ 데이터 저장/수정/삭제
  └─ Change Streams 생성 (MongoDB Replica Set)
```

```
┌─────────────────────────────────────────────────────────────────┐
│ 2단계: Monstache가 변경사항 감지                                │
└─────────────────────────────────────────────────────────────────┘

MongoDB Change Streams
  ↓
Monstache (Kubernetes Pod: bravo-efk-ns)
  ├─ MongoDB Change Streams 구독
  ├─ 변경사항 실시간 감지
  │   ├─ insert (생성)
  │   ├─ update (수정)
  │   └─ delete (삭제)
  └─ 변경된 문서 데이터 추출
```

```
┌─────────────────────────────────────────────────────────────────┐
│ 3단계: Elasticsearch 인덱싱                                     │
└─────────────────────────────────────────────────────────────────┘

Monstache
  ├─ 컬렉션 매핑 확인
  │   ├─ hiking.posts → posts 인덱스
  │   ├─ hiking.Mountain_list → mountains 인덱스
  │   └─ hiking.shoes/top/bottom/goods → products 인덱스
  ├─ Elasticsearch에 문서 인덱싱
  │   ├─ POST /posts/_doc/{_id} (생성/수정)
  │   └─ DELETE /posts/_doc/{_id} (삭제)
  └─ Elasticsearch (bravo-efk-ns)
      ├─ posts 인덱스
      ├─ mountains 인덱스
      └─ products 인덱스
```

---

### 2. 검색 요청 플로우 (읽기)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1단계: 사용자 검색 요청                                         │
└─────────────────────────────────────────────────────────────────┘

사용자 (브라우저)
  ├─ 검색어 입력: "북한산"
  └─ 검색 버튼 클릭
  ↓
Frontend (SearchResults.jsx)
  ├─ GET /api/posts/unified-search?q=북한산&limit=1000
  └─ API 호출
```

```
┌─────────────────────────────────────────────────────────────────┐
│ 2단계: Istio Gateway 라우팅                                     │
└─────────────────────────────────────────────────────────────────┘

Frontend 요청
  ↓
Istio Gateway (istio-system)
  ├─ URI 매칭: /api/posts/*
  └─ 라우팅 규칙
      ↓
Community Service (community-service:3002)
  └─ bravo-core-ns 네임스페이스
```

```
┌─────────────────────────────────────────────────────────────────┐
│ 3단계: Backend 검색 처리                                        │
└─────────────────────────────────────────────────────────────────┘

Community Service (posts.js)
  ├─ /unified-search 엔드포인트
  ├─ Elasticsearch 클라이언트 연결
  │   └─ http://elasticsearch.bravo-efk-ns.svc.cluster.local:9200
  ├─ 3가지 검색 병렬 수행:
  │   ├─ 게시글 검색
  │   │   ├─ 인덱스: posts
  │   │   ├─ 검색 필드: ['title^3', 'content']
  │   │   └─ Fuzzy Search 쿼리
  │   ├─ 산 검색
  │   │   ├─ 인덱스: mountains
  │   │   ├─ 검색 필드: ['name^3', 'location^2', 'description']
  │   │   └─ Fuzzy Search 쿼리
  │   └─ 상품 검색
  │       ├─ Store Service API 호출
  │       └─ Store Service 내부에서 Elasticsearch 검색
  └─ 결과 통합
```

```
┌─────────────────────────────────────────────────────────────────┐
│ 4단계: Elasticsearch 검색 실행                                   │
└─────────────────────────────────────────────────────────────────┘

Community Service
  ↓
Elasticsearch API 호출
  ├─ GET /posts/_search
  │   └─ Query: {
  │       "query": {
  │         "multi_match": {
  │           "query": "북한산",
  │           "fields": ["title^3", "content"]
  │         }
  │       }
  │     }
  ├─ GET /mountains/_search
  │   └─ Query: {
  │       "query": {
  │         "multi_match": {
  │           "query": "북한산",
  │           "fields": ["name^3", "location^2", "description"]
  │         }
  │       }
  │     }
  └─ Elasticsearch (bravo-efk-ns)
      ├─ 인덱스 검색
      ├─ 점수 계산 (_score)
      ├─ 결과 정렬
      └─ 결과 반환
```

```
┌─────────────────────────────────────────────────────────────────┐
│ 5단계: MongoDB에서 상세 정보 조회                                │
└─────────────────────────────────────────────────────────────────┘

Elasticsearch 검색 결과
  ├─ 문서 ID 목록 반환
  │   └─ ["507f1f77bcf86cd799439011", "507f191e810c19729de860ea", ...]
  ↓
Community Service
  ├─ MongoDB에서 상세 정보 조회
  │   └─ Post.find({ _id: { $in: [ObjectId(...), ...] } })
  │       .populate('author')
  │       .select('title content category author authorName views likes createdAt images')
  └─ Elasticsearch 점수와 MongoDB 데이터 결합
```

```
┌─────────────────────────────────────────────────────────────────┐
│ 6단계: 결과 반환 및 표시                                         │
└─────────────────────────────────────────────────────────────────┘

Community Service
  ├─ 결과 통합
  │   └─ {
  │       "mountains": [...],
  │       "posts": [...],
  │       "products": [...],
  │       "total": 150
  │     }
  └─ JSON 응답 반환
      ↓
Frontend (SearchResults.jsx)
  ├─ 검색 결과 수신
  ├─ 결과 표시
  │   ├─ 산 결과
  │   ├─ 게시글 결과
  │   └─ 상품 결과
  └─ 사용자에게 표시
```

---

## 📊 전체 플로우 다이어그램

```
┌─────────────────────────────────────────────────────────────────────┐
│                    데이터 저장 및 인덱싱 플로우                      │
└─────────────────────────────────────────────────────────────────────┘

사용자
  │ 게시글 작성
  ↓
┌─────────────────┐
│ Backend Service │ (Community Service)
│  POST /api/posts │
└────────┬────────┘
         │ MongoDB 저장
         ↓
┌─────────────────┐
│    MongoDB      │ (hiking.posts)
│  Change Streams │
└────────┬────────┘
         │ 변경사항 감지
         ↓
┌─────────────────┐
│   Monstache     │ (bravo-efk-ns)
│ Change Streams  │ 구독
│   구독 및 감지   │
└────────┬────────┘
         │ 문서 인덱싱
         ↓
┌─────────────────┐
│  Elasticsearch  │ (bravo-efk-ns)
│   posts 인덱스   │
└─────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                        검색 요청 플로우                              │
└─────────────────────────────────────────────────────────────────────┘

사용자
  │ 검색어 입력: "북한산"
  ↓
┌─────────────────┐
│    Frontend     │ (SearchResults.jsx)
│  GET /api/posts │
│ /unified-search │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Istio Gateway  │ (istio-system)
│   라우팅 규칙    │
└────────┬────────┘
         │ /api/posts → Community Service
         ↓
┌─────────────────┐
│ Community       │ (community-service:3002)
│ Service         │
│ /unified-search │
└────────┬────────┘
         │ Elasticsearch 검색
         ↓
┌─────────────────┐
│  Elasticsearch  │ (bravo-efk-ns)
│   검색 실행      │
│  GET /posts/    │
│    _search      │
└────────┬────────┘
         │ 검색 결과 (문서 ID)
         ↓
┌─────────────────┐
│ Community       │
│ Service         │
│ MongoDB 조회    │
└────────┬────────┘
         │ 상세 정보 + 점수 결합
         ↓
┌─────────────────┐
│    Frontend     │
│  결과 표시       │
└─────────────────┘
```

---

## 🔄 Monstache 동기화 매핑

### 컬렉션 → 인덱스 매핑

| MongoDB 컬렉션 | Elasticsearch 인덱스 | 설명 |
|---------------|---------------------|------|
| `hiking.posts` | `posts` | 게시글 검색용 |
| `hiking.Mountain_list` | `mountains` | 산 검색용 |
| `hiking.shoes` | `products` | 상품 검색용 (신발) |
| `hiking.top` | `products` | 상품 검색용 (상의) |
| `hiking.bottom` | `products` | 상품 검색용 (하의) |
| `hiking.goods` | `products` | 상품 검색용 (용품) |

### Monstache 설정 (config.toml)

```toml
# MongoDB 연결
mongo-url = "mongodb://mongodb.bravo-mongo-ns.svc.cluster.local:27017/hiking?replicaSet=rs0&readPreference=primaryPreferred"

# Elasticsearch 연결
elasticsearch-urls = ["http://elasticsearch.bravo-efk-ns.svc.cluster.local:9200"]

# 컬렉션 매핑
[[mapping]]
namespace = "hiking.posts"
index = "posts"

[[mapping]]
namespace = "hiking.Mountain_list"
index = "mountains"

[[mapping]]
namespace = "hiking.shoes"
index = "products"

[[mapping]]
namespace = "hiking.top"
index = "products"

[[mapping]]
namespace = "hiking.bottom"
index = "products"

[[mapping]]
namespace = "hiking.goods"
index = "products"
```

---

## 🔍 검색 상세 플로우

### 1. 게시글 검색 예시

```
사용자 검색어: "북한산 등산"
  ↓
Frontend: GET /api/posts/unified-search?q=북한산 등산
  ↓
Community Service: /unified-search 엔드포인트
  ↓
Elasticsearch 클라이언트 연결
  ├─ http://elasticsearch.bravo-efk-ns.svc.cluster.local:9200
  └─ 연결 확인
  ↓
Fuzzy Search 쿼리 생성
  ├─ 인덱스: posts
  ├─ 검색 필드: ['title^3', 'content']
  │   └─ title에 3배 가중치
  └─ 쿼리:
      {
        "query": {
          "multi_match": {
            "query": "북한산 등산",
            "fields": ["title^3", "content"],
            "fuzziness": "AUTO"
          }
        }
      }
  ↓
Elasticsearch 검색 실행
  ├─ GET /posts/_search
  ├─ 타임아웃: 5초
  ├─ 최대 결과: 100개
  └─ 정렬: _score 내림차순
  ↓
검색 결과 반환
  ├─ 문서 ID 목록
  ├─ 점수 (_score)
  └─ 총 개수 (total)
  ↓
MongoDB에서 상세 정보 조회
  ├─ Post.find({ _id: { $in: [ObjectId(...), ...] } })
  ├─ populate('author')
  └─ select('title content category author authorName views likes createdAt images')
  ↓
결과 통합
  ├─ Elasticsearch 점수 + MongoDB 데이터
  ├─ 점수 순으로 정렬
  └─ JSON 응답 생성
  ↓
Frontend에 결과 반환
  └─ { "posts": [...], "total": 25 }
```

### 2. 산 검색 예시

```
사용자 검색어: "북한산"
  ↓
Frontend: GET /api/posts/unified-search?q=북한산
  ↓
Community Service: /unified-search 엔드포인트
  ↓
Elasticsearch 클라이언트 연결
  ↓
Fuzzy Search 쿼리 생성
  ├─ 인덱스: mountains
  ├─ 검색 필드: ['name^3', 'location^2', 'description']
  └─ 쿼리:
      {
        "query": {
          "multi_match": {
            "query": "북한산",
            "fields": ["name^3", "location^2", "description"],
            "fuzziness": "AUTO"
          }
        }
      }
  ↓
Elasticsearch 검색 실행
  ├─ GET /mountains/_search
  └─ 결과 필터링 (검색어 포함 확인)
  ↓
검색 결과 반환
  └─ { "hits": [...], "total": 5 }
  ↓
Frontend에 결과 반환
  └─ { "mountains": [...], "total": 5 }
```

### 3. 상품 검색 예시

```
사용자 검색어: "등산화"
  ↓
Frontend: GET /api/posts/unified-search?q=등산화
  ↓
Community Service: /unified-search 엔드포인트
  ↓
Store Service API 호출
  ├─ GET /api/store/search?q=등산화&limit=1000
  └─ 내부 네트워크: http://store-service:3006
  ↓
Store Service 내부 처리
  ├─ Elasticsearch 클라이언트 연결
  ├─ 인덱스: products
  ├─ 검색 필드: ['title^3', 'brand^2', 'description']
  └─ Elasticsearch 검색 실행
  ↓
Elasticsearch 검색 결과
  └─ 문서 ID 목록 반환
  ↓
MongoDB에서 상세 정보 조회
  ├─ shoes, top, bottom, goods 컬렉션 조회
  └─ 썸네일 정보 추가
  ↓
Store Service 결과 반환
  └─ { "products": [...], "total": 50 }
  ↓
Community Service 결과 통합
  └─ { "products": [...], "total": 50 }
  ↓
Frontend에 결과 반환
  └─ { "products": [...], "total": 50 }
```

---

## 🛠️ 기술 스택 및 구성 요소

### 1. MongoDB
- **역할**: 메인 데이터베이스
- **컬렉션**:
  - `hiking.posts`: 게시글
  - `hiking.Mountain_list`: 산 정보
  - `hiking.shoes`, `hiking.top`, `hiking.bottom`, `hiking.goods`: 상품
- **특징**:
  - Replica Set 구성 (rs0)
  - Change Streams 활성화
  - Primary: `mongodb.bravo-mongo-ns.svc.cluster.local:27017`

### 2. Monstache
- **역할**: MongoDB → Elasticsearch 실시간 동기화
- **위치**: Kubernetes Pod (bravo-efk-ns)
- **기능**:
  - MongoDB Change Streams 구독
  - 변경사항 실시간 감지
  - Elasticsearch 자동 인덱싱
- **설정**: `k8s/efk-ns/monstache.yaml`

### 3. Elasticsearch
- **역할**: 검색 엔진
- **위치**: Kubernetes Pod (bravo-efk-ns)
- **인덱스**:
  - `posts`: 게시글 검색
  - `mountains`: 산 검색
  - `products`: 상품 검색
- **특징**:
  - Fuzzy Search 지원
  - 필드별 가중치 설정
  - 점수 기반 정렬

### 4. Backend Services
- **Community Service** (community-service:3002)
  - 통합 검색 API (`/api/posts/unified-search`)
  - 게시글 검색
  - 산 검색
  - 상품 검색 (Store Service 호출)
- **Store Service** (store-service:3006)
  - 상품 검색 API (`/api/store/search`)
  - Elasticsearch 검색
  - MongoDB 상세 정보 조회

### 5. Frontend
- **SearchResults.jsx**
  - 검색 결과 표시
  - 통합 검색 API 호출
  - 결과 렌더링

---

## ⚡ 성능 최적화

### 1. Elasticsearch 우선 사용
- 빠른 검색 속도
- Fuzzy Search 지원
- 점수 기반 정렬

### 2. 폴백 메커니즘
- Elasticsearch 실패 시 MongoDB로 자동 전환
- 검색 서비스 가용성 보장

### 3. 결과 제한
- 게시글: 최대 100개
- 산: 최대 100개
- 상품: 최대 50개
- 타임아웃: 5초

### 4. 실시간 동기화
- Monstache를 통한 자동 인덱싱
- 변경사항 즉시 반영
- 수동 인덱싱 불필요

---

## 📝 요약

### 데이터 저장 플로우
```
사용자 작성 → Backend → MongoDB → Monstache → Elasticsearch
```

### 검색 플로우
```
사용자 검색 → Frontend → Backend → Elasticsearch → MongoDB → Frontend
```

### 핵심 포인트
1. **MongoDB**: 메인 데이터 저장소
2. **Monstache**: 실시간 동기화 (MongoDB → Elasticsearch)
3. **Elasticsearch**: 검색 엔진 (빠른 검색)
4. **Backend**: 검색 요청 처리 및 결과 통합
5. **Frontend**: 검색 결과 표시

---

## ✅ 검증 방법

### 1. Monstache 동기화 확인
```bash
# Monstache 로그 확인
kubectl logs -n bravo-efk-ns -l app=monstache --tail=50

# Elasticsearch 인덱스 문서 수 확인
curl http://elasticsearch.bravo-efk-ns.svc.cluster.local:9200/posts/_count
curl http://elasticsearch.bravo-efk-ns.svc.cluster.local:9200/mountains/_count
curl http://elasticsearch.bravo-efk-ns.svc.cluster.local:9200/products/_count
```

### 2. 검색 동작 확인
```bash
# 통합 검색 API 테스트
curl "https://hiker-cloud.site/api/posts/unified-search?q=북한산&limit=10"
```

### 3. MongoDB 변경사항 확인
```bash
# MongoDB에서 게시글 생성
# Monstache 로그에서 인덱싱 확인
# Elasticsearch에서 검색 결과 확인
```



# Elasticsearch 인덱싱 상태 및 검색 최적화

## 현재 상태

### ✅ 구현 완료
1. **인덱싱 API 구현**
   - 산 데이터 인덱싱: `POST /api/mountains/index/init`
   - 스토어 데이터 인덱싱: `POST /api/store/index/init`
   - 게시글 데이터 인덱싱: `POST /api/posts/index/init`

2. **검색 최적화 설정**
   - ✅ 오타 허용 검색 (Fuzzy Search): `fuzziness: 'AUTO'`
   - ✅ 한국어 불용어 제거 (조사, 어미 등)
   - ✅ 다중 필드 검색 (이름^3, 위치^2, 설명)
   - ✅ 정확한 매치 우선 (match_phrase)
   - ✅ 접두사 검색 지원

3. **폴백 메커니즘**
   - Elasticsearch 실패 시 MongoDB/API로 자동 폴백

### ⚠️ 실행 필요
**인덱싱이 아직 실행되지 않았습니다!**

다음 API를 호출하여 데이터를 인덱싱해야 합니다:

```bash
# 1. 산 데이터 인덱싱
curl -X POST http://localhost:3003/api/mountains/index/init \
  -H "Content-Type: application/json"

# 2. 스토어 데이터 인덱싱 (관리자 토큰 필요)
curl -X POST http://localhost:3006/api/store/index/init \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"

# 3. 게시글 데이터 인덱싱 (관리자 토큰 필요)
curl -X POST http://localhost:3002/api/posts/index/init \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

## 검색 최적화 기능

### 1. 오타 허용 검색 (Fuzzy Search)
- `fuzziness: 'AUTO'` - 자동으로 오타 허용 범위 결정
- 예: "한라산" → "한라산", "한나산" 등도 검색됨

### 2. 한국어 불용어 제거
- 조사, 어미 자동 제거: '의', '가', '이', '은', '는', '을', '를', '에', '와', '과' 등
- 검색 정확도 향상

### 3. 다중 필드 검색
- 이름 (name^3): 가중치 3배
- 위치 (location^2): 가중치 2배
- 설명 (description): 가중치 1배

### 4. 검색 우선순위
1. 정확한 매치 (match_phrase) - 가장 높은 점수
2. Fuzzy 매치 (multi_match) - 오타 허용
3. 접두사 매치 (prefix) - 낮은 점수

## 인덱스 확인

```bash
# 인덱스 목록 확인
curl http://localhost:9200/_cat/indices?v

# 인덱스 문서 수 확인
curl http://localhost:9200/mountains/_count
curl http://localhost:9200/products/_count
curl http://localhost:9200/posts/_count
```

## 문제 해결

### 인덱스가 없는 경우
1. 인덱싱 API 호출
2. Elasticsearch 로그 확인
3. MongoDB 연결 확인

### 검색이 안 되는 경우
1. 인덱스 존재 여부 확인
2. Elasticsearch 연결 확인
3. 폴백 로직 확인 (자동으로 API 호출로 전환됨)


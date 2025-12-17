# Elasticsearch 인덱싱 가이드

MongoDB에 있는 기존 데이터를 Elasticsearch로 인덱싱하는 방법입니다.

## 인덱싱이 필요한 이유

Elasticsearch는 검색을 위해 데이터를 인덱싱해야 합니다. MongoDB에 있는 기존 데이터를 Elasticsearch로 옮겨야 검색이 가능합니다.

## 인덱싱 대상

1. **게시글 (Posts)**: 커뮤니티 게시글 검색용
2. **상품 (Products)**: 스토어 상품 검색용
3. **산 정보 (Mountains)**: 산 검색용 (선택적)

## 인덱싱 방법

### 1. 게시글 인덱싱

**API 엔드포인트**: `POST /api/posts/index/init`

**요청 예시**:
```bash
curl -X POST http://localhost:3002/api/posts/index/init \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

**응답 예시**:
```json
{
  "success": true,
  "message": "게시글 인덱싱 완료",
  "total": 150,
  "indexed": 150,
  "errors": 0
}
```

### 2. 상품 인덱싱

**API 엔드포인트**: `POST /api/store/index/init`

**요청 예시**:
```bash
curl -X POST http://localhost:3006/api/store/index/init \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

**응답 예시**:
```json
{
  "success": true,
  "message": "상품 인덱싱 완료",
  "totalIndexed": 500
}
```

## 자동 인덱싱

새로 생성/수정되는 데이터는 자동으로 인덱싱됩니다:
- 게시글 생성/수정 시 자동 인덱싱
- 게시글 삭제 시 자동 삭제

## 인덱싱 확인

### Kibana에서 확인

1. Kibana 접속: http://localhost:5601
2. Dev Tools에서 확인:
   ```json
   GET /posts/_count
   GET /products/_count
   ```

### API로 확인

```bash
# Elasticsearch 직접 확인
curl http://localhost:9200/posts/_count
curl http://localhost:9200/products/_count
```

## 주의사항

1. **관리자 권한 필요**: 인덱싱 API는 관리자 권한이 필요합니다.
2. **인덱싱 시간**: 데이터가 많으면 시간이 걸릴 수 있습니다.
3. **중복 인덱싱**: 같은 데이터를 여러 번 인덱싱하면 중복되지만, 같은 ID로 덮어씁니다.
4. **인덱스 삭제 후 재인덱싱**: 인덱스를 삭제하고 다시 인덱싱하려면:
   ```bash
   # 인덱스 삭제
   curl -X DELETE http://localhost:9200/posts
   curl -X DELETE http://localhost:9200/products
   
   # 다시 인덱싱
   # 위의 API 호출
   ```

## 문제 해결

### 인덱싱 실패 시

1. Elasticsearch 연결 확인:
   ```bash
   curl http://localhost:9200
   ```

2. 로그 확인:
   - 백엔드 서비스 로그 확인
   - Elasticsearch 로그 확인: `docker logs hiking-elasticsearch`

3. 인덱스 상태 확인:
   ```bash
   curl http://localhost:9200/_cat/indices?v
   ```

## 인덱싱 스크립트 (선택적)

일괄 인덱싱을 위한 스크립트를 만들 수도 있습니다:

```javascript
// scripts/index-all.js
import axios from 'axios'

const API_BASE = 'http://localhost:3002'
const ADMIN_TOKEN = 'YOUR_ADMIN_TOKEN'

async function indexAll() {
  try {
    // 게시글 인덱싱
    const postsResult = await axios.post(
      `${API_BASE}/api/posts/index/init`,
      {},
      { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } }
    )
    console.log('게시글 인덱싱:', postsResult.data)

    // 상품 인덱싱
    const productsResult = await axios.post(
      'http://localhost:3006/api/store/index/init',
      {},
      { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } }
    )
    console.log('상품 인덱싱:', productsResult.data)
  } catch (error) {
    console.error('인덱싱 오류:', error.message)
  }
}

indexAll()
```


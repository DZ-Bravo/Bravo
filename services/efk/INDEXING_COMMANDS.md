# Elasticsearch 인덱싱 API 호출 방법

## ⚠️ 중요: Kibana Dev Tools가 아닙니다!

이 API들은 **백엔드 서비스 API**이므로 HTTP 클라이언트(curl, Postman, 브라우저 등)로 호출해야 합니다.

## API 엔드포인트

### 1. 산 데이터 인덱싱
**엔드포인트**: `POST /api/mountains/index/init`  
**인증**: 불필요  
**서비스**: mountain-service

```bash
curl -X POST http://192.168.0.242/api/mountains/index/init \
  -H "Content-Type: application/json"
```

또는 브라우저에서:
```
http://192.168.0.242/api/mountains/index/init
```
(브라우저는 GET만 지원하므로 개발자 도구의 Network 탭에서 POST로 변경 필요)

### 2. 스토어 데이터 인덱싱
**엔드포인트**: `POST /api/store/index/init`  
**인증**: 필요 (관리자 토큰)  
**서비스**: store-service

```bash
curl -X POST http://192.168.0.242/api/store/index/init \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

### 3. 게시글 데이터 인덱싱
**엔드포인트**: `POST /api/posts/index/init`  
**인증**: 필요 (관리자 토큰)  
**서비스**: community-service

```bash
curl -X POST http://192.168.0.242/api/posts/index/init \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

## Postman 사용 방법

1. Postman 열기
2. 새 Request 생성
3. Method: `POST`
4. URL: `http://192.168.0.242/api/mountains/index/init` (또는 다른 엔드포인트)
5. Headers:
   - `Content-Type: application/json`
   - `Authorization: Bearer YOUR_ADMIN_TOKEN` (인증 필요한 경우)
6. Send 클릭

## 브라우저 개발자 도구 사용 방법

1. 브라우저에서 F12로 개발자 도구 열기
2. Network 탭 열기
3. Console 탭에서 다음 명령 실행:

```javascript
// 산 데이터 인덱싱 (인증 불필요)
fetch('http://192.168.0.242/api/mountains/index/init', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
})
.then(res => res.json())
.then(data => console.log(data))
.catch(err => console.error(err));

// 스토어/게시글 인덱싱 (인증 필요)
fetch('http://192.168.0.242/api/store/index/init', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_ADMIN_TOKEN'
  }
})
.then(res => res.json())
.then(data => console.log(data))
.catch(err => console.error(err));
```

## 인덱싱 확인

인덱싱이 완료되면 Elasticsearch에서 확인:

### Kibana Dev Tools에서 확인:
```json
GET /mountains/_count
GET /products/_count
GET /posts/_count
```

### curl로 확인:
```bash
curl http://localhost:9200/mountains/_count
curl http://localhost:9200/products/_count
curl http://localhost:9200/posts/_count
```

## 주의사항

1. **Kibana Dev Tools는 Elasticsearch API만 호출**합니다
2. **백엔드 API는 HTTP 클라이언트로 호출**해야 합니다
3. 관리자 토큰이 필요한 API는 먼저 로그인하여 토큰을 받아야 합니다


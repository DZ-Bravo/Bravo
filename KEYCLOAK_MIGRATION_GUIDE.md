# Keycloak 전환 가이드

## 📋 개요

MongoDB 기반 사용자 인증 시스템을 Keycloak으로 전환하는 가이드입니다.

## 🎯 전환 목표

1. **사용자 인증**: MongoDB → Keycloak
2. **소셜 로그인**: 카카오/네이버 → Keycloak Identity Provider
3. **토큰 관리**: JWT 직접 생성 → Keycloak Access Token
4. **사용자 데이터**: MongoDB → Keycloak (MariaDB)

## 📦 생성된 파일

### 1. Keycloak Kubernetes 매니페스트
- `k8s/keycloak-ns/namespace.yaml`: 네임스페이스
- `k8s/keycloak-ns/keycloak-secret.yaml`: MariaDB 연결 정보 및 Keycloak 설정
- `k8s/keycloak-ns/keycloak-deployment.yaml`: Keycloak Deployment
- `k8s/keycloak-ns/keycloak-service.yaml`: Keycloak Service
- `k8s/keycloak-ns/keycloak-ingress.yaml`: Keycloak Ingress (ALB)

### 2. 마이그레이션 스크립트
- `scripts/migrate-users-to-keycloak.js`: MongoDB → Keycloak 사용자 데이터 마이그레이션

### 3. Keycloak 클라이언트 유틸리티
- `services/backend-services/auth-service/keycloak-client.js`: Keycloak API 호출 헬퍼 함수

## 🚀 배포 순서

### 1단계: Keycloak 배포

```bash
# 네임스페이스 생성
kubectl apply -f k8s/keycloak-ns/namespace.yaml

# Secret 생성 (MariaDB 연결 정보)
kubectl apply -f k8s/keycloak-ns/keycloak-secret.yaml

# Deployment 및 Service 배포
kubectl apply -f k8s/keycloak-ns/keycloak-deployment.yaml
kubectl apply -f k8s/keycloak-ns/keycloak-service.yaml

# Ingress 배포 (ALB 생성)
kubectl apply -f k8s/keycloak-ns/keycloak-ingress.yaml

# Keycloak Pod 상태 확인
kubectl get pods -n bravo-keycloak-ns -w
```

### 2단계: Keycloak 초기 설정

1. **Keycloak Admin Console 접속**
   - URL: `https://keycloak.hiker-cloud.site`
   - Admin 계정: `admin` / `admin123`

2. **Realm 생성**
   - Realm 이름: `hiking`
   - Display Name: `Hiking App`

3. **Client 생성**
   - Client ID: `hiking-client`
   - Client Protocol: `openid-connect`
   - Access Type: `confidential`
   - Valid Redirect URIs:
     - `https://hiker-cloud.site/*`
     - `https://hiker-cloud.site/auth/success`
     - `https://hiker-cloud.site/api/auth/*`
   - Web Origins: `https://hiker-cloud.site`

4. **Identity Provider 설정**
   - 카카오: `kakao`
   - 네이버: `naver`

### 3단계: 사용자 데이터 마이그레이션

```bash
# 환경 변수 설정
export MONGODB_URI="mongodb://mongodb.bravo-mongo-ns.svc.cluster.local:27017/hiking?replicaSet=rs0&readPreference=secondaryPreferred"
export KEYCLOAK_URL="https://keycloak.hiker-cloud.site"
export KEYCLOAK_REALM="hiking"
export KEYCLOAK_CLIENT_ID="hiking-client"
export KEYCLOAK_CLIENT_SECRET="<Client Secret>"
export KEYCLOAK_ADMIN_USERNAME="admin"
export KEYCLOAK_ADMIN_PASSWORD="admin123"
export KAKAO_REST_API_KEY="75218448ddb01cb67aec079a8dbd61ae"
export KAKAO_CLIENT_SECRET="jqAC1gVOlf7cBhb500rReivNfJ3o5F59"
export NAVER_CLIENT_ID="bPUAgB6QZBRBZrL3G1CN"
export NAVER_CLIENT_SECRET="9TzCuTvpBJ"

# 마이그레이션 실행
node scripts/migrate-users-to-keycloak.js
```

### 4단계: auth-service 코드 수정

`auth-service`의 로그인/회원가입 로직을 Keycloak 연동으로 변경:

1. **로그인**: `router.post('/login')` → Keycloak `password` grant 사용
2. **회원가입**: `router.post('/signup')` → Keycloak Admin API로 사용자 생성
3. **소셜 로그인**: Keycloak Identity Provider로 리다이렉트
4. **토큰 검증**: JWT 직접 검증 → Keycloak Token Introspection

### 5단계: 프론트엔드 코드 수정

1. **로그인 페이지**: Keycloak 로그인 URL로 리다이렉트
2. **소셜 로그인**: Keycloak Identity Provider URL 사용
3. **토큰 저장**: Keycloak Access Token 저장
4. **API 요청**: Keycloak Access Token을 Authorization 헤더에 포함

## 🔧 환경 변수 설정

### Keycloak Secret (`k8s/keycloak-ns/keycloak-secret.yaml`)

```yaml
KC_DB: mysql
KC_DB_URL: jdbc:mysql://211.46.52.152:15432/test?useSSL=true&requireSSL=true
KC_DB_USERNAME: team2
KC_DB_PASSWORD: Gkrtod1@
KEYCLOAK_ADMIN: admin
KEYCLOAK_ADMIN_PASSWORD: admin123
```

### auth-service 환경 변수

```yaml
KEYCLOAK_URL: https://keycloak.hiker-cloud.site
KEYCLOAK_REALM: hiking
KEYCLOAK_CLIENT_ID: hiking-client
KEYCLOAK_CLIENT_SECRET: <Client Secret>
KEYCLOAK_ADMIN_USERNAME: admin
KEYCLOAK_ADMIN_PASSWORD: admin123
```

## 📝 주요 변경 사항

### 1. 로그인 흐름

**기존 (MongoDB + JWT)**:
```
사용자 → auth-service → MongoDB 사용자 조회 → JWT 생성 → 반환
```

**변경 후 (Keycloak)**:
```
사용자 → auth-service → Keycloak Token Endpoint → Keycloak Access Token → 반환
```

### 2. 소셜 로그인 흐름

**기존 (직접 구현)**:
```
사용자 → auth-service → 카카오/네이버 OAuth → 사용자 정보 조회 → MongoDB 저장 → JWT 생성
```

**변경 후 (Keycloak Identity Provider)**:
```
사용자 → Keycloak → 카카오/네이버 Identity Provider → Keycloak 사용자 생성 → Keycloak Access Token
```

### 3. 토큰 검증

**기존 (JWT 직접 검증)**:
```javascript
jwt.verify(token, JWT_SECRET)
```

**변경 후 (Keycloak Token Introspection)**:
```javascript
verifyToken(token) // Keycloak Token Introspection API 호출
```

## ⚠️ 주의사항

1. **데이터 마이그레이션**: 기존 MongoDB 사용자 데이터를 Keycloak으로 마이그레이션해야 합니다.
2. **비밀번호**: MongoDB에서 암호화된 비밀번호는 Keycloak으로 마이그레이션할 수 없습니다. 사용자에게 비밀번호 재설정을 요청해야 할 수 있습니다.
3. **소셜 로그인**: Keycloak Identity Provider 설정이 완료되어야 소셜 로그인이 작동합니다.
4. **토큰 만료**: Keycloak Access Token의 만료 시간을 적절히 설정해야 합니다.
5. **백엔드 API**: 모든 백엔드 API에서 Keycloak Token 검증을 사용하도록 수정해야 합니다.

## 🔍 문제 해결

### Keycloak Pod가 시작되지 않는 경우

```bash
# Pod 로그 확인
kubectl logs -n bravo-keycloak-ns -l app=keycloak

# MariaDB 연결 확인
kubectl exec -n bravo-keycloak-ns -it <pod-name> -- sh
# MariaDB 연결 테스트
```

### 마이그레이션 실패

```bash
# MongoDB 연결 확인
mongosh "mongodb://mongodb.bravo-mongo-ns.svc.cluster.local:27017/hiking?replicaSet=rs0"

# Keycloak Admin API 확인
curl -X POST https://keycloak.hiker-cloud.site/realms/master/protocol/openid-connect/token \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin123"
```

## 📚 참고 자료

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Keycloak Admin REST API](https://www.keycloak.org/docs-api/latest/rest-api/)
- [Keycloak Identity Providers](https://www.keycloak.org/docs/latest/server_admin/#_identity_broker)


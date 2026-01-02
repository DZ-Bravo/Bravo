# Keycloak 전환 작업 완료 가이드

## ✅ 완료된 작업

1. **Keycloak Kubernetes 배포**
   - Deployment, Service, Ingress 생성 및 배포 완료
   - ALB 생성 완료
   - Route53 A 레코드 추가 완료 (keycloak.hiker-cloud.site)

2. **Keycloak 코드 작성**
   - `keycloak-client.js`: Keycloak API 호출 유틸리티
   - `auth-keycloak.js`: Keycloak 연동 인증 라우터
   - `server.js`: Keycloak 라우트 활성화

3. **마이그레이션 스크립트**
   - `scripts/migrate-users-to-keycloak.js`: MongoDB → Keycloak 사용자 데이터 마이그레이션

## ⚠️ 현재 상태

- **Keycloak DB**: H2 인메모리 DB 사용 중 (임시)
  - MariaDB 연결 문제로 인해 H2 사용
  - Pod 재시작 시 데이터 초기화됨
  - MariaDB 연결 문제 해결 후 변경 필요

## 📋 다음 단계 (수동 작업 필요)

### 1. Keycloak Admin Console 접속

```bash
# URL: https://keycloak.hiker-cloud.site
# Admin 계정: admin / admin123
```

### 2. Realm 생성

1. Admin Console 접속
2. 왼쪽 상단 "Master" 클릭 → "Create Realm" 클릭
3. Realm name: `hiking`
4. "Create" 클릭

### 3. Client 생성

1. Realm `hiking` 선택
2. 왼쪽 메뉴 "Clients" → "Create client" 클릭
3. Client type: `OpenID Connect`
4. Client ID: `hiking-client`
5. "Next" 클릭
6. Capability config:
   - Client authentication: `On` (Confidential)
   - Authorization: `Off`
   - Authentication flow: `Standard flow`, `Direct access grants`
7. "Next" 클릭
8. Login settings:
   - Valid redirect URIs: 
     - `https://hiker-cloud.site/*`
     - `https://hiker-cloud.site/auth/success`
     - `https://hiker-cloud.site/api/auth/*`
   - Web origins: `https://hiker-cloud.site`
9. "Save" 클릭
10. "Credentials" 탭에서 Client Secret 복사 (환경 변수에 설정 필요)

### 4. Identity Provider 설정 (카카오)

1. Realm `hiking` 선택
2. 왼쪽 메뉴 "Identity providers" → "Add provider" 클릭
3. Provider: `OpenID Connect v1.0`
4. Alias: `kakao`
5. Display name: `Kakao`
6. Settings:
   - Authorization URL: `https://kauth.kakao.com/oauth/authorize`
   - Token URL: `https://kauth.kakao.com/oauth/token`
   - User Info URL: `https://kapi.kakao.com/v2/user/me`
   - Client ID: `75218448ddb01cb67aec079a8dbd61ae`
   - Client Secret: `jqAC1gVOlf7cBhb500rReivNfJ3o5F59`
   - Default Scopes: `profile_nickname account_email`
7. "Add" 클릭

### 5. Identity Provider 설정 (네이버)

1. Realm `hiking` 선택
2. 왼쪽 메뉴 "Identity providers" → "Add provider" 클릭
3. Provider: `OpenID Connect v1.0`
4. Alias: `naver`
5. Display name: `Naver`
6. Settings:
   - Authorization URL: `https://nid.naver.com/oauth2.0/authorize`
   - Token URL: `https://nid.naver.com/oauth2.0/token`
   - User Info URL: `https://openapi.naver.com/v1/nid/me`
   - Client ID: `bPUAgB6QZBRBZrL3G1CN`
   - Client Secret: `9TzCuTvpBJ`
   - Default Scopes: `name email`
7. "Add" 클릭

### 6. 환경 변수 설정

auth-service의 ConfigMap/Secret에 다음 환경 변수 추가:

```yaml
KEYCLOAK_URL: https://keycloak.hiker-cloud.site
KEYCLOAK_REALM: hiking
KEYCLOAK_CLIENT_ID: hiking-client
KEYCLOAK_CLIENT_SECRET: <Client Secret>
KEYCLOAK_ADMIN_USERNAME: admin
KEYCLOAK_ADMIN_PASSWORD: admin123
```

### 7. 사용자 데이터 마이그레이션

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

### 8. 프론트엔드 코드 수정

`services/frontend-service/src/pages/Login.jsx`를 Keycloak 로그인으로 변경:

```javascript
// Keycloak 로그인 URL로 리다이렉트
const handleLogin = () => {
  const keycloakUrl = `https://keycloak.hiker-cloud.site/realms/hiking/protocol/openid-connect/auth?client_id=hiking-client&redirect_uri=${encodeURIComponent('https://hiker-cloud.site/auth/success')}&response_type=code&scope=openid profile email`
  window.location.href = keycloakUrl
}

// 소셜 로그인
const handleSocialLogin = (provider) => {
  const keycloakUrl = `https://keycloak.hiker-cloud.site/realms/hiking/broker/${provider}/login`
  window.location.href = keycloakUrl
}
```

### 9. MariaDB 연결 문제 해결

현재 MariaDB 연결 문제:
- Keycloak이 MariaDB JDBC URL을 인식하지 못함
- 해결 방안:
  1. Keycloak 이미지에 MariaDB 드라이버 추가
  2. 또는 PostgreSQL로 변경
  3. 또는 외부 MariaDB 서버 방화벽 확인

## 🔍 문제 해결

### Keycloak Pod가 시작되지 않는 경우

```bash
# Pod 로그 확인
kubectl logs -n bravo-keycloak-ns -l app=keycloak

# MariaDB 연결 테스트
kubectl run mariadb-test --image=mysql:8.0 --rm -it --restart=Never -- mysql -h 211.46.52.152 -P 15432 -u team2 -p'Gkrtod1@' test -e "SELECT 1;"
```

### Keycloak Admin Console 접속 불가

```bash
# Ingress 확인
kubectl get ingress -n bravo-keycloak-ns

# Route53 A 레코드 확인
aws route53 list-resource-record-sets --hosted-zone-id <ZONE_ID> --query "ResourceRecordSets[?Name=='keycloak.hiker-cloud.site.']"
```

## 📚 참고 자료

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Keycloak Admin REST API](https://www.keycloak.org/docs-api/latest/rest-api/)
- [Keycloak Identity Providers](https://www.keycloak.org/docs/latest/server_admin/#_identity_broker)


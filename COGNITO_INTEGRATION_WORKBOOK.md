# AWS Cognito 통합 워크북

## 1. Cognito User Pool 설정

### 핵심 설정
- **UsernameAttributes**: `email` (이메일을 username으로 사용)
- **AutoVerifiedAttributes**: `email`
- **Custom Attributes**: `custom:provider`, `custom:userId`, `custom:userRole`, `custom:mongoId`

### CloudFormation 배포
```bash
aws cloudformation create-stack \
  --stack-name hiker-cognito-user-pool \
  --template-body file://cloudformation/cognito-user-pool.yaml \
  --parameters ParameterKey=MongoDBURI,ParameterValue=...
```

---

## 2. 일반 로그인 처리

### 로그인 플로우
1. **MongoDB에서 사용자 조회** → email 추출
2. **Cognito 로그인 시도** (email을 username으로 사용)
3. **Cognito 성공 시**: Cognito 토큰 반환 (IdToken, AccessToken, RefreshToken)
4. **Cognito 실패 시 (UserNotFoundException)**: MongoDB 폴백
   - MongoDB 비밀번호 확인
   - JWT 토큰 생성 및 반환 (하위 호환성)
   - 백그라운드에서 Cognito로 자동 마이그레이션

### 코드 구조
```javascript
// 1. MongoDB에서 사용자 조회
const user = await User.findOne({ id })
const cognitoUsername = user.email

// 2. Cognito 로그인 시도
try {
  const response = await cognitoClient.send(new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: {
      USERNAME: cognitoUsername, // email 사용
      PASSWORD: password
    }
  }))
  // Cognito 토큰 반환
} catch (cognitoError) {
  if (cognitoError.name === 'UserNotFoundException') {
    // MongoDB 폴백
    const isPasswordValid = await bcrypt.compare(password, user.password)
    const token = jwt.sign(...) // JWT 토큰 생성
    // 백그라운드 마이그레이션
  }
}
```

---

## 3. 소셜 로그인 처리 (카카오/네이버)

### 소셜 로그인 플로우
1. **OAuth 콜백 수신** (`/kakao/callback`, `/naver/callback`)
2. **OAuth 토큰 교환** → 사용자 정보 조회
3. **Cognito 사용자 생성/조회**
   - Username: `email` (소셜에서 받은 이메일)
   - 임시 비밀번호 생성 및 설정
   - Cognito 로그인하여 토큰 획득
4. **MongoDB 사용자 생성/조회** (소셜 ID 사용: `kakao_${id}`, `naver_${id}`)
5. **프론트엔드로 리다이렉트** (Cognito 토큰 포함)

### 코드 구조
```javascript
// 1. OAuth 토큰 교환
const tokenData = await fetch('https://kauth.kakao.com/oauth/token', ...)
const kakaoUser = await fetch('https://kapi.kakao.com/v2/user/me', ...)

// 2. Cognito 사용자 생성
const createUserCommand = new AdminCreateUserCommand({
  UserPoolId: USER_POOL_ID,
  Username: userInfo.email, // email을 username으로 사용
  UserAttributes: [
    { Name: 'email', Value: userInfo.email },
    { Name: 'name', Value: userInfo.name }
  ],
  MessageAction: 'SUPPRESS'
})

// 3. 임시 비밀번호 설정 및 로그인
const tempPassword = Math.random().toString(36).slice(-12) + ...
await cognitoClient.send(new AdminSetUserPasswordCommand({...}))
const authResponse = await cognitoClient.send(new InitiateAuthCommand({...}))

// 4. MongoDB 사용자 생성
const user = new User({
  id: `kakao_${kakaoUser.id}`, // 소셜 ID
  email: userInfo.email,
  ...
})

// 5. 리다이렉트 (Cognito 토큰 포함)
res.redirect(`${FRONTEND_URL}/auth/success?provider=kakao&idToken=...&accessToken=...&refreshToken=...`)
```

---

## 4. 회원가입 처리

### 회원가입 플로우
1. **MongoDB에 사용자 생성**
2. **Cognito에 사용자 생성** (email을 username으로 사용)
3. **Cognito 비밀번호 설정**
4. **Cognito 로그인하여 토큰 획득**
5. **응답 반환**: Cognito 토큰 우선, 없으면 JWT 토큰

### 코드 구조
```javascript
// 1. MongoDB 사용자 생성
const user = new User({ id, name, email, password, ... })
await user.save()

// 2. Cognito 사용자 생성
const cognitoUsername = email.trim()
await cognitoClient.send(new AdminCreateUserCommand({
  UserPoolId: USER_POOL_ID,
  Username: cognitoUsername,
  UserAttributes: [
    { Name: 'email', Value: email },
    { Name: 'name', Value: name },
    { Name: 'custom:userId', Value: id }
  ],
  MessageAction: 'SUPPRESS'
}))

// 3. 비밀번호 설정 및 로그인
await cognitoClient.send(new AdminSetUserPasswordCommand({...}))
const authResponse = await cognitoClient.send(new InitiateAuthCommand({...}))

// 4. 응답 반환
if (cognitoTokens) {
  res.json({ idToken, accessToken, refreshToken, user })
} else {
  res.json({ token: jwt.sign(...), user }) // JWT 폴백
}
```

---

## 5. 토큰 검증 (JWKS)

### 인증 미들웨어
- **`authenticateCognitoToken`**: Cognito IdToken 검증 (필수)
- **`optionalAuthenticateCognitoToken`**: 선택적 Cognito 인증

### JWKS 검증 로직
```javascript
// 1. JWT 디코딩하여 kid 추출
const decoded = jwt.decode(token, { complete: true })
const kid = decoded.header.kid

// 2. JWKS에서 공개키 가져오기
const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`
const jwks = await fetch(jwksUrl).then(r => r.json())
const key = jwks.keys.find(k => k.kid === kid)

// 3. 공개키로 토큰 검증
const publicKey = jose.createPublicKey(key)
const { payload } = await jose.jwtVerify(token, publicKey, {
  issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
  audience: clientId
})
```

---

## 6. 프론트엔드 처리

### Cognito SDK 초기화
```javascript
// cognito.js
const poolData = {
  UserPoolId: getEnv('VITE_COGNITO_USER_POOL_ID'),
  ClientId: getEnv('VITE_COGNITO_CLIENT_ID')
}
const userPool = new CognitoUserPool(poolData)
```

### 로그인 처리
```javascript
// Login.jsx
try {
  // 1. Cognito 로그인 시도
  const tokens = await login(username, password)
  localStorage.setItem('idToken', tokens.idToken)
  localStorage.setItem('accessToken', tokens.accessToken)
  localStorage.setItem('refreshToken', tokens.refreshToken)
} catch (cognitoError) {
  // 2. Cognito 실패 시 백엔드 API로 폴백
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ id: username, password })
  })
  const data = await response.json()
  if (data.IdToken) {
    // Cognito 토큰
    localStorage.setItem('idToken', data.IdToken)
  } else if (data.token) {
    // JWT 토큰 (하위 호환성)
    localStorage.setItem('token', data.token)
  }
}
```

### 소셜 로그인 콜백 처리
```javascript
// AuthSuccess.jsx
const idToken = searchParams.get('idToken')
const accessToken = searchParams.get('accessToken')
const refreshToken = searchParams.get('refreshToken')

if (idToken && accessToken && refreshToken) {
  localStorage.setItem('idToken', idToken)
  localStorage.setItem('accessToken', accessToken)
  localStorage.setItem('refreshToken', refreshToken)
  window.location.replace('/')
}
```

### API 요청 헤더
```javascript
// api.js
export const getAuthHeaders = () => {
  const idToken = localStorage.getItem('idToken')
  const headers = { 'Content-Type': 'application/json' }
  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`
  }
  return headers
}
```

---

## 7. 주요 이슈 및 해결

### 이슈 1: UsernameAttributes: email 설정
**문제**: Cognito User Pool이 email을 username으로 사용하도록 설정됨
**해결**: 모든 Cognito 작업에서 `email`을 username으로 사용

### 이슈 2: 환경 변수 주입
**문제**: 프론트엔드에서 `import.meta.env`가 런타임에 주입되지 않음
**해결**: `server.js`에서 `window.__RUNTIME_ENV__`로 런타임 주입
```javascript
// server.js
const envScript = `<script>
  window.__RUNTIME_ENV__ = {
    VITE_COGNITO_USER_POOL_ID: ${JSON.stringify(process.env.VITE_COGNITO_USER_POOL_ID)},
    VITE_COGNITO_CLIENT_ID: ${JSON.stringify(process.env.VITE_COGNITO_CLIENT_ID)}
  };
</script>`
```

### 이슈 3: 기존 사용자 마이그레이션
**문제**: 기존 MongoDB 사용자가 Cognito에 없음
**해결**: Cognito 로그인 실패 시 MongoDB 폴백, 백그라운드에서 자동 마이그레이션

### 이슈 4: 소셜 로그인 기존 사용자 처리
**문제**: Cognito에 이미 존재하는 사용자 (UsernameExistsException)
**해결**: 기존 사용자는 토큰 없이 username만 전달, 프론트엔드에서 `getCurrentSession()` 시도

---

## 8. 환경 변수 설정

### 백엔드 (auth-service)
```yaml
env:
  - name: COGNITO_USER_POOL_ID
    valueFrom:
      configMapKeyRef:
        name: bravo-config
        key: COGNITO_USER_POOL_ID
  - name: COGNITO_CLIENT_ID
    valueFrom:
      configMapKeyRef:
        name: bravo-config
        key: COGNITO_CLIENT_ID
  - name: AWS_REGION
    value: "ap-northeast-2"
```

### 프론트엔드 (frontend-service)
```yaml
env:
  - name: VITE_COGNITO_USER_POOL_ID
    valueFrom:
      configMapKeyRef:
        name: bravo-config
        key: VITE_COGNITO_USER_POOL_ID
  - name: VITE_COGNITO_CLIENT_ID
    valueFrom:
      configMapKeyRef:
        name: bravo-config
        key: VITE_COGNITO_CLIENT_ID
```

---

## 9. 핵심 포인트

1. **Username은 항상 email 사용**: Cognito User Pool이 `UsernameAttributes: email`로 설정됨
2. **하위 호환성 유지**: Cognito 실패 시 MongoDB 폴백하여 기존 사용자 지원
3. **자동 마이그레이션**: 백그라운드에서 기존 사용자를 Cognito로 자동 마이그레이션
4. **이중 저장**: MongoDB (사용자 정보) + Cognito (인증)
5. **토큰 우선순위**: Cognito 토큰 > JWT 토큰 (하위 호환성)

---

## 10. 배포 체크리스트

- [ ] CloudFormation으로 Cognito User Pool 생성
- [ ] 환경 변수 설정 (ConfigMap)
- [ ] 백엔드 이미지 빌드 및 배포
- [ ] 프론트엔드 이미지 빌드 및 배포
- [ ] ConfigMap 업데이트 (frontend-server-js)
- [ ] 일반 로그인 테스트
- [ ] 소셜 로그인 테스트 (카카오/네이버)
- [ ] 회원가입 테스트
- [ ] 기존 사용자 로그인 테스트 (마이그레이션 확인)


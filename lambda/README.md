# Lambda Function 배포 가이드

## 개요

이 디렉토리에는 Cognito 전환을 위한 Lambda Function 2개가 포함되어 있습니다:

1. **social-login-handler**: 네이버/카카오 OAuth 처리 및 Cognito 사용자 생성
2. **pre-token-generation**: Pre Token Generation Trigger (MongoDB 사용자 ID를 JWT에 추가)

## 사전 준비

### 1. AWS CLI 설정
```bash
aws configure
```

### 2. IAM Role 생성
```bash
chmod +x iam-role-setup.sh
./iam-role-setup.sh
```

## 배포 방법

### 1. social-login-handler 배포
```bash
chmod +x deploy.sh
./deploy.sh social-login-handler
```

### 2. pre-token-generation 배포
```bash
./deploy.sh pre-token-generation
```

## 환경 변수 설정

### social-login-handler
AWS Console에서 다음 환경 변수를 설정하세요:
- `AWS_REGION`: `ap-northeast-2`
- `USER_POOL_ID`: Cognito User Pool ID
- `CLIENT_ID`: Cognito App Client ID
- `KAKAO_REST_API_KEY`: 카카오 REST API Key
- `NAVER_CLIENT_ID`: 네이버 Client ID
- `NAVER_CLIENT_SECRET`: 네이버 Client Secret

또는 AWS CLI로 설정:
```bash
aws lambda update-function-configuration \
  --function-name social-login-handler \
  --environment "Variables={
    AWS_REGION=ap-northeast-2,
    USER_POOL_ID=your-user-pool-id,
    CLIENT_ID=your-client-id,
    KAKAO_REST_API_KEY=your-kakao-key,
    NAVER_CLIENT_ID=your-naver-id,
    NAVER_CLIENT_SECRET=your-naver-secret
  }"
```

### pre-token-generation
AWS Console에서 다음 환경 변수를 설정하세요:
- `MONGODB_URI`: MongoDB 연결 URI

또는 AWS CLI로 설정:
```bash
aws lambda update-function-configuration \
  --function-name pre-token-generation \
  --environment "Variables={MONGODB_URI=your-mongodb-uri}"
```

## Cognito User Pool 설정

### 1. Pre Token Generation Trigger 연결
1. AWS Console → Cognito → User Pools → 선택한 User Pool
2. "Sign-in experience" → "App integration" → "App clients"
3. App Client 선택 → "Edit"
4. "Token generation" → "Pre token generation" → Lambda Function 선택: `pre-token-generation`

### 2. Lambda Function URL 생성 (social-login-handler)
```bash
aws lambda create-function-url-config \
  --function-name social-login-handler \
  --auth-type NONE \
  --cors '{"AllowOrigins": ["*"], "AllowMethods": ["POST"], "AllowHeaders": ["content-type"]}'
```

또는 AWS Console에서:
1. Lambda Function → "Configuration" → "Function URL"
2. "Create function URL"
3. Auth type: `NONE`
4. CORS 설정: Allow origins `*`, Allow methods `POST`

생성된 Function URL을 `SOCIAL_LOGIN_LAMBDA_URL` 환경 변수에 설정하세요.

## 테스트

### social-login-handler 테스트
```bash
aws lambda invoke \
  --function-name social-login-handler \
  --payload '{"provider":"kakao","code":"test-code","redirectUri":"https://hiker-cloud.site/api/auth/kakao/callback"}' \
  response.json
cat response.json
```

### pre-token-generation 테스트
Cognito User Pool의 Pre Token Generation Trigger로 자동 호출됩니다.

## 문제 해결

### 권한 오류
- IAM Role에 필요한 권한이 있는지 확인
- Cognito User Pool에 대한 권한 확인

### 환경 변수 오류
- Lambda Function의 환경 변수가 올바르게 설정되었는지 확인
- 환경 변수 이름이 정확한지 확인

### MongoDB 연결 오류 (pre-token-generation)
- MongoDB URI가 올바른지 확인
- VPC 설정이 필요한 경우 Lambda Function을 VPC에 연결


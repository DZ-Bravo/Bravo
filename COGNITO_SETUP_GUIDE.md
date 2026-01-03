# Cognito 전환 완료 가이드

## 개요

이 가이드는 AWS Cognito로 전환하는 전체 과정을 설명합니다.

## 사전 준비

### 1. 환경 변수 설정
```bash
export MONGODB_URI="mongodb://your-mongodb-uri"
export KAKAO_REST_API_KEY="your-kakao-key"
export NAVER_CLIENT_ID="your-naver-id"
export NAVER_CLIENT_SECRET="your-naver-secret"
```

### 2. AWS CLI 설정
```bash
aws configure
```

## 빠른 배포 (원클릭)

### 방법 1: 전체 자동 배포 (권장)
```bash
# 환경 변수 설정
export MONGODB_URI="mongodb://your-mongodb-uri"
export KAKAO_REST_API_KEY="your-kakao-key"
export NAVER_CLIENT_ID="your-naver-id"
export NAVER_CLIENT_SECRET="your-naver-secret"

# 전체 배포 실행
chmod +x scripts/quick-deploy-cognito.sh
./scripts/quick-deploy-cognito.sh
```

이 스크립트는 다음을 자동으로 수행합니다:
1. Cognito User Pool 생성
2. Lambda Function 배포
3. Lambda Function URL 생성
4. Kubernetes 환경 변수 설정
5. Pod 재시작
6. 설정 검증

### 방법 2: 단계별 수동 배포

## 단계별 설정

### 1단계: Cognito User Pool 생성

#### 방법 1: CloudFormation 사용 (권장)
```bash
cd scripts
chmod +x create-cognito-user-pool.sh
./create-cognito-user-pool.sh hiker-cloud-cognito
```

#### 방법 2: AWS Console 사용
1. AWS Console → Cognito → User Pools → Create user pool
2. Sign-in options: Email
3. Password policy: Custom (최소 8자, 대소문자, 숫자, 특수문자)
4. MFA: Optional
5. User pool name: `hiker-cloud-user-pool`
6. App client 생성:
   - App client name: `hiker-cloud-user-pool-client`
   - Generate client secret: No
   - Allowed OAuth flows: Authorization code grant
   - Allowed OAuth scopes: email, openid, profile
   - Callback URLs: `https://hiker-cloud.site/auth/success`, `https://hiker-cloud.site`
   - Sign-out URLs: `https://hiker-cloud.site/login`, `https://hiker-cloud.site`

### 2단계: Lambda Function 배포

#### IAM Role 생성
```bash
cd lambda
chmod +x iam-role-setup.sh
./iam-role-setup.sh
```

#### Lambda Function 배포
```bash
# Pre Token Generation 배포
./deploy.sh pre-token-generation

# Social Login Handler 배포
./deploy.sh social-login-handler
```

### 3단계: Lambda Function 환경 변수 설정

#### pre-token-generation
```bash
aws lambda update-function-configuration \
  --function-name pre-token-generation \
  --environment "Variables={MONGODB_URI=your-mongodb-uri}"
```

#### social-login-handler
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

### 4단계: Lambda Function URL 생성

```bash
aws lambda create-function-url-config \
  --function-name social-login-handler \
  --auth-type NONE \
  --cors '{"AllowOrigins": ["*"], "AllowMethods": ["POST"], "AllowHeaders": ["content-type"]}'
```

생성된 URL을 기록해두세요.

### 5단계: Cognito User Pool Trigger 설정

1. AWS Console → Cognito → User Pools → 선택한 User Pool
2. "Sign-in experience" → "App integration" → "App clients"
3. App Client 선택 → "Edit"
4. "Token generation" → "Pre token generation" → Lambda Function 선택: `pre-token-generation`

### 6단계: Kubernetes 환경 변수 설정

#### 자동 설정 (스크립트 사용)
```bash
cd scripts
chmod +x setup-cognito-env.sh
./setup-cognito-env.sh hiker-cloud-cognito
```

#### 수동 설정
```bash
# ConfigMap 업데이트
kubectl patch configmap bravo-config -n bravo-core-ns --type merge -p '{
  "data": {
    "COGNITO_USER_POOL_ID": "your-user-pool-id",
    "COGNITO_CLIENT_ID": "your-client-id",
    "SOCIAL_LOGIN_LAMBDA_URL": "your-lambda-url",
    "VITE_COGNITO_USER_POOL_ID": "your-user-pool-id",
    "VITE_COGNITO_CLIENT_ID": "your-client-id"
  }
}'

# Frontend ConfigMap 업데이트
kubectl patch configmap bravo-config -n bravo-front-ns --type merge -p '{
  "data": {
    "VITE_COGNITO_USER_POOL_ID": "your-user-pool-id",
    "VITE_COGNITO_CLIENT_ID": "your-client-id"
  }
}'
```

### 7단계: Pod 재시작

```bash
# Backend 서비스 재시작
kubectl rollout restart deployment -n bravo-core-ns

# Frontend 서비스 재시작
kubectl rollout restart deployment -n bravo-front-ns
```

### 8단계: 사용자 데이터 마이그레이션 (선택사항)

```bash
# MongoDB → Cognito User Pool
node scripts/migrate-users-to-cognito.js
```

## 검증 및 테스트

### 자동 검증 스크립트
```bash
chmod +x scripts/verify-cognito-setup.sh
./scripts/verify-cognito-setup.sh
```

이 스크립트는 다음을 확인합니다:
- CloudFormation 스택 상태
- Lambda Function 존재 및 환경 변수
- Cognito User Pool Trigger 설정
- Kubernetes ConfigMap 설정
- Pod 상태

### 로그인 테스트 스크립트
```bash
chmod +x scripts/test-cognito-login.sh
./scripts/test-cognito-login.sh
```

이 스크립트는 다음을 테스트합니다:
- 테스트 사용자 생성
- Cognito 로그인
- 토큰 발급 확인
- Lambda Function URL 확인

### 수동 검증

### 1. Cognito User Pool 확인
```bash
aws cognito-idp describe-user-pool --user-pool-id <USER_POOL_ID>
```

### 2. Lambda Function 확인
```bash
aws lambda get-function --function-name pre-token-generation
aws lambda get-function --function-name social-login-handler
```

### 3. 환경 변수 확인
```bash
kubectl get configmap bravo-config -n bravo-core-ns -o yaml
kubectl get configmap bravo-config -n bravo-front-ns -o yaml
```

### 4. 로그인 테스트
1. 일반 로그인: `https://hiker-cloud.site/login`
2. 소셜 로그인: 카카오/네이버 로그인 버튼 클릭

## 문제 해결

### Lambda Function 오류
- CloudWatch Logs 확인: `aws logs tail /aws/lambda/social-login-handler --follow`
- 환경 변수 확인: `aws lambda get-function-configuration --function-name social-login-handler`

### Cognito 로그인 실패
- User Pool 설정 확인
- App Client 설정 확인
- Callback URL 확인

### 환경 변수 미적용
- Pod 재시작 확인
- ConfigMap 값 확인: `kubectl get configmap bravo-config -o yaml`

## 참고 자료

- [AWS Cognito 문서](https://docs.aws.amazon.com/cognito/)
- [Lambda Function 배포 가이드](lambda/README.md)
- [마이그레이션 스크립트](scripts/migrate-users-to-cognito.js)


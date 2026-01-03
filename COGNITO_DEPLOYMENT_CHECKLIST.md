# Cognito 배포 체크리스트

## 사전 준비 ✅

- [ ] AWS CLI 설정 완료 (`aws configure`)
- [ ] kubectl 설정 완료 (`kubectl get nodes` 성공)
- [ ] 환경 변수 준비:
  - [ ] `MONGODB_URI`
  - [ ] `KAKAO_REST_API_KEY`
  - [ ] `NAVER_CLIENT_ID`
  - [ ] `NAVER_CLIENT_SECRET`

## 1단계: Cognito User Pool 생성

- [ ] 환경 변수 설정
  ```bash
  export MONGODB_URI="mongodb://..."
  export KAKAO_REST_API_KEY="..."
  export NAVER_CLIENT_ID="..."
  export NAVER_CLIENT_SECRET="..."
  ```

- [ ] Cognito User Pool 생성
  ```bash
  chmod +x scripts/create-cognito-user-pool.sh
  ./scripts/create-cognito-user-pool.sh
  ```

- [ ] 출력 값 확인
  - [ ] User Pool ID
  - [ ] Client ID

## 2단계: Lambda Function 배포

- [ ] IAM Role 생성
  ```bash
  cd lambda
  chmod +x iam-role-setup.sh
  ./iam-role-setup.sh
  ```

- [ ] pre-token-generation 배포
  ```bash
  ./deploy.sh pre-token-generation
  ```

- [ ] social-login-handler 배포
  ```bash
  ./deploy.sh social-login-handler
  ```

- [ ] 환경 변수 설정 확인
  - [ ] pre-token-generation: `MONGODB_URI`
  - [ ] social-login-handler: `USER_POOL_ID`, `CLIENT_ID`, `KAKAO_REST_API_KEY`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`

## 3단계: Lambda Function URL 생성

- [ ] social-login-handler Function URL 생성
  ```bash
  aws lambda create-function-url-config \
    --function-name social-login-handler \
    --auth-type NONE \
    --cors '{"AllowOrigins": ["*"], "AllowMethods": ["POST"], "AllowHeaders": ["content-type"]}'
  ```

- [ ] Function URL 기록

## 4단계: Cognito User Pool Trigger 설정

- [ ] AWS Console → Cognito → User Pools
- [ ] User Pool 선택
- [ ] "Sign-in experience" → "App integration" → "App clients"
- [ ] App Client 선택 → "Edit"
- [ ] "Token generation" → "Pre token generation"
- [ ] Lambda Function 선택: `pre-token-generation`

## 5단계: Kubernetes 환경 변수 설정

- [ ] 환경 변수 자동 설정
  ```bash
  chmod +x scripts/setup-cognito-env.sh
  ./scripts/setup-cognito-env.sh
  ```

- [ ] ConfigMap 확인
  ```bash
  kubectl get configmap bravo-config -n bravo-core-ns -o yaml
  kubectl get configmap bravo-config -n bravo-front-ns -o yaml
  ```

## 6단계: Pod 재시작

- [ ] Backend 서비스 재시작
  ```bash
  kubectl rollout restart deployment -n bravo-core-ns
  ```

- [ ] Frontend 서비스 재시작
  ```bash
  kubectl rollout restart deployment -n bravo-front-ns
  ```

- [ ] Pod 상태 확인
  ```bash
  kubectl get pods -n bravo-core-ns
  kubectl get pods -n bravo-front-ns
  ```

## 7단계: 검증 및 테스트

- [ ] 설정 검증
  ```bash
  chmod +x scripts/verify-cognito-setup.sh
  ./scripts/verify-cognito-setup.sh
  ```

- [ ] 로그인 테스트
  ```bash
  chmod +x scripts/test-cognito-login.sh
  ./scripts/test-cognito-login.sh
  ```

- [ ] 브라우저 테스트
  - [ ] 일반 로그인: `https://hiker-cloud.site/login`
  - [ ] 소셜 로그인 (카카오)
  - [ ] 소셜 로그인 (네이버)

## 8단계: 사용자 데이터 마이그레이션 (선택사항)

- [ ] 마이그레이션 스크립트 실행
  ```bash
  export COGNITO_USER_POOL_ID="..."
  export MONGODB_URI="..."
  node scripts/migrate-users-to-cognito.js
  ```

## 문제 해결

### Lambda Function 오류
```bash
# CloudWatch Logs 확인
aws logs tail /aws/lambda/social-login-handler --follow
aws logs tail /aws/lambda/pre-token-generation --follow
```

### Cognito 로그인 실패
- User Pool 설정 확인
- App Client 설정 확인
- Callback URL 확인

### 환경 변수 미적용
```bash
# ConfigMap 확인
kubectl get configmap bravo-config -n bravo-core-ns -o yaml

# Pod 환경 변수 확인
kubectl exec -n bravo-core-ns <pod-name> -- env | grep COGNITO
```

### Pod 재시작 실패
```bash
# Pod 로그 확인
kubectl logs -n bravo-core-ns <pod-name>

# Pod 이벤트 확인
kubectl describe pod -n bravo-core-ns <pod-name>
```


#!/bin/bash

# Cognito 전체 배포 스크립트 (원클릭 배포)

set -e

STACK_NAME=${1:-"hiker-cloud-cognito"}
REGION="ap-northeast-2"

echo "🚀 Cognito 전체 배포 시작..."
echo ""

# 필수 환경 변수 확인
if [ -z "$MONGODB_URI" ]; then
  echo "❌ MONGODB_URI 환경 변수가 설정되지 않았습니다."
  exit 1
fi

if [ -z "$KAKAO_REST_API_KEY" ]; then
  echo "❌ KAKAO_REST_API_KEY 환경 변수가 설정되지 않았습니다."
  exit 1
fi

if [ -z "$NAVER_CLIENT_ID" ]; then
  echo "❌ NAVER_CLIENT_ID 환경 변수가 설정되지 않았습니다."
  exit 1
fi

if [ -z "$NAVER_CLIENT_SECRET" ]; then
  echo "❌ NAVER_CLIENT_SECRET 환경 변수가 설정되지 않았습니다."
  exit 1
fi

echo "✅ 필수 환경 변수 확인 완료"
echo ""

# 1. Cognito User Pool 생성
echo "1️⃣ Cognito User Pool 생성 중..."
if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" &>/dev/null; then
  echo "   ⚠️ 스택 '$STACK_NAME'이 이미 존재합니다. 건너뜁니다."
else
  chmod +x scripts/create-cognito-user-pool.sh
  ./scripts/create-cognito-user-pool.sh "$STACK_NAME"
fi

echo ""

# 2. Lambda Function 배포
echo "2️⃣ Lambda Function 배포 중..."

cd lambda

# IAM Role 생성
if [ ! -f iam-role-setup.sh ]; then
  echo "   ❌ iam-role-setup.sh 파일을 찾을 수 없습니다."
  exit 1
fi

chmod +x iam-role-setup.sh deploy.sh

if aws iam get-role --role-name lambda-cognito-role &>/dev/null; then
  echo "   ⚠️ IAM Role이 이미 존재합니다. 건너뜁니다."
else
  echo "   📝 IAM Role 생성 중..."
  ./iam-role-setup.sh
fi

# pre-token-generation 배포
echo "   📝 pre-token-generation 배포 중..."
./deploy.sh pre-token-generation

# social-login-handler 배포
echo "   📝 social-login-handler 배포 중..."
./deploy.sh social-login-handler

cd ..

echo ""

# 3. Lambda Function URL 생성
echo "3️⃣ Lambda Function URL 생성 중..."
FUNCTION_URL=$(aws lambda get-function-url-config \
  --function-name social-login-handler \
  --region "$REGION" \
  --query 'FunctionUrl' \
  --output text 2>/dev/null || echo "")

if [ -z "$FUNCTION_URL" ]; then
  echo "   📝 Function URL 생성 중..."
  FUNCTION_URL=$(aws lambda create-function-url-config \
    --function-name social-login-handler \
    --auth-type NONE \
    --cors '{"AllowOrigins": ["*"], "AllowMethods": ["POST"], "AllowHeaders": ["content-type"]}' \
    --region "$REGION" \
    --query 'FunctionUrl' \
    --output text)
  
  echo "   ✅ Function URL 생성 완료: $FUNCTION_URL"
else
  echo "   ⚠️ Function URL이 이미 존재합니다: $FUNCTION_URL"
fi

echo ""

# 4. Kubernetes 환경 변수 설정
echo "4️⃣ Kubernetes 환경 변수 설정 중..."
chmod +x scripts/setup-cognito-env.sh
./scripts/setup-cognito-env.sh "$STACK_NAME"

echo ""

# 5. Pod 재시작
echo "5️⃣ Pod 재시작 중..."
kubectl rollout restart deployment -n bravo-core-ns 2>/dev/null || echo "   ⚠️ bravo-core-ns 네임스페이스가 없습니다."
kubectl rollout restart deployment -n bravo-front-ns 2>/dev/null || echo "   ⚠️ bravo-front-ns 네임스페이스가 없습니다."

echo "   ⏳ Pod 재시작 완료 대기 중..."
sleep 10

echo ""

# 6. 검증
echo "6️⃣ 설정 검증 중..."
chmod +x scripts/verify-cognito-setup.sh
./scripts/verify-cognito-setup.sh "$STACK_NAME"

echo ""
echo "✅ 전체 배포 완료!"
echo ""
echo "📝 다음 단계:"
echo "   1. Pod가 모두 Running 상태인지 확인:"
echo "      kubectl get pods -n bravo-core-ns"
echo "      kubectl get pods -n bravo-front-ns"
echo ""
echo "   2. 로그인 테스트:"
echo "      https://hiker-cloud.site/login"
echo ""
echo "   3. 상세 검증:"
echo "      ./scripts/verify-cognito-setup.sh"
echo "      ./scripts/test-cognito-login.sh"


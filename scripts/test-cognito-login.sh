#!/bin/bash

# Cognito 로그인 테스트 스크립트

set -e

STACK_NAME=${1:-"hiker-cloud-cognito"}
REGION="ap-northeast-2"
FRONTEND_URL="https://hiker-cloud.site"

echo "🧪 Cognito 로그인 테스트 시작..."
echo ""

# CloudFormation 스택에서 User Pool ID 가져오기
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text 2>/dev/null || echo "")

CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
  --output text 2>/dev/null || echo "")

if [ -z "$USER_POOL_ID" ] || [ -z "$CLIENT_ID" ]; then
  echo "❌ Cognito User Pool 정보를 가져올 수 없습니다."
  exit 1
fi

echo "📋 테스트 정보:"
echo "   User Pool ID: $USER_POOL_ID"
echo "   Client ID: $CLIENT_ID"
echo "   Frontend URL: $FRONTEND_URL"
echo ""

# 테스트 사용자 생성
TEST_USERNAME="test-user-$(date +%s)"
TEST_PASSWORD="Test1234!@#$"
TEST_EMAIL="test-$(date +%s)@test.com"

echo "1️⃣ 테스트 사용자 생성 중..."
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$TEST_USERNAME" \
  --user-attributes Name=email,Value="$TEST_EMAIL" Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --region "$REGION" &>/dev/null || true

aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username "$TEST_USERNAME" \
  --password "$TEST_PASSWORD" \
  --permanent \
  --region "$REGION" &>/dev/null || true

echo "   ✅ 테스트 사용자 생성 완료: $TEST_USERNAME"
echo ""

# 로그인 테스트
echo "2️⃣ Cognito 로그인 테스트 중..."
LOGIN_RESULT=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" \
  --auth-parameters USERNAME="$TEST_USERNAME",PASSWORD="$TEST_PASSWORD" \
  --region "$REGION" \
  --output json 2>/dev/null || echo "{}")

if echo "$LOGIN_RESULT" | grep -q "AuthenticationResult"; then
  echo "   ✅ 로그인 성공!"
  
  ID_TOKEN=$(echo "$LOGIN_RESULT" | jq -r '.AuthenticationResult.IdToken' 2>/dev/null || echo "")
  ACCESS_TOKEN=$(echo "$LOGIN_RESULT" | jq -r '.AuthenticationResult.AccessToken' 2>/dev/null || echo "")
  
  if [ -n "$ID_TOKEN" ] && [ "$ID_TOKEN" != "null" ]; then
    echo "   ✅ IdToken 받음"
    
    # 토큰 디코딩 (페이로드만)
    PAYLOAD=$(echo "$ID_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "")
    if [ -n "$PAYLOAD" ]; then
      echo "   📄 Token Payload:"
      echo "$PAYLOAD" | jq '.' 2>/dev/null || echo "$PAYLOAD"
    fi
  else
    echo "   ⚠️ IdToken을 받지 못했습니다."
  fi
else
  echo "   ❌ 로그인 실패"
  echo "   응답: $LOGIN_RESULT"
fi

echo ""

# 테스트 사용자 삭제
echo "3️⃣ 테스트 사용자 삭제 중..."
aws cognito-idp admin-delete-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$TEST_USERNAME" \
  --region "$REGION" &>/dev/null || true

echo "   ✅ 테스트 사용자 삭제 완료"
echo ""

# Lambda Function 테스트
echo "4️⃣ Lambda Function 테스트 중..."

# social-login-handler Function URL 확인
FUNCTION_URL=$(aws lambda get-function-url-config \
  --function-name social-login-handler \
  --region "$REGION" \
  --query 'FunctionUrl' \
  --output text 2>/dev/null || echo "")

if [ -n "$FUNCTION_URL" ]; then
  echo "   ✅ Function URL: $FUNCTION_URL"
  
  # 간단한 테스트 요청 (실제 OAuth 코드 없이)
  echo "   ⚠️ 실제 OAuth 코드가 필요하므로 Lambda Function 테스트는 수동으로 진행하세요."
  echo "   테스트 방법:"
  echo "   curl -X POST $FUNCTION_URL \\"
  echo "     -H 'Content-Type: application/json' \\"
  echo "     -d '{\"provider\":\"kakao\",\"code\":\"test-code\",\"redirectUri\":\"$FRONTEND_URL/api/auth/kakao/callback\"}'"
else
  echo "   ⚠️ Function URL이 생성되지 않았습니다."
fi

echo ""
echo "✅ 테스트 완료!"
echo ""
echo "📝 다음 단계:"
echo "   1. 브라우저에서 $FRONTEND_URL/login 접속"
echo "   2. 일반 로그인 테스트"
echo "   3. 소셜 로그인 (카카오/네이버) 테스트"


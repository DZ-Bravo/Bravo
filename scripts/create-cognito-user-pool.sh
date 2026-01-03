#!/bin/bash

# Cognito User Pool 생성 스크립트
# 사용법: ./create-cognito-user-pool.sh [stack-name]

set -e

STACK_NAME=${1:-"hiker-cloud-cognito"}
REGION="ap-northeast-2"
TEMPLATE_FILE="cloudformation/cognito-user-pool.yaml"

echo "🔐 Cognito User Pool 생성 시작..."
echo "Stack Name: $STACK_NAME"
echo "Region: $REGION"
echo ""

# 필수 파라미터 확인
if [ -z "$MONGODB_URI" ]; then
  echo "❌ MONGODB_URI 환경 변수가 설정되지 않았습니다."
  echo "   export MONGODB_URI='your-mongodb-uri'"
  exit 1
fi

if [ -z "$KAKAO_REST_API_KEY" ]; then
  echo "❌ KAKAO_REST_API_KEY 환경 변수가 설정되지 않았습니다."
  echo "   export KAKAO_REST_API_KEY='your-kakao-key'"
  exit 1
fi

if [ -z "$NAVER_CLIENT_ID" ]; then
  echo "❌ NAVER_CLIENT_ID 환경 변수가 설정되지 않았습니다."
  echo "   export NAVER_CLIENT_ID='your-naver-id'"
  exit 1
fi

if [ -z "$NAVER_CLIENT_SECRET" ]; then
  echo "❌ NAVER_CLIENT_SECRET 환경 변수가 설정되지 않았습니다."
  echo "   export NAVER_CLIENT_SECRET='your-naver-secret'"
  exit 1
fi

# CloudFormation 스택 생성
echo "📦 CloudFormation 스택 생성 중..."

aws cloudformation create-stack \
  --stack-name "$STACK_NAME" \
  --template-body file://"$TEMPLATE_FILE" \
  --parameters \
    ParameterKey=MongoDBURI,ParameterValue="$MONGODB_URI" \
    ParameterKey=KakaoRestApiKey,ParameterValue="$KAKAO_REST_API_KEY" \
    ParameterKey=NaverClientId,ParameterValue="$NAVER_CLIENT_ID" \
    ParameterKey=NaverClientSecret,ParameterValue="$NAVER_CLIENT_SECRET" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION"

echo "⏳ 스택 생성 완료 대기 중..."
aws cloudformation wait stack-create-complete \
  --stack-name "$STACK_NAME" \
  --region "$REGION"

# 출력 값 가져오기
echo ""
echo "✅ Cognito User Pool 생성 완료!"
echo ""
echo "📋 출력 값:"
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs' \
  --output table

echo ""
echo "📝 다음 단계:"
echo "   1. Lambda Function 코드 배포:"
echo "      cd lambda && ./deploy.sh pre-token-generation"
echo "      cd lambda && ./deploy.sh social-login-handler"
echo ""
echo "   2. Lambda Function URL 생성 (social-login-handler):"
echo "      aws lambda create-function-url-config \\"
echo "        --function-name social-login-handler \\"
echo "        --auth-type NONE \\"
echo "        --cors '{\"AllowOrigins\": [\"*\"], \"AllowMethods\": [\"POST\"], \"AllowHeaders\": [\"content-type\"]}'"
echo ""
echo "   3. 환경 변수 설정:"
echo "      - Kubernetes ConfigMap에 COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID 추가"
echo "      - auth-service Deployment에 환경 변수 추가"
echo "      - frontend Deployment에 VITE_COGNITO_USER_POOL_ID, VITE_COGNITO_CLIENT_ID 추가"


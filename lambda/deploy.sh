#!/bin/bash

# Lambda Function 배포 스크립트
# 사용법: ./deploy.sh [social-login-handler|pre-token-generation]

set -e

FUNCTION_NAME=$1
REGION="ap-northeast-2"
ROLE_NAME="lambda-cognito-role"

if [ -z "$FUNCTION_NAME" ]; then
  echo "사용법: ./deploy.sh [social-login-handler|pre-token-generation]"
  exit 1
fi

if [ "$FUNCTION_NAME" != "social-login-handler" ] && [ "$FUNCTION_NAME" != "pre-token-generation" ]; then
  echo "오류: FUNCTION_NAME은 'social-login-handler' 또는 'pre-token-generation'이어야 합니다."
  exit 1
fi

cd "$FUNCTION_NAME"

echo "📦 $FUNCTION_NAME 배포 시작..."

# 1. 의존성 설치
echo "📥 의존성 설치 중..."
npm install --production

# 2. ZIP 파일 생성
echo "📦 ZIP 파일 생성 중..."
zip -r "../${FUNCTION_NAME}.zip" . -x "*.git*" "*.md" "node_modules/.cache/*"

cd ..

# 3. Lambda Function 생성 또는 업데이트
echo "🚀 Lambda Function 배포 중..."

# Function이 존재하는지 확인
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" &>/dev/null; then
  echo "✅ Function이 이미 존재합니다. 업데이트 중..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://${FUNCTION_NAME}.zip" \
    --region "$REGION"
  
  echo "⏳ Function 업데이트 완료 대기 중..."
  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"
else
  echo "🆕 새 Function 생성 중..."
  
  # IAM Role ARN 가져오기
  ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text 2>/dev/null || echo "")
  
  if [ -z "$ROLE_ARN" ]; then
    echo "❌ IAM Role '$ROLE_NAME'을 찾을 수 없습니다."
    echo "   먼저 IAM Role을 생성하세요. (참고: lambda/iam-role-setup.sh)"
    exit 1
  fi
  
  # 환경 변수 설정
  ENV_VARS="{}"
  if [ "$FUNCTION_NAME" == "social-login-handler" ]; then
    ENV_VARS='{
      "Variables": {
        "USER_POOL_ID": "",
        "CLIENT_ID": "",
        "KAKAO_REST_API_KEY": "",
        "NAVER_CLIENT_ID": "",
        "NAVER_CLIENT_SECRET": ""
      }
    }'
  elif [ "$FUNCTION_NAME" == "pre-token-generation" ]; then
    ENV_VARS='{
      "Variables": {
        "MONGODB_URI": ""
      }
    }'
  fi
  
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime "nodejs20.x" \
    --role "$ROLE_ARN" \
    --handler "index.handler" \
    --zip-file "fileb://${FUNCTION_NAME}.zip" \
    --timeout 30 \
    --memory-size 256 \
    --environment "$ENV_VARS" \
    --region "$REGION"
  
  echo "⏳ Function 생성 완료 대기 중..."
  aws lambda wait function-active \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"
fi

# 4. 환경 변수 업데이트 (필요한 경우)
echo "⚙️ 환경 변수 확인..."
echo "   환경 변수는 AWS Console에서 수동으로 설정하거나 다음 명령어를 사용하세요:"
echo "   aws lambda update-function-configuration --function-name $FUNCTION_NAME --environment 'Variables={KEY=value}'"

# 5. Function ARN 출력
FUNCTION_ARN=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Configuration.FunctionArn' --output text)
echo ""
echo "✅ 배포 완료!"
echo "   Function Name: $FUNCTION_NAME"
echo "   Function ARN: $FUNCTION_ARN"
echo "   Region: $REGION"
echo ""
echo "📝 다음 단계:"
echo "   1. AWS Console에서 환경 변수를 설정하세요"
echo "   2. (pre-token-generation의 경우) Cognito User Pool의 Pre Token Generation Trigger에 연결하세요"

# 6. ZIP 파일 정리
rm -f "${FUNCTION_NAME}.zip"


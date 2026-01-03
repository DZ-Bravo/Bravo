#!/bin/bash

# Cognito 환경 변수를 Kubernetes ConfigMap에 설정하는 스크립트

set -e

STACK_NAME=${1:-"hiker-cloud-cognito"}
REGION="ap-northeast-2"
NAMESPACE="bravo-core-ns"

echo "⚙️ Cognito 환경 변수 설정 중..."

# CloudFormation 스택에서 출력 값 가져오기
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
  --output text)

if [ -z "$USER_POOL_ID" ] || [ -z "$CLIENT_ID" ]; then
  echo "❌ Cognito User Pool 정보를 가져올 수 없습니다."
  echo "   Stack Name: $STACK_NAME"
  exit 1
fi

echo "✅ Cognito 정보:"
echo "   User Pool ID: $USER_POOL_ID"
echo "   Client ID: $CLIENT_ID"
echo ""

# Lambda Function URL 가져오기 (있는 경우)
LAMBDA_URL=$(aws lambda get-function-url-config \
  --function-name social-login-handler \
  --region "$REGION" \
  --query 'FunctionUrl' \
  --output text 2>/dev/null || echo "")

if [ -n "$LAMBDA_URL" ]; then
  echo "✅ Lambda Function URL: $LAMBDA_URL"
  echo ""
fi

# ConfigMap 업데이트
echo "📝 ConfigMap 업데이트 중..."

kubectl create configmap bravo-config \
  --from-literal=COGNITO_USER_POOL_ID="$USER_POOL_ID" \
  --from-literal=COGNITO_CLIENT_ID="$CLIENT_ID" \
  --from-literal=VITE_COGNITO_USER_POOL_ID="$USER_POOL_ID" \
  --from-literal=VITE_COGNITO_CLIENT_ID="$CLIENT_ID" \
  --dry-run=client -o yaml | \
  kubectl apply -f - -n "$NAMESPACE"

if [ -n "$LAMBDA_URL" ]; then
  kubectl create configmap bravo-config \
    --from-literal=SOCIAL_LOGIN_LAMBDA_URL="$LAMBDA_URL" \
    --dry-run=client -o yaml | \
    kubectl apply -f - -n "$NAMESPACE"
fi

# Frontend ConfigMap도 업데이트 (별도 네임스페이스인 경우)
FRONTEND_NAMESPACE="bravo-front-ns"
if kubectl get namespace "$FRONTEND_NAMESPACE" &>/dev/null; then
  echo "📝 Frontend ConfigMap 업데이트 중..."
  kubectl create configmap bravo-config \
    --from-literal=VITE_COGNITO_USER_POOL_ID="$USER_POOL_ID" \
    --from-literal=VITE_COGNITO_CLIENT_ID="$CLIENT_ID" \
    --dry-run=client -o yaml | \
    kubectl apply -f - -n "$FRONTEND_NAMESPACE"
fi

echo ""
echo "✅ 환경 변수 설정 완료!"
echo ""
echo "📝 다음 단계:"
echo "   1. Pod 재시작 (환경 변수 적용):"
echo "      kubectl rollout restart deployment -n $NAMESPACE"
echo "      kubectl rollout restart deployment -n $FRONTEND_NAMESPACE"
echo ""
echo "   2. 환경 변수 확인:"
echo "      kubectl get configmap bravo-config -n $NAMESPACE -o yaml"


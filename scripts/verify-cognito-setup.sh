#!/bin/bash

# Cognito 설정 검증 스크립트

set -e

STACK_NAME=${1:-"hiker-cloud-cognito"}
REGION="ap-northeast-2"
NAMESPACE="bravo-core-ns"

echo "🔍 Cognito 설정 검증 시작..."
echo ""

# 1. CloudFormation 스택 확인
echo "1️⃣ CloudFormation 스택 확인..."
if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" &>/dev/null; then
  echo "   ✅ 스택 '$STACK_NAME' 존재"
  
  # 출력 값 가져오기
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
  
  if [ -n "$USER_POOL_ID" ] && [ -n "$CLIENT_ID" ]; then
    echo "   ✅ User Pool ID: $USER_POOL_ID"
    echo "   ✅ Client ID: $CLIENT_ID"
  else
    echo "   ❌ User Pool ID 또는 Client ID를 가져올 수 없습니다."
  fi
else
  echo "   ❌ 스택 '$STACK_NAME'이 존재하지 않습니다."
  exit 1
fi

echo ""

# 2. Lambda Function 확인
echo "2️⃣ Lambda Function 확인..."

# pre-token-generation
if aws lambda get-function --function-name pre-token-generation --region "$REGION" &>/dev/null; then
  echo "   ✅ pre-token-generation 존재"
  
  # 환경 변수 확인
  ENV_VARS=$(aws lambda get-function-configuration \
    --function-name pre-token-generation \
    --region "$REGION" \
    --query 'Environment.Variables' \
    --output json 2>/dev/null || echo "{}")
  
  if echo "$ENV_VARS" | grep -q "MONGODB_URI"; then
    echo "   ✅ MONGODB_URI 환경 변수 설정됨"
  else
    echo "   ⚠️ MONGODB_URI 환경 변수가 설정되지 않았습니다."
  fi
else
  echo "   ❌ pre-token-generation이 존재하지 않습니다."
fi

# social-login-handler
if aws lambda get-function --function-name social-login-handler --region "$REGION" &>/dev/null; then
  echo "   ✅ social-login-handler 존재"
  
  # 환경 변수 확인
  ENV_VARS=$(aws lambda get-function-configuration \
    --function-name social-login-handler \
    --region "$REGION" \
    --query 'Environment.Variables' \
    --output json 2>/dev/null || echo "{}")
  
  REQUIRED_VARS=("USER_POOL_ID" "CLIENT_ID" "KAKAO_REST_API_KEY" "NAVER_CLIENT_ID" "NAVER_CLIENT_SECRET")
  for VAR in "${REQUIRED_VARS[@]}"; do
    if echo "$ENV_VARS" | grep -q "$VAR"; then
      echo "   ✅ $VAR 환경 변수 설정됨"
    else
      echo "   ⚠️ $VAR 환경 변수가 설정되지 않았습니다."
    fi
  done
  
  # Function URL 확인
  FUNCTION_URL=$(aws lambda get-function-url-config \
    --function-name social-login-handler \
    --region "$REGION" \
    --query 'FunctionUrl' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$FUNCTION_URL" ]; then
    echo "   ✅ Function URL: $FUNCTION_URL"
  else
    echo "   ⚠️ Function URL이 생성되지 않았습니다."
  fi
else
  echo "   ❌ social-login-handler가 존재하지 않습니다."
fi

echo ""

# 3. Cognito User Pool Trigger 확인
echo "3️⃣ Cognito User Pool Trigger 확인..."
if [ -n "$USER_POOL_ID" ]; then
  TRIGGER=$(aws cognito-idp describe-user-pool \
    --user-pool-id "$USER_POOL_ID" \
    --region "$REGION" \
    --query 'UserPool.LambdaConfig.PreTokenGeneration' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$TRIGGER" ] && [ "$TRIGGER" != "None" ]; then
    echo "   ✅ Pre Token Generation Trigger 설정됨: $TRIGGER"
  else
    echo "   ⚠️ Pre Token Generation Trigger가 설정되지 않았습니다."
  fi
fi

echo ""

# 4. Kubernetes ConfigMap 확인
echo "4️⃣ Kubernetes ConfigMap 확인..."

if kubectl get configmap bravo-config -n "$NAMESPACE" &>/dev/null; then
  echo "   ✅ bravo-config ConfigMap 존재"
  
  # Cognito 환경 변수 확인
  COGNITO_VARS=("COGNITO_USER_POOL_ID" "COGNITO_CLIENT_ID" "SOCIAL_LOGIN_LAMBDA_URL")
  for VAR in "${COGNITO_VARS[@]}"; do
    VALUE=$(kubectl get configmap bravo-config -n "$NAMESPACE" -o jsonpath="{.data.$VAR}" 2>/dev/null || echo "")
    if [ -n "$VALUE" ]; then
      echo "   ✅ $VAR 설정됨"
    else
      echo "   ⚠️ $VAR가 설정되지 않았습니다."
    fi
  done
else
  echo "   ❌ bravo-config ConfigMap이 존재하지 않습니다."
fi

# Frontend ConfigMap 확인
FRONTEND_NAMESPACE="bravo-front-ns"
if kubectl get namespace "$FRONTEND_NAMESPACE" &>/dev/null; then
  if kubectl get configmap bravo-config -n "$FRONTEND_NAMESPACE" &>/dev/null; then
    echo "   ✅ bravo-config ConfigMap (frontend) 존재"
    
    FRONTEND_VARS=("VITE_COGNITO_USER_POOL_ID" "VITE_COGNITO_CLIENT_ID")
    for VAR in "${FRONTEND_VARS[@]}"; do
      VALUE=$(kubectl get configmap bravo-config -n "$FRONTEND_NAMESPACE" -o jsonpath="{.data.$VAR}" 2>/dev/null || echo "")
      if [ -n "$VALUE" ]; then
        echo "   ✅ $VAR 설정됨"
      else
        echo "   ⚠️ $VAR가 설정되지 않았습니다."
      fi
    done
  else
    echo "   ⚠️ bravo-config ConfigMap (frontend)이 존재하지 않습니다."
  fi
fi

echo ""

# 5. Pod 상태 확인
echo "5️⃣ Pod 상태 확인..."

# auth-service 확인
AUTH_PODS=$(kubectl get pods -n "$NAMESPACE" -l app=auth-service --no-headers 2>/dev/null | wc -l || echo "0")
if [ "$AUTH_PODS" -gt 0 ]; then
  echo "   ✅ auth-service Pod 존재 ($AUTH_PODS개)"
  
  # Pod가 Running 상태인지 확인
  RUNNING=$(kubectl get pods -n "$NAMESPACE" -l app=auth-service --no-headers 2>/dev/null | grep -c "Running" || echo "0")
  if [ "$RUNNING" -gt 0 ]; then
    echo "   ✅ auth-service Pod 실행 중 ($RUNNING개)"
  else
    echo "   ⚠️ auth-service Pod가 실행 중이 아닙니다."
  fi
else
  echo "   ⚠️ auth-service Pod가 존재하지 않습니다."
fi

# frontend 확인
if kubectl get namespace "$FRONTEND_NAMESPACE" &>/dev/null; then
  FRONTEND_PODS=$(kubectl get pods -n "$FRONTEND_NAMESPACE" -l app=frontend --no-headers 2>/dev/null | wc -l || echo "0")
  if [ "$FRONTEND_PODS" -gt 0 ]; then
    echo "   ✅ frontend Pod 존재 ($FRONTEND_PODS개)"
    
    RUNNING=$(kubectl get pods -n "$FRONTEND_NAMESPACE" -l app=frontend --no-headers 2>/dev/null | grep -c "Running" || echo "0")
    if [ "$RUNNING" -gt 0 ]; then
      echo "   ✅ frontend Pod 실행 중 ($RUNNING개)"
    else
      echo "   ⚠️ frontend Pod가 실행 중이 아닙니다."
    fi
  else
    echo "   ⚠️ frontend Pod가 존재하지 않습니다."
  fi
fi

echo ""
echo "✅ 검증 완료!"
echo ""
echo "📝 다음 단계:"
echo "   - 누락된 설정이 있으면 위의 ⚠️ 항목을 확인하세요"
echo "   - 모든 설정이 완료되면 로그인 테스트를 진행하세요"


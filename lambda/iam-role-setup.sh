#!/bin/bash

# Lambda Function용 IAM Role 생성 스크립트

set -e

ROLE_NAME="lambda-cognito-role"
REGION="ap-northeast-2"

echo "🔐 Lambda Function용 IAM Role 생성 중..."

# 1. Trust Policy 생성
cat > /tmp/trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# 2. IAM Role 생성
if aws iam get-role --role-name "$ROLE_NAME" &>/dev/null; then
  echo "✅ IAM Role '$ROLE_NAME'이 이미 존재합니다."
else
  echo "🆕 IAM Role 생성 중..."
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document file:///tmp/trust-policy.json
  
  echo "⏳ Role 생성 완료 대기 중..."
  sleep 5
fi

# 3. 기본 Lambda 실행 정책 연결
echo "📋 기본 Lambda 실행 정책 연결 중..."
aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"

# 4. Cognito 권한 정책 생성
cat > /tmp/cognito-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminSetUserPassword",
        "cognito-idp:AdminGetUser",
        "cognito-idp:ListUsers",
        "cognito-idp:AdminUpdateUserAttributes"
      ],
      "Resource": "arn:aws:cognito-idp:${REGION}:*:userpool/*"
    }
  ]
}
EOF

POLICY_NAME="${ROLE_NAME}-cognito-policy"
POLICY_ARN=$(aws iam create-policy \
  --policy-name "$POLICY_NAME" \
  --policy-document file:///tmp/cognito-policy.json \
  --query 'Policy.Arn' \
  --output text 2>/dev/null || \
  aws iam get-policy --policy-arn "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/$POLICY_NAME" --query 'Policy.Arn' --output text)

echo "📋 Cognito 권한 정책 연결 중..."
aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "$POLICY_ARN"

# 5. Role ARN 출력
ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)
echo ""
echo "✅ IAM Role 설정 완료!"
echo "   Role Name: $ROLE_NAME"
echo "   Role ARN: $ROLE_ARN"
echo ""
echo "📝 다음 단계:"
echo "   1. ./deploy.sh social-login-handler 실행"
echo "   2. ./deploy.sh pre-token-generation 실행"

# 정리
rm -f /tmp/trust-policy.json /tmp/cognito-policy.json


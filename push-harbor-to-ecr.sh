#!/bin/bash
# Harbor에 있는 이미지를 ECR로 푸시하는 스크립트
# 사용법: ./push-harbor-to-ecr.sh

set -e

# AWS 설정
AWS_REGION="ap-northeast-2"
AWS_ACCOUNT_ID="940482451773"

# Harbor 설정
HARBOR_REGISTRY="192.168.0.244:30443"
HARBOR_PROJECT="bravo"

# ECR 설정
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECR_REPOSITORY="bravo"
IMAGE_VERSION="2.0"

echo "=========================================="
echo "Harbor → ECR 이미지 푸시 스크립트"
echo "=========================================="
echo "AWS 계정 ID: $AWS_ACCOUNT_ID"
echo "ECR 레지스트리: $ECR_REGISTRY"
echo "Harbor 레지스트리: $HARBOR_REGISTRY"
echo "이미지 버전: $IMAGE_VERSION"
echo "=========================================="
echo ""

# ECR 로그인
echo "ECR에 로그인 중..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY

# Harbor 로그인
echo "Harbor에 로그인 중..."
HARBOR_USER="admin"
HARBOR_PASS="bravo6785#"
echo "$HARBOR_PASS" | docker login -u "$HARBOR_USER" --password-stdin "$HARBOR_REGISTRY" || {
    echo "⚠️  Harbor 로그인 실패. Docker daemon에 insecure-registry 설정이 필요할 수 있습니다."
    exit 1
}

# 서비스 목록
SERVICES=(
    "auth-service"
    "community-service"
    "notice-service"
    "schedule-service"
    "notification-service"
    "store-service"
    "mountain-service"
    "stamp-service"
    "chatbot-service"
    "ai-service"
    "frontend"
    "ai-infra-service"
)

echo ""
echo "이미지 푸시 시작..."
echo ""

for service_name in "${SERVICES[@]}"; do
    HARBOR_IMAGE="$HARBOR_REGISTRY/$HARBOR_PROJECT/hiking-$service_name:$IMAGE_VERSION"
    ECR_IMAGE="$ECR_REGISTRY/$ECR_REPOSITORY/hiking-$service_name:$IMAGE_VERSION"
    
    echo "=========================================="
    echo "처리 중: $service_name"
    echo "Source: $HARBOR_IMAGE"
    echo "Target: $ECR_IMAGE"
    echo "=========================================="
    
    # ECR 리포지토리 생성 (없으면) - 서비스별 리포지토리 생성
    ECR_REPO_NAME="$ECR_REPOSITORY/hiking-$service_name"
    echo "ECR 리포지토리 확인/생성 중: $ECR_REPO_NAME"
    aws ecr describe-repositories --repository-names "$ECR_REPO_NAME" --region $AWS_REGION >/dev/null 2>&1 || {
        echo "ECR 리포지토리 생성 중: $ECR_REPO_NAME"
        aws ecr create-repository \
            --repository-name "$ECR_REPO_NAME" \
            --region $AWS_REGION \
            --image-tag-mutability MUTABLE \
            --encryption-configuration encryptionType=AES256
    }
    
    # Harbor에서 이미지 pull
    echo "Harbor에서 이미지 pull 중..."
    docker pull "$HARBOR_IMAGE" || {
        echo "⚠️  $HARBOR_IMAGE pull 실패, 건너뜀"
        continue
    }
    
    # ECR 태그 추가
    echo "ECR 태그 추가 중..."
    docker tag "$HARBOR_IMAGE" "$ECR_IMAGE"
    
    # ECR에 push
    echo "ECR에 push 중..."
    docker push "$ECR_IMAGE"
    
    echo "✅ $service_name 완료"
    echo ""
done

echo "=========================================="
echo "모든 이미지 ECR 푸시 완료!"
echo "=========================================="
echo ""
echo "ECR 이미지 목록:"
for service_name in "${SERVICES[@]}"; do
    echo "  $ECR_REGISTRY/$ECR_REPOSITORY/hiking-$service_name:$IMAGE_VERSION"
done


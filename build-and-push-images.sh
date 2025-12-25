#!/bin/bash
# Harbor에 이미지를 빌드하고 push하는 스크립트
# 사용법: ./build-and-push-images.sh

set -e

HARBOR_REGISTRY="192.168.0.244:30305"
HARBOR_PROJECT="bravo"
HARBOR_USER="admin"
HARBOR_PASS="bravo6785#"

# Harbor 로그인
echo "Harbor에 로그인 중..."
docker login -u "$HARBOR_USER" -p "$HARBOR_PASS" "$HARBOR_REGISTRY"

# 빌드 컨텍스트 (services 디렉토리)
BUILD_CONTEXT="/home/bravo/LABs/services"

# 빌드할 서비스 목록
SERVICES=(
    "auth-service:backend-services/auth-service/Dockerfile"
    "community-service:backend-services/community-service/Dockerfile"
    "notice-service:backend-services/notice-service/Dockerfile"
    "schedule-service:backend-services/schedule-service/Dockerfile"
    "notification-service:backend-services/notification-service/Dockerfile"
    "store-service:backend-services/store-service/Dockerfile"
    "mountain-service:backend-services/mountain-service/Dockerfile"
    "stamp-service:backend-services/stamp-service/Dockerfile"
    "chatbot-service:backend-services/chatbot-service/Dockerfile"
    "ai-service:backend-services/ai-service/Dockerfile"
    "frontend:frontend-service/Dockerfile"
    "ai-infra-service:ai-infra-service/backend/Dockerfile"
)

echo "이미지 빌드 및 push 시작..."

for service_info in "${SERVICES[@]}"; do
    IFS=':' read -r service_name dockerfile_path <<< "$service_info"
    
    IMAGE_NAME="$HARBOR_REGISTRY/$HARBOR_PROJECT/hiking-$service_name:latest"
    
    # frontend-service와 ai-infra-service는 빌드 컨텍스트가 다름
    if [ "$service_name" == "frontend" ]; then
        SERVICE_BUILD_CONTEXT="$BUILD_CONTEXT/frontend-service"
        DOCKERFILE_PATH="$SERVICE_BUILD_CONTEXT/Dockerfile"
    elif [ "$service_name" == "ai-infra-service" ]; then
        SERVICE_BUILD_CONTEXT="$BUILD_CONTEXT/ai-infra-service/backend"
        DOCKERFILE_PATH="$SERVICE_BUILD_CONTEXT/Dockerfile"
    else
        SERVICE_BUILD_CONTEXT="$BUILD_CONTEXT"
        DOCKERFILE_PATH="$BUILD_CONTEXT/$dockerfile_path"
    fi
    
    echo ""
    echo "=========================================="
    echo "빌드 중: $service_name"
    echo "Dockerfile: $DOCKERFILE_PATH"
    echo "빌드 컨텍스트: $SERVICE_BUILD_CONTEXT"
    echo "이미지: $IMAGE_NAME"
    echo "=========================================="
    
    # frontend는 빌드 인자 필요
    if [ "$service_name" == "frontend" ]; then
        # 이미지 빌드 (빌드 인자 포함)
        docker build -t "$IMAGE_NAME" \
            --build-arg VITE_KAKAO_MAP_API_KEY=650caaa8d67f90186c6a48c0df81607b \
            -f "$DOCKERFILE_PATH" \
            "$SERVICE_BUILD_CONTEXT"
    else
        # 이미지 빌드
        docker build -t "$IMAGE_NAME" \
            -f "$DOCKERFILE_PATH" \
            "$SERVICE_BUILD_CONTEXT"
    fi
    
    # Harbor에 push
    echo "Harbor에 push 중..."
    docker push "$IMAGE_NAME"
    
    echo "✅ $service_name 완료"
done

echo ""
echo "=========================================="
echo "모든 이미지 빌드 및 push 완료!"
echo "=========================================="
echo ""
echo "이제 Kubernetes Deployment를 다시 스케일 업하세요:"
echo "  kubectl scale deployment -n bravo-core-ns auth-service --replicas=2"
echo "  kubectl scale deployment -n bravo-core-ns community-service --replicas=2"
echo "  kubectl scale deployment -n bravo-core-ns mountain-service --replicas=2"
echo "  kubectl scale deployment -n bravo-core-ns store-service --replicas=2"


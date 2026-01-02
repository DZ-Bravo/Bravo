#!/bin/bash
# Harbor에 이미지를 빌드하고 2.0 태그로 push하는 스크립트
# 사용법: ./build-and-push-to-harbor-2.0.sh

set -e

HARBOR_REGISTRY="192.168.0.244:30443"
HARBOR_PROJECT="bravo"
IMAGE_VERSION="2.0"

# Harbor 로그인
echo "Harbor에 로그인 중..."
echo "Harbor 레지스트리: $HARBOR_REGISTRY"
HARBOR_USER="admin"
HARBOR_PASS="bravo6785#"

# Harbor 로그인 (비밀번호에 특수문자가 있어서 --password-stdin 사용)
# TLS 인증서 검증 오류를 피하기 위해 --insecure-registry 사용 불가
# 대신 Docker daemon에 insecure-registry 설정 필요
echo "$HARBOR_PASS" | docker login -u "$HARBOR_USER" --password-stdin "$HARBOR_REGISTRY" || {
    echo "⚠️  Harbor 로그인 실패. Docker daemon에 insecure-registry 설정이 필요할 수 있습니다."
    echo ""
    echo "다음 명령어로 Docker daemon 설정을 확인하세요:"
    echo "  sudo cat /etc/docker/daemon.json"
    echo ""
    echo "다음과 같이 설정하세요 (/etc/docker/daemon.json):"
    echo '  {'
    echo '    "insecure-registries": ["192.168.0.244:30443"]'
    echo '  }'
    echo ""
    echo "설정 후 Docker 재시작:"
    echo "  sudo systemctl restart docker"
    exit 1
}

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

echo "이미지 빌드 및 Harbor push 시작..."

for service_info in "${SERVICES[@]}"; do
    IFS=':' read -r service_name dockerfile_path <<< "$service_info"
    
    IMAGE_NAME="$HARBOR_REGISTRY/$HARBOR_PROJECT/hiking-$service_name:$IMAGE_VERSION"
    
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
echo "모든 이미지 빌드 및 Harbor push 완료!"
echo "=========================================="
echo ""
echo "업로드된 이미지 목록:"
for service_info in "${SERVICES[@]}"; do
    IFS=':' read -r service_name dockerfile_path <<< "$service_info"
    echo "  $HARBOR_REGISTRY/$HARBOR_PROJECT/hiking-$service_name:$IMAGE_VERSION"
done


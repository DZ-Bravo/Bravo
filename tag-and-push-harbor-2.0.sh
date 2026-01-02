#!/bin/bash
# Harbor에 있는 latest 이미지에 2.0 태그를 추가하고 push하는 스크립트
# 사용법: ./tag-and-push-harbor-2.0.sh

set -e

HARBOR_REGISTRY="192.168.0.244:30443"
HARBOR_PROJECT="bravo"
IMAGE_VERSION="2.0"

# Harbor 로그인
echo "Harbor에 로그인 중..."
HARBOR_USER="admin"
HARBOR_PASS="bravo6785#"

# Harbor 로그인 시도
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
    echo ""
    echo "수동 로그인을 시도하세요:"
    echo "docker login -u admin 192.168.0.244:30443"
    echo ""
    read -p "로그인 완료 후 Enter를 누르세요..."
}

# 빌드할 서비스 목록
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

echo "이미지 태그 및 push 시작..."

for service_name in "${SERVICES[@]}"; do
    SOURCE_IMAGE="$HARBOR_REGISTRY/$HARBOR_PROJECT/hiking-$service_name:latest"
    TARGET_IMAGE="$HARBOR_REGISTRY/$HARBOR_PROJECT/hiking-$service_name:$IMAGE_VERSION"
    
    echo ""
    echo "=========================================="
    echo "태그 추가 중: $service_name"
    echo "Source: $SOURCE_IMAGE"
    echo "Target: $TARGET_IMAGE"
    echo "=========================================="
    
    # latest 이미지 pull
    echo "이미지 pull 중..."
    docker pull "$SOURCE_IMAGE" || {
        echo "⚠️  $SOURCE_IMAGE pull 실패, 건너뜀"
        continue
    }
    
    # 2.0 태그 추가
    echo "태그 추가 중..."
    docker tag "$SOURCE_IMAGE" "$TARGET_IMAGE"
    
    # Harbor에 push
    echo "Harbor에 push 중..."
    docker push "$TARGET_IMAGE"
    
    echo "✅ $service_name 완료"
done

echo ""
echo "=========================================="
echo "모든 이미지 태그 및 push 완료!"
echo "=========================================="


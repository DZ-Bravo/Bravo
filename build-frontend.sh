#!/bin/bash

# 프론트엔드 이미지 재빌드 스크립트
# 카카오 지도 API 키를 빌드 타임에 포함시킴

set -e

echo "=== 프론트엔드 이미지 재빌드 시작 ==="

# 카카오 지도 API 키
VITE_KAKAO_MAP_API_KEY="650caaa8d67f90186c6a48c0df81607b"

# Cesium Access Token (Secret에서 가져오기)
VITE_CESIUM_ACCESS_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4MTI5Mjc1ZC02YjhjLTRhOWMtYTQyNS03NjkwYzgyZGMyZTYiLCJpZCI6MzY3NTE0LCJpYXQiOjE3NjUxNjExNTF9.As5RoX8zHf_k32QISU3-3xnvDi_VWt9rxOmgCfIFDwM"

# Harbor 레지스트리
REGISTRY="192.168.0.244:30305"
IMAGE_NAME="bravo/hiking-frontend"
IMAGE_TAG="latest"
FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"

# 프론트엔드 서비스 디렉토리
FRONTEND_DIR="services/frontend-service"

if [ ! -d "$FRONTEND_DIR" ]; then
    echo "❌ 오류: $FRONTEND_DIR 디렉토리를 찾을 수 없습니다."
    exit 1
fi

echo "📦 이미지 빌드 중..."
cd "$FRONTEND_DIR"

docker build \
    --build-arg VITE_KAKAO_MAP_API_KEY="${VITE_KAKAO_MAP_API_KEY}" \
    --build-arg VITE_CESIUM_ACCESS_TOKEN="${VITE_CESIUM_ACCESS_TOKEN}" \
    -t "${FULL_IMAGE}" \
    .

if [ $? -ne 0 ]; then
    echo "❌ 이미지 빌드 실패"
    exit 1
fi

echo "✅ 이미지 빌드 완료"
echo "📤 Harbor에 푸시 중..."

docker push "${FULL_IMAGE}"

if [ $? -ne 0 ]; then
    echo "❌ 이미지 푸시 실패"
    exit 1
fi

echo "✅ 이미지 푸시 완료"
echo ""
echo "🔄 Kubernetes Pod 재시작 중..."

kubectl rollout restart deployment frontend -n bravo-front-ns

if [ $? -ne 0 ]; then
    echo "❌ Pod 재시작 실패"
    exit 1
fi

echo "✅ Pod 재시작 완료"
echo ""
echo "⏳ Pod가 준비될 때까지 대기 중..."
kubectl rollout status deployment frontend -n bravo-front-ns --timeout=300s

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 완료! 프론트엔드가 재배포되었습니다."
    echo "웹페이지를 새로고침하면 카카오 지도가 정상 작동합니다."
else
    echo "⚠️  Pod 재시작이 완료되지 않았습니다. 상태를 확인해주세요."
    kubectl get pods -n bravo-front-ns -l app=frontend
fi


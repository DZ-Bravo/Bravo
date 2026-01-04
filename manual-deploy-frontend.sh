#!/bin/bash
set -e

# 환경 변수 설정
AWS_ACCOUNT_ID="940482451773"
AWS_DEFAULT_REGION="ap-northeast-2"
ECR_REPO="bravo/hiking-frontend"
SERVICE_NAME="frontend"
K8S_NS="bravo-front-ns"

# 이미지 태그 생성 (타임스탬프 기반)
IMAGE_TAG="$(date +%Y%m%d-%H%M%S)"

echo "=========================================="
echo "Frontend Service 수동 배포 시작"
echo "=========================================="
echo "서비스: $SERVICE_NAME"
echo "ECR Repository: $ECR_REPO"
echo "이미지 태그: $IMAGE_TAG"
echo "Kubernetes Namespace: $K8S_NS"
echo "=========================================="

# 1. ECR 로그인
echo ""
echo "1. ECR 로그인 중..."
aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | \
  docker login --username AWS --password-stdin \
  "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com"

# 2. Docker 이미지 빌드
echo ""
echo "2. Docker 이미지 빌드 중..."
cd /home/bravo/LABs/services/frontend-service

docker build \
  --build-arg VITE_KAKAO_MAP_API_KEY=650caaa8d67f90186c6a48c0df81607b \
  --build-arg VITE_CESIUM_ACCESS_TOKEN="${VITE_CESIUM_ACCESS_TOKEN:-}" \
  -f Dockerfile \
  -t "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}" \
  -t "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com/${ECR_REPO}:latest" \
  .

# 3. ECR에 푸시
echo ""
echo "3. ECR에 이미지 푸시 중..."
docker push "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}"
docker push "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com/${ECR_REPO}:latest"

# 4. Kubernetes 배포 업데이트
echo ""
echo "4. Kubernetes 배포 업데이트 중..."
CONTAINER_NAME=$(kubectl get deploy ${SERVICE_NAME} -n ${K8S_NS} \
  -o jsonpath='{.spec.template.spec.containers[0].name}' 2>/dev/null || echo "frontend")

echo "컨테이너 이름: $CONTAINER_NAME"

kubectl set image deployment/${SERVICE_NAME} \
  ${CONTAINER_NAME}=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG} \
  -n ${K8S_NS}

# 5. 배포 상태 확인
echo ""
echo "5. 배포 상태 확인 중..."
kubectl rollout status deployment/${SERVICE_NAME} \
  -n ${K8S_NS} \
  --timeout=5m || {
    echo "❌ 배포 실패. 롤백 중..."
    kubectl rollout undo deployment/${SERVICE_NAME} -n ${K8S_NS}
    exit 1
  }

echo ""
echo "=========================================="
echo "✅ Frontend Service 배포 완료!"
echo "=========================================="
echo "이미지: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}"
echo ""

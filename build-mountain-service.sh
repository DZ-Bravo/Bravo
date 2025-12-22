#!/bin/bash
set -e

echo "=== Mountain Service 이미지 빌드 ==="

cd /home/bravo/LABs

# Harbor 로그인
echo "Harbor 로그인 중..."
docker login 192.168.0.244:30305 -u admin -p "bravo6785#" || true

# 이미지 빌드 (캐시 없이)
echo "이미지 빌드 중 (캐시 무시)..."
docker build --no-cache -t 192.168.0.244:30305/bravo/hiking-mountain-service:latest \
  -f services/backend-services/mountain-service/Dockerfile \
  services/

# 이미지 푸시
echo "이미지 푸시 중..."
docker push 192.168.0.244:30305/bravo/hiking-mountain-service:latest

# Kubernetes 배포 재시작
echo "Kubernetes 배포 재시작 중..."
kubectl rollout restart deployment mountain-service -n bravo-core-ns

echo "✅ 완료!"
echo ""
echo "배포 상태 확인:"
kubectl rollout status deployment mountain-service -n bravo-core-ns --timeout=300s

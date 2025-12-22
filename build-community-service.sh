#!/bin/bash
set -e

echo "=== Community Service 이미지 빌드 ==="

cd /home/bravo/LABs

# Harbor 로그인
echo "Harbor 로그인 중..."
docker login 192.168.0.244:30305 -u admin -p "bravo6785#" || true

# 이미지 빌드
echo "이미지 빌드 중..."
docker build -t 192.168.0.244:30305/bravo/hiking-community-service:latest \
  -f services/backend-services/community-service/Dockerfile \
  services/

# 이미지 푸시
echo "이미지 푸시 중..."
docker push 192.168.0.244:30305/bravo/hiking-community-service:latest

# Kubernetes 배포 재시작
echo "Kubernetes 배포 재시작 중..."
kubectl rollout restart deployment community-service -n bravo-core-ns

echo "✅ 완료!"

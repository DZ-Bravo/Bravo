# Kubernetes 마이그레이션 가이드

이 디렉토리에는 Docker Compose에서 Kubernetes로 마이그레이션된 모든 서비스의 매니페스트가 포함되어 있습니다.

## 디렉토리 구조

```
k8s/
├── namespace/          # 네임스페이스 정의
├── config/            # ConfigMap 및 Secret
├── databases/         # MongoDB 및 Redis StatefulSet
├── efk/              # Elasticsearch, Fluent Bit, Kibana, Monstache
├── backend/           # 백엔드 서비스 Deployments
├── frontend/          # 프론트엔드 서비스 Deployment
└── ingress/           # Traefik 및 HAProxy
```

## 배포 순서

### 1. 네임스페이스 생성
```bash
kubectl apply -f namespace/
```

### 2. ConfigMap 및 Secret 생성
```bash
# Secret 파일 수정 필요 (실제 값으로 변경)
kubectl apply -f config/
```

### 3. MongoDB Keyfile 생성
```bash
# MongoDB Replica Set을 위한 keyfile 생성
openssl rand -base64 756 > mongodb-keyfile
kubectl create secret generic mongodb-keyfile \
  --from-file=keyfile=mongodb-keyfile \
  -n hiking
```

### 4. 데이터베이스 배포
```bash
kubectl apply -f databases/
```

### 5. MongoDB Replica Set 초기화
```bash
# MongoDB Pod가 모두 준비될 때까지 대기
kubectl wait --for=condition=ready pod -l app=mongodb -n hiking --timeout=300s

# Replica Set 초기화
kubectl exec -it mongodb-0 -n hiking -- mongosh --eval "
rs.initiate({
  _id: 'rs0',
  members: [
    { _id: 0, host: 'mongodb-0.mongodb:27017', priority: 2 },
    { _id: 1, host: 'mongodb-1.mongodb:27017', priority: 1 },
    { _id: 2, host: 'mongodb-2.mongodb:27017', priority: 1 }
  ]
})
"
```

### 6. EFK Stack 배포
```bash
kubectl apply -f efk/
```

### 7. 백엔드 서비스 배포
```bash
kubectl apply -f backend/
```

### 8. 프론트엔드 서비스 배포
```bash
kubectl apply -f frontend/
```

### 9. Istio Gateway 및 VirtualService 배포
```bash
kubectl apply -f ingress/
```

## 주요 구성

### MongoDB
- **구성**: Primary-Secondary-Secondary (읽기 복제본)
- **Replica Set**: rs0
- **인증**: admin/admin123
- **읽기 선호도**: secondaryPreferred (대부분의 서비스), primary (stamp-service)

### Redis
- **구성**: Primary-Secondary-Sentinel
- **Sentinel**: 3개 인스턴스
- **고가용성**: 자동 failover 지원

### EFK Stack
- **Elasticsearch**: 단일 노드 (8.11.0)
- **Kibana**: 시각화 및 관리
- **Fluent Bit**: 로그 수집 (DaemonSet)
- **Monstache**: MongoDB to Elasticsearch 동기화

### 백엔드 서비스
모든 백엔드 서비스는 2개의 replica로 실행됩니다:
- auth-service (3001)
- community-service (3002)
- notice-service (3003)
- schedule-service (3004)
- notification-service (3005)
- store-service (3006)
- chatbot-service (3007)
- mountain-service (3008)
- ai-service (3009)
- stamp-service (3010)

### 프론트엔드
- **포트**: 80
- **Replicas**: 2

### Ingress
- **Istio Gateway**: Istio Ingress Gateway 사용 (포트 80)
- **VirtualService**: 라우팅 규칙 정의
- Istio Ingress Gateway는 `istio-system` 네임스페이스에 설치되어 있음

## 환경 변수

모든 환경 변수는 `config/configmap.yaml`과 `config/secret.yaml`에 정의되어 있습니다.

### ConfigMap
- TZ, NODE_ENV, AWS_REGION 등 공개 설정

### Secret
- AWS 자격 증명
- API 키 및 토큰
- JWT Secret

## 볼륨

### PersistentVolumeClaim
모든 PVC는 **Longhorn StorageClass**를 사용합니다:
- `auth-uploads-pvc`: auth-service 업로드 파일 (ReadWriteMany)
- `community-uploads-pvc`: community-service 업로드 파일 (ReadWriteMany)
- `mountain-data-pvc`: mountain-service 정적 데이터 (ReadOnlyMany)
- MongoDB 및 Redis 데이터 볼륨은 StatefulSet에서 자동 생성 (ReadWriteOnce)
- Elasticsearch 데이터 볼륨은 StatefulSet에서 자동 생성 (ReadWriteOnce)

## 헬스 체크

모든 서비스는 liveness 및 readiness probe를 포함합니다:
- **Liveness**: 서비스가 살아있는지 확인
- **Readiness**: 서비스가 트래픽을 받을 준비가 되었는지 확인

## 리소스 제한

각 서비스는 다음과 같은 리소스 제한을 가집니다:
- **Backend Services**: 256Mi-512Mi 메모리, 100m-500m CPU
- **Frontend**: 128Mi-256Mi 메모리, 100m-500m CPU
- **MongoDB**: 1Gi-2Gi 메모리, 500m-1000m CPU
- **Redis**: 256Mi-512Mi 메모리, 100m-500m CPU
- **Elasticsearch**: 2Gi 메모리, 1000m CPU

## 트러블슈팅

### MongoDB Replica Set 초기화 실패
```bash
# Pod 상태 확인
kubectl get pods -n hiking -l app=mongodb

# 로그 확인
kubectl logs mongodb-0 -n hiking
```

### Redis Sentinel 연결 문제
```bash
# Redis Pod 상태 확인
kubectl get pods -n hiking -l app=redis

# Sentinel 상태 확인
kubectl exec -it redis-sentinel-0 -n hiking -- redis-cli -p 26379 INFO sentinel
```

### 서비스 연결 문제
```bash
# 서비스 엔드포인트 확인
kubectl get endpoints -n hiking

# DNS 확인
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup auth-service.hiking.svc.cluster.local
```

## 업데이트

### 이미지 업데이트
```bash
# 특정 서비스의 이미지 업데이트
kubectl set image deployment/auth-service auth-service=hiking-auth-service:new-tag -n hiking
```

### 설정 업데이트
```bash
# ConfigMap 업데이트
kubectl apply -f config/configmap.yaml

# Secret 업데이트
kubectl apply -f config/secret.yaml

# Pod 재시작 (자동으로 재시작됨)
kubectl rollout restart deployment -n hiking
```

## 모니터링

### 로그 확인
```bash
# 특정 서비스 로그
kubectl logs -f deployment/auth-service -n hiking

# 모든 Pod 로그
kubectl logs -f -l app=backend -n hiking
```

### 리소스 사용량
```bash
# Pod 리소스 사용량
kubectl top pods -n hiking

# 노드 리소스 사용량
kubectl top nodes
```

## 삭제

모든 리소스를 삭제하려면:
```bash
kubectl delete namespace hiking
```

주의: 이 명령은 네임스페이스 내의 모든 리소스(데이터 포함)를 삭제합니다.


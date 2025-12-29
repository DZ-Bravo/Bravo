# AWS 완전 이전 계획

## 📋 Executive Summary

**목표**: 온프레미스 Kubernetes 클러스터를 AWS로 완전 이전

**현재 환경**:
- 온프레미스 Kubernetes 클러스터
- MongoDB (3 Pods, Replica Set)
- Redis (Primary-Secondary-Sentinel)
- Elasticsearch (단일 노드)
- 10개 백엔드 서비스 + 프론트엔드
- Istio Gateway
- Longhorn 스토리지
- Harbor (이미지 레지스트리)
- 모니터링 스택 (Prometheus, Grafana, Loki, Tempo)

**AWS 목표 환경**:
- EKS 클러스터
- DocumentDB (MongoDB 호환)
- ElastiCache (Redis 호환)
- OpenSearch (Elasticsearch 호환)
- 모든 애플리케이션 서비스
- ALB + Route 53
- ECR (이미지 레지스트리)
- CloudWatch + X-Ray

---

## 🏗️ AWS 아키텍처

```
Internet
  ↓
Route 53 (DNS)
  ↓
CloudFront (CDN, 선택)
  ↓
WAF (보안)
  ↓
ALB (Application Load Balancer)
  ↓
EKS 클러스터
  ├── 프론트엔드 서비스
  ├── 백엔드 서비스 (10개)
  └── 모니터링 스택
  ↓
관리형 서비스
  ├── DocumentDB (MongoDB)
  ├── ElastiCache (Redis)
  └── OpenSearch (Elasticsearch)
```

---

## 📊 마이그레이션 구성 요소

### **1. 인프라 구성 요소**

| 구성 요소 | 온프레미스 | AWS 대체 | 비고 |
|----------|-----------|---------|------|
| **Kubernetes** | 온프레미스 K8s | EKS | 클러스터 관리형 |
| **로드밸런서** | HAProxy + Istio | ALB | AWS 관리형 |
| **DNS** | 외부 DNS | Route 53 | AWS 관리형 |
| **SSL/TLS** | cert-manager | ACM | 자동 갱신 |
| **이미지 레지스트리** | Harbor | ECR | AWS 관리형 |
| **스토리지** | Longhorn | EBS + S3 | AWS 관리형 |

### **2. 데이터베이스**

| 데이터베이스 | 온프레미스 | AWS 대체 | 마이그레이션 방법 |
|------------|-----------|---------|----------------|
| **MongoDB** | 3 Pods (Replica Set) | DocumentDB | mongodump → mongorestore |
| **Redis** | 2 Pods + 3 Sentinel | ElastiCache | redis-cli --rdb → redis-cli --pipe |
| **Elasticsearch** | 1 Pod | OpenSearch | snapshot → restore |

### **3. 애플리케이션 서비스**

| 서비스 | 포트 | 리소스 | 비고 |
|--------|------|--------|------|
| **frontend-service** | 80 | 2 replicas | React + Nginx |
| **auth-service** | 3001 | 2 replicas | 인증 |
| **community-service** | 3002 | 2 replicas | 커뮤니티 |
| **notice-service** | 3003 | 2 replicas | 공지사항 |
| **schedule-service** | 3004 | 2 replicas | 일정 |
| **notification-service** | 3005 | 2 replicas | 알림 |
| **store-service** | 3006 | 2 replicas | 스토어 |
| **chatbot-service** | 3007 | 2 replicas | 챗봇 |
| **mountain-service** | 3008 | 2 replicas | 산 정보 |
| **ai-service** | 3009 | 2 replicas | AI 서비스 |
| **stamp-service** | 3010 | 2 replicas | 스탬프 |
| **ai-infra-service** | 3011 | 2 replicas | AI 인프라 |

### **4. 모니터링 스택**

| 구성 요소 | 온프레미스 | AWS 대체 |
|----------|-----------|---------|
| **메트릭** | Prometheus | CloudWatch Container Insights |
| **대시보드** | Grafana | CloudWatch Dashboards |
| **로그** | Loki | CloudWatch Logs |
| **트레이싱** | Tempo | X-Ray |

---

## 🚀 마이그레이션 단계

### **Phase 1: AWS 인프라 구축 (1-2주)**

#### 1-1. VPC 및 네트워크
```bash
# VPC 생성
- CIDR: 10.0.0.0/16
- Public Subnet: 10.0.1.0/24, 10.0.2.0/24 (Multi-AZ)
- Private Subnet: 10.0.10.0/24, 10.0.11.0/24 (Multi-AZ)
- Database Subnet: 10.0.20.0/24, 10.0.21.0/24 (Multi-AZ)
- NAT Gateway (Public Subnet)
- Internet Gateway
```

#### 1-2. EKS 클러스터
```bash
# EKS 클러스터 생성
- Kubernetes 버전: 1.28+
- 노드 그룹: t3.medium × 3 (초기)
- Auto Scaling: min 3, max 10
```

#### 1-3. 관리형 서비스 생성
```bash
# DocumentDB
- 인스턴스: db.t3.medium × 3 (Multi-AZ)
- 백업: 7일 보관
- 암호화: 활성화

# ElastiCache
- Redis 7.x
- 노드 타입: cache.t3.micro × 2 (Multi-AZ)
- 자동 Failover

# OpenSearch
- 인스턴스 타입: t3.small.search
- 노드 수: 2 (Multi-AZ)
```

#### 1-4. 네트워크 및 보안
```bash
# ALB 생성
- Internet-facing
- HTTPS 리스너
- WAF 연동

# Route 53
- 호스팅 존 생성
- A 레코드 (ALB)

# ACM
- SSL 인증서 발급
- ALB에 연결

# Security Groups
- EKS → DocumentDB (27017)
- EKS → ElastiCache (6379)
- EKS → OpenSearch (9200)
```

---

### **Phase 2: 이미지 레지스트리 마이그레이션 (1주)**

#### 2-1. ECR 생성
```bash
# ECR 리포지토리 생성
aws ecr create-repository --repository-name hiking/frontend-service
aws ecr create-repository --repository-name hiking/auth-service
# ... 모든 서비스
```

#### 2-2. 이미지 마이그레이션
```bash
# Harbor에서 이미지 Pull
docker pull harbor.example.com/hiking/auth-service:latest

# ECR에 Push
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin 123456789012.dkr.ecr.ap-northeast-2.amazonaws.com

docker tag harbor.example.com/hiking/auth-service:latest \
  123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/hiking/auth-service:latest

docker push 123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/hiking/auth-service:latest
```

#### 2-3. CI/CD 파이프라인 업데이트
```bash
# GitLab CI/CD 수정
# Harbor → ECR로 변경
```

---

### **Phase 3: 데이터베이스 마이그레이션 (2-3주)**

#### 3-1. MongoDB → DocumentDB

**전략**: Zero Downtime 마이그레이션

```bash
# Step 1: DocumentDB 생성 및 설정
aws docdb create-db-cluster \
  --db-cluster-identifier hiking-docdb \
  --engine docdb \
  --master-username admin \
  --master-user-password <password> \
  --db-instance-class db.t3.medium \
  --vpc-security-group-ids sg-xxx

# Step 2: 온프레미스 MongoDB 백업
mongodump --host mongodb-0.bravo-mongo-ns.svc.cluster.local:27017 \
  --authenticationDatabase admin \
  --username admin \
  --password <password> \
  --out /backup/mongodb-$(date +%Y%m%d)

# Step 3: DocumentDB로 복원
mongorestore --host hiking-docdb.cluster-xxx.docdb.amazonaws.com:27017 \
  --ssl \
  --sslCAFile rds-ca-2019-root.pem \
  --authenticationDatabase admin \
  --username admin \
  --password <password> \
  /backup/mongodb-YYYYMMDD

# Step 4: 애플리케이션 연결 문자열 변경
MONGODB_URI=mongodb://admin:password@hiking-docdb.cluster-xxx.docdb.amazonaws.com:27017/hiking?ssl=true&replicaSet=rs0&readPreference=secondaryPreferred
```

#### 3-2. Redis → ElastiCache

```bash
# Step 1: ElastiCache 생성
aws elasticache create-cache-cluster \
  --cache-cluster-id hiking-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 2

# Step 2: 온프레미스 Redis 백업
redis-cli --rdb /backup/redis-$(date +%Y%m%d).rdb

# Step 3: ElastiCache로 복원
redis-cli -h hiking-redis.xxx.cache.amazonaws.com --pipe < /backup/redis-YYYYMMDD.rdb

# Step 4: 애플리케이션 연결 문자열 변경
REDIS_HOST=hiking-redis.xxx.cache.amazonaws.com
REDIS_PORT=6379
```

#### 3-3. Elasticsearch → OpenSearch

```bash
# Step 1: OpenSearch 도메인 생성
aws opensearch create-domain \
  --domain-name hiking-opensearch \
  --cluster-config instanceType=t3.small.search,instanceCount=2

# Step 2: 온프레미스 Elasticsearch 스냅샷
curl -X PUT "localhost:9200/_snapshot/backup" -H 'Content-Type: application/json' -d'
{
  "type": "fs",
  "settings": {
    "location": "/backup/elasticsearch"
  }
}'

curl -X PUT "localhost:9200/_snapshot/backup/snapshot_1?wait_for_completion=true"

# Step 3: OpenSearch로 복원
# S3에 업로드 후 OpenSearch에서 복원
```

---

### **Phase 4: 애플리케이션 서비스 마이그레이션 (2-3주)**

#### 4-1. Kubernetes 매니페스트 수정

**변경 사항**:
- 이미지 레지스트리: Harbor → ECR
- DB 연결 문자열: 온프레미스 → AWS 관리형 서비스
- 스토리지: Longhorn → EBS
- Ingress: Istio → ALB Ingress Controller

#### 4-2. 네임스페이스 및 리소스 생성

```bash
# 네임스페이스 생성
kubectl create namespace bravo-core-ns
kubectl create namespace bravo-front-ns
kubectl create namespace bravo-ai-integration-ns

# ConfigMap 및 Secret 생성
kubectl apply -f config/configmap.yaml
kubectl apply -f config/secret.yaml
```

#### 4-3. 서비스 배포

```bash
# 순차 배포 (테스트 후 다음 서비스)
kubectl apply -f frontend-service.yaml
kubectl apply -f auth-service.yaml
# ... 나머지 서비스
```

#### 4-4. ALB Ingress Controller 설정

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: hiking-ingress
  namespace: bravo-core-ns
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:...
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
spec:
  ingressClassName: alb
  rules:
  - host: hiker-cloud.site
    http:
      paths:
      - path: /api/auth
        pathType: Prefix
        backend:
          service:
            name: auth-service
            port:
              number: 3001
      # ... 나머지 경로
```

---

### **Phase 5: 모니터링 및 로깅 설정 (1주)**

#### 5-1. CloudWatch Container Insights

```bash
# Container Insights 활성화
kubectl apply -f https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/quickstart/cwagent-fluentd-quickstart.yaml
```

#### 5-2. X-Ray 설정

```yaml
# X-Ray DaemonSet
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: xray-daemon
  namespace: kube-system
spec:
  template:
    spec:
      containers:
      - name: xray-daemon
        image: amazon/aws-xray-daemon:latest
        env:
        - name: AWS_REGION
          value: ap-northeast-2
```

#### 5-3. CloudWatch Logs

```yaml
# Fluent Bit 설정
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluent-bit-config
data:
  fluent-bit.conf: |
    [INPUT]
        Name tail
        Path /var/log/containers/*.log
        Parser docker
    [OUTPUT]
        Name cloudwatch_logs
        Match *
        region ap-northeast-2
        log_group_name /aws/eks/hiking
```

---

### **Phase 6: 테스트 및 검증 (1주)**

#### 6-1. 기능 테스트
- [ ] 모든 API 엔드포인트 테스트
- [ ] 인증/인가 테스트
- [ ] 파일 업로드/다운로드 테스트
- [ ] DB 연결 테스트

#### 6-2. 성능 테스트
- [ ] 부하 테스트
- [ ] 응답 시간 측정
- [ ] 리소스 사용량 확인

#### 6-3. 보안 테스트
- [ ] SSL/TLS 확인
- [ ] WAF 규칙 테스트
- [ ] 접근 제어 확인

---

### **Phase 7: 트래픽 전환 (1주)**

#### 7-1. Route 53 Weighted Routing

```bash
# 점진적 트래픽 전환
# Day 1: 10% AWS, 90% 온프레미스
# Day 2: 30% AWS, 70% 온프레미스
# Day 3: 50% AWS, 50% 온프레미스
# Day 4: 70% AWS, 30% 온프레미스
# Day 5: 100% AWS
```

#### 7-2. 모니터링 및 롤백 계획
- CloudWatch 알림 설정
- 문제 발생 시 즉시 롤백 가능
- 온프레미스 환경 유지 (1개월)

---

## 💰 비용 분석

### **AWS 월 예상 비용**

| 서비스 | 사양 | 비용/월 |
|--------|------|---------|
| **EKS 클러스터** | - | $73 |
| **EKS Worker Nodes** | t3.medium × 3 | $90-120 |
| **DocumentDB** | db.t3.medium × 3 | $200-300 |
| **ElastiCache** | cache.t3.micro × 2 | $30-50 |
| **OpenSearch** | t3.small.search × 2 | $100-150 |
| **ALB** | - | $20-30 |
| **Route 53** | - | $1-5 |
| **ECR** | 스토리지 | $5-10 |
| **S3** | 백업 스토리지 | $10-20 |
| **CloudWatch** | 로그/메트릭 | $20-40 |
| **데이터 전송** | - | $10-30 |
| **총 예상** | - | **$560-830/월** |

### **비용 절감 전략**

1. **Reserved Instances**: 1년 약정 시 30-40% 할인
2. **Spot Instances**: Worker Nodes 일부 사용 (70% 할인)
3. **S3 Intelligent-Tiering**: 자동 스토리지 최적화
4. **CloudWatch Logs 보관**: 30일 후 S3로 아카이빙

---

## ⚠️ 리스크 및 대응 방안

### **1. 데이터 마이그레이션 리스크**

**리스크**: 데이터 손실 또는 불일치

**대응**:
- 백업 검증 필수
- 마이그레이션 전 데이터 검증
- 롤백 계획 수립
- Zero Downtime 마이그레이션 전략

### **2. 다운타임 리스크**

**리스크**: 서비스 중단

**대응**:
- Blue-Green 배포
- 점진적 트래픽 전환
- 온프레미스 환경 유지 (롤백용)

### **3. 비용 초과 리스크**

**리스크**: 예상보다 높은 비용

**대응**:
- AWS Budgets 설정
- Cost Anomaly Detection
- 정기적인 비용 리뷰

### **4. 성능 저하 리스크**

**리스크**: 응답 시간 증가

**대응**:
- 부하 테스트 필수
- CloudFront CDN 활용
- Connection Pooling 최적화

---

## 📋 체크리스트

### **Phase 1: 인프라 구축**
- [ ] VPC 및 서브넷 생성
- [ ] EKS 클러스터 생성
- [ ] DocumentDB 생성
- [ ] ElastiCache 생성
- [ ] OpenSearch 생성
- [ ] ALB 생성
- [ ] Route 53 설정
- [ ] ACM 인증서 발급
- [ ] Security Groups 설정

### **Phase 2: 이미지 마이그레이션**
- [ ] ECR 리포지토리 생성
- [ ] 이미지 마이그레이션
- [ ] CI/CD 파이프라인 업데이트

### **Phase 3: 데이터 마이그레이션**
- [ ] MongoDB 백업
- [ ] DocumentDB로 복원
- [ ] Redis 백업
- [ ] ElastiCache로 복원
- [ ] Elasticsearch 스냅샷
- [ ] OpenSearch로 복원
- [ ] 데이터 검증

### **Phase 4: 애플리케이션 배포**
- [ ] Kubernetes 매니페스트 수정
- [ ] ConfigMap/Secret 생성
- [ ] 서비스 배포
- [ ] ALB Ingress 설정
- [ ] 헬스 체크 확인

### **Phase 5: 모니터링**
- [ ] Container Insights 활성화
- [ ] X-Ray 설정
- [ ] CloudWatch Logs 설정
- [ ] 알림 설정

### **Phase 6: 테스트**
- [ ] 기능 테스트
- [ ] 성능 테스트
- [ ] 보안 테스트
- [ ] 부하 테스트

### **Phase 7: 전환**
- [ ] Route 53 Weighted Routing 설정
- [ ] 점진적 트래픽 전환
- [ ] 모니터링
- [ ] 최종 검증

---

## 🎯 예상 일정

| Phase | 작업 | 기간 |
|-------|------|------|
| **Phase 1** | AWS 인프라 구축 | 1-2주 |
| **Phase 2** | 이미지 레지스트리 마이그레이션 | 1주 |
| **Phase 3** | 데이터베이스 마이그레이션 | 2-3주 |
| **Phase 4** | 애플리케이션 서비스 마이그레이션 | 2-3주 |
| **Phase 5** | 모니터링 설정 | 1주 |
| **Phase 6** | 테스트 및 검증 | 1주 |
| **Phase 7** | 트래픽 전환 | 1주 |
| **총 예상** | - | **9-12주** |

---

## 🎯 결론

AWS 완전 이전은 **체계적인 계획과 단계적 실행**이 필요합니다.

**핵심 포인트**:
1. ✅ 관리형 서비스 활용으로 운영 부담 감소
2. ✅ 고가용성 및 확장성 확보
3. ✅ 비용 최적화 (Reserved Instances, Spot)
4. ✅ 점진적 전환으로 리스크 최소화

**성공 요인**:
- 철저한 테스트
- 백업 및 롤백 계획
- 모니터링 및 알림
- 단계적 트래픽 전환

---

**작성일**: 2024-12-28  
**버전**: 1.0


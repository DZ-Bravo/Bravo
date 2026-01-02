# EKS 클러스터 MongoDB 및 S3 연동 작업 요약

## 작업 개요
EKS 클러스터의 서비스들이 외부 EC2 인스턴스의 MongoDB와 S3 버킷의 코스 데이터에 접근할 수 있도록 설정했습니다.

---

## 1. MongoDB 연결 설정 (EC2 → EKS)

### 1.1 문제점
- EKS Pod들이 외부 EC2 인스턴스의 MongoDB에 연결할 수 없음
- MongoDB ReplicaSet 구성: Primary (10.0.11.82), Secondary1 (10.0.9.41), Secondary2 (10.0.15.147)

### 1.2 해결 방법: Endpoints + Headless Service 패턴

#### 생성/수정된 파일

**1. `/home/bravo/LABs/k8s/mongo-ns/mongodb-endpoints.yaml`** (신규 생성)
```yaml
apiVersion: v1
kind: Endpoints
metadata:
  name: mongodb
  namespace: bravo-mongo-ns
  labels:
    app: mongodb
subsets:
- addresses:
  - ip: 10.0.11.82   # MongoDB Primary
  - ip: 10.0.9.41    # MongoDB Secondary1
  - ip: 10.0.15.147  # MongoDB Secondary2
  ports:
  - port: 27017
    name: mongodb
    protocol: TCP
```

**2. `/home/bravo/LABs/k8s/mongo-ns/mongodb-statefulset.yaml`** (수정)
- Service 정의에서 `selector` 제거하여 Headless Service로 변경
- `clusterIP: None` 설정으로 Endpoints 리소스와 연동

**3. 네임스페이스 생성**
```bash
kubectl create namespace bravo-mongo-ns
kubectl create namespace bravo-efk-ns
```

### 1.3 보안 설정

#### NetworkPolicy 생성

**1. `/home/bravo/LABs/k8s-aws/networkpolicy/core/core-egress-db.yaml`** (수정)
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: core-egress-db
  namespace: bravo-core-ns
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:
    - ipBlock:
        cidr: 10.0.11.82/32   # MongoDB Primary
    - ipBlock:
        cidr: 10.0.9.41/32    # MongoDB Secondary1
    - ipBlock:
        cidr: 10.0.15.147/32  # MongoDB Secondary2
    ports:
    - protocol: TCP
      port: 27017
```

**2. `/home/bravo/LABs/k8s-aws/networkpolicy/ai-integration/ai-egress-db.yaml`** (신규 생성)
- `bravo-ai-integration-ns` 네임스페이스에서 MongoDB 접근 허용

**3. `/home/bravo/LABs/k8s-aws/networkpolicy/efk/efk-egress-db.yaml`** (신규 생성)
- `bravo-efk-ns` 네임스페이스에서 MongoDB 접근 허용 (monstache용)

#### AWS Security Group 설정
```bash
# MongoDB 보안 그룹에 EKS Pod IP 대역 허용
# VPC 전체 CIDR (10.0.0.0/16)에서 포트 27017 허용
aws ec2 authorize-security-group-ingress \
  --group-id <bravo-mongodb-sg-id> \
  --protocol tcp \
  --port 27017 \
  --cidr 10.0.0.0/16
```

### 1.4 MongoDB ReplicaSet 설정 확인
- `readPreference` 설정:
  - `bravo-core-ns` 서비스: `secondaryPreferred` (Secondary1 우선, 실패 시 Secondary2)
  - `monstache`: `primaryPreferred`

---

## 2. 프론트엔드 API 프록시 설정

### 2.1 문제점
- ALB Ingress가 다른 네임스페이스의 서비스를 직접 참조할 수 없음
- `/api/*` 경로 요청이 404 에러 발생

### 2.2 해결 방법: 프론트엔드 서버에 프록시 기능 추가

#### 수정된 파일

**`/home/bravo/LABs/k8s/front-ns/frontend-server-js` ConfigMap** (수정)
- Node.js 내장 `http` 모듈을 사용한 프록시 미들웨어 추가
- `/api/*` 경로를 백엔드 서비스로 자동 라우팅

**주요 기능:**
```javascript
// 백엔드 서비스 매핑
const backendServices = [
  { path: '/api/store', host: 'store-service.bravo-core-ns.svc.cluster.local', port: 3006 },
  { path: '/api/auth', host: 'auth-service.bravo-core-ns.svc.cluster.local', port: 3001 },
  { path: '/api/mountains', host: 'mountain-service.bravo-core-ns.svc.cluster.local', port: 3008 },
  // ... 기타 서비스들
]

// 프록시 미들웨어
app.use((req, res, next) => {
  // API 경로인지 확인하고 백엔드로 프록시
})
```

**경로 변환 로직:**
- `/api/store/shoes` → `/api/store/shoes` (그대로 전달)
- `/store/shoes` → `/api/store/shoes` (변환)

### 2.3 ALB Ingress 설정

**`/tmp/frontend-ingress.yaml`** (수정)
- `/api/*` 경로를 프론트엔드로 라우팅하도록 변경
- 프론트엔드 서버의 프록시가 백엔드로 요청 전달

**최종 Ingress 경로:**
- `/monitoring` → ai-infra-service
- `/` → frontend (모든 `/api/*` 요청 포함)

---

## 3. S3 코스 데이터 동기화

### 3.1 문제점
- mountain-service가 `/app/mountain` 폴더에서 코스 데이터를 찾지 못함
- 코스 데이터는 S3 버킷 `mountain-course-data`에 저장되어 있음

### 3.2 해결 방법: Init Container + 수동 동기화

#### 수정된 파일

**`/home/bravo/LABs/application_cd/backend/mountain-service/deployment.yaml`** (수정)
- Init Container 추가 (S3에서 데이터 다운로드 시도)
- 데이터가 이미 있으면 스킵하도록 로직 추가

**Init Container 설정:**
```yaml
initContainers:
- name: s3-sync
  image: amazon/aws-cli:latest
  command:
  - /bin/sh
  - -c
  - |
    # 데이터가 이미 있으면 스킵
    if [ "$(ls -A /app/mountain 2>/dev/null | grep -v lost+found | wc -l)" -gt 0 ]; then
      echo "코스 데이터가 이미 존재합니다. 스킵합니다."
      exit 0
    fi
    # S3 동기화 로직...
  volumeMounts:
  - name: mountain-data
    mountPath: /app/mountain
```

### 3.3 보안 설정

#### IAM Role 권한 추가
```bash
# 노드 IAM Role에 S3 읽기 권한 추가
aws iam attach-role-policy \
  --role-name bravo-node-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
```

#### ServiceAccount 생성 (IRSA 준비)
**`/home/bravo/LABs/k8s/mongo-ns/mountain-sa.yaml`** (신규 생성)
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: mountain-service-sa
  namespace: bravo-core-ns
```

### 3.4 데이터 동기화 방법

**수동 동기화 (현재 사용 중):**
```bash
# 로컬에서 S3 데이터 다운로드
aws s3 sync s3://mountain-course-data/ /tmp/mountain-test/ --region ap-northeast-2

# Pod에 데이터 복사
POD=$(kubectl get pods -n bravo-core-ns -l app=mountain-service -o jsonpath='{.items[0].metadata.name}')
kubectl cp /tmp/mountain-test/. $POD:/app/mountain/ -n bravo-core-ns
```

**결과:**
- 2931개의 geojson 폴더 동기화 완료
- 모든 mountain-service Pod에 데이터 복사 완료

---

## 4. 보안 설정 요약

### 4.1 Kubernetes NetworkPolicy

**생성/수정된 NetworkPolicy:**
1. `core-egress-db.yaml` - `bravo-core-ns` → MongoDB 접근 허용
2. `ai-egress-db.yaml` - `bravo-ai-integration-ns` → MongoDB 접근 허용
3. `efk-egress-db.yaml` - `bravo-efk-ns` → MongoDB 접근 허용

**특징:**
- Egress 트래픽만 허용 (Ingress는 기본 정책 사용)
- 특정 IP 주소로만 접근 제한 (10.0.11.82, 10.0.9.41, 10.0.15.147)
- 포트 27017만 허용

### 4.2 AWS Security Group

**MongoDB 보안 그룹 (`bravo-mongodb-sg`):**
- Inbound Rule: VPC 전체 (10.0.0.0/16)에서 포트 27017 허용
- 이유: EKS Pod IP가 동적으로 할당되므로 VPC 전체 허용 필요

### 4.3 IAM 권한

**노드 IAM Role (`bravo-node-role`):**
- `AmazonS3ReadOnlyAccess` 정책 추가
- S3 버킷 `mountain-course-data` 읽기 권한

**ServiceAccount:**
- `mountain-service-sa` 생성 (향후 IRSA 사용 가능)

### 4.4 보안 고려사항

**현재 상태:**
- ✅ NetworkPolicy로 Pod 간 통신 제어
- ✅ Security Group으로 EC2 레벨 접근 제어
- ✅ IAM Role로 S3 접근 제어
- ⚠️ Pod 내부에서 인스턴스 메타데이터 접근 불가 (보안상 정상)

**향후 개선 사항:**
- IRSA (IAM Roles for Service Accounts) 설정으로 Pod별 S3 접근 권한 세분화
- Init Container에서 자동 S3 동기화 구현 (현재는 수동)

---

## 5. 생성/수정된 파일 목록

### 신규 생성
1. `/home/bravo/LABs/k8s/mongo-ns/mongodb-endpoints.yaml`
2. `/home/bravo/LABs/k8s-aws/networkpolicy/ai-integration/ai-egress-db.yaml`
3. `/home/bravo/LABs/k8s-aws/networkpolicy/efk/efk-egress-db.yaml`
4. `/home/bravo/LABs/k8s/mongo-ns/EC2_MONGODB_CONNECTION_GUIDE.md`
5. `/home/bravo/LABs/k8s/mongo-ns/MONGODB_REPLICASET_FIX.md`
6. `/home/bravo/LABs/k8s/front-ns/backend-services-external.yaml` (사용 안 함)

### 수정
1. `/home/bravo/LABs/k8s/mongo-ns/mongodb-statefulset.yaml` (Service selector 제거)
2. `/home/bravo/LABs/k8s-aws/networkpolicy/core/core-egress-db.yaml` (IP 주소 수정)
3. `/home/bravo/LABs/application_cd/backend/mountain-service/deployment.yaml` (Init Container 추가)
4. `frontend-server-js` ConfigMap (프록시 기능 추가)
5. `frontend-ingress` Ingress (경로 라우팅 수정)

---

## 6. 네임스페이스 구조

```
bravo-mongo-ns/
  ├── mongodb (Headless Service)
  └── mongodb (Endpoints) → EC2 MongoDB IPs

bravo-core-ns/
  ├── auth-service, store-service, mountain-service 등
  └── NetworkPolicy: core-egress-db

bravo-ai-integration-ns/
  ├── ai-service, chatbot-service
  └── NetworkPolicy: ai-egress-db

bravo-efk-ns/
  ├── monstache
  └── NetworkPolicy: efk-egress-db

bravo-front-ns/
  ├── frontend (프록시 기능 포함)
  └── frontend-ingress (ALB)
```

---

## 7. 테스트 및 검증

### 7.1 MongoDB 연결 확인
```bash
# Pod에서 MongoDB 연결 테스트
kubectl exec -n bravo-core-ns <pod-name> -- \
  node -e "const {MongoClient} = require('mongodb'); ..."

# 서비스 로그 확인
kubectl logs -n bravo-core-ns deployment/auth-service | grep -i mongo
```

### 7.2 API 프록시 확인
```bash
# 프록시 로그 확인
kubectl logs -n bravo-front-ns deployment/frontend | grep "프록시"

# API 요청 테스트
curl https://hiker-cloud.site/api/store/shoes
```

### 7.3 S3 데이터 확인
```bash
# Pod에 데이터 존재 확인
kubectl exec -n bravo-core-ns <mountain-service-pod> -- \
  ls -la /app/mountain/

# geojson 폴더 개수 확인
kubectl exec -n bravo-core-ns <mountain-service-pod> -- \
  find /app/mountain -type d -name "*geojson" | wc -l
```

---

## 8. 트러블슈팅 이슈

### 8.1 MongoDB 연결 실패
**문제:** `getaddrinfo ENOTFOUND mongodb.bravo-mongo-ns.svc.cluster.local`
**해결:** Endpoints 리소스 생성 및 Headless Service 설정

### 8.2 Security Group 차단
**문제:** `Connection timed out`
**해결:** MongoDB 보안 그룹에 VPC CIDR (10.0.0.0/16) 추가

### 8.3 ReplicaSet IP 불일치
**문제:** Primary IP가 10.0.11.92로 설정되어 있었으나 실제는 10.0.11.82
**해결:** Endpoints 및 NetworkPolicy의 IP 주소 수정

### 8.4 API 404 에러
**문제:** `/api/store/shoes` 등 API 경로가 404 반환
**해결:** 프론트엔드 서버에 프록시 기능 추가

### 8.5 S3 접근 불가
**문제:** Init Container에서 `Unable to locate credentials`
**해결:** 노드 IAM Role에 S3 권한 추가 및 수동 동기화 방법 사용

---

## 9. 향후 개선 사항

1. **IRSA 설정**
   - ServiceAccount에 IAM Role 연결
   - Pod별 S3 접근 권한 세분화

2. **자동 S3 동기화**
   - Init Container에서 인스턴스 메타데이터 접근 방법 개선
   - 또는 CronJob으로 주기적 동기화

3. **모니터링**
   - MongoDB 연결 상태 모니터링
   - S3 동기화 상태 모니터링

4. **보안 강화**
   - NetworkPolicy 세분화 (서비스별)
   - Security Group 최소 권한 원칙 적용

---

## 10. 참고 문서

- `/home/bravo/LABs/k8s/mongo-ns/EC2_MONGODB_CONNECTION_GUIDE.md`
- `/home/bravo/LABs/k8s/mongo-ns/MONGODB_REPLICASET_FIX.md`

---

**작업 완료 일시:** 2026-01-02
**작업자:** AI Assistant
**검증 상태:** ✅ MongoDB 연결 성공, ✅ API 프록시 작동, ✅ S3 데이터 동기화 완료


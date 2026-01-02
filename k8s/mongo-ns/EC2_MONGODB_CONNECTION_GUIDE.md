# EC2 MongoDB 연결 가이드

## 개요
이 가이드는 EC2에 있는 MongoDB 인스턴스들을 EKS 클러스터에서 연결하는 방법을 설명합니다.

## 아키텍처

### EC2 MongoDB 구조
```
bravo-private-svc-a (10.0.8.0/22):
  ├─ bravo-mongodb-primary EC2: 10.0.11.92 (Primary)
  └─ bravo-mongodb-secondary1 EC2: 10.0.9.41 (Secondary1)

bravo-private-svc-b (10.0.12.0/22):
  ├─ bravo-mongodb-secondary-2 EC2: 10.0.15.147 (Secondary2)
  └─ bravo-elasticsearch-redis-monstache-kibana EC2: 10.0.13.116
```

### 연결 방식
- **방법**: Endpoints + Headless Service
- **서비스 이름**: `mongodb.bravo-mongo-ns.svc.cluster.local:27017`
- **동작**: MongoDB ReplicaSet이 자동으로 Primary/Secondary 선택
- **Read Preference**: `secondaryPreferred` (Secondary 우선, 없으면 Primary)

## 적용 순서

### 1단계: Endpoints 리소스 생성
```bash
kubectl apply -f /home/bravo/LABs/k8s/mongo-ns/mongodb-endpoints.yaml
```

### 2단계: Service 업데이트 (selector 제거)
```bash
kubectl apply -f /home/bravo/LABs/k8s/mongo-ns/mongodb-statefulset.yaml
```

### 3단계: NetworkPolicy 업데이트
```bash
# Core 네임스페이스
kubectl apply -f /home/bravo/LABs/k8s-aws/networkpolicy/core/core-egress-db.yaml

# AI Integration 네임스페이스
kubectl apply -f /home/bravo/LABs/k8s-aws/networkpolicy/ai-integration/ai-egress-db.yaml

# EFK 네임스페이스
kubectl apply -f /home/bravo/LABs/k8s-aws/networkpolicy/efk/efk-egress-db.yaml
```

### 4단계: 기존 StatefulSet 비활성화 (선택사항)
EC2 MongoDB를 사용하므로 Kubernetes StatefulSet은 필요 없습니다.
```bash
# StatefulSet 스케일 다운 (데이터 보존)
kubectl scale statefulset mongodb --replicas=0 -n bravo-mongo-ns

# 또는 완전 삭제 (주의: PVC는 유지됨)
# kubectl delete statefulset mongodb -n bravo-mongo-ns
```

## 연결 테스트

### 1. Endpoints 확인
```bash
kubectl get endpoints mongodb -n bravo-mongo-ns
```

예상 출력:
```
NAME      ENDPOINTS                                         AGE
mongodb   10.0.11.92:27017,10.0.9.41:27017,10.0.15.147:27017   1m
```

### 2. Service 확인
```bash
kubectl get svc mongodb -n bravo-mongo-ns
```

예상 출력:
```
NAME      TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)     AGE
mongodb   ClusterIP   None         <none>        27017/TCP   1m
```

### 3. Pod에서 연결 테스트
```bash
# 테스트 Pod 실행
kubectl run mongodb-test --image=mongo:7 --rm -it --restart=Never -n bravo-core-ns -- \
  mongosh "mongodb://mongodb.bravo-mongo-ns.svc.cluster.local:27017/hiking?replicaSet=rs0&readPreference=secondaryPreferred"

# 연결 성공 시 MongoDB 셸이 열림
# rs.status() 명령어로 ReplicaSet 상태 확인
```

### 4. 실제 서비스에서 연결 확인
```bash
# community-service Pod 로그 확인
kubectl logs -f deployment/community-service -n bravo-core-ns | grep -i mongo

# 또는 Pod 내부에서 직접 확인
kubectl exec -it deployment/community-service -n bravo-core-ns -- \
  mongosh "mongodb://mongodb.bravo-mongo-ns.svc.cluster.local:27017/hiking?replicaSet=rs0"
```

## MongoDB ReplicaSet 동작 방식

### Read Preference 설정
현재 모든 서비스는 `readPreference=secondaryPreferred`를 사용합니다:

```javascript
mongodb://mongodb.bravo-mongo-ns.svc.cluster.local:27017/hiking?replicaSet=rs0&readPreference=secondaryPreferred
```

### 동작 순서
1. MongoDB 드라이버가 Endpoints에 등록된 모든 IP에 연결 시도
2. ReplicaSet 멤버들을 자동 감지
3. `secondaryPreferred`로 Secondary 우선 선택
4. Secondary1(10.0.9.41)이 같은 서브넷에 있어 우선 선택될 가능성 높음
5. Secondary1에 문제가 있으면 Secondary2(10.0.15.147)로 자동 전환
6. Secondary가 모두 없으면 Primary(10.0.11.92)로 전환

### 특수 케이스
- **stamp-service**: `readPreference=primary` 사용 (쓰기 작업 필요)
- **monstache**: `readPreference=primaryPreferred` 사용 (실시간 동기화)

## 문제 해결

### 1. 연결 실패 시 확인사항

#### Endpoints 확인
```bash
kubectl describe endpoints mongodb -n bravo-mongo-ns
```

#### NetworkPolicy 확인
```bash
kubectl get networkpolicy -n bravo-core-ns
kubectl describe networkpolicy core-egress-db -n bravo-core-ns
```

#### EC2 보안 그룹 확인
- MongoDB 보안 그룹에서 EKS 노드/서브넷의 27017 포트 접근 허용 확인
- VPC 내부 통신이 가능한지 확인

### 2. DNS 해석 확인
```bash
kubectl run dns-test --image=busybox --rm -it --restart=Never -n bravo-core-ns -- \
  nslookup mongodb.bravo-mongo-ns.svc.cluster.local
```

### 3. MongoDB ReplicaSet 상태 확인
EC2 MongoDB에 직접 접속하여 확인:
```bash
# Primary에 접속
mongosh "mongodb://10.0.11.92:27017/hiking?replicaSet=rs0"

# ReplicaSet 상태 확인
rs.status()

# 멤버 호스트명 확인
rs.conf().members
```

## 주의사항

1. **NetworkPolicy IP 주소**
   - Primary IP가 `10.0.11.92`로 수정되었습니다
   - 기존 `10.0.11.82`는 제거되었습니다

2. **StatefulSet 비활성화**
   - EC2 MongoDB를 사용하므로 Kubernetes StatefulSet은 필요 없습니다
   - StatefulSet을 삭제해도 Service와 Endpoints는 유지됩니다

3. **MongoDB ReplicaSet 설정**
   - EC2 MongoDB의 ReplicaSet 이름이 `rs0`인지 확인
   - 멤버 호스트명이 IP 주소 또는 올바른 호스트명으로 설정되어 있는지 확인

4. **보안 그룹**
   - EC2 MongoDB 보안 그룹에서 EKS 노드/서브넷의 27017 포트 접근 허용 확인

## 관련 파일

- `/home/bravo/LABs/k8s/mongo-ns/mongodb-endpoints.yaml` - Endpoints 리소스
- `/home/bravo/LABs/k8s/mongo-ns/mongodb-statefulset.yaml` - Service 정의
- `/home/bravo/LABs/k8s-aws/networkpolicy/core/core-egress-db.yaml` - Core 네임스페이스 NetworkPolicy
- `/home/bravo/LABs/k8s-aws/networkpolicy/ai-integration/ai-egress-db.yaml` - AI Integration 네임스페이스 NetworkPolicy
- `/home/bravo/LABs/k8s-aws/networkpolicy/efk/efk-egress-db.yaml` - EFK 네임스페이스 NetworkPolicy


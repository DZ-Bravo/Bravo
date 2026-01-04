# MongoDB 연결 문제 해결 가이드

## 현재 문제 상황
- Pod에서 MongoDB 연결 시도 시 타임아웃 발생
- DNS 해석은 정상 작동 (3개 IP 모두 반환됨)
- NetworkPolicy는 정상 설정됨

## 확인 사항

### 1. EC2 MongoDB 보안 그룹 설정 확인

EC2 MongoDB 인스턴스의 보안 그룹에서 다음을 확인해야 합니다:

#### Primary (10.0.11.92)
```bash
# 보안 그룹 인바운드 규칙 확인
# EKS 노드 서브넷 또는 Pod 서브넷에서 27017 포트 접근 허용 필요
```

#### Secondary1 (10.0.9.41)
```bash
# 보안 그룹 인바운드 규칙 확인
# EKS 노드 서브넷 또는 Pod 서브넷에서 27017 포트 접근 허용 필요
```

#### Secondary2 (10.0.15.147)
```bash
# 보안 그룹 인바운드 규칙 확인
# EKS 노드 서브넷 또는 Pod 서브넷에서 27017 포트 접근 허용 필요
```

### 2. EKS 노드 IP 확인
현재 EKS 노드 IP:
- `10.0.17.71`
- `10.0.24.98`

### 3. 보안 그룹 인바운드 규칙 예시

다음과 같이 설정해야 합니다:

```
Type: Custom TCP
Port: 27017
Source: 
  - 10.0.17.0/24 (EKS 노드 서브넷)
  - 10.0.24.0/24 (EKS 노드 서브넷)
  - 또는 전체 VPC CIDR (예: 10.0.0.0/16)
```

### 4. MongoDB 서비스 확인

EC2에서 MongoDB가 실제로 리스닝하고 있는지 확인:

```bash
# EC2에 SSH 접속 후
sudo netstat -tlnp | grep 27017
# 또는
sudo ss -tlnp | grep 27017
```

### 5. MongoDB ReplicaSet 설정 확인

EC2 MongoDB에서 ReplicaSet 상태 확인:

```bash
mongosh "mongodb://localhost:27017/hiking?replicaSet=rs0"
rs.status()
rs.conf()
```

멤버 호스트명이 IP 주소로 설정되어 있는지 확인:
```javascript
rs.conf().members.forEach(m => print(m.host))
```

## 임시 해결 방법

보안 그룹 설정이 완료될 때까지 임시로 테스트:

### 방법 1: 보안 그룹에 EKS 노드 IP 추가
```bash
# AWS CLI로 보안 그룹 규칙 추가
aws ec2 authorize-security-group-ingress \
  --group-id <MongoDB-Security-Group-ID> \
  --protocol tcp \
  --port 27017 \
  --cidr 10.0.17.0/24

aws ec2 authorize-security-group-ingress \
  --group-id <MongoDB-Security-Group-ID> \
  --protocol tcp \
  --port 27017 \
  --cidr 10.0.24.0/24
```

### 방법 2: VPC 전체 허용 (개발 환경용)
```bash
aws ec2 authorize-security-group-ingress \
  --group-id <MongoDB-Security-Group-ID> \
  --protocol tcp \
  --port 27017 \
  --cidr 10.0.0.0/16
```

## 확인 명령어

### Pod에서 연결 테스트
```bash
# Pod 이름 확인
kubectl get pods -n bravo-core-ns -l app=auth-service

# Pod에서 직접 연결 테스트
kubectl exec -n bravo-core-ns <pod-name> -- \
  timeout 5 nc -zv 10.0.9.41 27017
```

### MongoDB 연결 테스트
```bash
kubectl run mongo-test --image=mongo:7 --rm -it --restart=Never -n bravo-core-ns -- \
  mongosh "mongodb://10.0.9.41:27017/hiking?replicaSet=rs0" --eval "db.adminCommand('ping')"
```

## 다음 단계

1. EC2 보안 그룹 설정 확인 및 수정
2. MongoDB 서비스 상태 확인
3. 연결 테스트 재실행
4. 서비스 Pod 재시작 (이미 완료됨)



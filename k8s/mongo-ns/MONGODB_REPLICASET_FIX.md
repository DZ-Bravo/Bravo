# MongoDB ReplicaSet 설정 수정 가이드

## 문제 상황
- 보안 그룹 설정 완료
- DNS 해석 정상
- 하지만 "Server selection timed out" 에러 발생

## 원인
MongoDB ReplicaSet의 멤버 호스트명이 Kubernetes DNS 이름으로 설정되어 있을 가능성이 높습니다.
예: `mongodb-0.mongodb:27017`, `mongodb-1.mongodb:27017` 등

## 해결 방법

### 방법 1: EC2 MongoDB에서 ReplicaSet 설정 수정 (권장)

EC2 MongoDB Primary에 SSH 접속 후:

```bash
# MongoDB에 접속
mongosh "mongodb://localhost:27017/hiking?replicaSet=rs0"

# 현재 ReplicaSet 설정 확인
rs.conf()

# ReplicaSet 설정 수정
cfg = rs.conf()
cfg.members[0].host = "10.0.11.92:27017"  # Primary
cfg.members[1].host = "10.0.9.41:27017"   # Secondary1
cfg.members[2].host = "10.0.15.147:27017" # Secondary2
rs.reconfig(cfg)

# 확인
rs.status()
```

### 방법 2: MongoDB URI에 직접 IP 주소 사용 (임시)

서비스들의 MongoDB URI를 직접 IP 주소로 변경:

```yaml
# 기존
mongodb://mongodb.bravo-mongo-ns.svc.cluster.local:27017/hiking?replicaSet=rs0&readPreference=secondaryPreferred

# 변경 후
mongodb://10.0.11.92:27017,10.0.9.41:27017,10.0.15.147:27017/hiking?replicaSet=rs0&readPreference=secondaryPreferred
```

하지만 이 방법은 코드 수정이 필요하므로 권장하지 않습니다.

## 확인 명령어

### EC2에서 ReplicaSet 상태 확인
```bash
mongosh "mongodb://localhost:27017/hiking?replicaSet=rs0"
rs.status()
rs.conf()
```

### EKS Pod에서 직접 IP로 연결 테스트
```bash
kubectl run mongo-test --image=mongo:7 --rm -it --restart=Never -n bravo-core-ns -- \
  mongosh "mongodb://10.0.11.92:27017,10.0.9.41:27017,10.0.15.147:27017/hiking?replicaSet=rs0" \
  --eval "rs.status()"
```

## 다음 단계

1. EC2 MongoDB Primary에 접속
2. ReplicaSet 설정 확인
3. 호스트명을 IP 주소로 변경
4. EKS에서 연결 테스트



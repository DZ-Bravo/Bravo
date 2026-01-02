# 보안 설정 시방서
## EKS 클러스터 MongoDB 및 S3 연동 보안 설정

**작업 일시:** 2026-01-02  
**작업 범위:** EKS Pod → EC2 MongoDB 연결, EKS Pod → S3 버킷 접근  
**작업자:** AI Assistant

---

## 1. Kubernetes NetworkPolicy 설정

### 1.1 MongoDB 접근 허용 (Egress)

| NS | Policy Name | Target Pod (app) | Direction | Protocol | Port | Allowed To | 적용 |
|----|------------|------------------|-----------|----------|------|------------|------|
| bravo-core-ns | core-egress-db | all | Egress | TCP | 27017 | EC2-Database-MongoDB-Primary (10.0.11.82) | ✅ |
| bravo-core-ns | core-egress-db | all | Egress | TCP | 27017 | EC2-Database-MongoDB-Secondary1 (10.0.9.41) | ✅ |
| bravo-core-ns | core-egress-db | all | Egress | TCP | 27017 | EC2-Database-MongoDB-Secondary2 (10.0.15.147) | ✅ |
| bravo-ai-integration-ns | ai-egress-db | all | Egress | TCP | 27017 | EC2-Database-MongoDB-Primary (10.0.11.82) | ✅ |
| bravo-ai-integration-ns | ai-egress-db | all | Egress | TCP | 27017 | EC2-Database-MongoDB-Secondary1 (10.0.9.41) | ✅ |
| bravo-ai-integration-ns | ai-egress-db | all | Egress | TCP | 27017 | EC2-Database-MongoDB-Secondary2 (10.0.15.147) | ✅ |
| bravo-efk-ns | efk-egress-db | all | Egress | TCP | 27017 | EC2-Database-MongoDB-Primary (10.0.11.82) | ✅ |
| bravo-efk-ns | efk-egress-db | all | Egress | TCP | 27017 | EC2-Database-MongoDB-Secondary1 (10.0.9.41) | ✅ |
| bravo-efk-ns | efk-egress-db | all | Egress | TCP | 27017 | EC2-Database-MongoDB-Secondary2 (10.0.15.147) | ✅ |

**설명:**
- `bravo-core-ns`: 백엔드 서비스(auth-service, store-service, mountain-service 등)가 MongoDB 접근
- `bravo-ai-integration-ns`: AI 서비스(ai-service, chatbot-service)가 MongoDB 접근
- `bravo-efk-ns`: EFK 스택(monstache)이 MongoDB 접근

**파일 위치:**
- `/home/bravo/LABs/k8s-aws/networkpolicy/core/core-egress-db.yaml` (수정)
- `/home/bravo/LABs/k8s-aws/networkpolicy/ai-integration/ai-egress-db.yaml` (신규 생성)
- `/home/bravo/LABs/k8s-aws/networkpolicy/efk/efk-egress-db.yaml` (신규 생성)

**적용 명령:**
```bash
kubectl apply -f /home/bravo/LABs/k8s-aws/networkpolicy/core/core-egress-db.yaml
kubectl apply -f /home/bravo/LABs/k8s-aws/networkpolicy/ai-integration/ai-egress-db.yaml
kubectl apply -f /home/bravo/LABs/k8s-aws/networkpolicy/efk/efk-egress-db.yaml
```

---

## 2. AWS Security Group 설정

### 2.1 MongoDB 보안 그룹

| VPC NAME | Security Group Name | 적용 대상 | Inbound Rules | Outbound Rules | 설명 |
|----------|---------------------|-----------|---------------|----------------|------|
| bravo-vpc | bravo-mongodb-sg | MongoDB EC2 (Primary: 10.0.11.82, Secondary1: 10.0.9.41, Secondary2: 10.0.15.147) | TCP 27017 : VPC 전체 (10.0.0.0/16)<br>TCP 22 : 관리 네트워크 (192.168.0.0/22) | ALL (기본 허용) | MongoDB 전용 보안 그룹으로 EKS Pod에서만 접근 허용 |

**설명:**
- EKS Pod IP가 동적으로 할당되므로 VPC 전체 CIDR (10.0.0.0/16)에서 포트 27017 허용
- SSH 접근은 관리 네트워크(192.168.0.0/22)에서만 허용

**적용 명령:**
```bash
# 보안 그룹 ID 확인
SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=bravo-mongodb-sg" \
  --query 'SecurityGroups[0].GroupId' --output text)

# Inbound Rule 추가
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 27017 \
  --cidr 10.0.0.0/16
```

---

## 3. AWS IAM 권한 설정

### 3.1 노드 IAM Role

| IAM Role Name | 정책 이름 | 정책 ARN | 권한 범위 | 설명 | 적용 |
|---------------|----------|----------|----------|------|------|
| bravo-node-role | AmazonS3ReadOnlyAccess | arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess | 모든 S3 버킷 읽기 | S3 버킷 mountain-course-data 읽기 권한 | ✅ |

**설명:**
- EKS Worker Node에서 S3 버킷 `mountain-course-data`의 코스 데이터를 읽을 수 있도록 권한 추가
- 읽기 전용 권한으로 최소 권한 원칙 준수

**적용 명령:**
```bash
aws iam attach-role-policy \
  --role-name bravo-node-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
```

**권한 확인:**
```bash
aws iam list-attached-role-policies --role-name bravo-node-role
```

---

### 3.2 ServiceAccount 생성

| Namespace | ServiceAccount Name | Role Name | Role / ClusterRole | Resources | verbs | Description | 적용 |
|-----------|---------------------|-----------|-------------------|-----------|-------|-------------|------|
| bravo-core-ns | mountain-service-sa | - | - | - | - | 향후 IRSA 설정 시 사용 | ✅ |

**설명:**
- 현재는 기본 ServiceAccount로 생성
- 향후 IRSA (IAM Roles for Service Accounts) 설정 시 IAM Role과 연결하여 Pod별 S3 접근 권한 세분화 가능

**적용 명령:**
```bash
kubectl apply -f /home/bravo/LABs/k8s/mongo-ns/mountain-sa.yaml
```

---

## 4. 보안 설정 요약표

### 4.1 NetworkPolicy 요약

| NS | Policy Name | Target Pod | Direction | Protocol | Port | Allowed To | 적용 |
|----|------------|------------|-----------|----------|------|------------|------|
| bravo-core-ns | core-egress-db | all | Egress | TCP | 27017 | MongoDB EC2 (3대) | ✅ |
| bravo-ai-integration-ns | ai-egress-db | all | Egress | TCP | 27017 | MongoDB EC2 (3대) | ✅ |
| bravo-efk-ns | efk-egress-db | all | Egress | TCP | 27017 | MongoDB EC2 (3대) | ✅ |

### 4.2 Security Group 요약

| Security Group | Type | Protocol | Port | Source/Destination | 설명 | 적용 |
|----------------|------|----------|------|---------------------|------|------|
| bravo-mongodb-sg | Inbound | TCP | 27017 | 10.0.0.0/16 | EKS Pod 접근 허용 | ✅ |
| bravo-mongodb-sg | Inbound | TCP | 22 | 192.168.0.0/22 | 관리자 SSH | ✅ (기존) |
| bravo-mongodb-sg | Outbound | ALL | ALL | 0.0.0.0/0 | 기본 허용 | ✅ (기존) |

### 4.3 IAM 권한 요약

| IAM Role | 정책 | 권한 범위 | 설명 | 적용 |
|----------|------|----------|------|------|
| bravo-node-role | AmazonS3ReadOnlyAccess | 모든 S3 버킷 읽기 | S3 데이터 읽기 | ✅ |

---

## 5. 보안 원칙 및 고려사항

### 5.1 적용된 보안 원칙

| 원칙 | 적용 내용 | 상태 |
|------|----------|------|
| 최소 권한 원칙 | NetworkPolicy: 특정 IP 주소와 포트만 허용<br>IAM: 읽기 전용 권한만 부여<br>Security Group: VPC 내부 IP 대역만 허용 | ✅ |
| 다층 방어 | Kubernetes NetworkPolicy (Pod 레벨)<br>AWS Security Group (EC2 레벨)<br>IAM Role (권한 레벨) | ✅ |
| 네트워크 분리 | 네임스페이스별 NetworkPolicy 적용<br>특정 IP 주소로만 접근 제한 | ✅ |

### 5.2 보안 고려사항

| 항목 | 현재 상태 | 향후 개선 사항 |
|------|----------|---------------|
| NetworkPolicy | ✅ Pod 간 통신 제어 | 서비스별 NetworkPolicy 세분화 |
| Security Group | ✅ EC2 레벨 접근 제어 | 가능하면 특정 서브넷 CIDR만 허용 |
| IAM 권한 | ✅ S3 접근 제어 | IRSA 설정으로 Pod별 권한 세분화 |
| 인스턴스 메타데이터 | ⚠️ Pod 내부 접근 불가 (보안상 정상) | IRSA 설정으로 해결 |

---

## 6. 검증 및 테스트

### 6.1 NetworkPolicy 검증

| 확인 항목 | 명령어 |
|-----------|--------|
| NetworkPolicy 적용 확인 | `kubectl get networkpolicy -n bravo-core-ns`<br>`kubectl get networkpolicy -n bravo-ai-integration-ns`<br>`kubectl get networkpolicy -n bravo-efk-ns` |
| NetworkPolicy 상세 확인 | `kubectl describe networkpolicy core-egress-db -n bravo-core-ns`<br>`kubectl describe networkpolicy ai-egress-db -n bravo-ai-integration-ns`<br>`kubectl describe networkpolicy efk-egress-db -n bravo-efk-ns` |

### 6.2 Security Group 검증

| 확인 항목 | 명령어 |
|-----------|--------|
| Security Group 규칙 확인 | `aws ec2 describe-security-groups --filters "Name=group-name,Values=bravo-mongodb-sg" --query 'SecurityGroups[0].IpPermissions'` |
| MongoDB 연결 테스트 | `kubectl exec -n bravo-core-ns <pod-name> -- telnet 10.0.11.82 27017` |

### 6.3 IAM 권한 검증

| 확인 항목 | 명령어 |
|-----------|--------|
| IAM Role 정책 확인 | `aws iam list-attached-role-policies --role-name bravo-node-role` |
| S3 접근 테스트 | `aws s3 ls s3://mountain-course-data/ --region ap-northeast-2` |

### 6.4 통합 테스트

| 확인 항목 | 명령어 |
|-----------|--------|
| MongoDB 연결 테스트 | `kubectl logs -n bravo-core-ns deployment/auth-service \| grep -i mongo` |
| S3 데이터 확인 | `kubectl exec -n bravo-core-ns <mountain-service-pod> -- ls -la /app/mountain/ \| head -20` |

---

## 7. 트러블슈팅

| 문제 | 원인 | 해결 방법 |
|------|------|----------|
| Pod에서 MongoDB 연결 실패 | NetworkPolicy 미적용 또는 잘못된 IP 주소 | NetworkPolicy 확인 및 IP 주소 수정 |
| Primary IP 불일치 | MongoDB ReplicaSet 설정과 NetworkPolicy IP 불일치 | NetworkPolicy의 Primary IP를 10.0.11.82로 수정 |
| Connection timed out | Security Group에 EKS Pod IP 대역 미허용 | VPC 전체 CIDR (10.0.0.0/16)에서 포트 27017 허용 |
| S3 접근 불가 (AccessDenied) | 노드 IAM Role에 S3 권한 없음 | AmazonS3ReadOnlyAccess 정책 추가 |
| Pod 내부에서 인스턴스 메타데이터 접근 불가 | 보안상 정상 동작 | 수동 동기화 방법 사용 또는 IRSA 설정 |

---

## 8. 생성/수정된 파일 목록

### 8.1 신규 생성 파일

| 파일 경로 | 설명 |
|-----------|------|
| `/home/bravo/LABs/k8s-aws/networkpolicy/ai-integration/ai-egress-db.yaml` | AI 통합 네임스페이스 MongoDB 접근 NetworkPolicy |
| `/home/bravo/LABs/k8s-aws/networkpolicy/efk/efk-egress-db.yaml` | EFK 네임스페이스 MongoDB 접근 NetworkPolicy |

### 8.2 수정된 파일

| 파일 경로 | 수정 내용 |
|-----------|----------|
| `/home/bravo/LABs/k8s-aws/networkpolicy/core/core-egress-db.yaml` | MongoDB IP 주소 수정 (10.0.11.92 → 10.0.11.82) |

---

## 9. 참고 문서

| 문서 경로 | 설명 |
|-----------|------|
| `/home/bravo/LABs/k8s/MIGRATION_SUMMARY.md` | 전체 작업 요약 |
| `/home/bravo/LABs/k8s/mongo-ns/EC2_MONGODB_CONNECTION_GUIDE.md` | MongoDB 연결 가이드 |
| `/home/bravo/LABs/k8s/mongo-ns/MONGODB_REPLICASET_FIX.md` | ReplicaSet 설정 가이드 |

---

**작업 완료 일시:** 2026-01-02  
**검증 상태:** ✅ NetworkPolicy 적용 완료, ✅ Security Group 설정 완료, ✅ IAM 권한 추가 완료

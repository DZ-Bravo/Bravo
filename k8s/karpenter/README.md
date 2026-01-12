# Karpenter 설정 가이드

## 개요
Karpenter는 Kubernetes 클러스터의 노드를 자동으로 프로비저닝하고 관리하는 도구입니다.

## 파일 구조

### 필수 파일
- `karpenter-sa.yaml`: ServiceAccount 설정
- `karpenter-trust-policy.json`: IAM Role Trust Policy
- `karpenter-controller-policy.json`: Controller IAM Policy
- `ec2nodeclass.yaml`: EC2 노드 클래스 설정
- `nodepool.yaml`: 노드 풀 설정

### 테스트 파일
- `community-service-karpenter-test.yaml`: Karpenter 테스트용 Deployment

## 설치 순서

### 1. IAM Role 생성 (Karpenter Node Role)

```bash
# 노드 역할 생성 (이미 존재하면 생략)
aws iam create-role \
  --role-name KarpenterNodeRole-bravo-eks \
  --assume-role-policy-document file://karpenter-node-trust-policy.json

# 노드 역할에 EKS Worker Node Policy 연결
aws iam attach-role-policy \
  --role-name KarpenterNodeRole-bravo-eks \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy

aws iam attach-role-policy \
  --role-name KarpenterNodeRole-bravo-eks \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy

aws iam attach-role-policy \
  --role-name KarpenterNodeRole-bravo-eks \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly

aws iam attach-role-policy \
  --role-name KarpenterNodeRole-bravo-eks \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
```

### 2. 서브넷 및 보안 그룹 태그 설정

```bash
# 서브넷 태그 설정
aws ec2 create-tags \
  --resources subnet-0e532183cde48d745 subnet-0811d54f9eb095938 \
  --tags Key=karpenter.sh/discovery,Value=bravo-eks

# 보안 그룹 태그 설정
aws ec2 create-tags \
  --resources sg-06df8203537b71734 \
  --tags Key=karpenter.sh/discovery,Value=bravo-eks
```

### 3. Karpenter 리소스 적용

```bash
# EC2NodeClass 적용
kubectl apply -f k8s/karpenter/ec2nodeclass.yaml

# NodePool 적용
kubectl apply -f k8s/karpenter/nodepool.yaml

# 상태 확인
kubectl get ec2nodeclass
kubectl get nodepool
```

### 4. 테스트 Deployment 적용

```bash
# 테스트 Deployment 생성
kubectl apply -f k8s/karpenter/community-service-karpenter-test.yaml

# 초기 상태 확인
kubectl get pods -n bravo-core-ns -l app=community-service-karpenter-test
```

## 테스트 방법 (CA와 동일)

### 1. 노드 스케일 업 테스트

```bash
# Deployment를 10개로 스케일 업 (CA 테스트와 동일한 명령어)
kubectl scale deploy community-service-karpenter-test \
  -n bravo-core-ns --replicas=10

# 노드 생성 확인
watch kubectl get nodes

# Pod 상태 확인
kubectl get pods -n bravo-core-ns -l app=community-service-karpenter-test -w

# NodeClaim 확인 (Karpenter가 생성한 노드)
kubectl get nodeclaims
```

### 2. 노드 스케일 다운 테스트

```bash
# Deployment를 1개로 스케일 다운
kubectl scale deploy community-service-karpenter-test \
  -n bravo-core-ns --replicas=1

# 노드 제거 확인 (약 30초 후)
watch kubectl get nodes
```

## 모니터링

### Karpenter 로그 확인
```bash
kubectl logs -n karpenter deployment/karpenter -c controller -f
```

### NodeClaim 확인
```bash
kubectl get nodeclaims
kubectl describe nodeclaim <nodeclaim-name>
```

### NodePool 상태 확인
```bash
kubectl get nodepool
kubectl describe nodepool default
```

## 문제 해결

### 노드가 생성되지 않는 경우
1. EC2NodeClass 확인: `kubectl get ec2nodeclass -o yaml`
2. NodePool 확인: `kubectl get nodepool -o yaml`
3. Karpenter 로그 확인: `kubectl logs -n karpenter deployment/karpenter -c controller`
4. IAM 권한 확인: Controller Role과 Node Role 권한 확인

### 노드가 삭제되지 않는 경우
1. NodePool의 `disruption` 설정 확인
2. Pod Disruption Budget 확인
3. 노드에 중요한 Pod가 있는지 확인

## 참고사항

- Karpenter는 Pending 상태의 Pod를 감지하여 노드를 생성합니다
- 노드 생성 시간은 약 1-2분 소요됩니다
- 노드 삭제는 `consolidateAfter` 시간 후에 시작됩니다


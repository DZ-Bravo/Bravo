# AWS 인프라 CloudFormation 템플릿

## 📋 개요

온프레미스 Kubernetes 클러스터를 AWS로 완전 이전하기 위한 인프라 구축 CloudFormation 템플릿입니다.

## 🏗️ 구성 요소

- **VPC**: 192.168.0.0/22
- **Public Subnets**: ALB, Monitoring NAT, GitLab
- **Private EKS Subnets**: EKS Worker Nodes
- **Private Service Subnets**: MongoDB, Elasticsearch, Redis
- **Monitoring EC2**: NAT Instance 역할 (Ubuntu 22.04)
- **GitLab EC2**: CI/CD 서버 (Ubuntu 22.04)
- **MongoDB EC2**: 데이터베이스 (Ubuntu 22.04)
- **Elasticsearch + Kibana + Redis EC2**: 검색 및 캐시 (Ubuntu 22.04)
- **ALB**: Application Load Balancer
- **EKS**: Kubernetes 클러스터

**모든 EC2 인스턴스는 Ubuntu 22.04 LTS (Jammy)를 사용합니다.**

## 🚀 사용 방법

### 1. 사전 준비

```bash
# AWS CLI 설정
aws configure

# Key Pair 생성 (EC2 접근용)
aws ec2 create-key-pair --key-name hiking-key --query 'KeyMaterial' --output text > ~/.ssh/hiking-key.pem
chmod 400 ~/.ssh/hiking-key.pem
```

### 2. CloudFormation 스택 생성

#### 방법 1: AWS CLI 사용

```bash
# 스택 생성
aws cloudformation create-stack \
  --stack-name hiking-infrastructure \
  --template-body file://infrastructure.yaml \
  --parameters ParameterKey=KeyPairName,ParameterValue=hiking-key \
               ParameterKey=CertificateArn,ParameterValue='' \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-northeast-2

# 스택 생성 상태 확인
aws cloudformation describe-stacks \
  --stack-name hiking-infrastructure \
  --region ap-northeast-2

# 출력 값 확인
aws cloudformation describe-stacks \
  --stack-name hiking-infrastructure \
  --query 'Stacks[0].Outputs' \
  --region ap-northeast-2
```

#### 방법 2: AWS Console 사용

1. AWS Console → CloudFormation → "스택 생성"
2. "템플릿 준비됨" 선택
3. "템플릿 업로드" → `infrastructure.yaml` 업로드
4. 스택 이름: `hiking-infrastructure`
5. 파라미터 입력:
   - KeyPairName: `hiking-key`
   - CertificateArn: (비워두거나 ACM 인증서 ARN 입력)
6. "스택 생성" 클릭

### 3. EKS 연결

```bash
# kubeconfig 업데이트
aws eks update-kubeconfig --region ap-northeast-2 --name hiking-eks

# 노드 확인
kubectl get nodes

# 클러스터 정보 확인
kubectl cluster-info
```

## 📊 생성되는 리소스

### 네트워크
- VPC (192.168.0.0/22)
- 6개 Subnet (/26)
- Internet Gateway
- Route Tables (Public, Private)
- Security Groups

### EC2 인스턴스 (모두 Ubuntu 22.04)
- Monitoring NAT (t3.large, 2 vCPU, 8GB RAM) - Public-a
- GitLab (t3.xlarge, 4 vCPU, 16GB RAM) - Public-b
- MongoDB (t3.large, 2 vCPU, 8GB RAM) - Private-svc-a
- Elasticsearch + Kibana + Redis (t3.xlarge, 4 vCPU, 16GB RAM) - Private-svc-b

**SSH 접속 시 사용자명: `ubuntu`**

### EKS
- EKS Cluster (Private endpoint)
- Node Group (m6i.large × 2, Multi-AZ, 2 vCPU, 8GB RAM each)

### ALB
- Application Load Balancer (Internet-facing)
- HTTP → HTTPS 리다이렉트

## ⚠️ 중요 사항

### SNAT 설정

Monitoring EC2는 자동으로 SNAT가 설정됩니다. 수동으로 확인하려면:

```bash
# Monitoring EC2에 접속1
ssh -i ~/.ssh/hiking-key.pem ubuntu@<monitoring-public-ip>

# SNAT 확인
sudo iptables -t nat -L -n -v

# IP forwarding 확인
cat /proc/sys/net/ipv4/ip_forward  # 1이어야 함
```

### Private EC2 인터넷 통신 확인

```bash
# MongoDB EC2에 접속 (Bastion 또는 Monitoring EC2를 통해)
ssh -i ~/.ssh/hiking-key.pem ubuntu@<mongodb-private-ip>

# 인터넷 통신 테스트
curl https://www.google.com
```

### EKS Private Endpoint 접근

EKS 클러스터는 Private endpoint만 활성화되어 있으므로, 접근하려면:

1. **Bastion Host 사용**: Monitoring EC2 또는 GitLab EC2를 통해 접근
2. **VPN 연결**: AWS Client VPN 또는 Site-to-Site VPN
3. **Public Endpoint 활성화**: 필요 시 템플릿에서 `EndpointPublicAccess: true`로 변경

### Ubuntu AMI 업데이트

Ubuntu AMI는 리전별로 다를 수 있습니다. 최신 AMI를 확인하려면:

```bash
aws ec2 describe-images \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
  --output text \
  --region ap-northeast-2
```

템플릿의 `Mappings` 섹션에서 AMI ID를 업데이트하세요.

## 🔧 파라미터

| 파라미터 | 설명 | 기본값 |
|---------|------|--------|
| KeyPairName | EC2 Key Pair 이름 (필수) | - |
| CertificateArn | ACM 인증서 ARN (선택) | '' |
| InstanceTypeMonitoring | Monitoring NAT 인스턴스 타입 | t3.large |
| InstanceTypeGitLab | GitLab 인스턴스 타입 | t3.xlarge |
| InstanceTypeMongoDB | MongoDB 인스턴스 타입 | t3.large |
| InstanceTypeElasticsearch | Elasticsearch 인스턴스 타입 | t3.xlarge |
| InstanceTypeEKSNode | EKS 노드 인스턴스 타입 | m6i.large |

## 📝 출력 값

스택 생성 후 다음 출력 값을 확인할 수 있습니다:

- VPCId
- PublicSubnetAId, PublicSubnetBId
- PrivateEKSSubnetAId, PrivateEKSSubnetBId
- PrivateSvcSubnetAId, PrivateSvcSubnetBId
- MonitoringNATInstanceId, MonitoringNATPrivateIP, MonitoringNATPublicIP
- GitLabInstanceId, GitLabPublicIP
- MongoDBInstanceId, MongoDBPrivateIP
- ElasticsearchKibanaRedisInstanceId, ElasticsearchKibanaRedisPrivateIP
- ALBDNSName, ALBArn
- EKSClusterId, EKSClusterEndpoint
- EKSKubeconfigCommand

## 🔄 스택 업데이트

```bash
aws cloudformation update-stack \
  --stack-name hiking-infrastructure \
  --template-body file://infrastructure.yaml \
  --parameters ParameterKey=KeyPairName,ParameterValue=hiking-key \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-northeast-2
```

## 🗑️ 스택 삭제

```bash
aws cloudformation delete-stack \
  --stack-name hiking-infrastructure \
  --region ap-northeast-2

# 삭제 상태 확인
aws cloudformation describe-stacks \
  --stack-name hiking-infrastructure \
  --region ap-northeast-2
```

**주의**: 모든 리소스가 삭제됩니다. 데이터베이스 데이터도 함께 삭제되므로 백업 확인 필수!

## 💰 예상 비용

월 약 $550-600 (온디맨드 기준)

- Monitoring NAT (t3.large): 약 $60/월
- GitLab (t3.xlarge): 약 $120/월
- MongoDB (t3.large): 약 $60/월
- Elasticsearch/Kibana/Redis (t3.xlarge): 약 $120/월
- EKS Worker Nodes (m6i.large × 2): 약 $150-180/월
- EKS Cluster: $73/월
- ALB: 약 $20-30/월
- 기타 (Route 53, 데이터 전송 등): 약 $10-20/월

- Reserved Instances 사용 시 약 30-40% 절감 가능

## 🔧 다음 단계

인프라 구축 후:

1. **ALB Ingress Controller 설치**
2. **애플리케이션 서비스 배포**
3. **모니터링 스택 설치** (Prometheus, Grafana)
4. **GitLab 설치 및 설정**
5. **CI/CD 파이프라인 구성**

## 📝 참고

- CloudFormation 템플릿 버전: 2010-09-09
- Kubernetes 버전: 1.28
- Ubuntu 버전: 22.04 LTS (Jammy)


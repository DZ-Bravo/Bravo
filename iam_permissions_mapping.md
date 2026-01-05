# IAM 권한 매핑표

## 리더(PM) 제외 사용자 권한 설정

| Department | User | Roles | Permission |
|------------|------|-------|------------|
| Security-Dept. | secops (예라) | 보안 설정 조회 및 감사 | AmazonEKSReadOnlyAccess |
| Security-Dept. | secops (예라) | IAM 정책 및 사용자 조회 | IAMReadOnlyAccess |
| Security-Dept. | secops (예라) | VPC / 네트워크 구성 조회 | AmazonVPCReadOnlyAccess |
| Security-Dept. | secops (예라) | 감사 로그 및 추적 조회 | CloudTrailReadOnlyAccess |
| Security-Dept. | secops (예라) | 리소스 설정 변경 이력 조회 | AWSConfigReadOnlyAccess |
| Security-Dept. | secops (예라) | Karpenter 관리 | AmazonEKSClusterPolicy, AmazonEKSServicePolicy |
| Security-Dept. | secops (예라) | 시크릿 관리 | AWSSecretsManagerReadWriteAccess |
| Security-Dept. | secops (예라) | 암호화 키 관리 (KMS) | AWSKeyManagementServicePowerUser |
| Security-Dept. | secops (예라) | 웹 애플리케이션 방화벽 관리 (WAF) | AWSWAFFullAccess |
| Dev-Dept. | devops (성혁) | EKS 클러스터 운영 관리 | AmazonEKSClusterPolicy |
| Dev-Dept. | devops (성혁) | EKS 서비스 연동 관리 | AmazonEKSServicePolicy |
| Dev-Dept. | devops (성혁) | 컨테이너 이미지 관리(ECR) | AmazonEC2ContainerRegistryPowerUser |
| Dev-Dept. | devops (성혁) | EC2 서버 관리 | AmazonEC2FullAccess |
| Dev-Dept. | devops (성혁) | 서버 접근 및 운영 자동화 | AmazonSSMFullAccess |
| Dev-Dept. | devops (성혁) | 개발 아티팩트 저장 관리 (S3) | AmazonS3FullAccess |
| Dev-Dept. | devops (성혁) | 서버리스 함수 개발 및 관리 | AWSLambdaFullAccess |
| Dev-Dept. | devops (성혁) | 네트워크 구성 및 관리 | AmazonVPCFullAccess |
| Fin-Dept. | finops (하나) | 비용 및 청구 정보 조회 | AWSBillingReadOnlyAccess |
| Fin-Dept. | finops (하나) | 비용 분석 및 리포트 | CostExplorerReadOnlyAccess |
| Fin-Dept. | finops (하나) | 예산 초과 알림 및 제어 | AWSBudgetsActionsWithAWSResourceControlAccess |
| Fin-Dept. | finops (하나) | 비용 알림 통지 | AmazonSNSFullAccess |
| Fin-Dept. | finops (하나) | 비용 자동화 처리 | AWSLambdaBasicExecutionRole |
| Fin-Dept. | finops (하나) | 컨테이너 이미지 관리(ECR) | AmazonEC2ContainerRegistryPowerUser |
| Fin-Dept. | finops (하나) | EKS 클러스터 배포 관리 | AmazonEKSClusterPolicy, AmazonEKSServicePolicy |
| Fin-Dept. | finops (하나) | GitLab 서버 관리 (EC2) | AmazonEC2ReadOnlyAccess (또는 FullAccess) |
| Fin-Dept. | finops (하나) | 아티팩트 저장 관리 (S3) | AmazonS3FullAccess |
| Fin-Dept. | finops (하나) | 서버 접근 및 운영 자동화 | AmazonSSMFullAccess |
| Ops-Dept. | ops (우석) | EKS 클러스터 운영 지원 | AmazonEKSClusterPolicy |
| Ops-Dept. | ops (우석) | EC2 서버 관리 | AmazonEC2FullAccess |
| Ops-Dept. | ops (우석) | 서버 접근 및 운영 자동화 | AmazonSSMFullAccess |
| Ops-Dept. | ops (우석) | 백업 데이터 저장 관리 | AmazonS3FullAccess |
| Ops-Dept. | ops (우석) | S3 Storage Lens 분석 및 대시보드 조회 | s3:ListStorageLensConfigurations, s3:GetStorageLensConfiguration, s3:GetStorageLensDashboard |
| Ops-Dept. | ops (우석) | 감사 로그 및 추적 조회 | CloudTrailReadOnlyAccess |
| Ops-Dept. | ops (우석) | 백업 정책 및 복구 관리 | AWSBackupFullAccess |


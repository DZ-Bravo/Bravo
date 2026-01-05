# 온프레미스 → AWS 기술 스택 이전 및 선택 이유

## 기술 스택 비교표

| 카테고리 | 온프레미스 | AWS 이전 후 | 사용 이유 |
|---------|-----------|------------|----------|
| **컨테이너 오케스트레이션** | Kubernetes (온프레미스) | **AWS EKS** | - 완전 관리형 Kubernetes 서비스로 Control Plane 관리 부담 감소<br>- AWS 서비스와의 네이티브 통합 (ALB, IAM, ECR 등)<br>- 고가용성 및 자동 스케일링 지원<br>- 클러스터 업그레이드 및 패치 자동화 |
| **인프라 코드화** | 수동 구성 / Ansible | **AWS CloudFormation** | - Infrastructure as Code로 인프라 일관성 보장<br>- 버전 관리 및 롤백 가능<br>- 선언적 방식으로 인프라 관리<br>- AWS 리소스 간 의존성 자동 처리 |
| **로드 밸런서** | Nginx / 온프레미스 LB | **AWS ALB (Application Load Balancer)** | - Layer 7 로드 밸런싱 (HTTP/HTTPS)<br>- 자동 스케일링 및 고가용성<br>- SSL/TLS 종료 지원<br>- 경로 기반 라우팅 및 헬스체크 자동화<br>- AWS WAF 통합 가능 |
| **데이터베이스** | MongoDB (온프레미스) | **MongoDB (EC2 Replica Set)** | - 기존 애플리케이션 코드 변경 최소화<br>- 데이터 마이그레이션 용이성<br>- 향후 AWS DocumentDB로 전환 가능<br>- Replica Set으로 고가용성 확보 |
| **캐시** | Redis (온프레미스) | **Redis (EC2)** | - 기존 애플리케이션 호환성 유지<br>- 낮은 레이턴시 요구사항<br>- 향후 ElastiCache로 전환 가능 |
| **검색 엔진** | Elasticsearch (온프레미스) | **Elasticsearch (EC2)** | - 기존 EFK 스택 유지<br>- Monstache를 통한 MongoDB 동기화<br>- 향후 OpenSearch Service로 전환 가능 |
| **객체 스토리지** | 로컬 파일 시스템 | **Amazon S3** | - 무제한 스케일링 및 내구성<br>- 비용 효율적인 저장소<br>- 정적 데이터(코스 데이터 등) 저장<br>- 버전 관리 및 라이프사이클 정책 지원 |
| **컨테이너 레지스트리** | Docker Registry / Harbor | **Amazon ECR** | - AWS 통합 인증 (IAM 기반)<br>- 이미지 스캔 및 취약점 검사<br>- 이미지 라이프사이클 정책<br>- GitLab CI/CD와의 네이티브 통합 |
| **CI/CD** | Jenkins / GitLab (온프레미스) | **GitLab (EC2)** | - 기존 CI/CD 파이프라인 재사용<br>- ECR 연동을 통한 자동 배포<br>- Self-hosted로 데이터 제어<br>- GitLab Runner로 빌드/테스트 자동화 |
| **서비스 메시** | Istio (온프레미스) | **Istio (EKS)** | - 마이크로서비스 간 통신 제어<br>- 트래픽 관리 및 보안 정책<br>- 분산 추적 (Tempo 연동)<br>- mTLS 통신 지원 |
| **모니터링 메트릭** | Prometheus (온프레미스) | **Prometheus (EC2)** | - Kubernetes 메트릭 수집<br>- 표준 PromQL 쿼리 언어<br>- Grafana와의 통합<br>- 장기 메트릭 저장 (필요시) |
| **모니터링 시각화** | Grafana (온프레미스) | **Grafana (EC2)** | - Prometheus, Loki, Tempo 통합 대시보드<br>- 커스텀 메트릭 시각화<br>- 알림 규칙 설정<br>- 다중 데이터 소스 지원 |
| **로그 수집** | Fluentd / Fluent Bit | **Loki (EKS) + Promtail** | - Kubernetes 네이티브 로그 수집<br>- 레이블 기반 로그 쿼리<br>- Grafana 통합<br>- Prometheus와 유사한 쿼리 언어 (LogQL) |
| **분산 추적** | Jaeger | **Tempo (EKS)** | - OpenTelemetry 표준 지원<br>- 낮은 오버헤드<br>- Grafana 통합<br>- 긴 트레이스 보관 가능 |
| **네트워킹** | 물리적 네트워크 / VLAN | **AWS VPC** | - 격리된 네트워크 환경<br>- Public/Private 서브넷 분리<br>- Security Group 및 NACL로 네트워크 보안<br>- NAT Gateway를 통한 Private 서브넷 인터넷 접근 |
| **보안 (인증/인가)** | 자체 인증 시스템 | **AWS Cognito** | - 완전 관리형 사용자 인증 서비스<br>- OAuth 2.0 / OpenID Connect 지원<br>- 소셜 로그인 통합<br>- Lambda Trigger로 커스텀 로직 구현 |
| **보안 (키 관리)** | 하드코딩 / 환경 변수 | **AWS KMS + Secrets Manager** | - 암호화 키 중앙 관리<br>- 자동 키 로테이션<br>- IAM 기반 접근 제어<br>- 애플리케이션 시크릿 안전한 저장 |
| **보안 (네트워크)** | 방화벽 규칙 | **Security Group + NetworkPolicy** | - EC2 레벨 보안 (Security Group)<br>- Pod 레벨 보안 (NetworkPolicy)<br>- 최소 권한 원칙 적용<br>- 다층 보안 방어 |
| **보안 (WAF)** | - | **AWS WAF** | - 웹 애플리케이션 보호<br>- DDoS 공격 방어<br>- SQL Injection, XSS 방어<br>- ALB와 통합 |
| **컴퓨팅 오토스케일링** | 수동 스케일링 | **Karpenter (EKS)** | - Kubernetes 워크로드 기반 자동 스케일링<br>- 다양한 인스턴스 타입 선택<br>- 비용 최적화<br>- 빠른 노드 프로비저닝 |
| **세션 관리** | SSH 직접 접근 | **AWS Systems Manager (SSM)** | - 키 관리 없이 EC2 접근<br>- 감사 로그 자동 기록<br>- IAM 기반 접근 제어<br>- 세션 기록 및 재생 가능 |
| **비용 관리** | 고정 비용 | **AWS Cost Explorer + Budgets** | - 리소스별 비용 분석<br>- 예산 설정 및 알림<br>- 비용 최적화 권장사항<br>- 리소스 태깅 기반 비용 추적 |

## 주요 기술 선택 이유 상세

### 1. AWS EKS 선택 이유
- **완전 관리형 서비스**: Control Plane 관리 부담 제거, 고가용성 보장
- **AWS 통합**: ALB, IAM, ECR 등 AWS 서비스와의 네이티브 통합
- **엔터프라이즈급 기능**: 자동 스케일링, 업그레이드, 모니터링 지원

### 2. MongoDB를 EC2에서 운영하는 이유
- **점진적 마이그레이션**: 기존 애플리케이션 코드 변경 최소화
- **유연성**: 향후 AWS DocumentDB로 전환 가능
- **비용 효율성**: Managed Service 대비 초기 비용 절감
- **제어**: 데이터베이스 설정 및 튜닝 자유도

### 3. S3를 객체 스토리지로 선택한 이유
- **무제한 스케일링**: 코스 데이터 등 대용량 정적 파일 저장
- **내구성**: 99.999999999% (11 9's) 객체 내구성
- **비용 효율성**: 스토리지 클래스별 비용 최적화
- **접근성**: HTTP/HTTPS를 통한 글로벌 접근

### 4. ECR을 컨테이너 레지스트리로 선택한 이유
- **AWS 통합**: IAM 기반 인증으로 보안 강화
- **비용**: 데이터 전송 비용 없음 (동일 리전)
- **보안**: 이미지 스캔 및 취약점 검사
- **CI/CD 통합**: GitLab CI/CD와의 원활한 통합

### 5. Cognito를 인증 서비스로 선택한 이유
- **완전 관리형**: 인증 서버 운영 및 유지보수 불필요
- **표준 프로토콜**: OAuth 2.0, OpenID Connect 지원
- **확장성**: 수백만 사용자 지원
- **커스터마이징**: Lambda Trigger로 비즈니스 로직 구현 가능

### 6. Loki + Tempo를 관찰성 스택으로 선택한 이유
- **Grafana 통합**: 단일 대시보드에서 메트릭, 로그, 트레이스 통합
- **오픈소스**: 커뮤니티 지원 및 커스터마이징 가능
- **효율성**: 로그 및 트레이스 데이터 압축 저장
- **표준 지원**: OpenTelemetry 표준 지원

### 7. CloudFormation을 IaC로 선택한 이유
- **AWS 네이티브**: AWS 리소스 생성 및 관리에 최적화
- **의존성 관리**: 리소스 간 의존성 자동 처리
- **롤백 지원**: 스택 롤백으로 이전 상태 복구
- **템플릿 재사용**: 다른 환경에서 템플릿 재사용 가능

### 8. ALB를 로드 밸런서로 선택한 이유
- **Layer 7 지원**: HTTP/HTTPS 레벨 라우팅 및 로드 밸런싱
- **자동 스케일링**: 트래픽 증가에 따라 자동 확장
- **고가용성**: 다중 AZ 배포로 단일 장애점 제거
- **SSL/TLS 종료**: 인증서 관리 및 SSL 종료 지원

## 기술 스택 아키텍처

```
Internet
   │
   ▼
[ AWS ALB ] ──┐
   │          │
   ├─▶ [ EKS Cluster ] ──▶ [ Application Pods ]
   │                      │
   │                      ├─▶ [ Istio Service Mesh ]
   │                      │
   │                      └─▶ [ Monitoring Stack ]
   │                          ├─ Prometheus (EC2)
   │                          ├─ Grafana (EC2)
   │                          ├─ Loki (EKS)
   │                          └─ Tempo (EKS)
   │
   ├─▶ [ MongoDB EC2 ] (Replica Set)
   ├─▶ [ Redis EC2 ]
   ├─▶ [ Elasticsearch EC2 ]
   ├─▶ [ GitLab EC2 ] ──▶ [ GitLab CI/CD ] ──▶ [ ECR ]
   │
   └─▶ [ S3 ] (Static Data)
```

## 마이그레이션 전략

1. **하이브리드 접근**: 기존 스택(DB, Cache)은 EC2에서 운영하면서 점진적으로 AWS 서비스로 전환
2. **최소 변경 원칙**: 애플리케이션 코드 변경 최소화를 위해 동일한 기술 스택 유지 (MongoDB, Redis 등)
3. **확장성 고려**: 향후 트래픽 증가에 대비한 스케일링 전략 (EKS, ALB 자동 스케일링)
4. **비용 최적화**: Managed Service와 Self-hosted 서비스 간 비용 비교 후 선택
5. **보안 강화**: AWS IAM, Security Group, NetworkPolicy를 통한 다층 보안 방어


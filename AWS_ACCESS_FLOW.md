# AWS 서비스 접속 흐름 (실제 구조)

## ✅ 실제 확인된 AWS 인프라 구조

### 1. 사용자 접속 순서

```
1. 사용자 (브라우저)
   ↓
2. Route 53 (hiker-cloud.site)
   ├─ A 레코드 (Alias) → ALB
   └─ www.hiker-cloud.site → ALB
   ↓
3. ACM TLS 인증서
   ├─ 도메인: hiker-cloud.site, *.hiker-cloud.site
   ├─ 상태: ISSUED (발급 완료)
   └─ ARN: arn:aws:acm:ap-northeast-2:940482451773:certificate/be0c2b32-10e1-4d84-be2c-ac407e5c50eb
   ↓
4. AWS WAF (hiker-cloud-waf)
   ├─ DDoS 방어
   ├─ SQL Injection 방어
   └─ 기타 보안 규칙
   ↓
5. AWS ALB (hiker-cloud-alb)
   ├─ HTTP (80) → HTTPS (443) 자동 리다이렉트
   ├─ HTTPS (443) - ACM 인증서로 TLS 종료
   └─ 라우팅 규칙:
      ├─ Priority 1: /auth/success → Frontend
      ├─ Priority 2: /monitoring, /monitoring/* → AI Infra Service
      ├─ Priority 3: /api, /api/* → Frontend
      ├─ Priority 4: /* (기본) → Frontend
      ├─ Priority 100: gitlab.hiker-cloud.site → GitLab EC2
      ├─ Priority 101: grafana.hiker-cloud.site → Grafana EC2
      └─ Priority 102: prometheus.hiker-cloud.site → Prometheus EC2
   ↓
6. EKS Target Groups
  ├─ Target Group: k8s-bravofro-frontend-37ee3fad9d
  │   └─ Type: IP (Pod IP 직접 연결)
  │   └─ Port: 80
  │   └─ Target: Frontend Pod IPs
  │
  └─ Target Group: k8s-bravofro-aiinfras-1bbcde16d0
      └─ Type: IP (Pod IP 직접 연결)
      └─ Port: 3011
      └─ Target: AI Infra Service Pod IPs
   ↓
7. Kubernetes Pods
  ├─ Frontend Pods (포트 80)
  └─ AI Infra Service Pods (포트 3011)
```

## 📋 상세 구성

### Route 53
- **호스팅 존**: `hiker-cloud.site`
- **레코드 타입**: A (Alias)
- **대상**: `hiker-cloud-alb-1817160795.ap-northeast-2.elb.amazonaws.com`
- **서브도메인**:
  - `hiker-cloud.site` → ALB
  - `www.hiker-cloud.site` → ALB
  - `gitlab.hiker-cloud.site` → ALB
  - `grafana.hiker-cloud.site` → ALB
  - `prometheus.hiker-cloud.site` → ALB

### ACM (AWS Certificate Manager)
- **인증서 ARN**: `arn:aws:acm:ap-northeast-2:940482451773:certificate/be0c2b32-10e1-4d84-be2c-ac407e5c50eb`
- **도메인**: `hiker-cloud.site`, `*.hiker-cloud.site`
- **상태**: ISSUED (발급 완료)
- **유효 기간**: 2025-12-31 ~ 2027-01-30
- **사용 위치**: ALB HTTPS 리스너 (443 포트)

### AWS WAF
- **이름**: `hiker-cloud-waf`
- **스코프**: Regional
- **연결된 리소스**: `hiker-cloud-alb`
- **기능**:
  - DDoS 방어
  - SQL Injection 방어
  - 기타 보안 규칙

### AWS ALB
- **이름**: `hiker-cloud-alb`
- **타입**: Application Load Balancer
- **스킴**: Internet-facing
- **리스너**:
  - **HTTP (80)**: HTTPS로 자동 리다이렉트 (301)
  - **HTTPS (443)**: ACM 인증서 사용
- **인증서**: `arn:aws:acm:ap-northeast-2:940482451773:certificate/be0c2b32-10e1-4d84-be2c-ac407e5c50eb`
- **서브넷**: Public Subnet A, B (Multi-AZ)

### EKS Target Groups
1. **Frontend Target Group**
   - 이름: `k8s-bravofro-frontend-37ee3fad9d`
   - 타입: IP (Pod IP 직접 연결)
   - 포트: 80
   - 프로토콜: HTTP

2. **AI Infra Service Target Group**
   - 이름: `k8s-bravofro-aiinfras-1bbcde16d0`
   - 타입: IP (Pod IP 직접 연결)
   - 포트: 3011
   - 프로토콜: HTTP

3. **GitLab Target Group**
   - 이름: `gitlab-tg`
   - 타입: Instance (EC2)
   - 포트: 80

4. **Grafana Target Group**
   - 이름: `grafana-tg`
   - 타입: Instance (EC2)
   - 포트: 3000

5. **Prometheus Target Group**
   - 이름: `prometheus-tg`
   - 타입: Instance (EC2)
   - 포트: 9090

## 🔄 트래픽 흐름 예시

### 예시 1: 메인 페이지 접속
```
1. 사용자
   ↓
2. Route 53
   ↓
3. ACM TLS 인증서 (검증)
   ↓
4. AWS WAF (보안 필터링)
   ↓
5. ALB (HTTPS 443, ACM 인증서로 TLS 종료)
   → Rule Priority 4: /* → Frontend Target Group
   ↓
6. EKS Frontend Target Group
   ↓
7. Frontend Pod
```

### 예시 2: API 호출
```
1. 사용자
   ↓
2. Route 53
   ↓
3. ACM TLS 인증서
   ↓
4. AWS WAF
   ↓
5. ALB (HTTPS 443)
   → Rule Priority 3: /api/* → Frontend Target Group
   ↓
6. EKS Frontend Target Group
   ↓
7. Frontend Pod (프록시 또는 내부 서비스 호출)
```

### 예시 3: 모니터링 페이지
```
1. 사용자
   ↓
2. Route 53
   ↓
3. ACM TLS 인증서
   ↓
4. AWS WAF
   ↓
5. ALB (HTTPS 443)
   → Rule Priority 2: /monitoring/* → AI Infra Target Group
   ↓
6. EKS AI Infra Target Group
   ↓
7. AI Infra Service Pod (Port 3011)
```

## ✅ 확인 사항

1. ✅ **Route 53**: ALB로 정상 연결
2. ✅ **ACM**: TLS 인증서 발급 완료 (ISSUED)
3. ✅ **WAF**: ALB에 연결됨
4. ✅ **ALB**: HTTPS 리다이렉트 및 ACM 인증서로 TLS 종료
5. ✅ **EKS**: Target Group을 통한 Pod IP 직접 연결
6. ✅ **Istio 미사용**: AWS에서는 Istio Gateway를 사용하지 않음

## 📝 참고사항

- **접속 순서**: 사용자 → Route 53 → ACM TLS 인증 → WAF → ALB → EKS Target Groups → Kubernetes Pods
- **Istio Gateway는 사용하지 않음**: AWS 환경에서는 ALB가 직접 EKS Pod IP로 연결
- **ACM 인증서**: ALB HTTPS 리스너에서 SSL/TLS 종료 (443 포트)
- **WAF**: ALB 앞단에서 보안 필터링 (DDoS, SQL Injection 등)
- **Target Group 타입**: IP 타입을 사용하여 Pod IP 직접 연결 (Kubernetes Service를 거치지 않음)


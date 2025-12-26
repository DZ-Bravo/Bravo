# AI 인프라 서비스 전체 아키텍처 문서

## 📋 목차
1. [개요](#개요)
2. [기술 스택](#기술-스택)
3. [구현 구조](#구현-구조)
4. [Kubernetes 리소스](#kubernetes-리소스)
5. [네임스페이스 및 Pod 구성](#네임스페이스-및-pod-구성)
6. [데이터 흐름](#데이터-흐름)
7. [배포 구조](#배포-구조)

---

## 개요

**AI 인프라 서비스**는 Kubernetes 클러스터의 모니터링, 로그 수집, 에러 분석, 보고서 생성, AI 기반 분석을 제공하는 종합 모니터링 시스템입니다.

### 주요 기능
- 실시간 인프라 모니터링 대시보드
- Prometheus 메트릭 수집 및 시각화
- Loki 로그 수집 및 분석
- 에러 분석 및 알림 (Slack)
- 자동화된 보고서 생성 (일간/주간/월간)
- AI 기반 인프라 분석 (AWS Bedrock)
- CSV 데이터 내보내기
- 헬스체크 및 알림

---

## 기술 스택

### 백엔드
- **런타임**: Node.js 18 (Alpine Linux)
- **프레임워크**: Express.js 4.18.2
- **언어**: JavaScript (ES Modules)

### 주요 라이브러리
| 라이브러리 | 용도 | 버전 |
|-----------|------|------|
| `express` | 웹 서버 프레임워크 | ^4.18.2 |
| `axios` | HTTP 클라이언트 (Prometheus, Loki API 호출) | ^1.6.0 |
| `@kubernetes/client-node` | Kubernetes API 클라이언트 | ^0.20.0 |
| `puppeteer` | PDF 생성 (보고서) | ^21.0.0 |
| `aws-sdk` | AWS SDK v2 (SES, Bedrock) | ^2.1692.0 |
| `@aws-sdk/client-bedrock-runtime` | AWS Bedrock Runtime API | ^3.490.0 |
| `@aws-sdk/client-bedrock-agent-runtime` | AWS Bedrock Agent Runtime API | ^3.490.0 |
| `@slack/web-api` | Slack Bot API | ^6.9.0 |
| `cors` | CORS 미들웨어 | ^2.8.5 |
| `dotenv` | 환경 변수 관리 | ^16.3.1 |

### 프론트엔드
- **HTML5/CSS3/JavaScript** (바닐라 JS)
- **Chart.js** 4.4.0 (차트 시각화)
- **CDN 기반** (별도 빌드 없음)

### 인프라 및 모니터링
- **Prometheus**: 메트릭 수집 및 쿼리
- **Loki**: 로그 수집 및 쿼리
- **Grafana**: 메트릭 시각화 (외부 링크)
- **Kiali**: 서비스 메시 시각화 (외부 링크)
- **Istio**: 서비스 메시, Gateway, VirtualService

### 외부 서비스
- **AWS Bedrock**: AI 분석 및 보고서 생성
- **AWS SES**: 이메일 전송
- **Slack**: 알림 및 보고서 전송

### 컨테이너
- **Base Image**: `node:18-alpine`
- **추가 패키지**:
  - Chromium (Puppeteer용)
  - 한글 폰트 (Noto Sans CJK, Noto Sans)
  - tzdata (한국 시간대)

---

## 구현 구조

### 디렉토리 구조
```
ai-infra-service/
├── backend/
│   ├── public/              # 프론트엔드 정적 파일
│   │   ├── index.html       # 메인 HTML
│   │   ├── js/
│   │   │   └── main.js     # 프론트엔드 JavaScript
│   │   └── css/
│   │       └── style.css   # 스타일시트
│   ├── routes/             # Express 라우트
│   │   ├── metrics.js      # 메트릭 API
│   │   ├── errors.js       # 에러 분석 API
│   │   ├── ai.js           # AI 분석 API
│   │   ├── reports.js      # 보고서 API
│   │   ├── csv-export.js   # CSV 내보내기 API
│   │   ├── healthcheck.js  # 헬스체크 API
│   │   └── kiali-links.js  # 외부 링크 API
│   ├── services/           # 비즈니스 로직
│   │   ├── prometheus.js   # Prometheus 쿼리 서비스
│   │   ├── kubernetes.js   # Kubernetes API 서비스
│   │   ├── loki.js         # Loki 쿼리 서비스
│   │   ├── healthcheck.js  # 헬스체크 서비스
│   │   ├── alert.js        # 알림 서비스
│   │   ├── bedrock-analysis.js  # Bedrock 분석 서비스
│   │   ├── bedrock-report.js    # Bedrock 보고서 서비스
│   │   ├── report.js        # 보고서 생성 서비스
│   │   ├── report-script.js # CronJob용 보고서 스크립트
│   │   └── csv-generator.js # CSV 생성 서비스
│   ├── server.js           # Express 서버 진입점
│   ├── Dockerfile          # Docker 이미지 빌드
│   └── package.json        # 의존성 관리
├── k8s/                    # Kubernetes 매니페스트
│   ├── ai-infra-service.yaml        # Deployment, Service
│   ├── ai-infra-service-rbac.yaml   # RBAC (ServiceAccount, ClusterRole)
│   ├── reports/
│   │   ├── daily-report-cronjob.yaml    # 일간 보고서 CronJob
│   │   ├── weekly-report-cronjob.yaml   # 주간 보고서 CronJob
│   │   └── monthly-report-cronjob.yaml  # 월간 보고서 CronJob
│   ├── healthcheck/
│   │   └── healthcheck-daemonset.yaml  # 헬스체크 DaemonSet
│   └── ai-infra-secrets-template.yaml  # Secret 템플릿
└── README.md
```

### 서버 구조 (server.js)

```javascript
Express Server (Port 3011)
├── Middleware
│   ├── CORS
│   ├── JSON Parser
│   └── Static File Serving (public/)
├── API Routes (/api/monitoring/*)
│   ├── /metrics/*          → metricsRoutes
│   ├── /errors/*           → errorsRoutes
│   ├── /ai/*               → aiRoutes
│   ├── /reports/*          → reportsRoutes
│   ├── /csv/*              → csvRoutes
│   ├── /healthcheck/*      → healthcheckRoutes
│   └── /kiali/*            → kialiRoutes
└── Health Check (/health)
```

### 서비스 레이어 구조

#### 1. Prometheus Service (`services/prometheus.js`)
- **역할**: Prometheus 쿼리 실행 및 메트릭 수집
- **주요 함수**:
  - `queryPrometheus(query)`: 단일 쿼리 실행
  - `queryRange(query, start, end, step)`: 범위 쿼리 실행
  - `getNodeCPU(nodeName)`: 노드 CPU 사용률
  - `getNodeMemory(nodeName)`: 노드 메모리 사용률
  - `getContainerCPUMetrics()`: 컨테이너 CPU 메트릭
  - `getContainerMemoryMetrics()`: 컨테이너 메모리 메트릭
  - `getPodCPUMetrics()`: Pod CPU 메트릭
  - `getPodMemoryMetrics()`: Pod 메모리 메트릭
  - `get5xxErrorBreakdown()`: 5XX 에러 단계별 분류
  - `getClusterMetrics()`: 클러스터 리소스 사용률

#### 2. Kubernetes Service (`services/kubernetes.js`)
- **역할**: Kubernetes API 호출
- **주요 함수**:
  - `getClusterOverview()`: 클러스터 개요 (노드/Pod 수)
  - `getNodes()`: 노드 목록
  - `getPods()`: Pod 목록
  - `getNodeDetails()`: 노드 상세 정보
  - `getPodDetails()`: Pod 상세 정보

#### 3. Loki Service (`services/loki.js`)
- **역할**: Loki 로그 쿼리
- **주요 함수**:
  - `queryLoki(query, start, end)`: Loki 쿼리 실행
  - `getTodayErrors()`: 금일 에러 로그
  - `getRecentErrors()`: 최근 에러 로그
  - `getErrorLogCountOverTime()`: 시간별 에러 로그 수
  - `getServiceErrors()`: 서비스별 에러 로그
  - `getTopErrorMessages()`: Top N 에러 메시지

#### 4. Healthcheck Service (`services/healthcheck.js`)
- **역할**: 헬스체크 Pod 로그 읽기 및 상태 확인
- **주요 함수**:
  - `getHealthcheckStatus()`: 헬스체크 상태 조회

#### 5. Bedrock Analysis Service (`services/bedrock-analysis.js`)
- **역할**: AWS Bedrock Agent를 통한 AI 분석
- **주요 함수**:
  - `requestAnalysis(data)`: 분석 요청

#### 6. Bedrock Report Service (`services/bedrock-report.js`)
- **역할**: AWS Bedrock Agent를 통한 보고서 내용 생성
- **주요 함수**:
  - `generateReportContent(data)`: 보고서 내용 생성

#### 7. Report Service (`services/report.js`)
- **역할**: 보고서 데이터 수집, HTML 생성, PDF 변환, 전송
- **주요 함수**:
  - `collectReportData()`: 보고서 데이터 수집
  - `generateHTMLTemplate()`: HTML 템플릿 생성
  - `generatePDF()`: Puppeteer로 PDF 생성
  - `sendReportToSlack()`: Slack 전송
  - `sendReportToSES()`: AWS SES 이메일 전송

#### 8. Alert Service (`services/alert.js`)
- **역할**: 임계치 기반 알림 전송
- **주요 함수**:
  - `checkThresholds()`: 임계치 확인
  - `sendSlackAlert()`: Slack 알림 전송

---

## Kubernetes 리소스

### 네임스페이스
- **네임스페이스**: `bravo-ai-integration-ns`

### Deployment
- **이름**: `ai-infra-service`
- **레플리카**: 2-5개 (HPA에 의해 자동 조정)
- **이미지**: `192.168.0.244:30305/bravo/hiking-ai-infra-service:latest`
- **포트**: 3011
- **리소스**:
  - Requests: CPU 500m, Memory 512Mi
  - Limits: CPU 1, Memory 1Gi

### Service
- **이름**: `ai-infra-service`
- **타입**: ClusterIP
- **포트**: 3011
- **Selector**: `app=ai-infra-service`

### HorizontalPodAutoscaler (HPA)
- **이름**: `ai-infra-service-hpa`
- **타겟**: `ai-infra-service` Deployment
- **최소 레플리카**: 2
- **최대 레플리카**: 5
- **메트릭**:
  - CPU: 평균 사용률 70%
  - Memory: 평균값 1Gi
- **스케일링 정책**:
  - Scale Up: 60초마다 최대 50% 또는 2 Pod 증가
  - Scale Down: 60초마다 최대 25% 감소, 안정화 창 300초

### ServiceAccount
- **이름**: `ai-infra-service`
- **네임스페이스**: `bravo-ai-integration-ns`

### ClusterRole
- **이름**: `ai-infra-service`
- **권한**:
  - `nodes`: get, list, watch
  - `nodes/proxy`: get, list, watch
  - `namespaces`: get, list, watch
  - `pods`: get, list, watch
  - `pods/log`: get, list, watch
  - `services`: get, list, watch
  - `endpoints`: get, list, watch
  - `events`: get, list, watch
  - `metrics.k8s.io`: nodes, pods (get, list)

### ClusterRoleBinding
- **이름**: `ai-infra-service`
- **RoleRef**: `ai-infra-service` ClusterRole
- **Subject**: `ai-infra-service` ServiceAccount

### CronJob
#### 1. Daily Report
- **이름**: `daily-report`
- **스케줄**: `0 0 * * *` (매일 자정)
- **이미지**: `192.168.0.244:30305/bravo/hiking-ai-infra-service:latest`
- **커맨드**: `["node", "/app/services/report-script.js", "daily"]`
- **리소스**:
  - Requests: CPU 500m, Memory 1Gi
  - Limits: CPU 2, Memory 3Gi
- **ServiceAccount**: `ai-infra-service`
- **Istio Sidecar**: 비활성화 (`sidecar.istio.io/inject: "false"`)

#### 2. Weekly Report
- **이름**: `weekly-report`
- **스케줄**: `0 0 * * 0` (매주 일요일 자정)

#### 3. Monthly Report
- **이름**: `monthly-report`
- **스케줄**: `0 0 28-31 * *` (매월 마지막 날 자정)

### DaemonSet
#### Healthcheck DaemonSet
- **이름**: `healthcheck`
- **이미지**: `alpine/curl:latest`
- **레플리카**: 모든 노드에 1개씩 (5개)
- **기능**:
  - 2초마다 헬스체크 실행
  - 포트 체크 (Kubernetes 서비스)
  - HAProxy stats 페이지 체크
  - 디스크 사용률 체크
  - 에러 발생 시 Slack 알림
- **Host Network**: 활성화 (HAProxy stats 접근용)
- **ConfigMap**: `healthcheck-script` (헬스체크 스크립트)

### ConfigMap
- **이름**: `ai-infra-config`
- **데이터**:
  - `PROMETHEUS_URL`: Prometheus 서비스 URL
  - `LOKI_URL`: Loki 서비스 URL
  - `GRAFANA_URL`: Grafana URL
  - `KIALI_URL`: Kiali URL
  - `TEAM_EMAILS`: 팀원 이메일 목록
  - 임계치 설정 (CPU, Memory, Disk, Error Rate, Latency)

### Secret
- **이름**: `ai-infra-secrets`
- **데이터**:
  - `AWS_ACCESS_KEY_ID`: AWS 액세스 키
  - `AWS_SECRET_ACCESS_KEY`: AWS 시크릿 키
  - `AWS_SES_REGION`: SES 리전
  - `AWS_SES_FROM_EMAIL`: 발신 이메일
  - `BEDROCK_ANALYSIS_AGENT_ID`: Bedrock 분석 Agent ID
  - `BEDROCK_ANALYSIS_AGENT_ALIAS_ID`: Bedrock 분석 Agent Alias ID
  - `BEDROCK_REPORT_AGENT_ID`: Bedrock 보고서 Agent ID
  - `BEDROCK_REPORT_AGENT_ALIAS_ID`: Bedrock 보고서 Agent Alias ID
  - `SLACK_WEBHOOK_URL`: Slack 웹훅 URL
  - `SLACK_BOT_TOKEN`: Slack Bot 토큰
  - `SLACK_CHANNEL`: Slack 채널 ID
  - `TEAM_EMAILS`: 팀원 이메일 목록

---

## 네임스페이스 및 Pod 구성

### 네임스페이스: `bravo-ai-integration-ns`

### Pod 목록

#### 1. ai-infra-service Pods (Deployment)
- **이름 패턴**: `ai-infra-service-{hash}-{random}`
- **개수**: 2-5개 (HPA에 의해 조정)
- **상태**: Running
- **컨테이너**: 
  - `ai-infra-service` (메인 애플리케이션)
  - `istio-proxy` (Istio sidecar, 선택적)
- **포트**: 3011
- **리소스**: CPU 500m-1, Memory 512Mi-1Gi

#### 2. healthcheck Pods (DaemonSet)
- **이름 패턴**: `healthcheck-{random}`
- **개수**: 5개 (모든 노드에 1개씩)
- **노드별 배치**:
  - `healthcheck-7k8m4` → node5 (192.168.0.251)
  - `healthcheck-hwx8s` → node1 (192.168.0.247)
  - `healthcheck-kcklx` → node2 (192.168.0.248)
  - `healthcheck-kswv2` → node4 (192.168.0.250)
  - `healthcheck-mgglg` → node3 (192.168.0.249)
- **상태**: Running
- **컨테이너**: `healthcheck` (alpine/curl)
- **기능**: 2초마다 헬스체크 실행

#### 3. daily-report Pods (CronJob)
- **이름 패턴**: `daily-report-{timestamp}-{random}`
- **스케줄**: 매일 자정 실행
- **상태**: Completed (실행 후 종료)
- **컨테이너**: `report-generator`
- **리소스**: CPU 500m-2, Memory 1Gi-3Gi

#### 4. weekly-report Pods (CronJob)
- **이름 패턴**: `weekly-report-{timestamp}-{random}`
- **스케줄**: 매주 일요일 자정 실행

#### 5. monthly-report Pods (CronJob)
- **이름 패턴**: `monthly-report-{timestamp}-{random}`
- **스케줄**: 매월 마지막 날 자정 실행

---

## 데이터 흐름

### 1. 웹 대시보드 접근
```
사용자 브라우저
  → Istio Gateway (hiker-cloud.site/monitoring)
  → VirtualService (라우팅)
  → ai-infra-service Service (ClusterIP)
  → ai-infra-service Pod (Port 3011)
  → Express Server
  → Static Files (index.html, main.js, style.css)
```

### 2. 메트릭 데이터 수집
```
프론트엔드 (main.js)
  → API 호출 (/api/monitoring/metrics/*)
  → Express Route (routes/metrics.js)
  → Service Layer (services/prometheus.js)
  → Prometheus API (http://prometheus.bravo-monitoring-ns:9090)
  → Prometheus 쿼리 실행
  → 결과 반환 (JSON)
  → 프론트엔드 차트 업데이트
```

### 3. 로그 데이터 수집
```
프론트엔드 (main.js)
  → API 호출 (/api/monitoring/errors/*)
  → Express Route (routes/errors.js)
  → Service Layer (services/loki.js)
  → Loki API (http://loki.bravo-monitoring-ns:3100)
  → LogQL 쿼리 실행
  → 결과 반환 (JSON)
  → 프론트엔드 표시
```

### 4. 헬스체크
```
healthcheck Pod (DaemonSet)
  → 2초마다 스크립트 실행
  → 포트 체크 (Kubernetes 서비스)
  → HAProxy stats 체크 (192.168.0.244:8404)
  → 디스크 사용률 체크
  → 에러 발생 시:
    → 로그 기록 (/tmp/healthcheck-errors.log)
    → Slack 알림 전송 (Webhook)
```

### 5. 보고서 생성
```
CronJob (daily-report)
  → Pod 시작
  → report-script.js 실행
  → 데이터 수집:
    → Prometheus (메트릭)
    → Kubernetes API (클러스터 정보)
    → Loki (로그)
  → Bedrock Agent 호출 (보고서 내용 생성)
  → HTML 템플릿 생성 (Chart.js 포함)
  → Puppeteer로 PDF 생성
  → Slack 전송 (Bot API)
  → AWS SES 이메일 전송 (팀원들에게)
  → Pod 종료
```

### 6. AI 분석
```
프론트엔드 (main.js)
  → "현재 상태 분석" 버튼 클릭
  → API 호출 (POST /api/monitoring/ai/analyze)
  → Express Route (routes/ai.js)
  → 데이터 수집 (모든 모니터링 데이터)
  → Bedrock Agent 호출 (services/bedrock-analysis.js)
  → AWS Bedrock Agent Runtime API
  → 분석 결과 반환
  → 프론트엔드 표시
```

---

## 배포 구조

### 이미지 빌드 및 배포
```bash
# 1. 이미지 빌드
docker build -t 192.168.0.244:30305/bravo/hiking-ai-infra-service:latest .

# 2. 이미지 저장
docker save 192.168.0.244:30305/bravo/hiking-ai-infra-service:latest -o /tmp/image.tar

# 3. 모든 노드에 배포
for node in master1 master2 master3 node1 node2 node3 node4 node5; do
  scp /tmp/image.tar $node:/tmp/
  ssh $node "sudo ctr -n k8s.io images import /tmp/image.tar"
done

# 4. Kubernetes 배포
kubectl apply -f k8s/ai-infra-service.yaml
```

### 외부 접근 (Istio Gateway)
- **도메인**: `hiker-cloud.site`
- **경로**: `/monitoring`
- **Gateway**: Istio Gateway (포트 80/443)
- **VirtualService**: `/monitoring` → `ai-infra-service:3011`

### 내부 접근
- **Service**: `ai-infra-service.bravo-ai-integration-ns.svc.cluster.local:3011`
- **ClusterIP**: `10.233.42.149:3011`

---

## 주요 설정 및 환경 변수

### 환경 변수 (ConfigMap/Secret에서 주입)
- `PORT`: 3011
- `PROMETHEUS_URL`: `http://prometheus.bravo-monitoring-ns:9090`
- `LOKI_URL`: `http://loki.bravo-monitoring-ns:3100`
- `GRAFANA_URL`: `http://grafana.bravo-monitoring-ns:3000`
- `KIALI_URL`: `http://192.168.0.244:20001/kiali`
- `TEAM_EMAILS`: 팀원 이메일 목록 (쉼표 구분)
- `AWS_ACCESS_KEY_ID`: AWS 액세스 키
- `AWS_SECRET_ACCESS_KEY`: AWS 시크릿 키
- `AWS_SES_REGION`: `ap-northeast-2`
- `AWS_SES_FROM_EMAIL`: `monitoring@hiker-cloud.site`
- `BEDROCK_ANALYSIS_AGENT_ID`: Bedrock 분석 Agent ID
- `BEDROCK_ANALYSIS_AGENT_ALIAS_ID`: Bedrock 분석 Agent Alias ID
- `BEDROCK_REPORT_AGENT_ID`: Bedrock 보고서 Agent ID
- `BEDROCK_REPORT_AGENT_ALIAS_ID`: Bedrock 보고서 Agent Alias ID
- `SLACK_WEBHOOK_URL`: Slack 웹훅 URL
- `SLACK_BOT_TOKEN`: Slack Bot 토큰
- `SLACK_CHANNEL`: Slack 채널 ID

### 임계치 설정 (ConfigMap)
- `CPU_THRESHOLD_WARNING`: 70%
- `CPU_THRESHOLD_CRITICAL`: 85%
- `MEMORY_THRESHOLD_WARNING`: 75%
- `MEMORY_THRESHOLD_CRITICAL`: 90%
- `DISK_THRESHOLD_WARNING`: 75%
- `DISK_THRESHOLD_CRITICAL`: 90%
- `ERROR_RATE_THRESHOLD_WARNING`: 0.5%
- `ERROR_RATE_THRESHOLD_CRITICAL`: 2.0%
- `LATENCY_THRESHOLD_WARNING`: 500ms
- `LATENCY_THRESHOLD_CRITICAL`: 2000ms

---

## 보안 및 권한

### RBAC
- **ServiceAccount**: `ai-infra-service`
- **ClusterRole**: 클러스터 레벨 리소스 읽기 권한
- **ClusterRoleBinding**: ServiceAccount와 ClusterRole 연결

### 네트워크 정책
- Istio Service Mesh를 통한 트래픽 제어
- Sidecar injection 활성화 (보고서 CronJob 제외)

### Secret 관리
- Kubernetes Secret 사용
- 민감 정보는 Secret에 저장
- ConfigMap과 Secret 분리

---

## 모니터링 및 알림

### 모니터링 대상
1. **노드**: CPU, 메모리, 디스크 사용률
2. **Pod**: CPU, 메모리 사용률
3. **컨테이너**: CPU, 메모리 사용률
4. **에러**: 5XX 에러, 로그 에러
5. **헬스체크**: 서비스 포트, HAProxy stats, 디스크 마운트

### 알림 채널
- **Slack**: 웹훅 (실시간 알림), Bot (보고서 전송)
- **이메일**: AWS SES (보고서 전송)

### 알림 조건
- CPU 사용률 > 70% (경고), > 85% (위험)
- 메모리 사용률 > 75% (경고), > 90% (위험)
- 디스크 사용률 > 75% (경고), > 90% (위험)
- 에러율 > 0.5% (경고), > 2.0% (위험)
- 지연시간 > 500ms (경고), > 2000ms (위험)
- 헬스체크 실패 (즉시 알림)

---

## 확장성 및 고가용성

### 수평 확장
- **HPA**: CPU/메모리 기반 자동 스케일링
- **최소 레플리카**: 2개
- **최대 레플리카**: 5개

### 고가용성
- **다중 Pod**: 최소 2개 Pod로 가용성 보장
- **노드 분산**: Pod가 여러 노드에 분산 배치
- **헬스체크**: Pod 레벨 헬스체크 활성화

---

## 트러블슈팅

### 주요 로그 위치
- **애플리케이션 로그**: Pod 로그 (`kubectl logs <pod-name>`)
- **헬스체크 로그**: `/tmp/healthcheck-errors.log` (Pod 내부)
- **보고서 생성 로그**: CronJob Pod 로그

### 일반적인 문제
1. **이미지 Pull 실패**: Harbor 인증 문제 → 로컬 이미지 사용
2. **PDF 생성 실패**: Puppeteer 리소스 부족 → 리소스 제한 증가
3. **이메일 전송 실패**: SES Sandbox 모드 → 이메일 인증 필요
4. **메트릭 수집 실패**: Prometheus 연결 문제 → 네트워크 정책 확인

---

## 참고 문서
- [데이터 흐름 문서](./DATA_FLOW_DOCUMENTATION.md)
- [README](./README.md)


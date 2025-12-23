# AI 인프라 모니터링 시스템 (ai-infra-service)

## 개요

Kubernetes 클러스터의 인프라를 모니터링하고, 알람을 발송하며, 정기적인 보고서를 생성하는 시스템입니다.

## 주요 기능

- 실시간 모니터링 대시보드 (웹 UI)
- 노드/Pod/서비스 메트릭 수집 및 시각화
- 임계치 기반 알람 (Slack Webhook)
- 일간/주간/월간 보고서 생성 (Slack Bot + SES 이메일)
- AI 분석 (AWS Bedrock Agent)
- 헬스체크 (2초 주기)
- CSV 다운로드
- Grafana/Kiali 링크 생성

## 파일 구조

```
ai-infra-service/
├── ai-infra-service.yaml          # 메인 서비스 (Deployment, Service, HPA, ConfigMap)
├── haproxy-exporter.yaml          # HAProxy Exporter
├── ai-infra-secrets-template.yaml # Secret 템플릿
├── healthcheck/
│   ├── healthcheck.sh             # 헬스체크 스크립트
│   └── healthcheck-daemonset.yaml # 헬스체크 DaemonSet
└── reports/
    ├── daily-report-cronjob.yaml  # 일간 보고서
    ├── weekly-report-cronjob.yaml # 주간 보고서
    └── monthly-report-cronjob.yaml # 월간 보고서
```

## 배포 순서

### 1. Secret 생성

`ai-infra-secrets-template.yaml` 파일을 참고하여 실제 값으로 Secret을 생성합니다:

```bash
kubectl create secret generic ai-infra-secrets \
  --from-literal=SLACK_WEBHOOK_URL='...' \
  --from-literal=SLACK_BOT_TOKEN='...' \
  --from-literal=SLACK_CHANNEL='#monitoring' \
  --from-literal=AWS_SES_REGION='ap-northeast-2' \
  --from-literal=AWS_SES_FROM_EMAIL='monitoring@hiker-cloud.site' \
  --from-literal=AWS_ACCESS_KEY_ID='...' \
  --from-literal=AWS_SECRET_ACCESS_KEY='...' \
  --from-literal=BEDROCK_ANALYSIS_AGENT_ID='...' \
  --from-literal=BEDROCK_ANALYSIS_AGENT_ALIAS_ID='...' \
  --from-literal=BEDROCK_REPORT_AGENT_ID='...' \
  --from-literal=BEDROCK_REPORT_AGENT_ALIAS_ID='...' \
  -n bravo-ai-integration-ns
```

### 2. HAProxy Exporter 배포

```bash
kubectl apply -f haproxy-exporter.yaml
```

### 3. 메인 서비스 배포

```bash
kubectl apply -f ai-infra-service.yaml
```

### 4. 헬스체크 배포

```bash
kubectl apply -f healthcheck/healthcheck-daemonset.yaml
```

### 5. 보고서 CronJob 배포 (선택사항)

```bash
kubectl apply -f reports/daily-report-cronjob.yaml
kubectl apply -f reports/weekly-report-cronjob.yaml
kubectl apply -f reports/monthly-report-cronjob.yaml
```

## 설정

### ConfigMap (ai-infra-config)

주요 설정값들:
- 모니터링 스택 URL (Prometheus, Grafana, Loki, Tempo, Kiali)
- 임계치 설정 (CPU, Memory, 5xx Error Rate, Latency, Disk)
- 팀원 이메일 주소

### Secret (ai-infra-secrets)

필수 설정:
- `SLACK_WEBHOOK_URL`: Slack 알람용 Webhook URL
- `SLACK_BOT_TOKEN`: Slack 보고서 전송용 Bot Token
- `SLACK_CHANNEL`: 보고서 전송 채널
- `AWS_SES_REGION`: AWS SES 리전
- `AWS_SES_FROM_EMAIL`: 발신 이메일 주소
- `AWS_ACCESS_KEY_ID`: AWS 자격 증명
- `AWS_SECRET_ACCESS_KEY`: AWS 자격 증명
- `BEDROCK_ANALYSIS_AGENT_ID`: Bedrock Agent ID (웹 대시보드 AI 분석용)
- `BEDROCK_ANALYSIS_AGENT_ALIAS_ID`: Bedrock Agent Alias ID (웹 대시보드 AI 분석용)
- `BEDROCK_REPORT_AGENT_ID`: Bedrock Agent ID (보고서 생성용)
- `BEDROCK_REPORT_AGENT_ALIAS_ID`: Bedrock Agent Alias ID (보고서 생성용)

## 서비스 접근

### 웹 대시보드

서비스 타입에 따라 접근:
- ClusterIP: 클러스터 내부에서 접근
- NodePort: 노드 IP:NodePort로 접근

### API 엔드포인트

- `/api/cluster/overview`: 클러스터 개요
- `/api/nodes`: 노드 목록
- `/api/pods`: Pod 목록
- `/api/services`: 서비스 목록
- `/api/metrics/realtime`: 실시간 메트릭
- `/api/errors/5xx`: 5xx 에러 분석
- `/api/ai/analyze`: AI 분석 요청
- 기타 엔드포인트는 API 문서 참고

## 알람 임계치

| 메트릭 | Warning | Critical |
|--------|---------|----------|
| CPU 사용률 | 70% | 85% |
| 메모리 사용률 | 75% | 90% |
| 5xx 에러율 | 0.5% | 2.0% |
| 지연시간 (p95) | 500ms | 2000ms |
| 디스크 사용률 | 75% | 90% |

## 보고서

### 일간 보고서
- 매일 자정 (00:00) 자동 생성
- VM/노드별 리소스 요약
- 전날/금일 장애·에러 분석
- 백업 상태
- 헬스체크 상태

### 주간 보고서
- 매주 일요일 자정 (00:00) 자동 생성
- 일간 보고서 내용 + 주간 트렌드 분석

### 월간 보고서
- 매월 마지막 날 자정 (00:00) 자동 생성
- 주간 보고서 내용 + 월간 트렌드 분석

## 5xx 에러 단계별 분류

1. HAProxy 레벨
2. Istio Gateway 레벨
3. Application 레벨
4. Downstream (DB/외부 API) 레벨

## 헬스체크

- 실행 주기: 2초
- 체크 항목:
  - Kubernetes 서비스 포트 체크
  - HAProxy 헬스체크
  - 마운트/디스크 사용률 체크

## 주의사항

1. HAProxy Exporter는 `hostNetwork: true`로 설정되어 호스트의 HAProxy stats에 접근합니다.
2. Prometheus에서 HAProxy Exporter와 Istio 메트릭을 스크랩하도록 설정이 필요합니다.
3. SES 발신 이메일 주소는 AWS에서 인증이 필요합니다.
4. HPA 동작을 위해 metrics-server가 클러스터에 설치되어 있어야 합니다.
5. RBAC 설정은 별도로 진행 예정입니다.

## 트러블슈팅

### Pod가 시작되지 않는 경우

```bash
# Pod 상태 확인
kubectl get pods -n bravo-ai-integration-ns

# Pod 로그 확인
kubectl logs -n bravo-ai-integration-ns -l app=ai-infra-service

# 이벤트 확인
kubectl describe pod -n bravo-ai-integration-ns <pod-name>
```

### 알람이 발송되지 않는 경우

- Secret의 `SLACK_WEBHOOK_URL`이 올바른지 확인
- Slack Webhook이 활성화되어 있는지 확인

### 보고서가 생성되지 않는 경우

- Secret의 `SLACK_BOT_TOKEN`, `AWS_SES_*` 설정 확인
- SES 발신 이메일 주소 인증 상태 확인
- CronJob 상태 확인: `kubectl get cronjobs -n bravo-ai-integration-ns`


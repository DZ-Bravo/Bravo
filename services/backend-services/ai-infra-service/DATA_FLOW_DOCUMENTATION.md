# HIKER 인프라 모니터링 웹사이트 데이터 흐름 문서

## 개요
이 문서는 웹사이트의 각 항목이 어떻게 데이터를 가져오고 표시하는지 설명합니다.

---

## 1. 노드 선택 필터

### 프론트엔드 (main.js)
- **API 호출**: `GET /api/monitoring/metrics/nodes`
- **함수**: `loadNodes()`
- **표시 위치**: `<select id="nodeSelect">`

### 백엔드 (routes/metrics.js)
- **엔드포인트**: `GET /metrics/nodes`
- **서비스**: `kubernetesService.getNodes()`

### 데이터 소스 (services/kubernetes.js)
- **소스**: Kubernetes API
- **메서드**: `k8sApi.listNode()`
- **필요한 키**:
  - `metadata.name` (노드 이름)
  - `status.addresses[].address` (IP 주소)
  - `metadata.labels['node-role.kubernetes.io/control-plane']` (역할)
  - `status.conditions[].status` (Ready 상태)
  - `status.nodeInfo.osImage` (OS 정보)

### 반환 데이터 형식
```json
[
  {
    "name": "master1",
    "ip": "192.168.0.244",
    "role": "control-plane",
    "status": "Ready",
    "os": "Ubuntu 22.04",
    "kernel": "6.14.0",
    "containerRuntime": "containerd://1.7.x",
    "kubeletVersion": "v1.28.x"
  }
]
```

---

## 2. 클러스터 개요

### 프론트엔드 (main.js)
- **API 호출**: `GET /api/monitoring/metrics/cluster/overview`
- **함수**: `loadClusterOverview()`
- **표시 위치**: 
  - `#nodeTotal`, `#nodeReady` (노드 수)
  - `#podTotal`, `#podRunning` (Pod 수)
  - `#errorCount` (5XX 에러 수)

### 백엔드 (routes/metrics.js)
- **엔드포인트**: `GET /metrics/cluster/overview`
- **서비스**: `kubernetesService.getClusterOverview()`

### 데이터 소스 (services/kubernetes.js)
- **소스**: Kubernetes API
- **메서드**: 
  - `k8sApi.listNode()` (노드 목록)
  - `k8sApi.listPodForAllNamespaces()` (Pod 목록)
- **필요한 키**:
  - 노드: `items[].status.conditions[].type === 'Ready' && status === 'True'`
  - Pod: `items[].status.phase` (Running, Failed, Pending)

### 반환 데이터 형식
```json
{
  "nodes": {
    "total": 8,
    "ready": 8
  },
  "pods": {
    "total": 150,
    "running": 145,
    "failed": 2,
    "pending": 3
  }
}
```

### 5XX 에러 카운트 (추가)
- **API 호출**: `GET /api/monitoring/errors/5xx?start=...&end=...`
- **서비스**: `prometheusService.get5xxErrorBreakdown()`
- **Prometheus 쿼리**: `sum(rate(istio_requests_total{response_code=~"5.."}[5m]))`

---

## 3. 리소스 사용률 (CPU/메모리)

### 프론트엔드 (main.js)
- **API 호출**: `GET /api/monitoring/metrics/resource-usage?start=...&end=...&node=...`
- **함수**: `loadResourceUsage()`
- **차트**: `cpuChart`, `memoryChart` (Chart.js)

### 백엔드 (routes/metrics.js)
- **엔드포인트**: `GET /metrics/resource-usage`
- **서비스**: `prometheusService.getClusterMetrics()`

### 데이터 소스 (services/prometheus.js)
- **소스**: Prometheus
- **Prometheus 쿼리**:
  - CPU: `100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`
  - Memory: `(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100`
- **메서드**: `queryRange(query, start, end, step)`
- **필요한 메트릭**:
  - `node_cpu_seconds_total` (CPU 사용량)
  - `node_memory_MemAvailable_bytes` (사용 가능한 메모리)
  - `node_memory_MemTotal_bytes` (전체 메모리)

### 반환 데이터 형식
```json
{
  "cpu": [
    [1699123456, "45.2"],
    [1699123471, "46.8"]
  ],
  "memory": [
    [1699123456, "62.5"],
    [1699123471, "63.1"]
  ]
}
```

---

## 4. Container CPU 사용량

### 프론트엔드 (main.js)
- **API 호출**: `GET /api/monitoring/metrics/containers/cpu?start=...&end=...&node=...`
- **함수**: `loadContainerCPU()`
- **차트**: `containerCpuChart` (Chart.js)
- **리스트**: `#containerCpuList`

### 백엔드 (routes/metrics.js)
- **엔드포인트**: `GET /metrics/containers/cpu`
- **서비스**: `prometheusService.getContainerCPUMetrics()`

### 데이터 소스 (services/prometheus.js)
- **소스**: Prometheus (cAdvisor 메트릭)
- **Prometheus 쿼리**: 
  ```
  sum(rate(container_cpu_usage_seconds_total{container!="POD",container!=""}[5m])) 
  by (namespace,pod,container)
  ```
- **필요한 메트릭**: `container_cpu_usage_seconds_total`
- **레이블**: `namespace`, `pod`, `container`, `kubernetes_node`

### 반환 데이터 형식
```json
[
  {
    "name": "nginx",
    "namespace": "default",
    "pod": "nginx-xxx",
    "data": [
      [1699123456, "0.5"],
      [1699123471, "0.6"]
    ]
  }
]
```

---

## 5. Container Memory 사용량

### 프론트엔드 (main.js)
- **API 호출**: `GET /api/monitoring/metrics/containers/memory?start=...&end=...&node=...`
- **함수**: `loadContainerMemory()`
- **차트**: `containerMemoryChart` (Chart.js)
- **리스트**: `#containerMemoryList`

### 백엔드 (routes/metrics.js)
- **엔드포인트**: `GET /metrics/containers/memory`
- **서비스**: `prometheusService.getContainerMemoryMetrics()`

### 데이터 소스 (services/prometheus.js)
- **소스**: Prometheus (cAdvisor 메트릭)
- **Prometheus 쿼리**:
  - 사용량: `sum(container_memory_working_set_bytes{container!="POD",name!=""}) by (namespace,pod,container)`
  - Limit: `sum(container_spec_memory_limit_bytes{container!="POD",container!=""}) by (namespace,pod,container)`
- **필요한 메트릭**:
  - `container_memory_working_set_bytes` (사용량)
  - `container_spec_memory_limit_bytes` (Limit)
- **계산**: 사용률(%) = (사용량 / Limit) * 100

### 반환 데이터 형식
```json
[
  {
    "name": "nginx",
    "namespace": "default",
    "pod": "nginx-xxx",
    "limitBytes": 1073741824,
    "data": [
      [1699123456, "45.2"],
      [1699123471, "46.8"]
    ],
    "usageBytesData": [
      [1699123456, 485000000],
      [1699123471, 502000000]
    ]
  }
]
```

---

## 6. Pod CPU 사용량

### 프론트엔드 (main.js)
- **API 호출**: `GET /api/monitoring/metrics/pods/cpu?start=...&end=...&node=...`
- **함수**: `loadPodCPU()`
- **차트**: `podCpuChart` (Chart.js)
- **리스트**: `#podCpuList`
- **Top 5**: `#podCpuTop5`

### 백엔드 (routes/metrics.js)
- **엔드포인트**: `GET /metrics/pods/cpu`
- **서비스**: `prometheusService.getPodCPUMetrics()`

### 데이터 소스 (services/prometheus.js)
- **소스**: Prometheus (cAdvisor 메트릭 - 컨테이너 집계)
- **Prometheus 쿼리**: 
  ```
  sum(rate(container_cpu_usage_seconds_total{container!="POD",name!=""}[5m])) 
  by (namespace,pod)
  ```
- **필요한 메트릭**: `container_cpu_usage_seconds_total`
- **집계**: Pod 내 모든 컨테이너의 CPU 사용량 합계

### 반환 데이터 형식
```json
[
  {
    "name": "nginx-xxx",
    "namespace": "default",
    "pod": "nginx-xxx",
    "node": "node1",
    "data": [
      [1699123456, "1.2"],
      [1699123471, "1.3"]
    ]
  }
]
```

---

## 7. Pod Memory 사용량

### 프론트엔드 (main.js)
- **API 호출**: `GET /api/monitoring/metrics/pods/memory?start=...&end=...&node=...`
- **함수**: `loadPodMemory()`
- **차트**: `podMemoryChart` (Chart.js)
- **리스트**: `#podMemoryList`
- **Top 5**: `#podMemoryTop5`

### 백엔드 (routes/metrics.js)
- **엔드포인트**: `GET /metrics/pods/memory`
- **서비스**: `prometheusService.getPodMemoryMetrics()`

### 데이터 소스 (services/prometheus.js)
- **소스**: Prometheus (cAdvisor 메트릭 - 컨테이너 집계)
- **Prometheus 쿼리**:
  - 사용량: `sum(container_memory_working_set_bytes{container!="POD",name!=""}) by (namespace,pod)`
  - Limit: `sum(container_spec_memory_limit_bytes{container!="POD",container!=""}) by (namespace,pod)`
- **필요한 메트릭**:
  - `container_memory_working_set_bytes`
  - `container_spec_memory_limit_bytes`
- **계산**: 사용률(%) = (Pod 내 모든 컨테이너 사용량 합계 / Pod Limit 합계) * 100

### 반환 데이터 형식
```json
[
  {
    "name": "nginx-xxx",
    "namespace": "default",
    "pod": "nginx-xxx",
    "node": "node1",
    "limitBytes": 2147483648,
    "data": [
      [1699123456, "52.3"],
      [1699123471, "53.1"]
    ],
    "usageBytesData": [
      [1699123456, 1123456789],
      [1699123471, 1134567890]
    ]
  }
]
```

---

## 8. 에러 분석

### 프론트엔드 (main.js)
- **API 호출**: 
  - `GET /api/monitoring/errors/5xx?start=...&end=...` (에러 분류)
  - `GET /api/monitoring/errors/recent?limit=10` (최근 에러)
- **함수**: `loadErrorBreakdown()`, `loadRecentErrors()`
- **차트**: `errorChart` (파이 차트)
- **리스트**: `#errorList`

### 백엔드 (routes/errors.js)
- **엔드포인트**: 
  - `GET /errors/5xx` → `prometheusService.get5xxErrorBreakdown()`
  - `GET /errors/recent` → `lokiService.getRecentErrors()`

### 데이터 소스 (services/prometheus.js)
- **소스**: Prometheus (Istio 메트릭)
- **Prometheus 쿼리**:
  - HAProxy: `sum(rate(haproxy_backend_http_responses_total{code=~"5.."}[5m]))`
  - Gateway: `sum(rate(istio_requests_total{response_code=~"5..",destination_service_name=~".*gateway.*"}[5m]))`
  - Application: `sum(rate(istio_requests_total{response_code=~"5..",destination_service_name!~".*gateway.*|.*downstream.*"}[5m]))`
  - Downstream: `sum(rate(istio_requests_total{response_code=~"5..",destination_service_name=~".*downstream.*"}[5m]))`
- **필요한 메트릭**:
  - `haproxy_backend_http_responses_total` (HAProxy)
  - `istio_requests_total` (Istio)

### 반환 데이터 형식
```json
{
  "haproxy": { "count": 10, "percentage": "20.0" },
  "gateway": { "count": 15, "percentage": "30.0" },
  "application": { "count": 20, "percentage": "40.0" },
  "downstream": { "count": 5, "percentage": "10.0" },
  "total": 50
}
```

### 최근 에러 (Loki)
- **소스**: Loki
- **Loki 쿼리**: `{namespace=~"bravo-.*"} |= "error" | json | status_code=~"5.."`
- **필요한 레이블**: `namespace`, `pod`, `service`

---

## 9. Loki/Promtail Error Log

### 프론트엔드 (main.js)
- **API 호출**:
  - `GET /api/monitoring/errors/log-count?start=...&end=...&source=app` (시간별 카운트)
  - `GET /api/monitoring/errors/service-errors?start=...&end=...&limit=30` (서비스별 에러)
  - `GET /api/monitoring/errors/top-errors?start=...&end=...&topN=10` (Top N 에러)
- **함수**: `loadErrorLogs()`
- **차트**: `errorLogCountChart` (시간별 에러 로그 수)
- **리스트**: `#serviceErrorList`, `#topErrorMessagesList`

### 백엔드 (routes/errors.js)
- **엔드포인트**:
  - `GET /errors/log-count` → `lokiService.getErrorLogCountOverTime()`
  - `GET /errors/service-errors` → `lokiService.getServiceErrors()`
  - `GET /errors/top-errors` → `lokiService.getTopErrorMessages()`

### 데이터 소스 (services/loki.js)
- **소스**: Loki
- **Loki 쿼리**:
  - 시간별 카운트: `count_over_time({namespace=~"bravo-.*"} |= "error" | json | status_code=~"5.." [1h])`
  - 서비스별 에러: `{namespace=~"bravo-.*"} |= "error" | json | status_code=~"5.."`
  - Top N 에러: `topk(10, count_over_time({namespace=~"bravo-.*"} |= "error" | json | status_code=~"5.." [1h]))`
- **필요한 레이블**: `namespace`, `pod`, `service`, `level`
- **Loki API**: `/loki/api/v1/query_range`

### 반환 데이터 형식
```json
// 시간별 카운트
[
  { "time": "2025-12-23T10:00:00Z", "count": 5 },
  { "time": "2025-12-23T11:00:00Z", "count": 8 }
]

// 서비스별 에러
[
  {
    "timestamp": "2025-12-23T10:30:00Z",
    "namespace": "bravo-ai-integration-ns",
    "pod": "ai-service-xxx",
    "service": "ai-service",
    "message": "Internal server error",
    "level": "error"
  }
]

// Top N 에러
[
  {
    "message": "Connection timeout",
    "count": 25,
    "lastSeen": "2025-12-23T11:00:00Z"
  }
]
```

---

## 10. 서비스 헬스체크

### 프론트엔드 (main.js)
- **API 호출**: `GET /api/monitoring/healthcheck/status`
- **함수**: `loadHealthcheckStatus()`
- **표시 위치**: `#healthcheckStatus`, `#healthcheckErrors`

### 백엔드 (routes/healthcheck.js)
- **엔드포인트**: `GET /healthcheck/status`
- **서비스**: `healthcheckService.getHealthcheckStatus()`

### 데이터 소스 (services/healthcheck.js)
- **소스**: Kubernetes Pod 로그
- **메서드**: 
  - `k8sApi.listNamespacedPod('bravo-ai-integration-ns', ..., 'app=healthcheck')` (healthcheck Pod 목록)
  - `k8sApi.readNamespacedPodLog(podName, namespace, container, ..., tailLines=100)` (최근 100줄 로그)
- **필터링**: 로그에서 "ERROR", "실패", "FAIL", "DOWN", "CRITICAL" 포함 라인 추출
- **필요한 키**:
  - Pod: `metadata.name`, `spec.nodeName`
  - 로그: 에러 메시지, 타임스탬프

### 반환 데이터 형식
```json
{
  "hasErrors": true,
  "errors": [
    {
      "pod": "healthcheck-xxx",
      "node": "node1",
      "errors": [
        {
          "timestamp": "2025-12-23 10:30:00",
          "message": "HAProxy 헬스체크 실패: stats 페이지 접근 불가"
        }
      ]
    }
  ],
  "checkedPods": 8
}
```

---

## 11. AI 분석

### 프론트엔드 (main.js)
- **API 호출**: `POST /api/monitoring/ai/analyze`
- **함수**: `runAIAnalysis()`
- **표시 위치**: `#aiAnalysisResult`

### 백엔드 (routes/ai.js)
- **엔드포인트**: `POST /ai/analyze`
- **서비스**: `bedrockAnalysisService.requestAnalysis()`

### 데이터 수집 (routes/ai.js)
다음 데이터를 수집하여 Bedrock Agent에 전달:
1. **클러스터 개요**: `kubernetesService.getClusterOverview()`
2. **리소스 사용률**: `prometheusService.getResourceUsageTimeline()`
3. **Container/Pod 메트릭**: 
   - `prometheusService.getContainerCPUMetrics()`
   - `prometheusService.getContainerMemoryMetrics()`
   - `prometheusService.getPodCPUMetrics()`
   - `prometheusService.getPodMemoryMetrics()`
4. **에러 분석**: 
   - `prometheusService.get5xxErrorBreakdown()`
   - `lokiService.getErrorLogCountOverTime()`
   - `lokiService.getTopErrorMessages()`
   - `lokiService.getServiceErrors()`
5. **헬스체크**: `healthcheckService.getHealthcheckStatus()`

### Bedrock Agent (services/bedrock-analysis.js)
- **Agent ID**: `BEDROCK_ANALYSIS_AGENT_ID` (환경 변수)
- **Alias ID**: `BEDROCK_ANALYSIS_AGENT_ALIAS_ID` (환경 변수)
- **API**: AWS Bedrock Agent Runtime API
- **메서드**: `invokeAgent()`

### 반환 데이터 형식
```json
{
  "analysis": "AI가 생성한 분석 텍스트...",
  "recommendations": ["권장사항 1", "권장사항 2"]
}
```

---

## 12. 외부 링크

### 프론트엔드 (main.js)
- **설정**: `setupExternalLinks()`
- **링크**:
  - Grafana: `http://192.168.0.244:32000`
  - Kiali: `http://192.168.0.244:32755/kiali`
  - HAProxy Stats: `http://192.168.0.244:8404/stats`

### 데이터 소스
- **ConfigMap**: `ai-infra-config`
  - `GRAFANA_URL`
  - `KIALI_URL`
- **하드코딩**: HAProxy Stats URL

---

## 환경 변수 및 ConfigMap

### ConfigMap (ai-infra-config)
- `PROMETHEUS_URL`: `http://prometheus.bravo-monitoring-ns:9090`
- `LOKI_URL`: `http://loki.bravo-monitoring-ns:3100`
- `GRAFANA_URL`: `http://grafana.bravo-monitoring-ns:3000`
- `KIALI_URL`: `http://192.168.0.244:20001/kiali`
- `TEAM_EMAILS`: 팀원 이메일 목록 (쉼표 구분)

### Secret (ai-infra-secrets)
- `BEDROCK_ANALYSIS_AGENT_ID`: Bedrock Analysis Agent ID
- `BEDROCK_ANALYSIS_AGENT_ALIAS_ID`: Bedrock Analysis Agent Alias ID
- `BEDROCK_REPORT_AGENT_ID`: Bedrock Report Agent ID
- `BEDROCK_REPORT_AGENT_ALIAS_ID`: Bedrock Report Agent Alias ID
- `AWS_ACCESS_KEY_ID`: AWS 액세스 키
- `AWS_SECRET_ACCESS_KEY`: AWS 시크릿 키
- `SLACK_WEBHOOK_URL`: Slack 웹훅 URL
- `SLACK_BOT_TOKEN`: Slack Bot 토큰
- `SLACK_CHANNEL`: Slack 채널 ID

---

## 데이터 업데이트 주기

- **자동 새로고침**: 30초마다 (`setInterval(updateAllMetrics, 30000)`)
- **수동 새로고침**: "새로고침" 버튼 클릭
- **노드 선택 변경**: 즉시 해당 노드 데이터 로드

---

## 주요 Prometheus 메트릭

### 노드 메트릭
- `node_cpu_seconds_total`: 노드 CPU 사용량
- `node_memory_MemAvailable_bytes`: 사용 가능한 메모리
- `node_memory_MemTotal_bytes`: 전체 메모리

### 컨테이너 메트릭 (cAdvisor)
- `container_cpu_usage_seconds_total`: 컨테이너 CPU 사용량 (cores)
- `container_memory_working_set_bytes`: 컨테이너 메모리 사용량
- `container_spec_memory_limit_bytes`: 컨테이너 메모리 Limit

### Istio 메트릭
- `istio_requests_total`: 요청 수 (레이블: `response_code`, `destination_service_name`)

### HAProxy 메트릭
- `haproxy_backend_http_responses_total`: 응답 수 (레이블: `code`)

---

## 주요 Loki 쿼리 패턴

### 에러 로그 검색
```
{namespace=~"bravo-.*"} |= "error" | json | status_code=~"5.."
```

### 시간별 카운트
```
count_over_time({namespace=~"bravo-.*"} |= "error" [1h])
```

### Top N 에러
```
topk(10, count_over_time({namespace=~"bravo-.*"} |= "error" [1h]))
```


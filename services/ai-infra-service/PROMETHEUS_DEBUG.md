# Prometheus 메트릭 수집 문제 해결 가이드

## 문제 상황
- P95, P99, RPS, 에러율이 모두 0으로 표시됨
- 애플리케이션 메트릭(`http_requests_total`)이 Prometheus에 수집되지 않음

## 확인 사항

### 1. Prometheus Targets 확인
EC2에 SSH 접속 후 다음 명령어로 확인:

```bash
# Prometheus UI 접속
# http://43.200.143.174:9090/targets

# 또는 API로 확인
curl "http://43.200.143.174:9090/api/v1/targets" | jq '.data.activeTargets[] | select(.labels.job == "kubernetes-pods")'
```

**확인할 내용:**
- `kubernetes-pods` job에 타겟이 있는지
- 타겟의 상태가 `up`인지 `down`인지
- 에러 메시지가 있는지

### 2. Prometheus 설정 확인
EC2에서 Prometheus 설정 파일 확인:

```bash
# Prometheus Pod 확인
kubectl get pods -n bravo-monitoring-ns -l app=prometheus

# ConfigMap 확인
kubectl get configmap prometheus-config -n bravo-monitoring-ns -o yaml

# 또는 Prometheus UI에서 확인
# http://43.200.143.174:9090/config
```

**확인할 내용:**
- `kubernetes-pods` job 설정이 올바른지
- Istio 관련 설정이 있는지 (사용하지 않으므로 제거 필요)
- `prometheus.io/scrape: "true"` 어노테이션 기반 스크랩이 설정되어 있는지

### 3. 애플리케이션 Pod 어노테이션 확인
```bash
# ai-infra-service Pod 어노테이션 확인
kubectl get pods -n bravo-ai-integration-ns -l app=ai-infra-service -o jsonpath='{.items[0].metadata.annotations}' | jq '.'

# 다른 서비스들도 확인
kubectl get pods -n bravo-core-ns -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.metadata.annotations.prometheus\.io/scrape}{"\n"}{end}'
```

**확인할 내용:**
- `prometheus.io/scrape: "true"` 어노테이션이 있는지
- `prometheus.io/port: "3011"` (또는 해당 포트) 어노테이션이 있는지
- `prometheus.io/path: "/metrics"` 어노테이션이 있는지

### 4. 메트릭 엔드포인트 직접 확인
```bash
# Pod 내부에서 메트릭 확인
kubectl exec -n bravo-ai-integration-ns <pod-name> -- curl localhost:3011/metrics

# 또는 Service를 통해 확인
kubectl port-forward -n bravo-ai-integration-ns svc/ai-infra-service 3011:3011
curl http://localhost:3011/metrics
```

**확인할 내용:**
- `/metrics` 엔드포인트가 응답하는지
- `http_requests_total` 메트릭이 노출되는지
- 레이블이 올바른지 (`service`, `status_code` 등)

### 5. Prometheus에서 메트릭 확인
```bash
# 메트릭 존재 여부 확인
curl "http://43.200.143.174:9090/api/v1/query?query=count(http_requests_total)"

# 실제 메트릭 샘플 확인
curl "http://43.200.143.174:9090/api/v1/query?query=http_requests_total" | jq '.data.result[0] | .metric'

# 레이블 값 확인
curl "http://43.200.143.174:9090/api/v1/label/service/values"
curl "http://43.200.143.174:9090/api/v1/label/kubernetes_namespace/values"
```

## 수정 사항

### 코드 수정 완료
- `getOverallMetrics`: `service` 레이블로 필터링 시도 (kubernetes_namespace는 자동 추가되지 않을 수 있음)
- `getServiceMetrics`: 여러 레이블 조합 시도
- `get5xxErrorBreakdown`: 메트릭 존재 여부 확인 및 여러 레이블 조합 시도

### Prometheus 설정 수정 필요
EC2에서 Prometheus 설정 파일을 수정해야 할 수 있습니다:

1. **Istio 관련 설정 제거** (사용하지 않으므로)
   - `istiod` job
   - `istio-ingressgateway` job  
   - `istio-pods` job

2. **kubernetes-pods job 확인**
   - 어노테이션 기반 스크랩이 올바르게 설정되어 있는지
   - 네트워크 접근이 가능한지

## 다음 단계

1. EC2에 SSH 접속 (세션 매니저 사용)
2. Prometheus 설정 파일 확인 및 수정
3. Prometheus Pod 재시작
4. Targets 페이지에서 스크랩 상태 확인
5. 메트릭이 수집되면 대시보드에서 확인

## 참고
- Prometheus는 `prometheus.io/scrape: "true"` 어노테이션이 있는 Pod만 스크랩합니다
- 메트릭은 `/metrics` 경로에서 노출되어야 합니다
- 포트는 `prometheus.io/port` 어노테이션으로 지정할 수 있습니다

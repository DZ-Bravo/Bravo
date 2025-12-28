# Promtail 수정 적용 완료

**일시**: 2025-12-26

---

## ✅ 적용한 수정사항

### 1. __path__ relabel 규칙 수정

**문제**: `regex` 캡처가 없어서 `$1`, `$2`, `$3`가 제대로 채워지지 않음

**수정 전**:
```yaml
- replacement: /var/log/containers/$1_$2_$3-*.log
  separator: _
  source_labels:
    - __meta_kubernetes_pod_name
    - __meta_kubernetes_namespace
    - __meta_kubernetes_pod_container_name
  target_label: __path__
```

**수정 후**:
```yaml
- action: replace
  source_labels:
    - __meta_kubernetes_pod_name
    - __meta_kubernetes_namespace
    - __meta_kubernetes_pod_container_name
  separator: ;
  regex: (.+);(.+);(.+)
  target_label: __path__
  replacement: /var/log/containers/$1_$2_$3-*.log
```

**핵심 변경점**:
- `action: replace` 명시적 추가
- `separator: ;` 사용 (기본값)
- `regex: (.+);(.+);(.+)` 추가하여 3개 캡처 그룹 생성
- 이제 `$1`, `$2`, `$3`가 제대로 채워짐

### 2. RBAC 권한 추가

- `namespaces` 리소스에 대한 `get`, `list`, `watch` 권한 추가

---

## 🔍 확인 방법

### 1. Service Discovery 페이지 확인
```bash
kubectl port-forward -n bravo-monitoring-ns <promtail-pod> 3101:3101
# 브라우저에서 http://localhost:3101/service-discovery 접속
```

### 2. Targets 페이지 확인
```bash
# 브라우저에서 http://localhost:3101/targets 접속
```

### 3. 메트릭 확인
```bash
kubectl exec -n bravo-monitoring-ns <promtail-pod> -- \
  curl -s http://localhost:3101/metrics | grep promtail_targets_active_total
```

### 4. Loki 쿼리 확인
```bash
curl -sG "http://loki.bravo-monitoring-ns:3100/loki/api/v1/query_range" \
  --data-urlencode "query={namespace=\"bravo-ai-integration-ns\"}" \
  --data-urlencode "start=${START}" \
  --data-urlencode "end=${END}" \
  --data-urlencode "limit=3"
```

---

## 📊 예상 결과

1. **promtail_targets_active_total**: 1개 이상 (다른 Pod 타겟 추가됨)
2. **service-discovery**: dropped targets의 이유가 "file does not exist" 또는 다른 이유로 변경됨
3. **Loki 쿼리**: 다른 Pod의 로그가 반환됨

---

## ⚠️ 추가 확인 필요 사항

### 1. 노드 필터링 문제
만약 "file does not exist"로 drop되는 경우, 노드 필터링이 필요할 수 있습니다:

```yaml
- action: keep
  source_labels: [__meta_kubernetes_pod_node_name]
  regex: <promtail이 실행 중인 노드 이름>
```

### 2. Loki Push 에러
타겟이 생겨도 Loki로 push가 실패할 수 있습니다:

```bash
kubectl logs -l app=promtail --tail=300 | \
  grep -iE "error sending batch|component=client|429|401|403|500|timeout|refused"
```

---

## 🎯 다음 단계

1. Promtail 재시작 후 2-3분 대기
2. service-discovery 페이지에서 drop 이유 확인
3. targets 페이지에서 active targets 확인
4. Loki 쿼리로 로그 확인



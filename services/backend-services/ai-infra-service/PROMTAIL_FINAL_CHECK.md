# Promtail 최종 점검 보고서

**점검 일시**: 2025-12-26  
**상태**: 코드 수정 없이 점검만 수행

---

## 🔍 현재 상황

### 확인된 사실

1. **설정은 올바르게 수정됨**
   - 로그 경로 패턴: `/var/log/pods/$1_$2_$3/$4/*.log`
   - 실제 경로와 일치함

2. **로그 파일은 존재함**
   - `/var/log/pods/bravo-ai-integration-ns_ai-infra-service-7dcbf9b95c-gw6rq_95b15b3f-a814-42d1-b535-b79b9c0eaf15/ai-infra-service/` 존재
   - 로그 파일 (`0.log`) 존재

3. **Promtail이 다른 Pod를 타겟으로 추가하지 않음**
   - Promtail 로그에 `Adding target` 메시지가 Promtail 자체 로그에만 있음
   - 다른 Pod에 대한 타겟 추가 메시지 없음
   - Promtail 로그가 매우 적음 (9줄)

4. **Loki에 저장된 레이블**
   - `filename`, `job`만 존재
   - `namespace` 레이블 값이 비어있음 (쿼리 결과 빈 배열)

---

## 🎯 문제 원인 분석

### 핵심 문제

**Promtail이 Kubernetes discovery를 시작했지만, 실제로 Pod를 발견하고 타겟으로 추가하지 못하고 있습니다.**

### 가능한 원인

#### 1. **Kubernetes Discovery가 Pod를 발견하지 못함**

Promtail 로그가 매우 적은 것으로 보아, Kubernetes discovery가 Pod를 발견하지 못했을 가능성이 있습니다.

**확인 필요**:
- Promtail이 Kubernetes API에 접근할 수 있는지
- Promtail이 실제로 Pod 목록을 가져오는지
- Promtail의 로그 레벨이 너무 낮아서 메시지가 출력되지 않는지

#### 2. **Relabel Configs에서 필터링됨**

Promtail이 Pod를 발견했지만, `relabel_configs`에서 필터링되어 제외될 수 있습니다.

**확인 필요**:
- `relabel_configs`에 `action: drop`이나 필터링 규칙이 있는지
- `__path__` 레이블이 제대로 생성되는지

#### 3. **노드 필터링 문제**

Promtail은 DaemonSet으로 각 노드에 하나씩 실행되며, 자신의 노드에 있는 Pod만 타겟으로 추가해야 합니다.

**확인 필요**:
- Promtail이 자신의 노드에 있는 Pod만 타겟으로 추가하는지
- `__host__` 레이블이 제대로 설정되는지

---

## 📊 현재 상태 요약

| 항목 | 상태 | 설명 |
|------|------|------|
| Promtail Pod | ✅ 정상 | 8개 모두 실행 중 |
| RBAC 권한 | ✅ 해결됨 | 더 이상 오류 없음 |
| Promtail 로그 수집 | ✅ 정상 | `{job="promtail"}` 로그 조회 가능 |
| 다른 Pod 로그 수집 | ❌ 실패 | 타겟으로 추가되지 않음 |
| 로그 파일 존재 | ✅ 확인됨 | `/var/log/pods/`에 로그 파일 존재 |
| Kubernetes Discovery | ⚠️ 시작됨 | 하지만 Pod 발견 안 됨 |
| 로그 경로 패턴 | ✅ 수정됨 | 실제 경로 구조와 일치 |

---

## 🔧 권장 조치 사항

### 1. Promtail 로그 레벨 증가

Promtail 설정에 로그 레벨을 증가시켜 더 자세한 정보 확인:
```yaml
server:
  log_level: debug  # info에서 debug로 변경
```

### 2. Promtail 메트릭 확인

Promtail의 메트릭을 확인하여 실제로 몇 개의 타겟을 발견했는지 확인:
```bash
kubectl port-forward -n bravo-monitoring-ns promtail-w7flv 3101:3101
curl http://localhost:3101/metrics | grep promtail_targets
```

### 3. Kubernetes API 접근 확인

Promtail이 Kubernetes API에 접근할 수 있는지 확인:
```bash
kubectl exec -n bravo-monitoring-ns promtail-w7flv -- \
  sh -c 'curl -k https://kubernetes.default.svc/api/v1/pods?limit=5'
```

### 4. Relabel Configs 확인

Promtail 설정의 `relabel_configs`에 필터링 규칙이 있는지 확인:
```bash
kubectl exec -n bravo-monitoring-ns promtail-w7flv -- \
  cat /etc/promtail/promtail.yaml | grep -A 50 "relabel_configs:"
```

---

## 📝 확인 명령어

### Promtail이 발견한 타겟 확인
```bash
# Promtail 메트릭 확인 (포트 포워딩 필요)
kubectl port-forward -n bravo-monitoring-ns promtail-w7flv 3101:3101
curl http://localhost:3101/metrics | grep promtail_targets
```

### Promtail 로그 확인
```bash
# 모든 Promtail Pod의 로그 확인
kubectl logs -n bravo-monitoring-ns -l app=promtail | grep -E "Adding target|watching|kubernetes"
```

### Kubernetes API 접근 확인
```bash
# Promtail이 Kubernetes API에 접근할 수 있는지 확인
kubectl exec -n bravo-monitoring-ns promtail-w7flv -- \
  sh -c 'TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token); \
  curl -k -H "Authorization: Bearer $TOKEN" \
  https://kubernetes.default.svc/api/v1/pods?limit=5'
```

---

## 🎯 결론

**현재 상황**:
- 설정은 올바르게 수정되었지만, Promtail이 여전히 다른 Pod를 타겟으로 추가하지 못하고 있습니다.
- Promtail 로그가 매우 적어서 Kubernetes discovery가 Pod를 발견하지 못했을 가능성이 있습니다.

**다음 단계**:
1. Promtail 로그 레벨을 증가시켜 더 자세한 정보 확인
2. Promtail 메트릭을 확인하여 실제 발견한 타겟 수 확인
3. Promtail이 Kubernetes API에 접근할 수 있는지 확인
4. Relabel configs에 필터링 규칙이 있는지 확인



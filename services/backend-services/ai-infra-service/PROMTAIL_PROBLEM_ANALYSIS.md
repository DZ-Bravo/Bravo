# Promtail 문제 분석 보고서

**분석 일시**: 2025-12-26  
**상태**: 코드 수정 없이 분석만 수행

---

## 🔍 문제 확인

### 확인된 사실

1. **Promtail 메트릭**
   ```
   promtail_targets_active_total 1
   ```
   - Promtail이 1개의 타겟만 활성화함
   - 이것은 Promtail 자체 로그만 타겟으로 추가되었다는 의미

2. **Promtail 설정**
   - Kubernetes discovery 설정은 정상
   - 로그 경로 패턴도 올바름: `/var/log/pods/$1_$2_$3/$4/*.log`

3. **로그 파일 존재**
   - `/var/log/pods/bravo-ai-integration-ns_ai-infra-service-7dcbf9b95c-gw6rq_95b15b3f-a814-42d1-b535-b79b9c0eaf15/ai-infra-service/` 존재
   - 로그 파일 (`0.log`) 존재

4. **Promtail 동작**
   - Promtail이 Kubernetes discovery를 시작했지만, 다른 Pod를 타겟으로 추가하지 못함
   - Promtail 로그에 "Adding target" 메시지가 Promtail 자체 로그에만 있음

---

## 🎯 문제 원인 분석

### 핵심 문제

**Promtail이 Kubernetes API를 통해 Pod를 발견하지 못하고 있습니다.**

### 가능한 원인

#### 1. **Kubernetes Discovery가 Pod를 발견하지 못함**

Promtail이 Kubernetes API를 통해 Pod 목록을 가져오지 못하고 있을 가능성이 높습니다.

**확인 필요**:
- Promtail이 Kubernetes API에 접근할 수 있는지
- Promtail이 실제로 Pod 목록을 가져오는지
- Promtail의 Kubernetes discovery가 정상 작동하는지

#### 2. **Relabel Configs에서 필터링됨**

Promtail이 Pod를 발견했지만, `relabel_configs`에서 필터링되어 제외될 수 있습니다.

**현재 설정 확인**:
- `relabel_configs`에 `action: drop`이나 필터링 규칙이 없음
- 하지만 `__path__` 레이블이 제대로 생성되지 않아 타겟으로 추가하지 못할 수 있음

#### 3. **노드 필터링 문제**

Promtail은 DaemonSet으로 각 노드에 하나씩 실행되며, 자신의 노드에 있는 Pod만 타겟으로 추가해야 합니다.

**확인 필요**:
- Promtail이 자신의 노드에 있는 Pod만 타겟으로 추가하는지
- `__host__` 레이블이 제대로 설정되는지

---

## 🔧 해결 방안

### 1. Promtail이 Kubernetes API에 접근할 수 있는지 확인

```bash
kubectl exec -n bravo-monitoring-ns promtail-b6bx6 -- \
  sh -c 'TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token); \
  echo "Token exists: $([ -n "$TOKEN" ] && echo yes || echo no)"'
```

### 2. Promtail 로그 레벨 증가

Promtail 설정에 로그 레벨을 증가시켜 더 자세한 정보 확인:
```yaml
server:
  log_level: debug
```

### 3. Promtail이 실제로 Pod를 발견하는지 확인

Promtail의 Kubernetes discovery가 실제로 Pod를 발견하는지 확인하기 위해, Promtail 로그를 더 자세히 확인하거나, Promtail이 Kubernetes API를 통해 Pod 목록을 가져오는지 확인해야 합니다.

### 4. 표준 Promtail Kubernetes 설정 확인

Promtail의 표준 Kubernetes discovery 설정과 비교하여 차이점 확인:
- 일반적으로 Promtail은 Kubernetes API를 통해 Pod를 자동으로 발견함
- 하지만 현재 설정에서는 Pod를 발견하지 못하고 있음

---

## 📊 현재 상태 요약

| 항목 | 상태 | 설명 |
|------|------|------|
| Promtail 타겟 수 | ❌ 1개만 | Promtail 자체 로그만 타겟으로 추가됨 |
| Promtail 설정 | ✅ 정상 | Kubernetes discovery 설정 정상 |
| 로그 파일 존재 | ✅ 확인됨 | `/var/log/pods/`에 로그 파일 존재 |
| Kubernetes Discovery | ⚠️ 시작됨 | 하지만 Pod 발견 안 됨 |
| Loki 저장 | ❌ 실패 | 다른 Pod 로그가 저장되지 않음 |

---

## 🎯 결론

**현재 상황**:
- Promtail이 Kubernetes API를 통해 Pod를 발견하지 못하고 있습니다.
- `promtail_targets_active_total`이 1개만 있는 것은 Promtail 자체 로그만 타겟으로 추가되었다는 의미입니다.
- 설정은 올바르지만, Promtail이 실제로 Pod를 발견하지 못하고 있습니다.

**다음 단계**:
1. Promtail이 Kubernetes API에 접근할 수 있는지 확인
2. Promtail 로그 레벨을 증가시켜 더 자세한 정보 확인
3. Promtail의 표준 Kubernetes discovery 설정과 비교
4. 필요시 Promtail 설정을 표준 설정으로 변경



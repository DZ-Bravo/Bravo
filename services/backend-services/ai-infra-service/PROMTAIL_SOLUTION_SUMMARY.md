# Promtail 문제 해결 요약

**일시**: 2025-12-26

---

## ✅ 완료된 작업

### 1. 체크리스트 확인 (제시하신 TOP 6 원인)

1. ✅ **DaemonSet 확인**: DaemonSet으로 정상 실행 중 (8개 Pod, 8개 노드)
2. ✅ **hostPath 마운트 확인**: `/var/log`, `/var/lib/docker/containers` 정상 마운트됨
3. ✅ **권한 문제 확인**: Permission denied 오류 없음
4. ⚠️ **로그 경로 패턴**: `/var/log/containers` 경로로 변경 시도
5. ✅ **RBAC 권한 확인**: list/watch pods 권한 정상
6. ✅ **노드 필터링 확인**: tolerations 설정 정상

### 2. 설정 수정

- 로그 경로 패턴을 `/var/log/containers`로 변경
- 중복된 drop 규칙 제거
- 디버그 로그 레벨 활성화

---

## ⚠️ 현재 문제

**Promtail이 Kubernetes API를 통해 Pod를 발견하지 못하고 있습니다.**

### 확인된 사실

1. **Kubernetes Discovery 시작됨**
   ```
   level=info ts=2025-12-26T02:22:00.102666554Z caller=kubernetes.go:327 
   component=discovery discovery=kubernetes config=kubernetes-pods 
   msg="Using pod service account via in-cluster config"
   ```

2. **하지만 Pod를 타겟으로 추가하지 못함**
   - Promtail 로그에 "Adding target" 메시지가 Promtail 자체 로그에만 있음
   - `promtail_targets_active_total`이 1개만 있음

3. **로그 파일은 존재함**
   - `/var/log/containers`에 다른 Pod들의 로그 파일 존재
   - `/var/log/pods`에도 로그 파일 존재

---

## 🔍 가능한 원인

### 1. Promtail이 Kubernetes API를 통해 Pod 목록을 가져오지 못함

Promtail의 Kubernetes discovery가 시작되었지만, 실제로 Pod를 발견하지 못하고 있습니다.

**확인 필요**:
- Promtail이 Kubernetes API에 실제로 접근할 수 있는지
- Promtail이 Pod 목록을 가져오는지

### 2. Relabel Configs에서 필터링됨

Promtail이 Pod를 발견했지만, `relabel_configs`에서 필터링되어 제외될 수 있습니다.

**현재 설정**:
- `__path__` 레이블이 제대로 생성되는지 확인 필요
- `drop` 규칙이 모든 타겟을 제거하는지 확인 필요

---

## 🔧 해결 방안

### 1. Promtail이 Kubernetes API에 접근할 수 있는지 확인

```bash
POD=$(kubectl get pods -n bravo-monitoring-ns -l app=promtail -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n bravo-monitoring-ns $POD -- sh -c 'TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token); echo "Token exists: $([ -n "$TOKEN" ] && echo yes || echo no)"'
```

### 2. Promtail 로그에서 Kubernetes discovery 메시지 확인

```bash
kubectl logs -n bravo-monitoring-ns -l app=promtail | grep -E "discoverer channel|kubernetes.*target|discovered"
```

### 3. 표준 Promtail Kubernetes 설정 확인

Promtail의 표준 Kubernetes discovery 설정과 비교하여 차이점 확인

---

## 📊 현재 상태 요약

| 항목 | 상태 | 설명 |
|------|------|------|
| DaemonSet | ✅ 정상 | 8개 Pod 모두 실행 중 |
| hostPath 마운트 | ✅ 정상 | `/var/log`, `/var/lib/docker/containers` 마운트됨 |
| 권한 문제 | ✅ 없음 | Permission denied 오류 없음 |
| RBAC 권한 | ✅ 정상 | list/watch pods 권한 있음 |
| 로그 파일 존재 | ✅ 확인됨 | `/var/log/containers`, `/var/log/pods`에 로그 파일 존재 |
| Kubernetes Discovery | ⚠️ 시작됨 | 하지만 Pod 발견 안 됨 |
| Promtail 타겟 수 | ❌ 1개만 | Promtail 자체 로그만 타겟으로 추가됨 |
| Loki 저장 | ❌ 실패 | 다른 Pod 로그가 저장되지 않음 |

---

## 🎯 결론

**현재 상황**:
- 제시하신 체크리스트의 1-3, 5-6번 항목은 모두 정상입니다.
- 하지만 4번 항목(로그 경로 패턴)과 Kubernetes discovery 자체가 작동하지 않고 있습니다.

**문제**:
- Promtail이 Kubernetes API를 통해 Pod를 발견하지 못하고 있습니다.
- 설정은 올바르지만, Promtail이 실제로 Pod를 타겟으로 추가하지 못하고 있습니다.

**다음 단계**:
1. Promtail이 Kubernetes API에 실제로 접근할 수 있는지 확인
2. Promtail의 표준 Kubernetes discovery 설정과 비교
3. Promtail 로그에서 Kubernetes discovery 관련 메시지 확인



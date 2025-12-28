# Promtail 현재 상태 확인 보고서

**확인 일시**: 2025-12-26  
**상태**: 코드 수정 없이 확인만 수행

---

## 🔍 확인 결과

### 현재 상황

1. **Promtail 설정**: ✅ 올바르게 설정됨
   - 로그 경로 패턴: `/var/log/pods/$1_$2_$3/$4/*.log`
   - Kubernetes discovery 설정 정상

2. **Promtail Pod**: ✅ 정상 실행 중
   - 8개 Pod 모두 Running 상태
   - RBAC 권한 정상

3. **로그 파일**: ✅ 존재함
   - `/var/log/pods/bravo-ai-integration-ns_ai-infra-service-7dcbf9b95c-gw6rq_95b15b3f-a814-42d1-b535-b79b9c0eaf15/ai-infra-service/0.log` 존재
   - 다른 Pod들의 로그 파일도 존재

4. **Promtail 동작**: ⚠️ 문제 있음
   - Promtail이 Kubernetes discovery를 시작했지만, 다른 Pod를 타겟으로 추가하지 못함
   - Promtail 로그에 "Adding target" 메시지가 Promtail 자체 로그에만 있음
   - 다른 Pod에 대한 타겟 추가 메시지 없음

5. **Loki 저장**: ❌ 실패
   - `{namespace=~"bravo-.*"}` 쿼리 결과: 빈 배열
   - 다른 Pod 로그가 Loki에 저장되지 않음

---

## 🎯 문제 분석

### 핵심 문제

**Promtail이 Kubernetes API를 통해 Pod를 발견하지 못하고 있습니다.**

### 확인된 사실

1. **Kubernetes Discovery 시작됨**
   ```
   level=info ts=2025-12-26T02:05:04.652217514Z caller=kubernetes.go:327 
   component=discovery discovery=kubernetes config=kubernetes-pods 
   msg="Using pod service account via in-cluster config"
   ```

2. **다른 Pod를 타겟으로 추가하지 않음**
   - Promtail 로그에 "Adding target" 메시지가 Promtail 자체 로그에만 있음
   - 다른 Pod에 대한 타겟 추가 메시지 없음

3. **로그 파일은 존재함**
   - `/var/log/pods/`에 다른 Pod들의 로그 디렉토리와 파일이 존재함
   - 하지만 Promtail이 이를 타겟으로 추가하지 못함

### 가능한 원인

1. **Kubernetes Discovery가 Pod를 발견하지 못함**
   - Promtail이 Kubernetes API를 통해 Pod 목록을 가져오지 못함
   - 또는 Pod를 발견했지만 타겟으로 추가하는 과정에서 실패

2. **Relabel Configs 문제**
   - Promtail이 Pod를 발견했지만, relabel_configs에서 필터링되어 제외됨
   - `__path__` 레이블이 제대로 생성되지 않아 타겟으로 추가하지 못함

3. **노드 필터링 문제**
   - Promtail이 다른 노드의 Pod를 발견했지만, 로컬에 로그 파일이 없어서 타겟으로 추가하지 못함
   - 하지만 로그 파일은 존재하므로 이 가능성은 낮음

---

## 📊 현재 상태 요약

| 항목 | 상태 | 설명 |
|------|------|------|
| Promtail Pod | ✅ 정상 | 8개 모두 실행 중 |
| RBAC 권한 | ✅ 정상 | 더 이상 오류 없음 |
| Promtail 설정 | ✅ 정상 | 로그 경로 패턴 올바름 |
| 로그 파일 존재 | ✅ 확인됨 | `/var/log/pods/`에 로그 파일 존재 |
| Kubernetes Discovery | ⚠️ 시작됨 | 하지만 Pod 발견 안 됨 |
| 다른 Pod 타겟 추가 | ❌ 실패 | Promtail 자체 로그만 타겟으로 추가됨 |
| Loki 저장 | ❌ 실패 | 다른 Pod 로그가 저장되지 않음 |

---

## 🔧 추가 확인 필요 사항

### 1. Promtail 메트릭 확인
Promtail이 실제로 몇 개의 타겟을 발견했는지 확인:
```bash
kubectl port-forward -n bravo-monitoring-ns promtail-b6bx6 3101:3101
curl http://localhost:3101/metrics | grep promtail_targets
```

### 2. Promtail 로그 레벨 증가
더 자세한 정보를 위해 로그 레벨을 debug로 증가:
```yaml
server:
  log_level: debug
```

### 3. Kubernetes API 접근 확인
Promtail이 Kubernetes API에 접근할 수 있는지 확인:
```bash
kubectl exec -n bravo-monitoring-ns promtail-b6bx6 -- \
  sh -c 'TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token); \
  echo $TOKEN | wc -c'
```

### 4. 시간 경과 후 재확인
Kubernetes discovery가 Pod를 발견하는 데 시간이 걸릴 수 있으므로, 몇 분 후 다시 확인

---

## 🎯 결론

**현재 상황**:
- Promtail 설정은 올바르게 수정되었습니다.
- 하지만 Promtail이 Kubernetes API를 통해 Pod를 발견하지 못하고 있습니다.
- Promtail이 다른 Pod를 타겟으로 추가하지 못해 Loki에 로그가 저장되지 않습니다.

**다음 단계**:
1. Promtail 메트릭을 확인하여 실제 발견한 타겟 수 확인
2. Promtail 로그 레벨을 증가시켜 더 자세한 정보 확인
3. Promtail이 Kubernetes API에 접근할 수 있는지 확인
4. 시간을 두고 재확인 (Kubernetes discovery가 완료되는 데 시간이 걸릴 수 있음)



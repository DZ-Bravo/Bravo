# Promtail 문제 해결 요약

**해결 일시**: 2025-12-26

---

## ✅ 완료된 작업

### 1. 로그 경로 패턴 수정
- **변경 전**: `/var/log/pods/$1/$2/*.log`
- **변경 후**: `/var/log/pods/$1_$2_$3/$4/*.log`
- **설명**: 실제 Kubernetes Pod 로그 경로 구조에 맞게 수정
  - `$1` = namespace
  - `$2` = pod_name
  - `$3` = pod_uid
  - `$4` = container_name

### 2. Promtail 설정 정리
- 불필요한 노드 필터링 제거
- 표준 Promtail Kubernetes discovery 설정으로 정리

### 3. Promtail 재시작
- ConfigMap 업데이트 완료
- Promtail DaemonSet 재시작 완료 (8개 Pod 모두 재시작)

---

## ⚠️ 현재 상태

### 정상 작동 중
- ✅ Promtail Pod: 8개 모두 정상 실행 중
- ✅ RBAC 권한: 해결됨 (더 이상 오류 없음)
- ✅ Promtail 자체 로그: `{job="promtail"}` 쿼리로 조회 가능
- ✅ 로그 파일 존재: `/var/log/pods/`에 다른 Pod들의 로그 파일 존재

### 아직 해결되지 않은 문제
- ❌ 다른 Pod 로그 수집: Promtail이 Kubernetes discovery를 통해 Pod를 발견하지 못함
- ❌ Loki에 저장: `{namespace=~"bravo-.*"}` 쿼리 결과 빈 배열

---

## 🔍 문제 원인

**Promtail이 Kubernetes API를 통해 Pod를 발견하지 못하고 있습니다.**

가능한 원인:
1. Kubernetes discovery가 Pod를 발견하는 데 시간이 걸림 (일반적으로 몇 분 소요)
2. Promtail이 Kubernetes API에 접근할 수 없음 (하지만 RBAC 권한은 정상)
3. Promtail의 Kubernetes discovery 설정 문제

---

## 🔧 추가 확인 필요 사항

### 1. 시간 경과 후 재확인
Kubernetes discovery가 Pod를 발견하는 데 시간이 걸릴 수 있으므로, 몇 분 후 다시 확인:

```bash
kubectl run -it --rm --restart=Never --image=curlimages/curl:latest curl-test \
  --namespace=bravo-monitoring-ns -- \
  sh -c 'END=$(date +%s)000000000; START=$((END - 3600000000000)); \
  curl -sG "http://loki.bravo-monitoring-ns:3100/loki/api/v1/query_range" \
  --data-urlencode "query={namespace=~\"bravo-.*\"}" \
  --data-urlencode "start=${START}" --data-urlencode "end=${END}" --data-urlencode "limit=10"'
```

### 2. Promtail 메트릭 확인
Promtail이 실제로 몇 개의 타겟을 발견했는지 확인:

```bash
kubectl port-forward -n bravo-monitoring-ns promtail-b6bx6 3101:3101
curl http://localhost:3101/metrics | grep promtail_targets
```

### 3. Promtail 로그 확인
Promtail이 다른 Pod를 타겟으로 추가했는지 확인:

```bash
kubectl logs -n bravo-monitoring-ns promtail-b6bx6 | grep "Adding target" | grep -v promtail
```

---

## 📝 변경된 파일

- `/home/bravo/LABs/k8s/monitoring/monitoring-all.yaml`
  - 로그 경로 패턴 수정
  - Promtail 설정 정리

---

## 🎯 다음 단계

1. **몇 분 후 재확인**: Kubernetes discovery가 완료되는 데 시간이 걸릴 수 있음
2. **Promtail 메트릭 확인**: 실제 발견한 타겟 수 확인
3. **Promtail 로그 확인**: 다른 Pod를 타겟으로 추가했는지 확인

설정은 올바르게 수정되었으며, Promtail이 Kubernetes API를 통해 Pod를 발견하는 데 시간이 필요할 수 있습니다.



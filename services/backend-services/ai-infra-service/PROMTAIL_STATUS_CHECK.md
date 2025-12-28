# Promtail 상태 점검 보고서

**점검 일시**: 2025-12-26  
**점검자**: AI Assistant  
**상태**: 코드 수정 없이 점검만 수행

---

## 📊 현재 상태 요약

### ✅ 정상 작동 중인 항목

1. **Promtail Pod 상태**
   - 8개 Promtail Pod 모두 정상 실행 중
   - RBAC 권한 문제 해결됨 (더 이상 `pods is forbidden` 오류 없음)

2. **Promtail 자체 로그 수집**
   - `{job="promtail"}` 쿼리로 Promtail 로그 조회 가능
   - Loki에 Promtail 로그 저장 확인됨

3. **Loki 연결**
   - Promtail → Loki 연결 정상
   - Loki API 응답 정상

### ⚠️ 문제가 있는 항목

1. **다른 Pod 로그 수집 실패**
   - `{namespace=~"bravo-.*"}` 쿼리 결과: 빈 배열 (`"result":[]`)
   - Loki에 저장된 레이블: `filename`, `job`만 존재
   - `namespace`, `pod`, `container` 레이블 없음

---

## 🔍 상세 점검 결과

### 1. Loki에 저장된 레이블 확인

```bash
# 레이블 목록
{"status":"success","data":["filename","job"]}

# job 레이블 값
{"status":"success","data":["promtail"]}
```

**분석**:
- `namespace`, `pod`, `container` 레이블이 Loki에 저장되지 않음
- `job` 레이블 값은 `promtail`만 존재
- 이는 Promtail이 다른 Pod들의 로그를 수집하지 못하고 있다는 의미

### 2. Promtail 로그 분석

**확인된 메시지**:
```
level=info ts=2025-12-26T01:41:57.618335433Z caller=kubernetes.go:327 
component=discovery discovery=kubernetes config=kubernetes-pods 
msg="Using pod service account via in-cluster config"

level=info ts=2025-12-26T01:42:02.61796116Z caller=filetargetmanager.go:361 
msg="Adding target" key="/var/log/pods/*/promtail/*.log:{job=\"promtail\"}"
```

**분석**:
- Promtail이 Kubernetes Pod discovery를 시작함
- 하지만 다른 Pod들을 발견했다는 메시지가 없음
- Promtail 자체 로그만 타겟으로 추가됨

### 3. 로그 파일 존재 확인

**확인 결과**:
- `/var/log/pods/` 디렉토리에 다른 Pod들의 로그 디렉토리 존재:
  - `bravo-ai-integration-ns_ai-infra-service-7dcbf9b95c-gw6rq_.../ai-infra-service/0.log`
  - `bravo-core-ns_community-service-.../community-service/0.log`
  - `bravo-core-ns_mountain-service-.../mountain-service/0.log`
  - 등등...

**로그 파일 내용 확인**:
- 로그 파일이 존재하고 내용도 있음
- 예: `ai-infra-service` Pod의 로그 파일에 실제 로그 내용 확인됨

### 4. Promtail 설정 확인

**현재 설정** (`/etc/promtail/promtail.yaml`):
```yaml
scrape_configs:
  - job_name: kubernetes-pods
    kubernetes_sd_configs:
      - role: pod
    pipeline_stages:
      - docker: {}
    relabel_configs:
      # ... 레이블 설정 ...
      - replacement: /var/log/pods/$1/$2/*.log
        separator: /
        source_labels:
          - __meta_kubernetes_pod_uid
          - __meta_kubernetes_pod_container_name
        target_label: __path__
```

**설정 분석**:
- Kubernetes Pod discovery 설정은 정상
- 로그 경로 패턴도 수정됨 (`$1/$2/*.log`)
- 하지만 Promtail이 실제로 Pod를 발견하지 못함

---

## 🎯 문제 원인 분석

### 가능한 원인

1. **Kubernetes Discovery 지연**
   - Promtail이 Kubernetes API를 통해 Pod를 발견하는 데 시간이 걸릴 수 있음
   - 하지만 이미 7분 이상 경과했는데도 발견하지 못함

2. **레이블 필터링 문제**
   - Promtail이 모든 Pod를 발견하지만, 특정 조건으로 필터링되어 제외될 수 있음
   - 하지만 설정에 필터가 없음

3. **로그 경로 매칭 실패**
   - Kubernetes discovery가 Pod를 발견했지만, `__path__` 레이블 생성 실패
   - 로그 경로 패턴이 실제 파일 경로와 매칭되지 않을 수 있음

4. **Promtail이 다른 노드의 Pod를 발견하지 못함**
   - Promtail은 DaemonSet으로 각 노드에 하나씩 실행됨
   - 각 Promtail은 자신이 실행된 노드의 `/var/log/pods/`만 읽을 수 있음
   - 하지만 Kubernetes discovery는 클러스터 전체의 Pod를 발견함
   - 이로 인해 다른 노드의 Pod를 발견했지만 로그 파일이 없어서 타겟으로 추가하지 못할 수 있음

### 가장 가능성 높은 원인

**노드별 로그 파일 접근 문제**:
- Promtail은 DaemonSet으로 각 노드에 하나씩 실행됨
- 각 Promtail은 자신이 실행된 노드의 `/var/log/pods/`만 읽을 수 있음
- Kubernetes discovery는 클러스터 전체의 Pod를 발견하지만, 실제 로그 파일은 각 노드에만 존재함
- Promtail이 다른 노드의 Pod를 발견했지만, 로컬에 로그 파일이 없어서 타겟으로 추가하지 못할 수 있음

**확인 필요 사항**:
- Promtail이 실제로 Kubernetes API에서 Pod 목록을 가져오는지
- Promtail이 발견한 Pod 중 로컬 노드에 로그 파일이 있는 Pod만 타겟으로 추가하는지
- 각 노드의 Promtail이 자신의 노드에 있는 Pod 로그만 수집하는지

---

## 📝 확인 명령어

### 1. 각 노드의 Promtail이 자신의 노드 Pod를 수집하는지 확인

```bash
# node2의 Promtail 확인
kubectl logs -n bravo-monitoring-ns promtail-6lqfn | grep -E "watching|Adding target" | grep -v promtail

# node5의 Promtail 확인  
kubectl logs -n bravo-monitoring-ns promtail-9jpn2 | grep -E "watching|Adding target" | grep -v promtail
```

### 2. Promtail이 Kubernetes API에서 Pod를 가져오는지 확인

```bash
# Promtail 로그에서 Kubernetes discovery 관련 메시지 확인
kubectl logs -n bravo-monitoring-ns promtail-6lqfn | grep -i "kubernetes\|discovered\|target"
```

### 3. 실제 로그 파일 경로와 설정 패턴 비교

```bash
# 실제 로그 파일 경로
kubectl exec -n bravo-monitoring-ns promtail-6lqfn -- \
  ls -la /var/log/pods/bravo-ai-integration-ns_ai-infra-service-*/ai-infra-service/

# 설정의 경로 패턴
# /var/log/pods/$1/$2/*.log
# $1 = __meta_kubernetes_pod_uid
# $2 = __meta_kubernetes_pod_container_name
```

---

## 🔧 권장 조치 사항

### 1. Promtail 로그 레벨 증가 (디버깅용)

Promtail 설정에 로그 레벨을 증가시켜 더 자세한 정보 확인:
```yaml
server:
  log_level: debug  # 또는 info에서 debug로 변경
```

### 2. Promtail 메트릭 확인

Promtail의 메트릭을 확인하여 실제로 몇 개의 타겟을 발견했는지 확인:
```bash
kubectl port-forward -n bravo-monitoring-ns promtail-6lqfn 3101:3101
curl http://localhost:3101/metrics | grep promtail_targets
```

### 3. 시간 경과 후 재확인

Kubernetes discovery가 Pod를 발견하는 데 시간이 걸릴 수 있으므로, 몇 분 후 다시 확인:
```bash
# 5-10분 후 다시 확인
kubectl run -it --rm --restart=Never --image=curlimages/curl:latest curl-test \
  --namespace=bravo-monitoring-ns -- \
  sh -c 'END=$(date +%s)000000000; START=$((END - 3600000000000)); \
  curl -sG "http://loki.bravo-monitoring-ns:3100/loki/api/v1/query_range" \
  --data-urlencode "query={namespace=~\"bravo-.*\"}" \
  --data-urlencode "start=${START}" --data-urlencode "end=${END}" --data-urlencode "limit=10"'
```

---

## 📊 현재 상태 요약표

| 항목 | 상태 | 설명 |
|------|------|------|
| Promtail Pod | ✅ 정상 | 8개 모두 실행 중 |
| RBAC 권한 | ✅ 해결됨 | 더 이상 오류 없음 |
| Promtail 로그 수집 | ✅ 정상 | `{job="promtail"}` 로그 조회 가능 |
| 다른 Pod 로그 수집 | ❌ 실패 | `{namespace=~"bravo-.*"}` 쿼리 결과 빈 배열 |
| Loki 연결 | ✅ 정상 | Promtail → Loki 연결 정상 |
| 로그 파일 존재 | ✅ 확인됨 | `/var/log/pods/`에 로그 파일 존재 |
| Kubernetes Discovery | ⚠️ 시작됨 | 하지만 다른 Pod 발견 안 됨 |

---

## 🎯 결론

**현재 상황**:
- Promtail 자체 로그는 정상적으로 수집되고 있음
- 하지만 다른 Pod들의 로그는 수집되지 않음
- 로그 파일은 존재하지만 Promtail이 타겟으로 추가하지 못함

**가능한 원인**:
- Promtail이 Kubernetes API를 통해 Pod를 발견했지만, 로컬 노드에 로그 파일이 있는 Pod만 타겟으로 추가해야 하는데 그 과정에서 문제가 발생했을 가능성
- 또는 Promtail이 아직 Pod discovery를 완료하지 못했을 가능성

**다음 단계**:
- 시간을 두고 재확인 (Kubernetes discovery가 완료되는 데 시간이 걸릴 수 있음)
- Promtail 메트릭 확인하여 실제 발견한 타겟 수 확인
- 필요시 Promtail 로그 레벨 증가하여 더 자세한 정보 확인



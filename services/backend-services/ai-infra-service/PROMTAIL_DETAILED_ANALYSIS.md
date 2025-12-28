# Promtail 상세 분석 보고서

**분석 일시**: 2025-12-26  
**상태**: 코드 수정 없이 분석만 수행

---

## 🔍 현재 상황

### 확인된 사실

1. **Promtail 설정은 정상**
   ```yaml
   - job_name: kubernetes-pods
     kubernetes_sd_configs:
       - role: pod
     relabel_configs:
       - replacement: /var/log/pods/$1/$2/*.log
         source_labels:
           - __meta_kubernetes_pod_uid
           - __meta_kubernetes_pod_container_name
         target_label: __path__
   ```

2. **로그 파일은 존재함**
   - `/var/log/pods/`에 다른 Pod들의 로그 파일이 존재
   - 예: `/var/log/pods/bravo-ai-integration-ns_ai-infra-service-7dcbf9b95c-gw6rq_95b15b3f-a814-42d1-b535-b79b9c0eaf15/ai-infra-service/0.log`

3. **Promtail이 다른 Pod를 타겟으로 추가하지 않음**
   - 로그에 `Adding target` 메시지가 Promtail 자체 로그에만 있음
   - 다른 Pod에 대한 타겟 추가 메시지 없음

4. **Loki에 저장된 레이블**
   - `filename`, `job`만 존재
   - `namespace`, `pod`, `container` 레이블 없음

---

## 🎯 문제 원인 분석

### 핵심 문제

**Promtail이 Kubernetes API를 통해 Pod를 발견했지만, 실제로 로그 파일을 읽도록 타겟으로 추가하지 못하고 있습니다.**

### 가능한 원인들

#### 1. **노드 필터링 문제 (가장 가능성 높음)**

Promtail은 DaemonSet으로 각 노드에 하나씩 실행됩니다. 각 Promtail은:
- Kubernetes API를 통해 **클러스터 전체의 Pod**를 발견함
- 하지만 **자신이 실행된 노드의 `/var/log/pods/`만 읽을 수 있음**

**문제**:
- Promtail이 다른 노드의 Pod를 발견했지만, 로컬에 로그 파일이 없어서 타겟으로 추가하지 못함
- Promtail이 자신의 노드에 있는 Pod만 타겟으로 추가해야 하는데, 그 필터링이 작동하지 않을 수 있음

**확인 필요**:
- Promtail이 발견한 Pod 중 자신의 노드에 있는 Pod만 타겟으로 추가하는지
- `__host__` 레이블이 제대로 설정되는지

#### 2. **로그 경로 패턴 매칭 실패**

실제 로그 파일 경로:
```
/var/log/pods/bravo-ai-integration-ns_ai-infra-service-7dcbf9b95c-gw6rq_95b15b3f-a814-42d1-b535-b79b9c0eaf15/ai-infra-service/0.log
```

설정의 경로 패턴:
```
/var/log/pods/$1/$2/*.log
```
- `$1` = Pod UID: `95b15b3f-a814-42d1-b535-b79b9c0eaf15`
- `$2` = Container name: `ai-infra-service`

**문제**:
- 실제 디렉토리 이름은 `{namespace}_{pod-name}_{pod-uid}` 형식
- 하지만 설정은 `{pod-uid}`만 사용
- 경로 패턴이 실제 파일 경로와 매칭되지 않을 수 있음

**실제 경로 구조**:
```
/var/log/pods/{namespace}_{pod-name}_{pod-uid}/{container-name}/{log-file}
```

**설정이 생성하는 경로**:
```
/var/log/pods/{pod-uid}/{container-name}/*.log
```

이 두 경로가 일치하지 않습니다!

#### 3. **Kubernetes Discovery 지연**

Promtail이 Kubernetes API를 통해 Pod를 발견하는 데 시간이 걸릴 수 있지만, 이미 충분한 시간이 경과했습니다.

---

## 🔧 문제 해결 방안

### 문제 1: 로그 경로 패턴 불일치

**현재 설정**:
```yaml
- replacement: /var/log/pods/$1/$2/*.log
  source_labels:
    - __meta_kubernetes_pod_uid
    - __meta_kubernetes_pod_container_name
```

**실제 경로 구조**:
```
/var/log/pods/{namespace}_{pod-name}_{pod-uid}/{container-name}/0.log
```

**해결 방법**:
경로 패턴을 실제 구조에 맞게 수정해야 합니다:
```yaml
- replacement: /var/log/pods/$1_$2_$3/$4/*.log
  separator: /
  source_labels:
    - __meta_kubernetes_namespace
    - __meta_kubernetes_pod_name
    - __meta_kubernetes_pod_uid
    - __meta_kubernetes_pod_container_name
  target_label: __path__
```

또는 더 간단하게:
```yaml
- replacement: /var/log/pods/$1/$2/*.log
  separator: /
  source_labels:
    - __meta_kubernetes_pod_uid
    - __meta_kubernetes_pod_container_name
  target_label: __path__
```

하지만 실제로는 디렉토리 이름이 `{namespace}_{pod-name}_{pod-uid}` 형식이므로, 이 부분을 고려해야 합니다.

### 문제 2: 노드 필터링

Promtail이 자신의 노드에 있는 Pod만 타겟으로 추가하도록 필터링이 필요할 수 있습니다.

---

## 📊 현재 상태 요약

| 항목 | 상태 | 설명 |
|------|------|------|
| Promtail Pod | ✅ 정상 | 8개 모두 실행 중 |
| RBAC 권한 | ✅ 해결됨 | 더 이상 오류 없음 |
| Promtail 로그 수집 | ✅ 정상 | `{job="promtail"}` 로그 조회 가능 |
| 다른 Pod 로그 수집 | ❌ 실패 | 타겟으로 추가되지 않음 |
| 로그 파일 존재 | ✅ 확인됨 | `/var/log/pods/`에 로그 파일 존재 |
| Kubernetes Discovery | ⚠️ 시작됨 | 하지만 타겟 추가 안 됨 |
| 로그 경로 패턴 | ⚠️ 불일치 가능성 | 실제 경로 구조와 설정 불일치 |

---

## 🎯 결론

**핵심 문제**:
Promtail이 Kubernetes API를 통해 Pod를 발견했지만, 실제로 로그 파일을 읽도록 타겟으로 추가하지 못하고 있습니다.

**가장 가능성 높은 원인**:
1. **로그 경로 패턴 불일치**: 설정의 경로 패턴이 실제 파일 경로 구조와 일치하지 않음
2. **노드 필터링 문제**: Promtail이 다른 노드의 Pod를 발견했지만 로컬에 로그 파일이 없어서 타겟으로 추가하지 못함

**권장 조치**:
1. 로그 경로 패턴을 실제 경로 구조에 맞게 수정
2. Promtail이 자신의 노드에 있는 Pod만 타겟으로 추가하도록 확인
3. Promtail 메트릭을 확인하여 실제 발견한 타겟 수 확인

---

## 📝 확인 명령어

### Promtail이 발견한 타겟 확인
```bash
# Promtail 메트릭 확인 (포트 포워딩 필요)
kubectl port-forward -n bravo-monitoring-ns promtail-6lqfn 3101:3101
curl http://localhost:3101/metrics | grep promtail_targets
```

### 실제 로그 파일 경로 확인
```bash
kubectl exec -n bravo-monitoring-ns promtail-6lqfn -- \
  ls -la /var/log/pods/bravo-ai-integration-ns_ai-infra-service-*/
```

### Promtail 로그에서 타겟 추가 메시지 확인
```bash
kubectl logs -n bravo-monitoring-ns promtail-6lqfn | grep "Adding target"
```



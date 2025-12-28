# Promtail 현재 상태 최종 확인

**확인 일시**: 2025-12-26

---

## ✅ 완료된 작업

1. **RBAC 권한 추가**
   - `namespaces` 리소스에 대한 `get`, `list`, `watch` 권한 추가
   - `kubectl auth can-i list namespaces` → `yes` 확인

2. **설정 수정**
   - job 레이블 설정의 `replacement: null` → `replacement: $1/$2`로 수정
   - 로그 경로 패턴: `/var/log/containers/$1_$2_$3-*.log`

---

## ⚠️ 현재 상태

**아직 동작하지 않습니다.**

### 확인된 사실

1. **RBAC 권한**: ✅ 모두 정상
   - `list pods -A`: yes
   - `watch pods -A`: yes
   - `list namespaces`: yes (추가됨)
   - `get nodes`: yes

2. **설정**: ✅ 문제 없음
   - `kubernetes_sd_configs`에 namespaces 제한 없음
   - keep/drop 규칙 문제 없음
   - `job_name: kubernetes-pods` 존재

3. **Promtail 동작**: ❌ 문제 있음
   - Kubernetes discovery 시작됨
   - 하지만 Pod를 타겟으로 추가하지 못함
   - "Adding target" 메시지가 Promtail 자체 로그에만 있음

4. **Loki 저장**: ❌ 실패
   - `{namespace="bravo-ai-integration-ns"}` 쿼리 결과: 빈 배열

---

## 🔍 문제 분석

**Promtail이 Kubernetes API를 통해 Pod를 발견하지 못하고 있습니다.**

### 가능한 원인

1. **Kubernetes Discovery가 Pod를 발견하지 못함**
   - Promtail이 Kubernetes API를 통해 Pod 목록을 가져오지 못함
   - 또는 Pod를 발견했지만 타겟으로 추가하는 과정에서 실패

2. **로그 경로 패턴 문제**
   - `/var/log/containers/$1_$2_$3-*.log` 패턴이 실제 파일명과 일치하지 않을 수 있음
   - 실제 파일명: `ai-infra-service-7dcbf9b95c-gw6rq_bravo-ai-integration-ns_ai-infra-service-fe3d490eb42605f991b1c7d455ac69cb3cf293207c8a66afb1982e39d21162c5.log`
   - 설정 패턴: `/var/log/containers/$1_$2_$3-*.log` (pod-name_namespace_container-name-*.log)

---

## 📊 현재 상태 요약

| 항목 | 상태 | 설명 |
|------|------|------|
| RBAC 권한 | ✅ 정상 | 모든 권한 yes |
| 설정 | ✅ 정상 | namespaces 제한 없음, keep/drop 규칙 없음 |
| Kubernetes Discovery | ⚠️ 시작됨 | 하지만 Pod 발견 안 됨 |
| Promtail 타겟 수 | ❌ 1개만 | Promtail 자체 로그만 |
| Loki 저장 | ❌ 실패 | 다른 Pod 로그 저장 안 됨 |

---

## 🎯 결론

**현재 상황**:
- RBAC 권한은 모두 정상입니다.
- 설정도 문제가 없어 보입니다.
- 하지만 Promtail이 Kubernetes API를 통해 Pod를 발견하지 못하고 있습니다.

**다음 단계**:
1. Promtail이 실제로 Kubernetes API를 통해 Pod 목록을 가져오는지 확인
2. Promtail의 표준 Kubernetes discovery 설정과 비교
3. 로그 경로 패턴이 실제 파일명과 일치하는지 확인



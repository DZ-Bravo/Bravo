# cAdvisor DaemonSet 배포 완료

## 배포된 리소스
- ✅ cAdvisor DaemonSet: `bravo-monitoring-ns` 네임스페이스에 배포됨
- ✅ cAdvisor Service: `cadvisor.bravo-monitoring-ns:8080`

## 확인 사항
- ✅ cAdvisor Pod 2개 정상 실행 중
- ✅ 메트릭 엔드포인트 정상 작동 (`/metrics`)

## Prometheus 설정 추가 필요

EC2에서 실행되는 Prometheus 설정 파일에 다음 job을 추가해야 합니다:

```yaml
# cAdvisor DaemonSet 메트릭
- job_name: 'cadvisor'
  kubernetes_sd_configs:
    - role: endpoints
      namespaces:
        names:
          - bravo-monitoring-ns
  relabel_configs:
    - source_labels: [__meta_kubernetes_service_name]
      action: keep
      regex: cadvisor
    - source_labels: [__meta_kubernetes_endpoint_address_target_name]
      action: replace
      target_label: instance
    - source_labels: [__meta_kubernetes_pod_node_name]
      action: replace
      target_label: kubernetes_node
    - source_labels: [__meta_kubernetes_namespace]
      action: replace
      target_label: kubernetes_namespace
    - source_labels: [__meta_kubernetes_pod_name]
      action: replace
      target_label: kubernetes_pod_name
```

또는 더 간단하게 Service를 직접 지정:

```yaml
- job_name: 'cadvisor'
  static_configs:
    - targets:
        - cadvisor.bravo-monitoring-ns:8080
```

## 다음 단계
1. EC2에 SSH 접속 (세션 매니저)
2. Prometheus 설정 파일 위치 확인
3. 위 설정 추가
4. Prometheus 재시작 또는 설정 리로드

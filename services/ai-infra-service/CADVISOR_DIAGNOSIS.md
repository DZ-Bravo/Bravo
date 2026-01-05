# cAdvisor DaemonSet 타겟 미생성 문제 진단

## 현재 상황

### ✅ 정상 작동 중인 것들
1. **cAdvisor DaemonSet**: 정상 배포 및 실행 중
   - Pod 2개 정상 실행 (10.0.17.71, 10.0.24.98 노드)
   - 메트릭 엔드포인트 정상 작동 (`/metrics`)
   - 네트워크 접근 가능 (curl 테스트 성공)

2. **Prometheus 설정 파일**: 설정 추가 완료
   - `cadvisor-daemonset` job이 `/opt/prometheus/prometheus.yml`에 추가됨
   - Prometheus가 설정 파일을 읽음 (API 확인 시 설정에 포함됨)

3. **네트워크 연결**: 정상
   - EC2 (10.0.0.40) → Node 1 (10.0.17.71:8080): ✅ 접근 가능
   - EC2 (10.0.0.40) → Node 2 (10.0.24.98:8080): ✅ 접근 가능

### ❌ 문제점

1. **타겟이 생성되지 않음**
   ```bash
   curl -s "http://localhost:9090/api/v1/targets" | jq '.data.activeTargets[] | select(.labels.job == "cadvisor-daemonset")'
   # 결과: 없음 (빈 결과)
   ```

2. **Kubernetes ServiceDiscovery 실패**
   - 로그에 반복적으로 나타나는 에러:
   ```
   Failed to watch *v1.Node: failed to list *v1.Node: 
   Get "https://CD954D03FD7521324954E667CB2450E9.yl4.ap-northeast-2.eks.amazonaws.com/api/v1/nodes?limit=500&resourceVersion=0": 
   tls: failed to verify certificate: x509: certificate signed by unknown authority
   ```

3. **설정 파일의 문제점**
   - 현재 설정: `kubernetes_sd_configs`를 사용하여 동적 노드 발견 시도
   - 하지만 Kubernetes API 접근이 TLS 인증서 검증 실패로 차단됨
   - `insecure_skip_verify: true`가 설정되어 있지만 여전히 실패

## 근본 원인 분석

### 1. Kubernetes ServiceDiscovery 실패
- **원인**: Prometheus가 Kubernetes API 서버에 접근할 때 TLS 인증서 검증 실패
- **영향**: `role: node`를 사용한 동적 노드 발견이 작동하지 않음
- **증거**: 
  - 로그에 지속적인 TLS 인증서 에러
  - `cadvisor-daemonset` 타겟이 생성되지 않음
  - 다른 Kubernetes ServiceDiscovery job들도 동일한 문제 가능성

### 2. 설정 방식의 문제
- **현재 설정**: `kubernetes_sd_configs` + `role: node` 사용
- **문제**: Kubernetes API 접근이 실패하면 노드를 발견할 수 없음
- **대안**: 정적 타겟(`static_configs`) 사용 필요

### 3. 다른 Job들과의 비교
- **정상 작동하는 Job들**:
  - `prometheus`: static_configs (localhost:9090) ✅
  - `node-exporter`: static_configs (localhost:9100) ✅
  - `kube-state-metrics`: static_configs (10.0.17.71:32418, 10.0.24.98:32418) ✅
  
- **문제가 있는 Job들**:
  - `kubernetes-pods-app-metrics`: kubernetes_sd_configs 사용 → 타겟 0개
  - `cadvisor-daemonset`: kubernetes_sd_configs 사용 → 타겟 0개

## 진단 결과

### 핵심 문제
**Kubernetes ServiceDiscovery가 TLS 인증서 검증 실패로 인해 완전히 작동하지 않음**

### 증거
1. 로그에 지속적인 TLS 인증서 에러
2. `kubernetes_sd_configs`를 사용하는 모든 job에서 타겟이 생성되지 않음
3. `static_configs`를 사용하는 job들은 정상 작동

### 해결 방향
1. **단기 해결책**: 정적 타겟(`static_configs`) 사용
   - 장점: 즉시 작동, 네트워크 접근은 정상이므로 가능
   - 단점: 노드가 추가/제거되면 수동으로 설정 수정 필요

2. **장기 해결책**: Kubernetes ServiceDiscovery 문제 해결
   - TLS 인증서 검증 문제 해결 필요
   - CA 인증서 설정 또는 올바른 인증서 경로 설정

## 권장 사항

### 즉시 적용 가능한 해결책
`cadvisor-daemonset` job을 정적 타겟으로 변경:
```yaml
- job_name: cadvisor-daemonset
  static_configs:
    - targets:
        - 10.0.17.71:8080
        - 10.0.24.98:8080
      labels:
        job: cadvisor
        source: daemonset
```

### 근본 원인 해결 (추후)
1. Kubernetes API 서버의 CA 인증서 확인
2. Prometheus가 사용하는 인증서 경로 확인
3. `bearer_token_file`과 함께 올바른 CA 인증서 설정

## 확인 사항

### 추가로 확인해야 할 것들
1. 다른 Kubernetes ServiceDiscovery job들도 동일한 문제인지 확인
2. `kubernetes-pods-app-metrics` job도 타겟이 0개인지 확인
3. Prometheus가 사용하는 Kubernetes 토큰의 권한 확인

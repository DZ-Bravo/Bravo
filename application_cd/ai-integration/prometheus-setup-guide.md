# Prometheus 설정 가이드

## 현재 상태
- Prometheus: `10.0.0.40:9090`에서 실행 중
- Loki: `10.0.0.40:3100`에서 정상 작동 중 ✅
- 현재 스크랩 대상: prometheus, node-exporter만

## 설정 방법

### 1. Prometheus 설정 파일 업데이트

EC2 인스턴스(`bravo-monitoring`, `10.0.0.40`)에 접속하여:

```bash
# Prometheus 설정 파일 위치 확인 (일반적으로 /etc/prometheus/prometheus.yml 또는 /opt/prometheus/prometheus.yml)
sudo find / -name "prometheus.yml" -o -name "prometheus.yaml" 2>/dev/null

# 설정 파일 백업
sudo cp /etc/prometheus/prometheus.yml /etc/prometheus/prometheus.yml.backup

# 새 설정 파일 복사
sudo cp /home/bravo/LABs/application_cd/ai-integration/prometheus-config.yaml /etc/prometheus/prometheus.yml

# 또는 직접 편집
sudo vi /etc/prometheus/prometheus.yml
```

### 2. Kubernetes 인증 설정

EC2에서 Kubernetes 클러스터에 접근하려면:

```bash
# kubeconfig 파일이 있는지 확인
ls -la ~/.kube/config

# 없으면 생성 (EKS 클러스터 연결)
aws eks update-kubeconfig --name <cluster-name> --region ap-northeast-2

# 또는 ServiceAccount 토큰 사용 (권장)
# Prometheus가 Kubernetes API에 접근할 수 있도록 ServiceAccount 생성 필요
```

### 3. kubelet 메트릭 접근 설정

kubelet 메트릭에 접근하려면 인증이 필요합니다. 두 가지 방법:

#### 방법 1: ServiceAccount 토큰 사용 (권장)
```bash
# Kubernetes 클러스터에서 ServiceAccount 생성
kubectl create serviceaccount prometheus -n kube-system
kubectl create clusterrolebinding prometheus --clusterrole=cluster-admin --serviceaccount=kube-system:prometheus

# 토큰 추출
kubectl get secret -n kube-system $(kubectl get sa prometheus -n kube-system -o jsonpath='{.secrets[0].name}') -o jsonpath='{.data.token}' | base64 -d > /tmp/prometheus-token

# EC2에 토큰 복사
scp /tmp/prometheus-token bravo-monitoring@10.0.0.40:/var/run/secrets/kubernetes.io/serviceaccount/token
```

#### 방법 2: 직접 노드 IP로 접근 (간단하지만 보안상 권장하지 않음)
설정 파일에서 `bearer_token_file`을 제거하고 `insecure_skip_verify: true` 사용

### 4. Prometheus 재시작

```bash
# systemd 사용 시
sudo systemctl restart prometheus

# 또는 직접 실행 중인 경우
sudo pkill prometheus
sudo /usr/local/bin/prometheus --config.file=/etc/prometheus/prometheus.yml
```

### 5. 설정 확인

```bash
# Prometheus 웹 UI에서 확인
# http://10.0.0.40:9090/targets

# 또는 API로 확인
curl http://10.0.0.40:9090/api/v1/targets | jq

# cAdvisor 메트릭 확인
curl "http://10.0.0.40:9090/api/v1/query?query=container_cpu_usage_seconds_total" | jq
```

## 대안: 간단한 설정 (노드 IP 직접 접근)

EC2에서 직접 노드의 kubelet 메트릭에 접근하는 간단한 설정:

```yaml
scrape_configs:
  # 기존 설정...
  
  # cAdvisor 메트릭 (노드 IP 직접 접근)
  - job_name: cadvisor-node1
    scheme: https
    tls_config:
      insecure_skip_verify: true
    static_configs:
      - targets:
          - 10.0.17.71:10250
    metrics_path: /metrics/cadvisor
    
  - job_name: cadvisor-node2
    scheme: https
    tls_config:
      insecure_skip_verify: true
    static_configs:
      - targets:
          - 10.0.24.98:10250
    metrics_path: /metrics/cadvisor
```

주의: 이 방법은 kubelet이 외부 접근을 허용하는 경우에만 작동합니다.


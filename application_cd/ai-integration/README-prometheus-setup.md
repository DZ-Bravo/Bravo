# Prometheus & Loki 설정 가이드

## 현재 상태 확인

### ✅ Loki 서비스
- **상태**: 정상 작동 중
- **주소**: `http://10.0.0.40:3100`
- **확인**: `curl http://10.0.0.40:3100/ready` → `ready` 응답

### ⚠️ Prometheus 설정 필요
- **주소**: `http://10.0.0.40:9090`
- **현재 스크랩**: prometheus, node-exporter만
- **필요**: cAdvisor 메트릭 추가 필요

## 해결 방법

### 방법 1: Kubernetes API 서버를 통한 접근 (권장)

EC2에서 Kubernetes API 서버를 통해 노드 메트릭에 접근:

```bash
# EC2에 접속
ssh bravo-monitoring@10.0.0.40

# kubeconfig 설정 (EKS 클러스터 연결)
aws eks update-kubeconfig --name <cluster-name> --region ap-northeast-2

# Prometheus 설정 파일 수정
sudo vi /etc/prometheus/prometheus.yml
```

설정 파일에 다음 추가:

```yaml
scrape_configs:
  # 기존 설정...
  
  # Kubernetes API 서버를 통한 cAdvisor 메트릭
  - job_name: kubernetes-cadvisor
    kubernetes_sd_configs:
      - role: node
        kubeconfig_file: /root/.kube/config
    scheme: https
    tls_config:
      insecure_skip_verify: true
    relabel_configs:
      - source_labels: [__meta_kubernetes_node_name]
        target_label: __metrics_path__
        replacement: /api/v1/nodes/${1}/proxy/metrics/cadvisor
      - target_label: __address__
        replacement: <EKS-API-SERVER>:443
```

### 방법 2: 직접 노드 IP 접근 (간단하지만 인증 필요)

생성된 설정 파일 사용: `/home/bravo/LABs/application_cd/ai-integration/prometheus-config-simple.yaml`

```bash
# EC2에 접속
ssh bravo-monitoring@10.0.0.40

# 설정 파일 복사
sudo cp /home/bravo/LABs/application_cd/ai-integration/prometheus-config-simple.yaml /etc/prometheus/prometheus.yml

# Kubernetes ServiceAccount 토큰 생성 (kubelet 인증용)
kubectl create serviceaccount prometheus-scraper -n kube-system
kubectl create clusterrolebinding prometheus-scraper --clusterrole=system:node-reader --serviceaccount=kube-system:prometheus-scraper

# 토큰 추출
TOKEN=$(kubectl get secret -n kube-system $(kubectl get sa prometheus-scraper -n kube-system -o jsonpath='{.secrets[0].name}') -o jsonpath='{.data.token}' | base64 -d)

# EC2에 토큰 저장
echo "$TOKEN" | sudo tee /var/run/secrets/kubernetes.io/serviceaccount/token
sudo chmod 600 /var/run/secrets/kubernetes.io/serviceaccount/token

# 설정 파일에서 bearer_token_file 주석 해제
sudo sed -i 's|# bearer_token_file|bearer_token_file|' /etc/prometheus/prometheus.yml
sudo sed -i 's|# bearer_token_file|bearer_token_file|' /etc/prometheus/prometheus.yml

# Prometheus 재시작
sudo systemctl restart prometheus
```

### 방법 3: Kubernetes 클러스터 내부에 Prometheus 설치 (가장 권장)

EC2 대신 Kubernetes 클러스터 내부에 Prometheus를 설치하면 ServiceAccount를 사용하여 자동으로 인증됩니다.

## 설정 확인

### Prometheus 타겟 확인
```bash
curl http://10.0.0.40:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'
```

### cAdvisor 메트릭 확인
```bash
curl "http://10.0.0.40:9090/api/v1/query?query=container_cpu_usage_seconds_total" | jq
```

### Loki 확인
```bash
curl http://10.0.0.40:3100/ready
curl http://10.0.0.40:3100/loki/api/v1/labels
```

## 생성된 파일

1. **prometheus-config.yaml**: 전체 Kubernetes 서비스 디스커버리 설정
2. **prometheus-config-simple.yaml**: 간단한 노드 IP 직접 접근 설정
3. **prometheus-setup-guide.md**: 상세 설정 가이드
4. **prometheus-setup-instructions.sh**: 자동화 스크립트

## 다음 단계

1. EC2에 접속하여 Prometheus 설정 파일 업데이트
2. Prometheus 재시작
3. `http://10.0.0.40:9090/targets`에서 스크랩 상태 확인
4. 모니터링 페이지에서 컨테이너/파드 메트릭 확인


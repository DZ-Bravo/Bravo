# EC2 접속 후 작업 가이드

## 1단계: EC2 접속

```bash
# SSM Session Manager 사용 (권장)
aws ssm start-session --target i-060e76216c28aba5d --region ap-northeast-2

# 또는 SSH (키가 있다면)
ssh -i ~/.ssh/bravo-key.pem ec2-user@43.200.143.174
```

## 2단계: kubeconfig 설정

```bash
# EKS 클러스터 연결
aws eks update-kubeconfig --name <클러스터이름> --region ap-northeast-2

# 클러스터 이름 확인 (필요시)
aws eks list-clusters --region ap-northeast-2
```

## 3단계: Kubernetes 토큰 생성

```bash
# Prometheus가 사용할 토큰 생성
kubectl create token prometheus-scraper -n bravo-monitoring-ns --duration=8760h > /tmp/prometheus-k8s-token

# 토큰 파일 권한 설정
chmod 600 /tmp/prometheus-k8s-token

# 토큰 확인 (선택사항)
head -c 50 /tmp/prometheus-k8s-token
```

## 4단계: Prometheus 설정 파일 위치 확인

```bash
# 설정 파일 위치 찾기
sudo find /etc /opt -name prometheus.yml -o -name prometheus.yaml 2>/dev/null

# 일반적인 위치:
# /etc/prometheus/prometheus.yml
# 또는
# /opt/prometheus/prometheus.yml
```

## 5단계: 기존 설정 백업

```bash
# 설정 파일 변수에 저장 (위에서 찾은 경로 사용)
PROM_CONFIG="/etc/prometheus/prometheus.yml"  # 또는 찾은 경로

# 백업 생성
sudo cp $PROM_CONFIG ${PROM_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)

# 백업 확인
ls -lh ${PROM_CONFIG}.backup.*
```

## 6단계: 새 설정 파일 생성

```bash
# 새 설정 파일 생성 (기존 설정에 cAdvisor 설정 추가)
sudo tee -a $PROM_CONFIG << 'EOF'

  # Kubernetes cAdvisor 메트릭 - 노드 1
  - job_name: kubernetes-cadvisor-node1
    scheme: https
    tls_config:
      insecure_skip_verify: true
    static_configs:
      - targets:
          - CD954D03FD7521324954E667CB2450E9.yl4.ap-northeast-2.eks.amazonaws.com:443
    metrics_path: /api/v1/nodes/ip-10-0-17-71.ap-northeast-2.compute.internal/proxy/metrics/cadvisor
    bearer_token_file: /tmp/prometheus-k8s-token

  # Kubernetes cAdvisor 메트릭 - 노드 2
  - job_name: kubernetes-cadvisor-node2
    scheme: https
    tls_config:
      insecure_skip_verify: true
    static_configs:
      - targets:
          - CD954D03FD7521324954E667CB2450E9.yl4.ap-northeast-2.eks.amazonaws.com:443
    metrics_path: /api/v1/nodes/ip-10-0-24-98.ap-northeast-2.compute.internal/proxy/metrics/cadvisor
    bearer_token_file: /tmp/prometheus-k8s-token
EOF
```

**또는 전체 설정 파일 교체 (기존 설정이 간단한 경우):**

```bash
# 전체 설정 파일 다운로드 (로컬에서 생성된 파일)
# 또는 직접 편집
sudo vi $PROM_CONFIG
```

전체 설정 파일 내용:
```yaml
global:
  scrape_interval: 15s
  scrape_timeout: 10s
  evaluation_interval: 15s

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: [localhost:9090]

  - job_name: node-exporter
    static_configs:
      - targets: [localhost:9100]

  - job_name: kubernetes-cadvisor-node1
    scheme: https
    tls_config:
      insecure_skip_verify: true
    static_configs:
      - targets:
          - CD954D03FD7521324954E667CB2450E9.yl4.ap-northeast-2.eks.amazonaws.com:443
    metrics_path: /api/v1/nodes/ip-10-0-17-71.ap-northeast-2.compute.internal/proxy/metrics/cadvisor
    bearer_token_file: /tmp/prometheus-k8s-token

  - job_name: kubernetes-cadvisor-node2
    scheme: https
    tls_config:
      insecure_skip_verify: true
    static_configs:
      - targets:
          - CD954D03FD7521324954E667CB2450E9.yl4.ap-northeast-2.eks.amazonaws.com:443
    metrics_path: /api/v1/nodes/ip-10-0-24-98.ap-northeast-2.compute.internal/proxy/metrics/cadvisor
    bearer_token_file: /tmp/prometheus-k8s-token
```

## 7단계: 설정 파일 문법 확인

```bash
# Prometheus 설정 파일 검증 (Prometheus가 설치되어 있다면)
promtool check config $PROM_CONFIG

# 또는 설정 파일 확인
sudo cat $PROM_CONFIG | tail -20
```

## 8단계: Prometheus 재시작

```bash
# systemd 사용 시
sudo systemctl restart prometheus

# 또는 프로세스 재시작
sudo pkill -HUP prometheus

# 상태 확인
sudo systemctl status prometheus
```

## 9단계: 확인

```bash
# 타겟 상태 확인 (잠시 대기 후)
sleep 10
curl http://localhost:9090/api/v1/targets | python3 -m json.tool | grep -A 5 "kubernetes-cadvisor"

# 또는 웹 브라우저에서 확인
# http://10.0.0.40:9090/targets

# cAdvisor 메트릭 확인
curl "http://localhost:9090/api/v1/query?query=container_cpu_usage_seconds_total" | python3 -m json.tool | head -30
```

## 문제 해결

### 설정 파일 문법 오류가 있는 경우:
```bash
# 백업에서 복원
sudo cp ${PROM_CONFIG}.backup.* $PROM_CONFIG
sudo systemctl restart prometheus
```

### 토큰이 만료된 경우:
```bash
# 토큰 재생성
kubectl create token prometheus-scraper -n bravo-monitoring-ns --duration=8760h > /tmp/prometheus-k8s-token
chmod 600 /tmp/prometheus-k8s-token
sudo systemctl restart prometheus
```

### 타겟이 UP 상태가 아닌 경우:
```bash
# Prometheus 로그 확인
sudo journalctl -u prometheus -n 50
# 또는
sudo tail -f /var/log/prometheus/prometheus.log
```

## 완료 확인

성공하면 다음이 표시됩니다:
- `http://10.0.0.40:9090/targets`에서 `kubernetes-cadvisor-node1`, `kubernetes-cadvisor-node2`가 **UP** 상태
- `container_cpu_usage_seconds_total` 메트릭 쿼리 가능
- 모니터링 페이지에서 컨테이너/파드 메트릭 표시


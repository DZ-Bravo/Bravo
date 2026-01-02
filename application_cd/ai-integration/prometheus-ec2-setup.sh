#!/bin/bash
# EC2에서 실행할 Prometheus 설정 스크립트
# 이 스크립트는 EC2에 접속한 후 실행하거나, 다른 방법으로 전달해야 합니다

set -e

echo "=== Prometheus 설정 업데이트 ==="

# Prometheus 설정 파일 위치 확인
PROMETHEUS_CONFIG="/etc/prometheus/prometheus.yml"
if [ ! -f "$PROMETHEUS_CONFIG" ]; then
    PROMETHEUS_CONFIG="/opt/prometheus/prometheus.yml"
fi
if [ ! -f "$PROMETHEUS_CONFIG" ]; then
    echo "Prometheus 설정 파일을 찾을 수 없습니다."
    exit 1
fi

echo "Prometheus 설정 파일: $PROMETHEUS_CONFIG"

# 백업 생성
sudo cp "$PROMETHEUS_CONFIG" "${PROMETHEUS_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

# 새 설정 추가 (기존 설정에 추가)
cat >> "$PROMETHEUS_CONFIG" << 'EOF'

  # Kubernetes cAdvisor 메트릭 - 노드 1
  - job_name: kubernetes-cadvisor-node1
    scheme: https
    tls_config:
      insecure_skip_verify: true
    static_configs:
      - targets:
          - CD954D03FD7521324954E667CB2450E9.yl4.ap-northeast-2.eks.amazonaws.com:443
    metrics_path: /api/v1/nodes/ip-10-0-17-71.ap-northeast-2.compute.internal/proxy/metrics/cadvisor
    bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token

  # Kubernetes cAdvisor 메트릭 - 노드 2
  - job_name: kubernetes-cadvisor-node2
    scheme: https
    tls_config:
      insecure_skip_verify: true
    static_configs:
      - targets:
          - CD954D03FD7521324954E667CB2450E9.yl4.ap-northeast-2.eks.amazonaws.com:443
    metrics_path: /api/v1/nodes/ip-10-0-24-98.ap-northeast-2.compute.internal/proxy/metrics/cadvisor
    bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
EOF

# Kubernetes 토큰 저장 (스크립트에 포함된 토큰 사용)
# 또는 kubeconfig 파일 사용

# Prometheus 재시작
sudo systemctl restart prometheus || sudo pkill -HUP prometheus

echo "설정 완료!"


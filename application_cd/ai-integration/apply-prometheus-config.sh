#!/bin/bash
# Kubernetes를 통해 Prometheus 설정을 EC2에 적용하는 스크립트
# 이 스크립트는 EC2에 직접 접속할 수 없을 때 사용

set -e

echo "=== Prometheus 설정 적용 ==="

# 1. Kubernetes 토큰 생성
echo "1. ServiceAccount 토큰 생성 중..."
kubectl create serviceaccount prometheus-scraper -n bravo-monitoring-ns --dry-run=client -o yaml | kubectl apply -f -
kubectl create clusterrole prometheus-scraper --verb=get,list,watch --resource=nodes,nodes/metrics,nodes/proxy,pods --dry-run=client -o yaml | kubectl apply -f -
kubectl create clusterrolebinding prometheus-scraper --clusterrole=prometheus-scraper --serviceaccount=bravo-monitoring-ns:prometheus-scraper --dry-run=client -o yaml | kubectl apply -f -

# 2. 토큰 추출
SECRET_NAME=$(kubectl get sa prometheus-scraper -n bravo-monitoring-ns -o jsonpath='{.secrets[0].name}')
if [ -z "$SECRET_NAME" ]; then
    echo "Secret을 찾을 수 없습니다. 잠시 후 다시 시도..."
    sleep 5
    SECRET_NAME=$(kubectl get sa prometheus-scraper -n bravo-monitoring-ns -o jsonpath='{.secrets[0].name}')
fi

TOKEN=$(kubectl get secret $SECRET_NAME -n bravo-monitoring-ns -o jsonpath='{.data.token}' | base64 -d)
echo "토큰 생성 완료 (길이: ${#TOKEN})"

# 3. 설정 파일 생성 (토큰 포함)
cat > /tmp/prometheus-config-with-token.yaml << EOF
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
EOF

echo "설정 파일 생성 완료: /tmp/prometheus-config-with-token.yaml"
echo "토큰 파일 생성 완료: /tmp/prometheus-k8s-token"
echo "$TOKEN" > /tmp/prometheus-k8s-token

echo ""
echo "=== 다음 단계 ==="
echo "EC2 (10.0.0.40)에 접속하여 다음 명령 실행:"
echo ""
echo "1. 설정 파일 복사:"
echo "   scp /tmp/prometheus-config-with-token.yaml ec2-user@43.200.143.174:/tmp/"
echo "   scp /tmp/prometheus-k8s-token ec2-user@43.200.143.174:/tmp/"
echo ""
echo "2. EC2에서 실행:"
echo "   sudo cp /tmp/prometheus-config-with-token.yaml /etc/prometheus/prometheus.yml"
echo "   sudo cp /tmp/prometheus-k8s-token /tmp/prometheus-k8s-token"
echo "   sudo chmod 600 /tmp/prometheus-k8s-token"
echo "   sudo systemctl restart prometheus"

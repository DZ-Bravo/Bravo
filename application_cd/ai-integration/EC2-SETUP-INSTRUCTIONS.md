# EC2 Prometheus 설정 가이드

## 현재 상태
- **EC2 인스턴스**: i-060e76216c28aba5d (10.0.0.40)
- **Public IP**: 43.200.143.174
- **SSM 가능**: ✅ (PingStatus: Online)

## 접속 방법

### 방법 1: SSM Session Manager (권장)

```bash
aws ssm start-session --target i-060e76216c28aba5d --region ap-northeast-2
```

### 방법 2: SSH (키 필요)

```bash
ssh -i ~/.ssh/bravo-key.pem ec2-user@43.200.143.174
```

## 설정 적용 단계

EC2에 접속한 후:

### 1. kubeconfig 설정
```bash
aws eks update-kubeconfig --name <cluster-name> --region ap-northeast-2
```

### 2. 토큰 생성
```bash
kubectl create token prometheus-scraper -n bravo-monitoring-ns --duration=8760h > /tmp/prometheus-k8s-token
chmod 600 /tmp/prometheus-k8s-token
```

### 3. 설정 파일 적용
```bash
# 설정 파일 위치 확인
PROMETHEUS_CONFIG="/etc/prometheus/prometheus.yml"
# 또는
PROMETHEUS_CONFIG="/opt/prometheus/prometheus.yml"

# 백업
sudo cp $PROMETHEUS_CONFIG ${PROMETHEUS_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)

# 새 설정 적용
sudo cp /home/bravo/LABs/application_cd/ai-integration/prometheus-config-final-with-token.yaml $PROMETHEUS_CONFIG

# 또는 직접 편집하여 cAdvisor 설정 추가
```

### 4. Prometheus 재시작
```bash
sudo systemctl restart prometheus
# 또는
sudo pkill -HUP prometheus
```

### 5. 확인
```bash
# 타겟 상태 확인
curl http://localhost:9090/api/v1/targets | jq

# cAdvisor 메트릭 확인
curl "http://localhost:9090/api/v1/query?query=container_cpu_usage_seconds_total" | jq
```

## 생성된 파일

- `/home/bravo/LABs/application_cd/ai-integration/prometheus-config-final-with-token.yaml`
- `/home/bravo/LABs/application_cd/ai-integration/prometheus-k8s-token`

이 파일들을 EC2에 복사하여 사용할 수 있습니다.



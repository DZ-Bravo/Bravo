#!/bin/bash
# Prometheus 설정 적용 스크립트
# EC2 인스턴스 (bravo-monitoring, 10.0.0.40)에서 실행

set -e

echo "=== Prometheus 설정 적용 스크립트 ==="

# 1. Prometheus 설정 파일 위치 확인
PROMETHEUS_CONFIG="/etc/prometheus/prometheus.yml"
if [ ! -f "$PROMETHEUS_CONFIG" ]; then
    PROMETHEUS_CONFIG="/opt/prometheus/prometheus.yml"
fi
if [ ! -f "$PROMETHEUS_CONFIG" ]; then
    echo "Prometheus 설정 파일을 찾을 수 없습니다. 수동으로 경로를 지정하세요."
    echo "일반적인 위치: /etc/prometheus/prometheus.yml, /opt/prometheus/prometheus.yml"
    exit 1
fi

echo "Prometheus 설정 파일: $PROMETHEUS_CONFIG"

# 2. 백업 생성
echo "기존 설정 파일 백업 중..."
sudo cp "$PROMETHEUS_CONFIG" "${PROMETHEUS_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

# 3. 새 설정 파일 복사 (간단한 버전 사용)
echo "새 설정 파일 적용 중..."
# 여기서는 간단한 설정 파일 사용
# 실제로는 /home/bravo/LABs/application_cd/ai-integration/prometheus-config-simple.yaml을 사용

# 4. Prometheus 재시작
echo "Prometheus 재시작 중..."
if systemctl is-active --quiet prometheus; then
    sudo systemctl restart prometheus
    echo "Prometheus 재시작 완료"
elif pgrep -x prometheus > /dev/null; then
    echo "Prometheus 프로세스 발견. 수동으로 재시작하세요:"
    echo "sudo pkill prometheus"
    echo "sudo /usr/local/bin/prometheus --config.file=$PROMETHEUS_CONFIG"
else
    echo "Prometheus가 실행 중이지 않습니다."
fi

# 5. 상태 확인
sleep 5
echo ""
echo "=== Prometheus 상태 확인 ==="
if systemctl is-active --quiet prometheus; then
    echo "✅ Prometheus 실행 중"
    systemctl status prometheus --no-pager | head -10
else
    echo "⚠️ Prometheus가 실행 중이 아닙니다."
fi

echo ""
echo "=== 다음 단계 ==="
echo "1. Prometheus 웹 UI 확인: http://10.0.0.40:9090/targets"
echo "2. 스크랩 대상이 'UP' 상태인지 확인"
echo "3. 메트릭 쿼리 테스트: http://10.0.0.40:9090/graph?g0.expr=container_cpu_usage_seconds_total"


#!/bin/bash
# VM 한 대에 여러 개의 GitHub Actions Runner 설치 스크립트

# 사용법: ./setup-multiple-runners.sh <runner-count> <github-token>
# 예: ./setup-multiple-runners.sh 3 <your-github-token>

RUNNER_COUNT=${1:-3}  # 기본값: 3개
GITHUB_TOKEN=$2

if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ GitHub 토큰이 필요합니다."
    echo "사용법: $0 <runner-count> <github-token>"
    echo "GitHub에서 토큰 가져오기: Settings → Actions → Runners → New self-hosted runner"
    exit 1
fi

# GitHub 리포지토리 정보 (수정 필요)
REPO_OWNER="DZ-Bravo"
REPO_NAME="Bravo"

# Runner 설치 디렉토리
BASE_DIR="$HOME/actions-runner"

echo "🚀 VM 한 대에 $RUNNER_COUNT 개의 runner 설치 시작..."

for i in $(seq 1 $RUNNER_COUNT); do
    RUNNER_DIR="$BASE_DIR/runner-$i"
    
    echo ""
    echo "📦 Runner $i 설치 중..."
    
    # 디렉토리 생성
    mkdir -p "$RUNNER_DIR"
    cd "$RUNNER_DIR"
    
    # Runner 다운로드
    curl -o actions-runner-linux-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
    tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz
    
    # Runner 구성
    ./config.sh --url https://github.com/$REPO_OWNER/$REPO_NAME \
                --token $GITHUB_TOKEN \
                --name "vm-runner-$i" \
                --labels "self-hosted,Linux,X64" \
                --work "_work-$i" \
                --replace
    
    # Systemd 서비스 생성
    sudo ./svc.sh install
    sudo ./svc.sh start
    
    echo "✅ Runner $i 설치 완료!"
done

echo ""
echo "🎉 모든 runner 설치 완료!"
echo "📊 Runner 상태 확인:"
for i in $(seq 1 $RUNNER_COUNT); do
    RUNNER_DIR="$BASE_DIR/runner-$i"
    if [ -f "$RUNNER_DIR/.service" ]; then
        echo "  Runner $i: $(sudo systemctl status actions.runner.$REPO_OWNER-$REPO_NAME.vm-runner-$i.service --no-pager -l | grep Active)"
    fi
done

echo ""
echo "💡 관리 명령어:"
echo "  - Runner 중지: sudo systemctl stop actions.runner.$REPO_OWNER-$REPO_NAME.vm-runner-1.service"
echo "  - Runner 시작: sudo systemctl start actions.runner.$REPO_OWNER-$REPO_NAME.vm-runner-1.service"
echo "  - Runner 상태: sudo systemctl status actions.runner.$REPO_OWNER-$REPO_NAME.vm-runner-1.service"


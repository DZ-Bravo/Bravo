# SSM Session Manager 플러그인 설치 가이드

## 현재 상황
- 모니터링 EC2: `i-060e76216c28aba5d` (10.0.0.40)
- SSM Session Manager 플러그인이 설치되어 있지 않음

## 플러그인 설치 방법

### 방법 1: Ubuntu/Debian 시스템

```bash
# 1. 플러그인 다운로드
curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o /tmp/session-manager-plugin.deb

# 2. 설치
sudo dpkg -i /tmp/session-manager-plugin.deb

# 3. 확인
session-manager-plugin
```

### 방법 2: Amazon Linux 2 / RHEL / CentOS

```bash
# 1. 플러그인 다운로드
curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux_64bit/session-manager-plugin.rpm" -o /tmp/session-manager-plugin.rpm

# 2. 설치
sudo yum install -y /tmp/session-manager-plugin.rpm

# 또는
sudo rpm -ivh /tmp/session-manager-plugin.rpm

# 3. 확인
session-manager-plugin
```

### 방법 3: macOS

```bash
# Homebrew 사용
brew install --cask session-manager-plugin

# 또는 수동 설치
curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/mac_arm64/session-manager-plugin.pkg" -o /tmp/session-manager-plugin.pkg
sudo installer -pkg /tmp/session-manager-plugin.pkg -target /
```

### 방법 4: 수동 설치 (모든 Linux)

```bash
# 1. 다운로드
curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux_64bit/session-manager-plugin.rpm" -o /tmp/session-manager-plugin.rpm

# 2. 압축 해제 (rpm 파일이 아닌 경우)
mkdir -p /tmp/session-manager-plugin
cd /tmp/session-manager-plugin
rpm2cpio /tmp/session-manager-plugin.rpm | cpio -idmv

# 3. 바이너리 복사
sudo cp usr/local/sessionmanagerplugin/bin/session-manager-plugin /usr/local/bin/
sudo chmod +x /usr/local/bin/session-manager-plugin

# 4. 확인
session-manager-plugin
```

## 설치 후 EC2 접속

```bash
# 모니터링 EC2 접속
aws ssm start-session --target i-060e76216c28aba5d --region ap-northeast-2
```

## 대안: SSH 사용 (키가 있는 경우)

SSM 플러그인 설치가 어렵다면, SSH 키를 사용할 수 있습니다:

```bash
# Public IP로 접속
ssh -i ~/.ssh/bravo-key.pem ec2-user@43.200.143.174

# 또는 Private IP (같은 VPC 내에서)
ssh -i ~/.ssh/bravo-key.pem ec2-user@10.0.0.40
```

## 문제 해결

### 플러그인 설치 후에도 작동하지 않는 경우:

```bash
# PATH 확인
which session-manager-plugin

# 수동으로 PATH 추가 (필요시)
export PATH=$PATH:/usr/local/bin
```

### 권한 문제가 있는 경우:

```bash
# 실행 권한 부여
sudo chmod +x /usr/local/bin/session-manager-plugin
```


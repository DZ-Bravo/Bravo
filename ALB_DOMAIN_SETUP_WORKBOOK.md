# ALB 도메인 설정 및 보안 강화 워크북

## 개요

이 워크북은 다음 두 가지 주요 작업을 다룹니다:
1. **보안 강화**: SSH 포트(22) 인그레스 규칙 제거 → SSM Session Manager 사용
2. **IP 노출 방지**: GitLab, Grafana, Prometheus를 ALB를 통한 도메인 접속으로 전환

---

## 1. 보안 강화: SSH 인그레스 규칙 제거

### 1.1 배경
- 기존: SSH 포트(22)를 통한 직접 접속 → 보안 취약점
- 개선: SSM Session Manager 사용 → IAM 기반 인증, 감사 로그 자동 기록

### 1.2 제거 대상 보안 그룹
- `bravo-gitlab-sg` (GitLab EC2)
- `bravo-monitoring-sg` (Monitoring EC2 - Grafana/Prometheus)
- `bravo-mongodb-sg` (MongoDB EC2)
- `bravo-elasticsearch-redis-monstache-kibana-sg` (Elasticsearch/Redis/Monstache/Kibana EC2)

### 1.3 SSH 인그레스 규칙 제거 명령어

```bash
# 보안 그룹 ID 확인
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=bravo-gitlab-sg,bravo-monitoring-sg,bravo-mongodb-sg,bravo-elasticsearch-redis-monstache-kibana-sg" \
  --query 'SecurityGroups[*].[GroupName,GroupId]' \
  --output table

# GitLab 보안 그룹에서 SSH 포트 제거 (인터넷 전체)
aws ec2 revoke-security-group-ingress \
  --group-id sg-08923ba3063d19c11 \
  --protocol tcp \
  --port 22 \
  --cidr 0.0.0.0/0

# Monitoring 보안 그룹에서 SSH 포트 제거 (인터넷 전체)
aws ec2 revoke-security-group-ingress \
  --group-id sg-0d9465898709aa59b \
  --protocol tcp \
  --port 22 \
  --cidr 0.0.0.0/0

# MongoDB 보안 그룹에서 SSH 포트 제거 (VPC 내부)
aws ec2 revoke-security-group-ingress \
  --group-id sg-0732e19e55932546c \
  --protocol tcp \
  --port 22 \
  --cidr 10.0.0.0/16

# Elasticsearch/Redis/Monstache/Kibana 보안 그룹에서 SSH 포트 제거 (VPC 내부)
aws ec2 revoke-security-group-ingress \
  --group-id sg-07b974728d9361032 \
  --protocol tcp \
  --port 22 \
  --cidr 10.0.0.0/16
```

### 1.4 CloudFormation 템플릿 업데이트

`cloudformation/infrastructure(eks,alb-plus).yaml` 파일에서 다음 보안 그룹의 `SecurityGroupIngress`에서 SSH 포트(22) 규칙 제거:

```yaml
# GitLabSecurityGroup
GitLabSecurityGroup:
  Type: AWS::EC2::SecurityGroup
  Properties:
    # ... 기존 설정 ...
    SecurityGroupIngress:
      # SSH 포트 제거됨
      - IpProtocol: tcp
        FromPort: 80
        ToPort: 80
        CidrIp: 0.0.0.0/0
        Description: HTTP
      - IpProtocol: tcp
        FromPort: 443
        ToPort: 443
        CidrIp: 0.0.0.0/0
        Description: HTTPS

# MonitoringSecurityGroup
MonitoringSecurityGroup:
  Type: AWS::EC2::SecurityGroup
  Properties:
    # ... 기존 설정 ...
    SecurityGroupIngress:
      # SSH 포트 제거됨
      - IpProtocol: tcp
        FromPort: 3000
        ToPort: 3000
        CidrIp: 0.0.0.0/0
        Description: Grafana
      # ... 기타 포트 ...

# MongoDBSecurityGroup
MongoDBSecurityGroup:
  Type: AWS::EC2::SecurityGroup
  Properties:
    # ... 기존 설정 ...
    SecurityGroupIngress: []  # SSH 포트 제거됨, MongoDB 포트는 별도 SecurityGroupIngress 리소스로 관리
```

### 1.5 SSM Session Manager 접속 방법

SSH 포트 제거 후, EC2 인스턴스 접속은 SSM Session Manager를 사용:

```bash
# AWS 콘솔에서
# EC2 → 인스턴스 선택 → "연결" → "Session Manager" 탭

# AWS CLI에서
aws ssm start-session --target i-0d0c6acd460aeb9e9  # GitLab 인스턴스
aws ssm start-session --target i-060e76216c28aba5d  # Monitoring 인스턴스
```

---

## 2. ALB를 통한 도메인 설정 (IP 노출 방지)

### 2.1 배경
- 기존: Elastic IP를 통한 직접 접속 → IP 주소 노출, 보안 취약
- 개선: ALB + Route53 도메인 → IP 숨김, SSL/TLS 암호화, 중앙 집중식 관리

### 2.2 설정 대상 서비스
- **GitLab**: `gitlab.hiker-cloud.site` (포트 80)
- **Grafana**: `grafana.hiker-cloud.site` (포트 3000)
- **Prometheus**: `prometheus.hiker-cloud.site` (포트 9090)

### 2.3 사전 요구사항 확인

```bash
# 1. ALB 존재 확인
aws elbv2 describe-load-balancers \
  --names hiker-cloud-alb \
  --query 'LoadBalancers[0].{Name:LoadBalancerName,DNS:DNSName,ARN:LoadBalancerArn}' \
  --output table

# 2. SSL 인증서 확인 (와일드카드 또는 서브도메인 포함)
aws acm list-certificates \
  --query 'CertificateSummaryList[?contains(DomainName, `hiker-cloud.site`)].[CertificateArn,DomainName]' \
  --output table

# 3. Route53 호스팅 영역 확인
aws route53 list-hosted-zones \
  --query "HostedZones[?contains(Name, 'hiker-cloud.site')].{Name:Name,Id:Id}" \
  --output table

# 4. EC2 인스턴스 정보 확인
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=bravo-gitlab,bravo-monitoring" \
  --query 'Reservations[*].Instances[*].[Tags[?Key==`Name`].Value|[0],InstanceId,PrivateIpAddress,State.Name]' \
  --output table
```

### 2.4 타겟 그룹 생성

```bash
# VPC ID 확인
VPC_ID=$(aws ec2 describe-vpcs \
  --filters 'Name=tag:Name,Values=bravo-vpc' \
  --query 'Vpcs[0].VpcId' \
  --output text)

# 1. GitLab 타겟 그룹 생성 (포트 80)
aws elbv2 create-target-group \
  --name gitlab-tg \
  --protocol HTTP \
  --port 80 \
  --vpc-id $VPC_ID \
  --health-check-path / \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --target-type instance

# 2. Grafana 타겟 그룹 생성 (포트 3000)
aws elbv2 create-target-group \
  --name grafana-tg \
  --protocol HTTP \
  --port 3000 \
  --vpc-id $VPC_ID \
  --health-check-path /api/health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --target-type instance

# 3. Prometheus 타겟 그룹 생성 (포트 9090)
aws elbv2 create-target-group \
  --name prometheus-tg \
  --protocol HTTP \
  --port 9090 \
  --vpc-id $VPC_ID \
  --health-check-path /-/healthy \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --target-type instance
```

**생성된 타겟 그룹 ARN 저장:**
```bash
GITLAB_TG_ARN=$(aws elbv2 describe-target-groups \
  --names gitlab-tg \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)

GRAFANA_TG_ARN=$(aws elbv2 describe-target-groups \
  --names grafana-tg \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)

PROMETHEUS_TG_ARN=$(aws elbv2 describe-target-groups \
  --names prometheus-tg \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)
```

### 2.5 타겟 그룹에 인스턴스 등록

```bash
# GitLab 인스턴스 등록
aws elbv2 register-targets \
  --target-group-arn $GITLAB_TG_ARN \
  --targets Id=i-0d0c6acd460aeb9e9

# Monitoring 인스턴스 등록 (Grafana와 Prometheus 모두 동일 인스턴스)
aws elbv2 register-targets \
  --target-group-arn $GRAFANA_TG_ARN \
  --targets Id=i-060e76216c28aba5d

aws elbv2 register-targets \
  --target-group-arn $PROMETHEUS_TG_ARN \
  --targets Id=i-060e76216c28aba5d
```

### 2.6 ALB 리스너 규칙 추가

```bash
# ALB ARN 및 리스너 ARN 확인
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names hiker-cloud-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)

HTTPS_LISTENER_ARN=$(aws elbv2 describe-listeners \
  --load-balancer-arn $ALB_ARN \
  --query 'Listeners[?Port==`443`].ListenerArn' \
  --output text)

HTTP_LISTENER_ARN=$(aws elbv2 describe-listeners \
  --load-balancer-arn $ALB_ARN \
  --query 'Listeners[?Port==`80`].ListenerArn' \
  --output text)
```

#### 2.6.1 HTTPS 리스너 규칙 (호스트 기반 라우팅)

```bash
# GitLab 규칙 (Priority: 100)
aws elbv2 create-rule \
  --listener-arn $HTTPS_LISTENER_ARN \
  --priority 100 \
  --conditions Field=host-header,Values=gitlab.hiker-cloud.site \
  --actions Type=forward,TargetGroupArn=$GITLAB_TG_ARN

# Grafana 규칙 (Priority: 101)
aws elbv2 create-rule \
  --listener-arn $HTTPS_LISTENER_ARN \
  --priority 101 \
  --conditions Field=host-header,Values=grafana.hiker-cloud.site \
  --actions Type=forward,TargetGroupArn=$GRAFANA_TG_ARN

# Prometheus 규칙 (Priority: 102)
aws elbv2 create-rule \
  --listener-arn $HTTPS_LISTENER_ARN \
  --priority 102 \
  --conditions Field=host-header,Values=prometheus.hiker-cloud.site \
  --actions Type=forward,TargetGroupArn=$PROMETHEUS_TG_ARN
```

#### 2.6.2 HTTP 리스너 규칙 (HTTPS 리다이렉트)

```bash
# GitLab HTTP → HTTPS 리다이렉트
aws elbv2 create-rule \
  --listener-arn $HTTP_LISTENER_ARN \
  --priority 100 \
  --conditions Field=host-header,Values=gitlab.hiker-cloud.site \
  --actions Type=redirect,RedirectConfig='{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}'

# Grafana HTTP → HTTPS 리다이렉트
aws elbv2 create-rule \
  --listener-arn $HTTP_LISTENER_ARN \
  --priority 101 \
  --conditions Field=host-header,Values=grafana.hiker-cloud.site \
  --actions Type=redirect,RedirectConfig='{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}'

# Prometheus HTTP → HTTPS 리다이렉트
aws elbv2 create-rule \
  --listener-arn $HTTP_LISTENER_ARN \
  --priority 102 \
  --conditions Field=host-header,Values=prometheus.hiker-cloud.site \
  --actions Type=redirect,RedirectConfig='{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}'
```

### 2.7 Route53 DNS 레코드 추가

```bash
# ALB DNS 이름 확인
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --names hiker-cloud-alb \
  --query 'LoadBalancers[0].DNSName' \
  --output text)

# Route53 호스팅 영역 ID
HOSTED_ZONE_ID=Z08645032AQN4YZ1T1QIP

# ALB Hosted Zone ID (ap-northeast-2 리전)
ALB_HOSTED_ZONE_ID=ZWKZPGTI48KDX

# GitLab A 레코드 추가
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "gitlab.hiker-cloud.site",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "'$ALB_DNS'",
          "EvaluateTargetHealth": false,
          "HostedZoneId": "'$ALB_HOSTED_ZONE_ID'"
        }
      }
    }]
  }'

# Grafana A 레코드 추가
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "grafana.hiker-cloud.site",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "'$ALB_DNS'",
          "EvaluateTargetHealth": false,
          "HostedZoneId": "'$ALB_HOSTED_ZONE_ID'"
        }
      }
    }]
  }'

# Prometheus A 레코드 추가
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "prometheus.hiker-cloud.site",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "'$ALB_DNS'",
          "EvaluateTargetHealth": false,
          "HostedZoneId": "'$ALB_HOSTED_ZONE_ID'"
        }
      }
    }]
  }'
```

### 2.8 보안 그룹 규칙 추가

ALB에서 EC2 인스턴스로의 트래픽을 허용하기 위해 보안 그룹 규칙 추가:

```bash
# ALB 보안 그룹 ID 확인
ALB_SG_ID=$(aws elbv2 describe-load-balancers \
  --names hiker-cloud-alb \
  --query 'LoadBalancers[0].SecurityGroups[0]' \
  --output text)

# Monitoring 보안 그룹 ID
MONITORING_SG_ID=$(aws ec2 describe-security-groups \
  --filters 'Name=group-name,Values=bravo-monitoring-sg' \
  --query 'SecurityGroups[0].GroupId' \
  --output text)

# GitLab 보안 그룹 ID
GITLAB_SG_ID=$(aws ec2 describe-security-groups \
  --filters 'Name=group-name,Values=bravo-gitlab-sg' \
  --query 'SecurityGroups[0].GroupId' \
  --output text)

# Grafana 포트 3000 허용
aws ec2 authorize-security-group-ingress \
  --group-id $MONITORING_SG_ID \
  --ip-permissions IpProtocol=tcp,FromPort=3000,ToPort=3000,UserIdGroupPairs=[{GroupId=$ALB_SG_ID}]

# Prometheus 포트 9090 허용
aws ec2 authorize-security-group-ingress \
  --group-id $MONITORING_SG_ID \
  --ip-permissions IpProtocol=tcp,FromPort=9090,ToPort=9090,UserIdGroupPairs=[{GroupId=$ALB_SG_ID}]

# GitLab 포트 80 허용
aws ec2 authorize-security-group-ingress \
  --group-id $GITLAB_SG_ID \
  --ip-permissions IpProtocol=tcp,FromPort=80,ToPort=80,UserIdGroupPairs=[{GroupId=$ALB_SG_ID}]
```

---

## 3. 설정 확인

### 3.1 타겟 그룹 상태 확인

```bash
# GitLab 타겟 그룹 상태
aws elbv2 describe-target-health \
  --target-group-arn $GITLAB_TG_ARN \
  --query 'TargetHealthDescriptions[*].{Target:Target.Id,Port:Target.Port,State:TargetHealth.State}' \
  --output table

# Grafana 타겟 그룹 상태
aws elbv2 describe-target-health \
  --target-group-arn $GRAFANA_TG_ARN \
  --query 'TargetHealthDescriptions[*].{Target:Target.Id,Port:Target.Port,State:TargetHealth.State}' \
  --output table

# Prometheus 타겟 그룹 상태
aws elbv2 describe-target-health \
  --target-group-arn $PROMETHEUS_TG_ARN \
  --query 'TargetHealthDescriptions[*].{Target:Target.Id,Port:Target.Port,State:TargetHealth.State}' \
  --output table
```

### 3.2 ALB 리스너 규칙 확인

```bash
# HTTPS 리스너 규칙 확인
aws elbv2 describe-rules \
  --listener-arn $HTTPS_LISTENER_ARN \
  --query 'Rules[*].{Priority:Priority,Conditions:Conditions[0].Values[0],Actions:Actions[0].TargetGroupArn}' \
  --output table

# HTTP 리스너 규칙 확인
aws elbv2 describe-rules \
  --listener-arn $HTTP_LISTENER_ARN \
  --query 'Rules[*].{Priority:Priority,Conditions:Conditions[0].Values[0],Actions:Actions[0].Type}' \
  --output table
```

### 3.3 Route53 레코드 확인

```bash
# DNS 레코드 확인
aws route53 list-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --query "ResourceRecordSets[?contains(Name, 'gitlab') || contains(Name, 'grafana') || contains(Name, 'prometheus')].{Name:Name,Type:Type,AliasTarget:AliasTarget.DNSName}" \
  --output table
```

### 3.4 접속 테스트

```bash
# DNS 전파 확인 (몇 분 소요될 수 있음)
nslookup gitlab.hiker-cloud.site
nslookup grafana.hiker-cloud.site
nslookup prometheus.hiker-cloud.site

# HTTPS 접속 테스트
curl -I https://gitlab.hiker-cloud.site
curl -I https://grafana.hiker-cloud.site
curl -I https://prometheus.hiker-cloud.site

# HTTP → HTTPS 리다이렉트 테스트
curl -I http://gitlab.hiker-cloud.site
curl -I http://grafana.hiker-cloud.site
curl -I http://prometheus.hiker-cloud.site
```

---

## 4. 최종 접속 URL

설정 완료 후 다음 URL로 접속 가능:

- **GitLab**: https://gitlab.hiker-cloud.site
- **Grafana**: https://grafana.hiker-cloud.site
- **Prometheus**: https://prometheus.hiker-cloud.site

**참고:**
- HTTP 요청은 자동으로 HTTPS로 리다이렉트됩니다.
- DNS 전파에는 몇 분이 소요될 수 있습니다.
- SSL 인증서가 와일드카드(`*.hiker-cloud.site`)를 포함하는지 확인하세요.

---

## 5. 트러블슈팅

### 5.1 타겟 그룹이 unhealthy 상태인 경우

```bash
# 헬스체크 경로 확인 및 수정
aws elbv2 modify-target-group \
  --target-group-arn $GITLAB_TG_ARN \
  --health-check-path /users/sign_in  # GitLab의 경우 로그인 페이지 사용

# 헬스체크 상태 확인
aws elbv2 describe-target-health \
  --target-group-arn $GITLAB_TG_ARN
```

### 5.2 SSL 인증서 오류

와일드카드 인증서가 없는 경우, 서브도메인용 인증서를 생성하거나 기존 인증서에 추가:

```bash
# ACM에서 인증서 확인
aws acm list-certificates \
  --query 'CertificateSummaryList[?contains(DomainName, `hiker-cloud.site`)]' \
  --output table

# 필요시 새 인증서 요청 (Route53 DNS 검증 사용)
aws acm request-certificate \
  --domain-name *.hiker-cloud.site \
  --validation-method DNS \
  --subject-alternative-names hiker-cloud.site
```

### 5.3 보안 그룹 규칙 확인

```bash
# Monitoring 보안 그룹 인그레스 규칙 확인
aws ec2 describe-security-groups \
  --group-ids $MONITORING_SG_ID \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`3000` || FromPort==`9090`]' \
  --output json

# GitLab 보안 그룹 인그레스 규칙 확인
aws ec2 describe-security-groups \
  --group-ids $GITLAB_SG_ID \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`80`]' \
  --output json
```

---

## 6. 보안 개선 효과

### 6.1 SSH 포트 제거
- ✅ 공격 표면 축소: SSH 포트 노출 제거
- ✅ IAM 기반 인증: SSM Session Manager 사용
- ✅ 자동 감사 로그: 모든 세션 기록
- ✅ 키 관리 불필요: SSH 키 관리 제거

### 6.2 ALB 도메인 설정
- ✅ IP 주소 숨김: Elastic IP 직접 노출 방지
- ✅ SSL/TLS 암호화: HTTPS 강제
- ✅ 중앙 집중식 관리: ALB를 통한 통합 관리
- ✅ 로드 밸런싱: 향후 확장성 확보
- ✅ WAF 통합 가능: AWS WAF 연동 가능

---

## 7. 참고 자료

- [AWS Systems Manager Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)
- [Application Load Balancer 리스너 규칙](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-authenticate-users.html)
- [Route53 별칭 레코드](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-choosing-alias-non-alias.html)
- [ACM 인증서 관리](https://docs.aws.amazon.com/acm/latest/userguide/acm-overview.html)


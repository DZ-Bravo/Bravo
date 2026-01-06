# DKIM DNS 레코드 복구 가이드

## 문제 상황

AWS SES에서 다음 메일을 받았습니다:
> "We detected that the DNS records required for the DKIM setup of hiker-cloud.site are no longer present in your DNS settings."

DKIM DNS 레코드가 없어서 이메일 전송이 일시 중단되었습니다.

## 해결 방법

### 1단계: AWS SES 콘솔 접속

1. AWS 콘솔에 로그인
2. 리전 선택: **ap-northeast-2 (Seoul)**
3. 검색창에 "SES" 또는 "Simple Email Service" 입력
4. Simple Email Service 선택

직접 URL:
```
https://ap-northeast-2.console.aws.amazon.com/ses/home?region=ap-northeast-2
```

### 2단계: Verified identities 확인

1. 좌측 메뉴에서 **"Verified identities"** 클릭
2. `hiker-cloud.site` 도메인 찾기
3. 도메인을 클릭하여 상세 페이지로 이동

### 3단계: DKIM 설정 확인

1. 도메인 상세 페이지에서 **"DKIM"** 탭 클릭
2. **"DKIM signing"** 섹션 확인
3. 현재 상태가 **"Disabled"** 또는 **"Pending verification"**인지 확인

### 4단계: DKIM DNS 레코드 확인

1. **"DKIM records"** 섹션에서 3개의 CNAME 레코드 확인
2. 각 레코드는 다음과 같은 형식:
   ```
   _domainkey.hiker-cloud.site
   ```
3. 각 레코드의 **Name**과 **Value**를 복사

예시:
- Name: `xxxxx._domainkey.hiker-cloud.site`
- Value: `xxxxx.dkim.amazonses.com`

### 5단계: DNS 레코드 추가

도메인 관리 콘솔(예: Route 53, Cloudflare 등)에서:

1. DNS 레코드 추가 페이지로 이동
2. **CNAME 레코드** 추가
3. AWS SES에서 제공한 3개의 CNAME 레코드를 모두 추가:
   - Type: **CNAME**
   - Name: AWS에서 제공한 Name (예: `xxxxx._domainkey.hiker-cloud.site`)
   - Value: AWS에서 제공한 Value (예: `xxxxx.dkim.amazonses.com`)
   - TTL: 300 (또는 기본값)

### 6단계: DNS 전파 대기

- DNS 레코드 추가 후 전파까지 **5분 ~ 24시간** 소요
- 일반적으로 **5-10분** 내에 전파 완료

### 7단계: DKIM 상태 확인

1. AWS SES 콘솔로 돌아가기
2. `hiker-cloud.site` 도메인 상세 페이지
3. **"DKIM"** 탭에서 상태 확인
4. 상태가 **"Success"** 또는 **"Verified"**로 변경되면 완료

### 8단계: 자동 재활성화 확인

DNS 레코드가 확인되면 AWS SES가 자동으로 DKIM 서명을 재활성화합니다.
- 보통 DNS 전파 후 **몇 분 내** 자동 재활성화
- 최대 **5일** 내에 재활성화 (메일 내용 참고)

## Route 53을 사용하는 경우

### CloudFormation 스택 확인

1. CloudFormation 콘솔에서 `hiker-cloud-site` 또는 관련 스택 확인
2. Route 53 Hosted Zone ID 확인

### AWS CLI로 DNS 레코드 추가

```bash
# Hosted Zone ID 확인
aws route53 list-hosted-zones-by-name --dns-name hiker-cloud.site

# DKIM 레코드 추가 (예시)
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "xxxxx._domainkey.hiker-cloud.site",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "xxxxx.dkim.amazonses.com"}]
      }
    }]
  }'
```

**주의**: 위 명령어는 예시입니다. 실제 Name과 Value는 AWS SES 콘솔에서 확인한 값을 사용하세요.

## 트러블슈팅

### DNS 레코드가 보이지 않는 경우

1. **도메인 인증 상태 확인**
   - Verified identities에서 `hiker-cloud.site` 상태가 "Verified"인지 확인
   - 인증되지 않은 경우 도메인 인증부터 진행

2. **DKIM 활성화 확인**
   - DKIM 탭에서 "Enable DKIM" 버튼이 있는지 확인
   - 있다면 클릭하여 DKIM 활성화

### DNS 전파 확인

```bash
# DNS 레코드 확인
dig CNAME xxxxx._domainkey.hiker-cloud.site

# 또는
nslookup -type=CNAME xxxxx._domainkey.hiker-cloud.site
```

### DKIM 상태가 변경되지 않는 경우

1. DNS 레코드가 올바르게 추가되었는지 확인
2. DNS 전파가 완료되었는지 확인 (최대 24시간)
3. AWS SES 콘솔에서 "Verify" 버튼 클릭 (있는 경우)
4. 24시간 후에도 변경되지 않으면 AWS 지원팀에 문의

## 참고

- DKIM DNS 레코드는 3개가 필요합니다
- 모든 레코드가 올바르게 추가되어야 DKIM이 활성화됩니다
- DNS 전파 후 자동으로 재활성화되므로 추가 작업은 필요 없습니다


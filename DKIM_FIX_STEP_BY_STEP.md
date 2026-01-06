# AWS SES DKIM 설정 복구 - 단계별 가이드

## ⚠️ 중요: 대기만 하면 안 됩니다!
DNS 레코드를 **직접 추가**해야 합니다. AWS가 자동으로 추가해주지 않습니다.

---

## 📋 전체 프로세스 요약

1. **AWS SES 콘솔**에서 DKIM 레코드 확인 (3개)
2. **Route 53 콘솔**에서 CNAME 레코드 추가 (3개)
3. **DNS 전파 대기** (5-10분)
4. **AWS SES가 자동으로 재활성화** 확인

---

## 🔍 1단계: AWS SES에서 DKIM 레코드 확인

### 1-1. AWS SES 콘솔 접속
```
https://ap-northeast-2.console.aws.amazon.com/ses/home?region=ap-northeast-2#/verified-identities
```

### 1-2. 도메인 찾기
1. 좌측 메뉴: **"Verified identities"** 클릭
2. 목록에서 **`hiker-cloud.site`** 찾기
3. 도메인 이름 클릭

### 1-3. DKIM 탭 확인
1. 상단 탭에서 **"DKIM"** 클릭
2. **"DKIM signing"** 섹션 확인
   - 상태가 **"Disabled"** 또는 **"Pending verification"**인지 확인
3. **"DKIM records"** 섹션에서 **3개의 CNAME 레코드** 확인

### 1-4. 레코드 정보 복사
각 레코드의 다음 정보를 복사하세요:

**레코드 1:**
- Name: `xxxxx._domainkey.hiker-cloud.site` (예시)
- Value: `xxxxx.dkim.amazonses.com` (예시)

**레코드 2:**
- Name: `yyyyy._domainkey.hiker-cloud.site` (예시)
- Value: `yyyyy.dkim.amazonses.com` (예시)

**레코드 3:**
- Name: `zzzzz._domainkey.hiker-cloud.site` (예시)
- Value: `zzzzz.dkim.amazonses.com` (예시)

> 💡 **팁**: 각 레코드 옆에 "복사" 버튼이 있을 수 있습니다.

---

## 🔧 2단계: Route 53에서 DNS 레코드 추가

### 방법 A: Route 53 콘솔 사용 (권장)

#### 2-A-1. Route 53 콘솔 접속
```
https://console.aws.amazon.com/route53/v2/hostedzones
```

#### 2-A-2. 호스팅 영역 선택
1. **`hiker-cloud.site`** 호스팅 영역 클릭
2. 또는 호스팅 영역 ID: `Z063980923HQIM9BWG5KU` 검색

#### 2-A-3. 레코드 추가 (3번 반복)
각 DKIM 레코드마다 다음을 반복:

1. **"Create record"** 버튼 클릭
2. 레코드 설정:
   - **Record name**: SES에서 복사한 Name (예: `xxxxx._domainkey.hiker-cloud.site`)
   - **Record type**: **CNAME - Routes traffic to another domain name and some AWS resources**
   - **Value**: SES에서 복사한 Value (예: `xxxxx.dkim.amazonses.com`)
   - **TTL**: `300` (또는 기본값)
3. **"Create records"** 클릭

**3개의 레코드를 모두 추가하세요!**

---

### 방법 B: AWS CLI 사용 (빠른 방법)

#### 2-B-1. 호스팅 영역 ID 확인
```bash
aws route53 list-hosted-zones-by-name --dns-name hiker-cloud.site
```

출력 예시:
```json
{
    "HostedZones": [
        {
            "Id": "/hostedzone/Z063980923HQIM9BWG5KU",
            "Name": "hiker-cloud.site.",
            ...
        }
    ]
}
```

#### 2-B-2. DKIM 레코드 추가 (3개 모두)

**레코드 1 추가:**
```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z063980923HQIM9BWG5KU \
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

**레코드 2 추가:**
```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z063980923HQIM9BWG5KU \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "yyyyy._domainkey.hiker-cloud.site",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "yyyyy.dkim.amazonses.com"}]
      }
    }]
  }'
```

**레코드 3 추가:**
```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z063980923HQIM9BWG5KU \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "zzzzz._domainkey.hiker-cloud.site",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "zzzzz.dkim.amazonses.com"}]
      }
    }]
  }'
```

> ⚠️ **주의**: 위 예시의 `xxxxx`, `yyyyy`, `zzzzz`는 실제 SES에서 확인한 값으로 변경하세요!

---

## ⏳ 3단계: DNS 전파 대기

### 3-1. 전파 시간
- **일반적으로**: 5-10분
- **최대**: 24시간 (드물게)

### 3-2. 전파 확인 방법

**방법 1: dig 명령어**
```bash
# 레코드 1 확인
dig CNAME xxxxx._domainkey.hiker-cloud.site

# 레코드 2 확인
dig CNAME yyyyy._domainkey.hiker-cloud.site

# 레코드 3 확인
dig CNAME zzzzz._domainkey.hiker-cloud.site
```

**방법 2: nslookup**
```bash
nslookup -type=CNAME xxxxx._domainkey.hiker-cloud.site
```

**방법 3: 온라인 도구**
- https://dnschecker.org/
- 레코드 이름 입력 후 확인

---

## ✅ 4단계: AWS SES에서 자동 재활성화 확인

### 4-1. SES 콘솔로 돌아가기
```
https://ap-northeast-2.console.aws.amazon.com/ses/home?region=ap-northeast-2#/verified-identities
```

### 4-2. DKIM 상태 확인
1. `hiker-cloud.site` 도메인 클릭
2. **"DKIM"** 탭 클릭
3. **"DKIM signing"** 섹션 확인:
   - ✅ **"Success"** 또는 **"Verified"** → 완료!
   - ⏳ **"Pending verification"** → 아직 전파 중, 조금 더 대기
   - ❌ **"Disabled"** → 레코드 확인 필요

### 4-3. 자동 재활성화
- DNS 레코드가 확인되면 AWS SES가 **자동으로** DKIM 서명을 재활성화합니다
- 별도의 "재활성화" 버튼을 누를 필요 없습니다
- 보통 DNS 전파 후 **몇 분 내** 자동 재활성화

---

## 🔍 트러블슈팅

### 문제 1: 레코드가 이미 존재하는 경우

**오류 메시지**: "ResourceRecordSetAlreadyExists"

**해결 방법**:
1. Route 53에서 기존 레코드 확인
2. 기존 레코드가 올바른지 확인
3. 올바르다면 그대로 두기
4. 잘못되었다면 삭제 후 재생성

### 문제 2: DNS 전파가 안 되는 경우

**확인 사항**:
1. 레코드 이름이 정확한지 확인 (마지막에 `.` 없어야 함)
2. 레코드 값이 정확한지 확인
3. TTL이 너무 길지 않은지 확인 (300 권장)

**해결 방법**:
```bash
# Route 53에서 레코드 확인
aws route53 list-resource-record-sets \
  --hosted-zone-id Z063980923HQIM9BWG5KU \
  --query "ResourceRecordSets[?Type=='CNAME' && contains(Name, '_domainkey')]"
```

### 문제 3: DKIM 상태가 변경되지 않는 경우

**확인 사항**:
1. 3개의 레코드가 모두 추가되었는지 확인
2. DNS 전파가 완료되었는지 확인
3. 레코드 이름과 값이 정확한지 확인

**해결 방법**:
1. SES 콘솔에서 "Verify" 버튼이 있다면 클릭
2. 24시간 후에도 변경되지 않으면 AWS 지원팀에 문의

---

## 📝 체크리스트

- [ ] AWS SES에서 DKIM 레코드 3개 확인
- [ ] Route 53에서 CNAME 레코드 3개 추가
- [ ] DNS 전파 확인 (dig 또는 nslookup)
- [ ] AWS SES에서 DKIM 상태가 "Success"로 변경 확인
- [ ] 이메일 전송 테스트

---

## 🎯 빠른 참조

**Route 53 호스팅 영역 ID**: `Z063980923HQIM9BWG5KU`

**SES 콘솔**: https://ap-northeast-2.console.aws.amazon.com/ses/home?region=ap-northeast-2

**Route 53 콘솔**: https://console.aws.amazon.com/route53/v2/hostedzones

---

## 💡 요약

1. **대기만 하면 안 됩니다** - DNS 레코드를 직접 추가해야 합니다
2. **3개의 CNAME 레코드**를 모두 추가해야 합니다
3. **DNS 전파 후** AWS SES가 자동으로 재활성화합니다
4. **별도의 재활성화 버튼**은 없습니다 - 자동입니다


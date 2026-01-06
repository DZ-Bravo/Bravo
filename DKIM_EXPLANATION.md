# DKIM 레코드란?

## DKIM이란?

**DKIM (DomainKeys Identified Mail)**은 이메일 발신자의 도메인을 인증하는 보안 기술입니다.

### 왜 필요한가요?

1. **스팸 방지**: 이메일이 실제로 해당 도메인에서 발송되었는지 확인
2. **신뢰성 향상**: 수신자에게 이메일이 변조되지 않았음을 증명
3. **이메일 전달률 향상**: DKIM 서명이 있으면 스팸 폴더로 가는 확률이 낮아짐

---

## DKIM 레코드 3개는 무엇인가?

### 1. DKIM은 공개키 암호화를 사용합니다

- **개인키 (Private Key)**: AWS SES가 보관 (이메일 서명에 사용)
- **공개키 (Public Key)**: DNS 레코드에 저장 (이메일 검증에 사용)

### 2. 왜 3개인가?

AWS SES는 **3개의 서로 다른 키 쌍**을 사용합니다:

1. **현재 활성 키**: 현재 이메일 서명에 사용 중
2. **다음 키 (예비)**: 키 로테이션을 위해 준비된 키
3. **예비 키**: 추가 백업 키

이렇게 3개를 사용하는 이유:
- **키 로테이션**: 보안을 위해 주기적으로 키를 교체할 수 있음
- **무중단 전환**: 한 키를 교체하는 동안 다른 키로 계속 서비스 가능
- **안정성**: 하나의 키에 문제가 있어도 다른 키로 대체 가능

---

## 각 레코드의 구조

### 레코드 형식

```
{토큰}._domainkey.hiker-cloud.site  →  {토큰}.dkim.amazonses.com
```

### 실제 예시

**레코드 1:**
- **Name**: `zouof3jyqsdyfql3cejvgsiaatnrskhv._domainkey.hiker-cloud.site`
- **Type**: CNAME
- **Value**: `zouof3jyqsdyfql3cejvgsiaatnrskhv.dkim.amazonses.com`
- **의미**: 첫 번째 DKIM 공개키의 위치를 가리킴

**레코드 2:**
- **Name**: `ah2wfdy7nvqfafwmxojbwkgdl63dshub._domainkey.hiker-cloud.site`
- **Type**: CNAME
- **Value**: `ah2wfdy7nvqfafwmxojbwkgdl63dshub.dkim.amazonses.com`
- **의미**: 두 번째 DKIM 공개키의 위치를 가리킴

**레코드 3:**
- **Name**: `hnvwdgbsq4tf7puvmdmp22xahoatduge._domainkey.hiker-cloud.site`
- **Type**: CNAME
- **Value**: `hnvwdgbsq4tf7puvmdmp22xahoatduge.dkim.amazonses.com`
- **의미**: 세 번째 DKIM 공개키의 위치를 가리킴

---

## 작동 원리

### 1. 이메일 발송 시

```
[AWS SES] 
  ↓
[개인키로 이메일 서명]
  ↓
[서명된 이메일 + DKIM 헤더 전송]
```

### 2. 이메일 수신 시

```
[수신 메일 서버]
  ↓
[DNS에서 공개키 조회]
  ↓
[공개키로 서명 검증]
  ↓
[검증 성공 → 정상 이메일로 처리]
```

### 3. DNS 조회 과정

1. 수신 서버가 이메일 헤더에서 DKIM 서명 정보 확인
2. `{토큰}._domainkey.hiker-cloud.site` DNS 레코드 조회
3. CNAME 레코드를 따라 `{토큰}.dkim.amazonses.com`로 리다이렉트
4. AWS SES에서 공개키 가져오기
5. 공개키로 이메일 서명 검증

---

## 왜 CNAME 레코드인가?

### CNAME (Canonical Name) 레코드

- **역할**: 한 도메인 이름을 다른 도메인 이름으로 매핑
- **장점**: 
  - AWS SES가 키를 관리하므로, 키 변경 시 DNS 레코드를 수정할 필요 없음
  - AWS가 자동으로 키를 로테이션할 수 있음

### 예시

```
zouof3jyqsdyfql3cejvgsiaatnrskhv._domainkey.hiker-cloud.site
  ↓ (CNAME)
zouof3jyqsdyfql3cejvgsiaatnrskhv.dkim.amazonses.com
  ↓ (AWS SES가 관리)
실제 공개키 데이터
```

---

## 3개 레코드가 모두 필요한 이유

### ✅ 모두 있어야 하는 이유

1. **AWS SES 요구사항**: AWS SES는 3개의 레코드가 모두 있어야 DKIM을 활성화
2. **키 로테이션**: 키를 교체할 때 무중단으로 전환 가능
3. **안정성**: 하나의 키에 문제가 있어도 다른 키로 대체

### ❌ 하나라도 없으면?

- DKIM 상태가 **"Pending verification"** 또는 **"Failed"**로 표시됨
- 이메일이 DKIM 서명 없이 전송됨
- 스팸 필터에 걸릴 확률 증가
- 이메일 전달률 저하

---

## 현재 상태 확인

### 레코드 확인 방법

```bash
# Route 53에서 확인
aws route53 list-resource-record-sets \
  --hosted-zone-id Z08645032AQN4YZ1T1QIP \
  --query "ResourceRecordSets[?Type=='CNAME' && contains(Name, '_domainkey')]"

# DNS 전파 확인
dig CNAME zouof3jyqsdyfql3cejvgsiaatnrskhv._domainkey.hiker-cloud.site
dig CNAME ah2wfdy7nvqfafwmxojbwkgdl63dshub._domainkey.hiker-cloud.site
dig CNAME hnvwdgbsq4tf7puvmdmp22xahoatduge._domainkey.hiker-cloud.site
```

### SES 상태 확인

```bash
aws sesv2 get-email-identity \
  --email-identity hiker-cloud.site \
  --region ap-northeast-2 \
  --query 'DkimAttributes.Status'
```

**가능한 상태:**
- `SUCCESS`: 모든 레코드가 확인됨, DKIM 활성화됨 ✅
- `TEMPORARY_FAILURE`: 일부 레코드 확인 중, 곧 성공할 예정 ⏳
- `FAILED`: 레코드가 없거나 잘못됨 ❌
- `NOT_STARTED`: DKIM이 활성화되지 않음

---

## 요약

1. **DKIM 레코드 3개** = 3개의 공개키 위치를 가리키는 CNAME 레코드
2. **각 레코드** = `{토큰}._domainkey.hiker-cloud.site` → `{토큰}.dkim.amazonses.com`
3. **목적** = 이메일 발신자 인증 및 스팸 방지
4. **필요성** = 3개 모두 있어야 DKIM이 정상 작동
5. **관리** = AWS SES가 자동으로 키를 관리하고 로테이션

---

## 참고

- DKIM은 SPF, DMARC와 함께 사용하면 더 효과적입니다
- AWS SES는 자동으로 키를 로테이션하므로, DNS 레코드는 한 번 설정하면 계속 유지됩니다
- 레코드가 삭제되면 (지금처럼) DKIM이 비활성화되고, 다시 추가하면 자동으로 재활성화됩니다


# 이메일 전송 문제 해결 가이드

## 현재 상황

### ✅ 완료된 작업
1. **DKIM DNS 레코드 3개 추가 완료** (Route 53)
2. **DNS 전파 완료** (모든 레코드 확인됨)
3. **프론트엔드 배포 완료** (이메일 인증 타이머 추가)
4. **백엔드 배포 완료** (이메일 오류 처리 개선)

### ⚠️ 현재 문제
- **DKIM 상태**: `TEMPORARY_FAILURE` (DNS 전파 완료되었지만 AWS SES가 아직 확인 중)
- **이메일 미수신**: DKIM 문제로 인해 이메일 전송이 실패할 수 있음

---

## 문제 원인

### 1. DKIM 상태가 TEMPORARY_FAILURE인 이유

DNS 레코드는 추가되었지만, AWS SES가 주기적으로 확인하는 과정이 있습니다:
- DNS 전파 완료 후 **몇 분 ~ 몇 시간** 소요
- AWS SES는 **주기적으로** (보통 5-10분마다) DNS 레코드를 확인
- 모든 레코드가 확인되면 자동으로 `SUCCESS`로 변경

### 2. 이메일이 안 오는 이유

DKIM이 `TEMPORARY_FAILURE` 상태일 때:
- AWS SES가 이메일을 **거부할 수 있음**
- 또는 **DKIM 서명 없이** 전송될 수 있음 (스팸 필터에 걸릴 수 있음)

---

## 해결 방법

### 방법 1: 대기 (권장)

AWS SES가 자동으로 DKIM 상태를 확인합니다:
- **일반적으로**: 5-10분 내에 자동 확인
- **최대**: 24시간 내에 확인

**확인 방법:**
```bash
aws sesv2 get-email-identity \
  --email-identity hiker-cloud.site \
  --region ap-northeast-2 \
  --query 'DkimAttributes.Status' \
  --output text
```

상태가 `SUCCESS`로 변경되면 이메일 전송이 정상 작동합니다.

### 방법 2: AWS SES 콘솔에서 수동 확인

1. AWS SES 콘솔 접속:
   ```
   https://ap-northeast-2.console.aws.amazon.com/ses/home?region=ap-northeast-2#/verified-identities
   ```

2. `hiker-cloud.site` 도메인 클릭

3. **"DKIM"** 탭 클릭

4. **"Verify"** 버튼이 있다면 클릭 (없으면 자동 확인 대기)

### 방법 3: 임시 해결 (테스트용)

개발 모드에서는 인증번호가 응답에 포함되도록 코드가 수정되어 있습니다:
- 프론트엔드에서 개발 모드일 때 인증번호가 alert로 표시됨
- 백엔드에서 `NODE_ENV=development`일 때 인증번호 반환

---

## 현재 상태 확인

### DKIM 상태 확인
```bash
aws sesv2 get-email-identity \
  --email-identity hiker-cloud.site \
  --region ap-northeast-2 \
  --query 'DkimAttributes.{Status:Status,SigningEnabled:SigningEnabled}'
```

### DNS 레코드 확인
```bash
dig CNAME zouof3jyqsdyfql3cejvgsiaatnrskhv._domainkey.hiker-cloud.site
dig CNAME ah2wfdy7nvqfafwmxojbwkgdl63dshub._domainkey.hiker-cloud.site
dig CNAME hnvwdgbsq4tf7puvmdmp22xahoatduge._domainkey.hiker-cloud.site
```

### 이메일 전송 로그 확인
```bash
kubectl logs -n bravo-core-ns -l app=auth-service --tail=100 | grep -i "email\|ses"
```

---

## 예상 타임라인

1. **지금**: DNS 레코드 추가 완료, 전파 완료
2. **5-10분 후**: AWS SES가 DKIM 레코드 확인
3. **10-15분 후**: DKIM 상태가 `SUCCESS`로 변경
4. **그 이후**: 이메일 전송 정상 작동

---

## 참고

- DKIM이 `TEMPORARY_FAILURE` 상태여도 이메일은 전송될 수 있지만, 스팸 필터에 걸릴 확률이 높습니다
- `SUCCESS` 상태가 되면 이메일 전달률이 크게 향상됩니다
- 최신 코드에서는 DKIM 문제 시 명확한 오류 메시지가 표시됩니다

---

## 다음 단계

1. **5-10분 대기** 후 DKIM 상태 재확인
2. 상태가 `SUCCESS`로 변경되면 이메일 전송 테스트
3. 여전히 문제가 있으면 AWS 지원팀에 문의


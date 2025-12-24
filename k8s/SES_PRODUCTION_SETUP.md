# AWS SES Production 모드 설정 가이드

## 개요

이메일 인증 서비스(회원가입, 아이디 찾기, 비밀번호 찾기)를 위해 AWS SES를 Production 모드로 설정합니다.

**발신자 이메일**: `noreply@hiker-cloud.site` (또는 원하는 이메일)

---

## 단계 1: 발신자 이메일 주소 인증

### 1-1. AWS SES 콘솔 접속

1. AWS 콘솔에 로그인
2. 리전 선택: **ap-northeast-2 (Seoul)**
3. 검색창에 "SES" 또는 "Simple Email Service" 입력
4. Simple Email Service 선택

직접 URL:
```
https://ap-northeast-2.console.aws.amazon.com/ses/home?region=ap-northeast-2
```

### 1-2. Verified identities 페이지로 이동

좌측 메뉴에서 **"Verified identities"** 클릭

### 1-3. Create identity 클릭

화면 상단의 **"Create identity"** 버튼 클릭

### 1-4. Identity 유형 선택

**"Email address"** 선택 (라디오 버튼)

### 1-5. 이메일 주소 입력

- **Email address** 필드에 입력: `noreply@hiker-cloud.site` (또는 사용할 이메일)
- **Use a custom MAIL FROM domain** 체크박스는 **해제** (기본값 유지)

### 1-6. Create identity 클릭

화면 하단의 **"Create identity"** 버튼 클릭

### 1-7. 인증 이메일 확인

1. `noreply@hiker-cloud.site` 메일함 확인
2. **From**: AWS Notifications (no-reply-aws@amazon.com)
3. **제목**: "AWS Email Address Verification Request in region ap-northeast-2"
4. 이메일이 오지 않으면 **스팸/프로모션 폴더** 확인

### 1-8. 인증 링크 클릭

인증 이메일 내의 링크를 클릭하면:
- 새 탭/창이 열림
- "Successfully verified email address" 메시지 표시

### 1-9. 인증 상태 확인

AWS SES 콘솔 → Verified identities 페이지에서:
- **Identity**: `noreply@hiker-cloud.site`
- **Status**: **Verified** (녹색 체크 표시)

---

## 단계 2: Production 모드 전환 신청

### 2-1. Account dashboard로 이동

좌측 메뉴에서 **"Account dashboard"** 클릭

### 2-2. Production access 요청 버튼 찾기

다음 위치 중 하나에서 찾을 수 있습니다:

**옵션 A**: Account dashboard 상단
- 노란색 경고 배너 근처에 "Request production access" 버튼

**옵션 B**: Sending limits 섹션
- "Sending limits" 섹션에 "Request production access" 링크

**옵션 C**: Get set up 페이지
- "View Get set up page" 버튼 클릭 → 해당 페이지에서 요청

**옵션 D**: 직접 URL 접근
```
https://ap-northeast-2.console.aws.amazon.com/ses/home?region=ap-northeast-2#/account
```

### 2-3. 지원 요청 양식 작성

버튼을 클릭하면 지원 요청 양식이 나타납니다:

**필수 정보**:
- **Use case**: 
  ```
  User email verification for account registration, password recovery, and ID lookup on our web application (hiker-cloud.site)
  ```
- **Website URL**: `https://hiker-cloud.site`
- **Mail Type**: **Transactional** 선택
- **Expected bounce rate**: `< 5%` (또는 적절한 값)
- **Expected complaint rate**: `< 0.1%` (또는 적절한 값)
- **Additional information** (선택사항):
  ```
  We are using AWS SES to send email verification codes to users during:
  - Account registration
  - Password recovery
  - ID lookup
  
  All emails are transactional and user-initiated. We have proper email validation and rate limiting in place.
  ```

### 2-4. 제출 및 승인 대기

1. 양식 작성 완료 후 **"Submit"** 클릭
2. AWS 승인 대기 (보통 몇 시간 ~ 1일 소요)
3. 승인 완료 시 이메일로 알림 수신

---

## 단계 3: Production 모드 확인

### 3-1. Account dashboard 확인

승인 후 Account dashboard에서:
- 노란색 경고 배너가 사라짐
- "Your account is in production mode" 메시지 표시
- Sending limits가 증가함 (예: 50,000 emails/day)

### 3-2. 테스트 이메일 발송

승인 후 테스트:
```bash
# auth-service Pod에 접속하여 테스트
kubectl exec -it -n bravo-core-ns deployment/auth-service -- sh

# 또는 API로 테스트
curl -X POST https://hiker-cloud.site/api/auth/send-email-verification \
  -H "Content-Type: application/json" \
  -d '{"email":"your-test-email@example.com"}'
```

---

## 단계 4: 도메인 인증 (선택사항, 권장)

도메인 전체를 인증하면 더 나은 신뢰도와 전송률을 얻을 수 있습니다.

### 4-1. Domain identity 생성

1. Verified identities → **"Create identity"**
2. **"Domain"** 선택
3. **Domain name** 입력: `hiker-cloud.site`
4. **Create identity** 클릭

### 4-2. DNS 레코드 추가

SES가 제공하는 DNS 레코드를 Route 53에 추가:
- TXT 레코드 (SPF)
- CNAME 레코드 (DKIM)

### 4-3. 인증 완료 대기

DNS 전파 후 자동으로 인증 완료 (보통 몇 분 ~ 몇 시간)

---

## 현재 설정 확인

### ConfigMap 확인
```bash
kubectl get configmap bravo-config -n bravo-core-ns -o yaml | grep SES_FROM_EMAIL
```

### Secret 확인 (AWS 자격 증명)
```bash
kubectl get secret bravo-secrets -n bravo-core-ns -o jsonpath='{.data.AWS_ACCESS_KEY_ID}' | base64 -d
```

---

## 트러블슈팅

### 인증 이메일이 오지 않는 경우

1. **스팸/프로모션 폴더 확인**
2. **Gmail 필터 확인**
3. **잠시 대기** (최대 10분)
4. **재발송**: SES 콘솔에서 해당 이메일 선택 → "Send verification email" 클릭

### Production 모드 전환 요청이 보이지 않는 경우

1. **Get set up 페이지 확인**
2. **Support Center에서 요청**:
   - AWS Support Center → Create case
   - Service: Amazon SES
   - Limit type: Production access

### "Email address is not verified" 오류

- 발신자 이메일(`noreply@hiker-cloud.site`)이 인증되지 않음
- Verified identities에서 인증 상태 확인

---

## 다음 단계

1. ✅ 발신자 이메일 인증 완료
2. ✅ Production 모드 전환 신청
3. ⏳ AWS 승인 대기
4. ✅ 승인 후 테스트
5. (선택) 도메인 인증

---

## 참고

- **Sandbox 모드**: 발신자와 수신자 모두 인증 필요 (일반 서비스에 부적합)
- **Production 모드**: 발신자만 인증 필요, 모든 이메일로 전송 가능 (일반 서비스에 적합)
- **발송 한도**: Production 모드에서 더 높은 한도 제공


# AWS SES 이메일 인증 설정 가이드

## 개요

SES(Simple Email Service)를 통해 보고서를 이메일로 전송하려면 발신자 이메일 주소를 인증해야 합니다.

**인증 대상**: `salad0715@gmail.com` (발신자)

---

## 단계별 설정 방법

### 1단계: AWS SES 콘솔 접속

1. AWS 콘솔에 로그인
2. 리전 선택: **ap-northeast-2 (Seoul)**
3. 검색창에 "SES" 또는 "Simple Email Service" 입력
4. Simple Email Service 선택

또는 직접 URL 접속:
```
https://ap-northeast-2.console.aws.amazon.com/ses/home?region=ap-northeast-2
```

---

### 2단계: Verified identities 페이지로 이동

좌측 메뉴에서 **"Verified identities"** 클릭

---

### 3단계: Create identity 클릭

화면 상단의 **"Create identity"** 버튼 클릭

---

### 4단계: Identity 유형 선택

**"Email address"** 선택 (라디오 버튼)

---

### 5단계: 이메일 주소 입력

- **Email address** 필드에 입력: `salad0715@gmail.com`
- **Use a custom MAIL FROM domain** 체크박스는 **해제** (기본값 유지)

---

### 6단계: 추가 설정 (선택사항)

- **Configuration set**: 선택 안 함 (기본값)
- **Tags**: 필요시 추가 (기본값 유지)

---

### 7단계: Create identity 클릭

화면 하단의 **"Create identity"** 버튼 클릭

---

### 8단계: 인증 이메일 확인

1. `salad0715@gmail.com` 메일함 확인
2. **From**: AWS Notifications (no-reply-aws@amazon.com)
3. **제목**: "AWS Email Address Verification Request in region ap-northeast-2"
4. 이메일이 오지 않으면 **스팸/프로모션 폴더** 확인

---

### 9단계: 인증 링크 클릭

인증 이메일 내의 링크를 클릭하면:
- 새 탭/창이 열림
- "Successfully verified email address" 메시지 표시
- 또는 AWS 콘솔로 리다이렉트됨

---

### 10단계: 인증 상태 확인

AWS SES 콘솔 → Verified identities 페이지에서:
- **Identity**: `salad0715@gmail.com`
- **Status**: **Verified** (녹색 체크 표시)
- **Type**: Email address

---

## Sandbox 모드 vs Production 모드

### Sandbox 모드 (기본값)

처음 SES를 사용하는 경우 **Sandbox 모드**입니다:

**제한사항**:
- ✅ 인증된 이메일 주소로만 발송 가능
- ✅ 인증된 이메일 주소로만 수신 가능
- ❌ 임의의 이메일 주소로 발송 불가

**우리 경우**:
- 발신자: `salad0715@gmail.com` (인증 필요) ✅
- 수신자: 팀원 이메일들 (인증 불필요, Sandbox에서는 인증 필요!)
- **⚠️ Sandbox 모드에서는 수신자도 인증이 필요합니다!**

### Production 모드 (제한 해제)

Sandbox 모드 제한을 해제하려면:

1. AWS SES 콘솔 → **Account dashboard**
2. **"Request production access"** 버튼 클릭
3. 지원 요청 양식 작성:
   - Use case: "Send automated monitoring reports to team members"
   - Website URL: https://hiker-cloud.site (또는 적절한 URL)
   - 이메일 타입: Transactional
   - 기타 정보 입력
4. 제출 → AWS 승인 대기 (보통 몇 시간 ~ 1일 소요)

**Production 모드의 장점**:
- ✅ 모든 이메일 주소로 발송 가능
- ✅ 수신자 인증 불필요
- ✅ 더 높은 발송 한도

---

## 현재 상황에 맞는 선택

### 옵션 1: Sandbox 모드에서 시작 (빠른 시작)

**장점**: 즉시 사용 가능

**단점**: 
- 모든 수신자 이메일도 SES에서 인증 필요
- 팀원들 이메일을 모두 인증해야 함

**추가 작업**:
- 각 팀원 이메일도 SES에서 인증:
  - msj67854643@gmail.com
  - dprxrx@gmail.com
  - chn3043@gmail.com
  - woosuck3976@gmail.com
  - salad0715@gmail.com (이미 인증함)

### 옵션 2: Production 모드로 전환 (권장)

**장점**:
- 수신자 인증 불필요
- 모든 이메일로 발송 가능

**단점**:
- AWS 승인 대기 필요 (몇 시간 ~ 1일)

---

## 트러블슈팅

### 인증 이메일이 오지 않는 경우

1. **스팸/프로모션 폴더 확인**
2. **Gmail 필터 확인**
3. **잠시 대기** (최대 10분)
4. **재발송**: SES 콘솔에서 해당 이메일 선택 → "Send verification email" 클릭

### "Verification failed" 오류

- 이메일 주소 오타 확인
- 인증 링크 만료 (24시간 유효) → 재발송

### Sandbox 모드 제한 오류

**오류 메시지**: "Email address is not verified"

**원인**: 수신자 이메일이 SES에서 인증되지 않음

**해결**:
- Sandbox 모드: 모든 수신자도 인증 필요
- Production 모드: 제한 해제 요청

---

## 현재 권장 사항

1. **우선 Sandbox 모드에서 테스트**:
   - 발신자 `salad0715@gmail.com` 인증 완료
   - 테스트 목적으로 자신에게 먼저 발송 테스트

2. **Production 모드 전환 신청**:
   - 정식 사용을 위해 제한 해제 요청
   - 승인 후 모든 팀원에게 발송 가능

---

## 확인 방법

인증 상태 확인:
```bash
# AWS CLI로 확인 (선택사항)
aws ses get-identity-verification-attributes \
  --identities salad0715@gmail.com \
  --region ap-northeast-2
```

또는 AWS 콘솔에서 직접 확인:
- SES 콘솔 → Verified identities → `salad0715@gmail.com` → Status: Verified

---

## 다음 단계

인증 완료 후:
1. Secret 생성 (`./create-secret.sh` 실행)
2. 리소스 배포
3. 테스트 이메일 발송 확인


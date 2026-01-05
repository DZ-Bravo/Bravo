# AWS Support 케이스 생성 빠른 가이드

## 방법 1: 직접 케이스 생성 페이지로 이동

1. AWS 콘솔 로그인 후 이 URL로 직접 이동:
   ```
   https://console.aws.amazon.com/support/cases#/create?issueType=technical
   ```

2. 또는:
   - Support Center → Create case 클릭
   - "Technical" 선택
   - **페이지 하단으로 스크롤** → "Continue" 또는 "Next" 버튼 클릭

## 방법 2: 단계별 진행

### Step 1: Technical 선택 (현재 단계)
- "Technical" 옵션이 선택되어 있는지 확인 (파란색 테두리)
- **페이지 하단으로 스크롤** (중요!)

### Step 2: Case Details 입력
다음 정보 입력:

**Service**: Amazon Bedrock (드롭다운에서 선택)

**Category**: Performance (또는 General guidance)

**Severity**: Production system impaired

**Subject**: 
```
Bedrock Agent Nova 모델 DEFAULT parser 오류 - $response 필드 접근 불가
```

**Description**: (아래 텍스트 복사해서 붙여넣기)

```
Bedrock Agent에서 Nova 모델(apac.amazon.nova-lite-v1:0) 사용 시 DEFAULT parser 오류 발생합니다.

오류 메시지:
"An error occurred when attempting to parse the model response with the default parser. Check your overridden prompt configurations or attach a lambda parser to handle the response."

상세 정보:
- Agent ID: EFHTPK8I6B
- Agent Name: Hiker_course_recommendation  
- Foundation Model: apac.amazon.nova-lite-v1:0 (Nova Lite)
- Agent Alias ID: MJCYLWVRGW
- Region: ap-northeast-2
- SDK: @aws-sdk/client-bedrock-agent-runtime ^3.962.0

문제:
- HTTP Status Code: 200 (응답은 수신되었으나 파싱 실패)
- 에러 객체에 $response 필드가 없음 (에러 메시지에서 언급되지만 접근 불가)
- Lambda Parser 시도했으나 형식 문제로 실패
- Nova 모델만 사용 가능 (Claude 모델 전환 불가)

문의:
1. Nova 모델과 DEFAULT parser 간 알려진 이슈가 있나요?
2. $response 필드에 접근하는 방법이 있나요?
3. Nova 모델 응답 처리 권장 방법은 무엇인가요?
4. 우회 방법이나 수정 사항이 있나요?
```

**Contact method**: Email (또는 원하는 방법)

### Step 3: 제출
- "Submit" 또는 "Create case" 버튼 클릭

## 문제 해결: 버튼이 안 보일 때

1. **페이지 스크롤 확인**: "Continue" 버튼이 하단에 있을 수 있습니다
2. **브라우저 캐시 지우기**: Ctrl+F5 또는 Cmd+Shift+R
3. **다른 브라우저 시도**: Chrome, Firefox 등
4. **JavaScript 확인**: 브라우저 개발자 도구(F12)에서 JavaScript 오류 확인
5. **직접 URL 사용**: 
   ```
   https://console.aws.amazon.com/support/cases#/create?issueType=technical
   ```

## 대안: AWS Developer Forums

지원 케이스 생성이 어려우면 Forum에서 질문:
- URL: https://forums.aws.amazon.com/forum.jspa?forumID=355
- "Ask a question" 클릭
- 제목과 본문 입력 (위의 Description 사용)

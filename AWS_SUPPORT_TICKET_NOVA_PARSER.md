# AWS 지원팀 문의 가이드 - Nova 모델 파서 이슈

## AWS Support Center 접속

1. AWS 콘솔 로그인
2. 우측 상단 계정명 클릭 → **Support** → **Support Center** 선택
3. 또는 직접 URL: https://console.aws.amazon.com/support/home

## 지원 케이스 생성

1. **Create case** 클릭
2. **Technical support** 선택
3. **Service**: Amazon Bedrock 선택
4. **Category**: Performance 선택 (또는 General guidance)
5. **Severity**: Production system impaired 선택 (프로덕션 시스템에 영향)

## 케이스 제목

```
Bedrock Agent with Nova model fails with default parser error - $response field not accessible
```

한국어:
```
Bedrock Agent Nova 모델 사용 시 DEFAULT parser 오류 발생 - $response 필드 접근 불가
```

## 케이스 본문 (영어)

```
Subject: Bedrock Agent InvokeAgentCommand fails with Nova model due to parser error

Issue Description:
We are experiencing a parsing error when using Amazon Bedrock Agent with Nova model (apac.amazon.nova-lite-v1:0). The error occurs even though the HTTP status code is 200, indicating that the response was received but cannot be parsed by the default parser.

Error Message:
"An error occurred when attempting to parse the model response with the default parser. Check your overridden prompt configurations or attach a lambda parser to handle the response."

Details:
- Agent ID: EFHTPK8I6B
- Agent Name: Hiker_course_recommendation
- Foundation Model: apac.amazon.nova-lite-v1:0 (Nova Lite)
- Agent Alias ID: MJCYLWVRGW
- Region: ap-northeast-2
- SDK: @aws-sdk/client-bedrock-agent-runtime (latest version)

Error Details:
- HTTP Status Code: 200 (response received successfully)
- Request ID: [varies per request]
- Error object only contains: ['message', '$metadata']
- The $response field mentioned in the error message ("to see the raw response, inspect the hidden field {error}.$response") is not accessible in the error object

Attempted Solutions:
1. Tried to implement Lambda Parser but encountered format issues
2. Attempted to extract response data from error.$response.body but the $response field is not present in the error object
3. Verified that the SDK is the latest version

Questions:
1. Is there a known issue with Nova model and the default parser in Bedrock Agent?
2. Is the $response field supposed to be accessible when parser errors occur? If so, why is it not present in our error objects?
3. What is the recommended approach to handle Nova model responses in Bedrock Agent?
4. Are there any workarounds or fixes available for this issue?
5. Is there an ETA for Nova model parser support or updates?

Request:
We need guidance on how to properly handle Nova model responses in Bedrock Agent, or confirmation if this is a known limitation/bug.

Additional Information:
- The error occurs consistently for all requests
- Only Nova models (Pro/Lite/Micro) are available in our region, so we cannot switch to Claude models
- The Lambda Parser approach is challenging due to format specification issues
```

## 케이스 본문 (한국어 - 간단 버전)

```
제목: Bedrock Agent에서 Nova 모델 사용 시 DEFAULT parser 오류 발생

문제 설명:
Amazon Bedrock Agent에서 Nova 모델(apac.amazon.nova-lite-v1:0)을 사용할 때 파싱 오류가 발생합니다. HTTP 상태 코드는 200으로 응답은 수신되었지만, DEFAULT parser가 응답을 파싱하지 못합니다.

오류 메시지:
"An error occurred when attempting to parse the model response with the default parser. Check your overridden prompt configurations or attach a lambda parser to handle the response."

상세 정보:
- Agent ID: EFHTPK8I6B
- Agent Name: Hiker_course_recommendation
- Foundation Model: apac.amazon.nova-lite-v1:0 (Nova Lite)
- Region: ap-northeast-2
- SDK: @aws-sdk/client-bedrock-agent-runtime (최신 버전)

오류 상세:
- HTTP 상태 코드: 200 (응답은 성공적으로 수신됨)
- 에러 객체에는 ['message', '$metadata']만 포함됨
- 오류 메시지에서 언급된 $response 필드가 에러 객체에 존재하지 않음

시도한 해결 방법:
1. Lambda Parser 구현 시도했으나 형식 문제로 실패
2. error.$response.body에서 응답 데이터 추출 시도했으나 $response 필드가 없음
3. SDK가 최신 버전임을 확인

문의 사항:
1. Bedrock Agent에서 Nova 모델과 DEFAULT parser 간 알려진 이슈가 있나요?
2. 파서 오류 발생 시 $response 필드에 접근 가능해야 하나요? 가능하다면 왜 에러 객체에 없는지요?
3. Bedrock Agent에서 Nova 모델 응답을 처리하는 권장 방법은 무엇인가요?
4. 이 이슈에 대한 우회 방법이나 수정 사항이 있나요?
5. Nova 모델 파서 지원 또는 업데이트 예정이 있나요?

요청:
Bedrock Agent에서 Nova 모델 응답을 올바르게 처리하는 방법에 대한 가이드 또는 알려진 제한사항/버그인지 확인이 필요합니다.

추가 정보:
- 모든 요청에서 일관되게 발생
- 우리 리전에서는 Nova 모델(Pro/Lite/Micro)만 사용 가능하여 Claude 모델로 전환 불가
- Lambda Parser 접근 방식은 형식 명세 문제로 어려움
```

## 필요한 정보 수집 (케이스 제출 전)

다음 정보를 포함하면 지원팀이 더 빠르게 도와줄 수 있습니다:

1. **Request ID** (최근 요청의):
   ```
   Request ID: ab6139eb-074f-4d83-8f8b-ac0225aefcc3
   ```

2. **에러 로그 스니펫** (최근 발생한 에러):
   ```
   [로그에서 복사]
   ```

3. **Agent 설정 정보**:
   - Agent ID, Alias ID
   - Foundation Model
   - Knowledge Base 연결 여부
   - Action Groups 설정 여부

4. **SDK 버전**:
   ```json
   "@aws-sdk/client-bedrock-agent-runtime": "^3.962.0"
   ```

## 케이스 제출 후 예상 응답

1. **초기 응답** (1-2일 내):
   - 문제 확인 및 추가 정보 요청
   - 로그 또는 설정 정보 요청 가능

2. **추가 조사** (3-5일):
   - AWS 내부 팀과 확인
   - 해결 방법 제안

3. **최종 응답**:
   - 해결 방법 또는 우회 방법 안내
   - 또는 알려진 제한사항/버그 확인

## 대안: AWS Developer Forums

지원 케이스 생성 전에 AWS Developer Forums에서도 질문 가능:
- URL: https://forums.aws.amazon.com/forum.jspa?forumID=355
- Bedrock 서브포럼에서 동일한 이슈가 있는지 확인

## 참고사항

- **지원 플랜**: Production system impaired는 모든 지원 플랜에서 사용 가능
- **응답 시간**: 
  - Business/Enterprise: 1시간 이내
  - Developer: 12시간 이내
- **비용**: 지원 케이스 자체는 무료 (지원 플랜에 따라)

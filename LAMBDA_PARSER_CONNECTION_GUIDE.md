# Lambda Parser Agent 연결 가이드

## ✅ 완료된 작업
- Lambda 함수 생성 완료: `bedrock-course-recommendation-parser`
- 함수 ARN: `arn:aws:lambda:ap-northeast-2:940482451773:function:bedrock-course-recommendation-parser`
- 상태: Active

## 🔗 Agent에 연결하기

### 방법 1: AWS 콘솔에서 (권장)

1. **AWS Bedrock 콘솔 접속**
   - https://console.aws.amazon.com/bedrock/

2. **Agent 선택**
   - 왼쪽 메뉴: Agents
   - `Hiker_course_recommendation` 선택

3. **Edit 모드 진입**
   - 우측 상단 "Edit" 버튼 클릭

4. **Advanced prompts 설정**
   - 화면 하단 또는 중간 "Advanced prompts" 섹션 찾기
   - 또는 "Orchestration" 탭 클릭

5. **Lambda parser 설정**
   - 오른쪽 "Configurations" 패널에서
   - **"Use Lambda function for parsing"** 체크박스가 체크되어 있는지 확인
   - (이미 체크되어 있다면 다음 단계로)

6. **Lambda 함수 선택**
   - 하단 "Parser Lambda function - optional" 섹션으로 스크롤
   - "Parser Lambda function" 드롭다운에서
   - **`bedrock-course-recommendation-parser`** 선택

7. **저장**
   - "Save" 또는 "Save and exit" 클릭
   - Agent가 "Preparing" 상태로 변경됨 (몇 분 소요)

8. **테스트**
   - Agent 준비 완료 후 테스트
   - 기존 500 에러가 해결되었는지 확인

### 방법 2: AWS CLI로 (고급)

참고: Agent의 promptOverrideConfiguration을 업데이트하는 것은 복잡합니다.
콘솔에서 하는 것이 더 안전하고 쉬습니다.

## 🔍 문제 해결

### Lambda 함수가 드롭다운에 보이지 않는 경우
- Lambda 함수가 같은 리전(ap-northeast-2)에 있는지 확인
- 함수 상태가 "Active"인지 확인
- 브라우저 새로고침

### 여전히 에러가 발생하는 경우
1. CloudWatch Logs 확인
   - Lambda 함수 로그: `/aws/lambda/bedrock-course-recommendation-parser`
   - 입력 형식 확인 후 코드 수정 필요할 수 있음

2. Agent 로그 확인
   - Bedrock Agent 실행 로그에서 추가 에러 정보 확인

## 📝 다음 단계

1. Agent에 Lambda parser 연결 (콘솔에서)
2. Agent 테스트
3. 에러 해결 확인
4. 필요시 Lambda 함수 코드 수정

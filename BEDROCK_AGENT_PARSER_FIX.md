# Bedrock Agent Lambda Parser 설정 가이드

## 문제 상황
- Agent: `Hiker_course_recommendation` (Agent ID: `EFHTPK8I6B`)
- 에러: "An error occurred when attempting to parse the model response with the default parser"
- 원인: Amazon Nova 모델(`apac.amazon.nova-lite-v1:0`)의 응답을 DEFAULT parser가 파싱하지 못함

## 해결 방법: AWS 콘솔에서 Lambda Parser 추가

### 1. AWS 콘솔 접속
1. AWS Management Console에 로그인
2. Amazon Bedrock 서비스로 이동
3. 왼쪽 메뉴에서 **Agents** 선택

### 2. Agent 선택 및 편집
1. Agent 목록에서 **Hiker_course_recommendation** 선택
2. **Edit** 버튼 클릭 (또는 Agent 설정 페이지로 이동)

### 3. Prompt Configuration 편집
1. **Prompt Configuration** 섹션으로 이동
2. **ORCHESTRATION** prompt type 찾기
3. **Parser Configuration** 또는 **Parser Mode** 설정 확인

### 4. Lambda Parser 추가 옵션

#### 옵션 A: Lambda Parser 함수 생성 (권장)
Lambda parser는 Bedrock Agent의 응답을 파싱하는 커스텀 함수입니다.

**Lambda 함수 요구사항:**
- 입력: Bedrock Agent의 원본 응답
- 출력: 파싱된 응답 형식

#### 옵션 B: Parser Mode 변경 (가능한 경우)
- `DEFAULT` → `LAMBDA` 모드로 변경
- Lambda 함수 ARN 입력

### 5. 현재 Agent 정보
- **Agent ID**: `EFHTPK8I6B`
- **Agent Alias ID**: `MJCYLWVRGW`
- **Agent Name**: `Hiker_course_recommendation`
- **Foundation Model**: `apac.amazon.nova-lite-v1:0`
- **Status**: `PREPARED`

### 6. 참고사항
- Lambda parser를 추가하지 않고도 해결할 수 있는 다른 방법이 있는지 AWS 문서 확인 필요
- Amazon Nova 모델과 호환되는 parser 설정 확인
- 다른 Agent들도 동일한 설정(DEFAULT parser)을 사용하고 있으므로, 공통 해결책이 필요할 수 있음

## 대안: 코드 레벨 처리
Lambda parser 추가가 어려운 경우, 코드 레벨에서 에러를 더 잘 처리하여 실제 응답 데이터를 추출하는 방법도 고려할 수 있습니다.

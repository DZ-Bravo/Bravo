# Bedrock Agent Nova 모델 파싱 에러 대안 해결 방법

## 문제 상황
- Nova 모델(`apac.amazon.nova-lite-v1:0`) 사용 중
- DEFAULT parser가 Nova 응답을 파싱하지 못함
- Lambda Parser 시도했으나 형식 문제로 실패

## 해결 방법 1: 모델 변경 (가장 권장)

### 방법: Nova → Claude 3.5 Sonnet 변경

**장점:**
- DEFAULT parser와 완벽 호환
- 안정적이고 검증된 모델
- Knowledge Base, Action Groups 모두 정상 작동

**단점:**
- 비용 차이 (Claude가 더 비쌀 수 있음)
- 응답 스타일/품질 차이

### AWS 콘솔에서 변경 방법:

1. **AWS Bedrock 콘솔 접속**
2. **Agents** → `Hiker_course_recommendation` (EFHTPK8I6B) 선택
3. **Edit** 버튼 클릭
4. **Agent builder** → **Model configuration** 또는 **Foundation model** 섹션
5. **Foundation model** 선택:
   - 기존: `apac.amazon.nova-lite-v1:0`
   - 변경: `anthropic.claude-3-5-sonnet-20241022-v2:0` (또는 최신 Claude 3.5)
6. **Save** 클릭
7. **Prepare** 또는 **Deploy** 실행

### AWS CLI로 변경 (선택사항):
```bash
# Agent 업데이트 (실제 API는 복잡할 수 있음)
# 주의: Agent의 Foundation model을 변경하는 API는 제한적일 수 있음
# 콘솔 사용 권장
```

## 해결 방법 2: 에러 응답 본문에서 데이터 추출 (고급)

파싱 에러가 발생하더라도, 실제 응답 데이터가 에러 본문에 포함되어 있을 수 있습니다.

### 코드 수정 아이디어:

```javascript
// 파싱 에러 발생 시, 에러 본문에서 실제 데이터 추출 시도
if (errorMessage.includes('parse')) {
  try {
    // 에러 응답 본문에서 JSON 또는 텍스트 추출
    const errorBody = bedrockError.$response?.body
    if (errorBody) {
      // 본문에서 실제 응답 데이터 추출 로직
      // (실제 형식은 Bedrock 응답 구조에 따라 다를 수 있음)
    }
  } catch (extractError) {
    console.error('에러 본문에서 데이터 추출 실패')
  }
}
```

**주의사항:**
- 실제 응답 형식을 정확히 알아야 함
- 불안정할 수 있음
- AWS SDK 업데이트 시 작동하지 않을 수 있음

## 해결 방법 3: InvokeModel API 직접 사용 (제한적)

Bedrock Agent 대신 Runtime API를 직접 사용:
- Knowledge Base 검색 수동 구현 필요
- Action Groups (Lambda 함수) 수동 호출 필요
- Agent의 편의 기능 모두 포기

**권장하지 않음** - Agent의 모든 기능을 다시 구현해야 함

## 해결 방법 4: AWS SDK 업그레이드

최신 AWS SDK가 Nova 모델을 지원할 수 있음:
```bash
npm update @aws-sdk/client-bedrock-agent-runtime
```

**확인 필요:**
- 최신 SDK 버전에서 Nova 지원 여부 확인
- Release notes 확인

## 권장 해결 순서

1. **1순위: 모델 변경 (Nova → Claude 3.5)**
   - 가장 확실하고 안정적
   - 즉시 적용 가능

2. **2순위: AWS SDK 업그레이드**
   - 코드 변경 최소
   - 하지만 지원 여부 확인 필요

3. **3순위: 에러 본문 데이터 추출**
   - 복잡하고 불안정
   - 임시 조치로만 권장

## 모델 변경 시 주의사항

1. **비용 확인**
   - Claude는 Nova보다 비쌀 수 있음
   - 사용량 모니터링 필요

2. **응답 품질 차이**
   - 테스트 필수
   - Instruction 조정 필요할 수 있음

3. **Knowledge Base 호환성**
   - Claude는 Nova와 동일하게 작동
   - 문제 없음

4. **Action Groups**
   - Lambda 함수는 그대로 작동
   - 변경 불필요

## 다음 단계

1. 모델 변경을 AWS 콘솔에서 수행
2. 테스트 요청: "서울 근처 산 추천해줘"
3. 200 OK 응답 확인
4. 응답 품질 검토 및 필요시 Instruction 조정

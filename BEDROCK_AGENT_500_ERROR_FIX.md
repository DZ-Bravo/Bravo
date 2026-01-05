# Bedrock Agent 500 에러 해결 가이드

## 에러 현상
```
POST /api/ai/recommend-course 500 (Internal Server Error)
{"error":"AI 응답 형식 오류가 발생했습니다. Bedrock Agent 설정을 확인해주세요."}
```

## 원인 분석

### 1. 근본 원인
- **Bedrock Agent**: `Hiker_course_recommendation` (Agent ID: `EFHTPK8I6B`)
- **Foundation Model**: `apac.amazon.nova-lite-v1:0` (Nova Lite)
- **문제**: Amazon Nova 모델의 응답을 DEFAULT parser가 파싱하지 못함

### 2. 에러 발생 경로
1. 사용자 요청: "서울 근처 산 추천해줘"
2. Bedrock Agent 호출 성공
3. Nova 모델이 응답 생성
4. **DEFAULT parser가 응답을 파싱하지 못함**
5. AWS SDK에서 파싱 에러 발생
6. 코드에서 에러를 감지하고 500 에러 반환

### 3. 코드 분석
- 현재 활성 코드: `/home/bravo/LABs/services/backend-services/ai-service/server.js`
- 에러 메시지: "AI 응답 형식 오류가 발생했습니다. Bedrock Agent 설정을 확인해주세요."는 이전 버전 코드에서 발생
- 실제 에러는 Bedrock Agent의 파싱 실패로 인한 것

## 해결 방법

### 방법 1: Lambda Parser 설정 (권장)

Lambda Parser 함수(`bedrock-course-parser`)가 이미 존재하므로, Bedrock Agent에 연결만 하면 됩니다.

#### 1단계: Lambda 함수 확인
```bash
aws lambda get-function --function-name bedrock-course-recommendation-parser --region ap-northeast-2
```

함수가 없다면 생성:
```bash
cd /home/bravo/LABs/lambda-functions/bedrock-course-parser
zip bedrock-course-parser.zip lambda_function.py

aws lambda create-function \
  --function-name bedrock-course-recommendation-parser \
  --runtime python3.11 \
  --role arn:aws:iam::940482451773:role/lambda-execution-role \
  --handler lambda_function.lambda_handler \
  --zip-file fileb://bedrock-course-parser.zip \
  --region ap-northeast-2
```

#### 2단계: Bedrock Agent에 Lambda Parser 연결

**AWS 콘솔에서:**
1. AWS Management Console → Amazon Bedrock
2. Agents → `Hiker_course_recommendation` 선택
3. **Edit** 버튼 클릭
4. **Advanced prompts** 또는 **Prompt Configuration** 섹션으로 이동
5. **ORCHESTRATION** prompt type 찾기
6. **Parser Configuration** 섹션에서:
   - Parser mode를 **Lambda** 또는 **Custom parser**로 변경
   - Lambda function 선택: `bedrock-course-recommendation-parser`
7. **Save** 클릭

**AWS CLI로 (선택사항):**
```bash
# Agent의 현재 설정 확인
aws bedrock-agent get-agent \
  --agent-id EFHTPK8I6B \
  --region ap-northeast-2

# Prompt configuration 업데이트 (예시)
# 주의: 실제 형식은 AWS CLI 버전에 따라 다를 수 있음
```

### 방법 2: 모델 변경 (대안)

Nova 모델 대신 Claude 모델을 사용:
- `anthropic.claude-3-5-sonnet-20241022-v2:0`
- DEFAULT parser와 호환됨

**단점**: 모델 변경 시 성능 및 비용 차이 발생 가능

### 방법 3: 코드 레벨 에러 처리 개선 (임시 조치)

현재 코드는 이미 에러 처리를 하고 있으나, 더 구체적인 로깅 추가 가능:
- CloudWatch Logs에서 실제 Bedrock 에러 메시지 확인
- 에러 원인에 따른 다른 처리 로직 추가

## 확인 방법

### 1. Lambda Parser 연결 확인
```bash
aws bedrock-agent get-agent \
  --agent-id EFHTPK8I6B \
  --region ap-northeast-2 \
  --query 'agent.promptConfiguration' \
  --output json
```

### 2. 테스트
Lambda Parser 설정 후:
1. 프론트엔드에서 "서울 근처 산 추천해줘" 요청
2. 200 OK 응답 확인
3. 추천 결과가 정상적으로 반환되는지 확인

### 3. 로그 확인
CloudWatch Logs에서:
- `/aws/bedrock/agents/EFHTPK8I6B` - Agent 로그
- `/aws/lambda/bedrock-course-recommendation-parser` - Parser 로그
- `/aws/ecs/ai-service` 또는 해당 서비스 로그 - 애플리케이션 로그

## 참고 문서
- `AGENT_CONFIGURATION_SUMMARY.md` - Agent 구성 정보
- `BEDROCK_AGENT_PARSER_FIX.md` - Lambda Parser 설정 가이드
- `lambda-functions/bedrock-course-parser/README.md` - Parser 함수 설명

## 요약
**핵심 문제**: Nova 모델 응답을 DEFAULT parser가 파싱하지 못함  
**해결 방법**: Lambda Parser를 Bedrock Agent에 연결  
**예상 시간**: 5-10분 (AWS 콘솔에서 설정)

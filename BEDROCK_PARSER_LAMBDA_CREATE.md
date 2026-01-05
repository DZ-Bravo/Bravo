# Bedrock Agent Parser Lambda 함수 생성 가이드

## 현재 상황
- Agent: `Hiker_course_recommendation` (EFHTPK8I6B)
- 문제: Amazon Nova 모델 응답을 DEFAULT parser가 파싱하지 못함
- 해결: Lambda parser 함수 생성 및 연결

## Lambda Parser 함수 생성

### 1. AWS Lambda 콘솔에서 함수 생성

**기본 설정:**
- 함수 이름: `bedrock-course-recommendation-parser` (또는 원하는 이름)
- Runtime: Python 3.11 이상 (또는 Node.js)
- Architecture: x86_64
- Execution role: 적절한 IAM 역할 (Bedrock Agent 접근 권한)

### 2. 함수 코드 (Python 예제)

```python
import json
import re

def lambda_handler(event, context):
    """
    Bedrock Agent의 Nova 모델 응답을 파싱하는 Lambda 함수
    
    입력: Agent의 원본 응답
    출력: 파싱된 응답 형식
    """
    try:
        # 입력 형식 확인
        message = event.get('message', {})
        content = message.get('content', [{}])[0]
        original_text = content.get('text', '')
        
        if not original_text:
            # 빈 응답인 경우
            return {
                'statusCode': 200,
                'response': {
                    'text': '',
                    'thought': '',
                    'actionGroups': [],
                    'knowledgeBases': []
                }
            }
        
        # Nova 모델 응답 파싱
        # <thinking> 태그 내용 추출 (선택사항)
        thought_match = re.search(r'<thinking>(.*?)</thinking>', original_text, re.DOTALL)
        thought = thought_match.group(1).strip() if thought_match else ''
        
        # <answer> 태그 내용 추출 (최종 응답)
        answer_match = re.search(r'<answer>(.*?)</answer>', original_text, re.DOTALL)
        if answer_match:
            parsed_text = answer_match.group(1).strip()
        else:
            # <answer> 태그가 없으면 전체 텍스트 사용
            # <thinking> 태그 제거
            parsed_text = re.sub(r'<thinking>.*?</thinking>', '', original_text, flags=re.DOTALL).strip()
        
        # 결과 반환
        return {
            'statusCode': 200,
            'response': {
                'text': parsed_text,
                'thought': thought,
                'actionGroups': [],
                'knowledgeBases': []
            }
        }
        
    except Exception as e:
        # 에러 발생 시 원본 텍스트 반환
        return {
            'statusCode': 200,
            'response': {
                'text': event.get('message', {}).get('content', [{}])[0].get('text', ''),
                'thought': '',
                'actionGroups': [],
                'knowledgeBases': []
            }
        }
```

### 3. IAM 역할 권한

Lambda 함수의 실행 역할에 다음 권한 필요:
- `bedrock:InvokeModel` (필요한 경우)
- CloudWatch Logs 권한

### 4. Agent에 연결

1. AWS Bedrock 콘솔 → Agents → `Hiker_course_recommendation`
2. Edit → Advanced prompts → Orchestration
3. Configurations 섹션에서 "Use Lambda function for parsing" 체크
4. 생성한 Lambda 함수 선택
5. Save

## 참고사항

- Parser Lambda 함수는 Agent의 모든 응답에 대해 호출됩니다
- 함수가 에러를 반환하면 Agent도 에러를 반환할 수 있습니다
- 테스트를 위해 먼저 간단한 파서를 만들어 테스트하는 것을 권장합니다

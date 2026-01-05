# Bedrock Course Recommendation Parser Lambda

## 목적
Bedrock Agent의 Nova 모델 응답을 파싱하여 DEFAULT parser 에러를 해결합니다.

## 배포 방법

### 1. ZIP 파일 생성
```bash
cd /home/bravo/LABs/lambda-functions/bedrock-course-parser
zip bedrock-course-parser.zip lambda_function.py
```

### 2. AWS Lambda 함수 생성
```bash
aws lambda create-function \
  --function-name bedrock-course-recommendation-parser \
  --runtime python3.11 \
  --role arn:aws:iam::940482451773:role/lambda-execution-role \
  --handler lambda_function.lambda_handler \
  --zip-file fileb://bedrock-course-parser.zip \
  --region ap-northeast-2
```

또는 AWS 콘솔에서:
1. Lambda 콘솔 → Functions → Create function
2. 함수 이름: `bedrock-course-recommendation-parser`
3. Runtime: Python 3.11
4. 코드 업로드: ZIP 파일 업로드 또는 코드 직접 입력

### 3. Agent에 연결
1. Bedrock 콘솔 → Agents → Hiker_course_recommendation
2. Edit → Advanced prompts → Orchestration
3. Configurations → "Use Lambda function for parsing" 체크
4. Lambda 함수 선택: `bedrock-course-recommendation-parser`
5. Save

## 참고사항
- 실제 입력/출력 형식은 Bedrock Agent 버전에 따라 다를 수 있습니다
- CloudWatch Logs에서 실제 입력 형식 확인 가능
- 필요시 코드 수정 후 재배포

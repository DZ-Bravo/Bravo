# Bedrock Nova 모델 파서 에러 해결 방안

## 원래 문제
```
An error occurred when attempting to parse the model response with the default parser.
Check your overridden prompt configurations or attach a lambda parser to handle the response.
```

## 시도한 방법
1. ✅ Lambda parser 추가 시도 - 복잡한 응답 형식 요구사항으로 인해 실패
2. 🔄 기본 파서 사용 - 원래 에러로 복귀

## 현재 상태
- Lambda parser 제거 완료
- 기본 파서 사용 중
- 원래 에러 재발 가능성

## 가능한 해결 방안

### 방안 1: 코드 레벨에서 에러 처리 개선
- Bedrock Agent 호출 시 에러를 더 상세히 캐치
- 실제 응답 데이터가 있는지 확인
- 스트림 응답 처리 개선

### 방안 2: Foundation Model 변경 (정책상 불가능)
- Nova Lite → Claude 등 다른 모델
- 사용자 정책상 불가능

### 방안 3: Agent Instruction 수정
- 응답 형식을 기본 파서가 처리할 수 있는 형식으로 조정
- <thinking>, <answer> 태그 사용 규칙 변경

### 방안 4: Bedrock Agent 버전/설정 확인
- Agent 버전 업데이트
- Prompt configuration 재설정

## 다음 단계
1. 기본 파서 사용 상태에서 테스트
2. 실제 에러 메시지 및 로그 확인
3. 가장 실용적인 해결 방안 선택

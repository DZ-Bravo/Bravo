# Hiker_course_recommendation Agent 구성 요약

## Agent 정보
- **Agent ID**: `EFHTPK8I6B`
- **Agent Name**: `Hiker_course_recommendation`
- **Foundation Model**: `apac.amazon.nova-lite-v1:0` (Nova Lite)
- **Agent Version**: `1`
- **Alias ID**: `MJCYLWVRGW`

## 현재 에러
```
An error occurred when attempting to parse the model response with the default parser. 
Check your overridden prompt configurations or attach a lambda parser to handle the response.
```

## Agent 구성 요소

### 1. Knowledge Base
- **KB ID**: `BGDCCVW0WC`
- **이름**: `knowledge-base-mountain-recommendation`
- **설명**: "산 위치와 코스 난이도의 데이터들입니다."
- **상태**: `ENABLED`
- **중요**: Bedrock Knowledge Base는 JSONL을 직접 지원하지 않음. 벡터 스토어(OpenSearch 등)를 통해 텍스트로 인덱싱됨

### 2. Action Groups (Lambda 함수)
- **Action Group ID**: `UDUDXNDETV`
- **이름**: `weatherfetcher`
- **설명**: "산의 위도/경도 기반 날씨 데이터 조회"
- **상태**: `ENABLED`
- **Lambda 함수**: `weather-data-fetcher` (Python 3.14)

### 3. Agent Instruction의 문제점
Agent instruction에 다음 내용이 있음:
```
- KB 검색 결과에서 JSON Lines 형식의 데이터를 파싱할 때:
  - 각 줄이 완전한 JSON 객체인지 확인하고, 파싱 에러가 나는 라인은 건너뜁니다.
```

**문제**: Bedrock Knowledge Base는 JSONL 형식을 직접 반환하지 않음. 텍스트 형식으로 반환되므로 Agent instruction의 JSONL 파싱 지시가 실제로는 작동하지 않음.

## 실제 문제 원인
1. **주요 문제**: Amazon Nova 모델의 응답을 DEFAULT parser가 파싱하지 못함
2. **부차적 문제**: Agent instruction에 JSONL 파싱 요구사항이 있으나 실제로는 불가능

## 해결 방안
1. Lambda parser 추가 (AWS 콘솔에서)
2. 또는 Agent instruction에서 JSONL 파싱 관련 내용 제거/수정
3. 또는 코드 레벨에서 에러 처리 개선

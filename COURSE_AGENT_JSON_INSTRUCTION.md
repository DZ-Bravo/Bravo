# 코스 추천 Agent Instruction 수정 가이드 (JSON 응답 형식)

## 목적
장비 추천 Agent처럼 JSON 형식으로 응답하도록 Instruction을 수정하여 파싱 에러를 해결합니다.

## AWS 콘솔에서 수정 방법

### 1. AWS Bedrock 콘솔 접속
1. AWS Management Console 로그인
2. **Amazon Bedrock** 서비스 선택
3. 왼쪽 메뉴에서 **Agents** 선택

### 2. Agent 선택
- **Agent 이름**: `Hiker_course_recommendation`
- **Agent ID**: `EFHTPK8I6B`

### 3. Instruction 수정
1. **Edit** 버튼 클릭
2. **Agent builder** 탭에서 **Instructions** 섹션 찾기
3. 기존 Instruction 끝에 다음 내용 추가:

---

## 추가할 Instruction 내용

```
[응답 형식 규칙]

항상 JSON 형식으로만 응답해야 합니다. 텍스트 설명 없이 순수 JSON만 출력합니다.

응답 형식:
```json
{
  "recommendations": [
    {
      "mountain": "산 이름",
      "location": "위치",
      "difficulty": "난이도",
      "description": "설명",
      "trail_info": "등산로 정보"
    }
  ]
}
```

중요 사항:
- 반드시 JSON 형식으로만 응답
- 코드 블록(```) 없이 순수 JSON만 출력
- 텍스트 설명, 서문, 결론 등을 포함하지 마세요
- JSON이 유효한 형식이어야 합니다 (배열, 객체 구조)
```

---

## 전체 Instruction 예시 구조

기존 Instruction이 있다면, 그 앞부분은 유지하고 위의 "[응답 형식 규칙]" 부분만 추가하면 됩니다.

예시:
```
[기존 Instruction 내용...]

[응답 형식 규칙]

항상 JSON 형식으로만 응답해야 합니다. 텍스트 설명 없이 순수 JSON만 출력합니다.

응답 형식:
{
  "recommendations": [
    {
      "mountain": "산 이름",
      "location": "위치", 
      "difficulty": "난이도",
      "description": "설명",
      "trail_info": "등산로 정보"
    }
  ]
}

중요 사항:
- 반드시 JSON 형식으로만 응답
- 코드 블록(```) 없이 순수 JSON만 출력
- 텍스트 설명, 서문, 결론 등을 포함하지 마세요
- JSON이 유효한 형식이어야 합니다
```

## 저장 및 테스트

1. **Save** 버튼 클릭
2. **Prepare** 또는 **Deploy** 실행
3. 프론트엔드에서 테스트: "서울 근처 산 추천해줘"
4. 응답이 JSON 형식으로 오는지 확인

## 코드 수정 (선택사항)

코스 추천 코드도 장비 추천처럼 JSON 파싱 로직을 추가해야 할 수 있습니다. 
하지만 우선 Agent Instruction 수정 후 응답 형식을 확인한 후, 필요시 코드 수정을 진행하면 됩니다.

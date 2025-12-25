# AI 분석 기능 개선 계획

## 현재 상태

### 구현된 부분
1. **Bedrock Agent 연결**
   - `BEDROCK_ANALYSIS_AGENT_ID`, `BEDROCK_ANALYSIS_AGENT_ALIAS_ID` 환경변수 설정됨
   - `bedrock-analysis.js` 서비스 구현됨
   - `/api/monitoring/ai/analyze` 엔드포인트 존재

2. **현재 전달되는 데이터 (제한적)**
   - `getRealtimeMetrics(node)`: CPU, Memory, 5XX Error Rate만
   - `getRecentLogs(50)`: 최근 50개 로그만

3. **대시보드에 표시되는 데이터 (미전달)**
   - 클러스터 개요 (노드 수, Pod 수)
   - 리소스 사용률 (CPU/Memory 시계열)
   - Container CPU/Memory 사용량
   - Pod CPU/Memory 사용량
   - 5XX 에러 단계별 분류 (HAProxy → Gateway → App → Downstream)
   - Loki/Promtail 에러 로그 (시간별 카운트, 서비스별 에러, Top N 에러 메시지)
   - 헬스체크 상태 및 에러

## 목표

**대시보드에 표시되는 모든 메트릭, 로그, 헬스체크 데이터를 AI에게 전달하여 종합 분석 수행**

## 전달할 데이터 구조

### 1. 클러스터 개요
```javascript
{
  cluster: {
    nodes: { total: number, ready: number },
    pods: { total: number, running: number, pending: number, failed: number },
    errorCount: number  // 금일 5XX 에러 수
  }
}
```

### 2. 리소스 사용률 (시계열)
```javascript
{
  resourceUsage: {
    node: string,  // 선택된 노드 또는 "all"
    cpu: {
      current: number,  // 현재 사용률 %
      average: number,  // 평균 사용률 %
      peak: number,     // 피크 사용률 %
      threshold: { warning: 70, critical: 85 },
      timeline: Array<{timestamp, value}>  // 최근 1시간 데이터
    },
    memory: {
      current: number,
      average: number,
      peak: number,
      threshold: { warning: 75, critical: 90 },
      timeline: Array<{timestamp, value}>
    }
  }
}
```

### 3. Container/Pod 메트릭
```javascript
{
  containers: {
    cpu: {
      top5: Array<{name, namespace, currentUsage, peakUsage, trend}>,
      overThreshold: Array<{name, namespace, usage, threshold}>
    },
    memory: {
      top5: Array<{name, namespace, currentUsage, peakUsage, trend}>,
      overThreshold: Array<{name, namespace, usage, threshold}>
    }
  },
  pods: {
    cpu: {
      top5: Array<{name, namespace, node, currentUsage, peakUsage, trend}>,
      overThreshold: Array<{name, namespace, node, usage, threshold}>
    },
    memory: {
      top5: Array<{name, namespace, node, currentUsage, peakUsage, trend}>,
      overThreshold: Array<{name, namespace, node, usage, threshold}>
    }
  }
}
```

### 4. 에러 분석
```javascript
{
  errors: {
    breakdown: {
      haproxy: { count: number, percentage: string },
      gateway: { count: number, percentage: string },
      application: { count: number, percentage: string },
      downstream: { count: number, percentage: string },
      total: number
    },
    timeline: Array<{timestamp, count}>,  // 시간별 에러 카운트
    topErrors: Array<{
      message: string,
      count: number,
      namespace: string,
      service: string,
      latestTimestamp: string
    }>,
    recentErrors: Array<{
      namespace: string,
      service: string,
      level: string,
      message: string,
      timestamp: string
    }>
  }
}
```

### 5. 헬스체크 상태
```javascript
{
  healthcheck: {
    status: 'healthy' | 'warning' | 'critical',
    errors: Array<{
      pod: string,
      node: string,
      timestamp: string,
      message: string
    }>,
    lastChecked: string
  }
}
```

### 6. 컨텍스트 정보
```javascript
{
  context: {
    selectedNode: string,  // 선택된 노드 또는 "all"
    timeRange: {
      start: string,  // ISO 8601
      end: string,    // ISO 8601
      duration: string  // "1h", "24h" 등
    },
    analysisTime: string  // 분석 요청 시각
  }
}
```

## AI 분석 프롬프트 (Bedrock Agent에 설정할 내용)

### 시스템 프롬프트
```
당신은 Kubernetes 클러스터 인프라 모니터링 전문가입니다. 
제공된 메트릭, 로그, 헬스체크 데이터를 종합 분석하여 다음을 수행합니다:

1. **현재 상태 요약**
   - 클러스터 전반적인 건강 상태
   - 주요 이슈 및 경고 사항
   - 리소스 사용률 평가

2. **이상 징후 분석**
   - 임계치 초과 리소스 식별
   - 에러 패턴 분석 (5XX 에러 발생 지점, 빈도, 원인 추정)
   - 헬스체크 실패 원인 분석

3. **성능 분석**
   - CPU/Memory 사용률 추세 분석
   - 컨테이너/Pod별 리소스 사용 패턴
   - 피크 시간대 및 원인 추정

4. **권장 사항**
   - 즉시 조치가 필요한 항목
   - 리소스 최적화 제안
   - 예방 조치 제안

5. **다음 단계**
   - 추가 조사가 필요한 영역
   - 모니터링 강화가 필요한 지표

응답은 한국어로 작성하며, 구조화된 형식(마크다운)으로 제공합니다.
```

### 사용자 프롬프트 템플릿
```
다음은 Kubernetes 클러스터의 모니터링 데이터입니다:

[여기에 JSON 데이터 삽입]

위 데이터를 분석하여 클러스터 상태, 이상 징후, 성능 이슈, 권장 사항을 제시해주세요.
```

## 구현 작업

### 1. 백엔드 개선 (`routes/ai.js`)
- 모든 관련 데이터 수집 함수 호출
- 데이터 구조화 및 정리
- Bedrock Agent에 전달

### 2. 데이터 수집 함수 추가 (`services/prometheus.js`, `services/loki.js`, `services/healthcheck.js`)
- 필요한 추가 메트릭 수집 함수 구현
- 헬스체크 상태 수집 함수 확인/개선

### 3. 프론트엔드 개선 (`public/js/main.js`)
- `runAIAnalysis()` 함수 개선
- 분석 결과 표시 UI 개선 (마크다운 렌더링)

### 4. Bedrock Agent 설정 (AWS 콘솔)
- 시스템 프롬프트 설정
- Instruction 설정 (위의 시스템 프롬프트 내용)

## 참고사항

1. **데이터 크기 제한**
   - Bedrock Agent의 입력 크기 제한 고려
   - 중요한 데이터 우선순위화
   - 시계열 데이터는 샘플링 또는 집계

2. **응답 형식**
   - 마크다운 형식 권장
   - 구조화된 섹션으로 구성

3. **성능 고려**
   - 데이터 수집 시간 최소화
   - 병렬 처리 활용



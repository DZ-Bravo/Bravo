# Log와 Trace 데이터 구조

## 📋 Logs (Loki) 데이터 구조

### API 엔드포인트
- **URL**: `/api/monitoring/errors/app`
- **파라미터**: 
  - `start`: ISO 8601 형식 (예: `2026-01-05T00:00:00.000Z`)
  - `end`: ISO 8601 형식
  - `limit`: 숫자 (기본값: 50)
  - `namespace`: 선택사항 (예: `bravo-core-ns`)

### Loki 쿼리
```logql
{namespace=~"bravo-.*"} |= "error" | json | level="error"
```

### 반환 데이터 형식 (배열)
```javascript
[
  {
    timestamp: 1736006400000,  // 밀리초 단위 (JavaScript Date.getTime())
    message: "에러 메시지 내용",
    level: "error",             // 로그 레벨
    service: "ai-infra-service", // 서비스 이름 (logEntry.service 또는 stream.stream.pod)
    namespace: "bravo-ai-integration-ns" // 네임스페이스
  },
  // ...
]
```

### 프론트엔드에서 사용하는 필드
- `log.timestamp` → `new Date(log.timestamp).toLocaleString()` (표시용)
- `log.service` 또는 `log.namespace` → 서비스 이름 표시
- `log.level` → 로그 레벨 표시 (필터링에도 사용)
- `log.message` → 에러 메시지 표시

---

## 🐌 Traces (Tempo) 데이터 구조

### API 엔드포인트

#### 1. Slow Traces
- **URL**: `/api/monitoring/traces/slow`
- **파라미터**:
  - `start`: ISO 8601 형식
  - `end`: ISO 8601 형식
  - `limit`: 숫자 (기본값: 10)

#### 2. Error Traces
- **URL**: `/api/monitoring/traces/error`
- **파라미터**:
  - `start`: ISO 8601 형식
  - `end`: ISO 8601 형식
  - `limit`: 숫자 (기본값: 10)

### Tempo API 호출
- **Tempo URL**: `http://43.200.143.174:3200/api/search`
- **파라미터**:
  - `q`: 쿼리 문자열 (빈 문자열이면 전체 검색)
  - `start`: Unix timestamp (초 단위)
  - `end`: Unix timestamp (초 단위)

### 반환 데이터 형식 (배열)

#### Slow Traces
```javascript
[
  {
    traceID: "abc123...",           // 또는 traceId
    duration: 1500000000,            // 나노초 단위 (또는 durationMs)
    durationMs: 1500,                // 밀리초 단위 (선택사항)
    serviceName: "ai-infra-service", // 또는 service
    service: "ai-infra-service",     // 서비스 이름
    startTimeUnixNano: 1736006400000000000, // 나노초 단위 (또는 startTime)
    startTime: 1736006400000,        // 밀리초 단위 (선택사항)
    tags: {                         // 선택사항
      error: "true",
      status_code: 500
    },
    statusCode: 500,                 // 선택사항
    error: true                      // 선택사항
  },
  // ...
]
```

#### Error Traces
```javascript
[
  {
    traceID: "def456...",
    duration: 500000000,
    serviceName: "auth-service",
    startTimeUnixNano: 1736006500000000000,
    tags: {
      error: "true",
      status_code: 400
    },
    statusCode: 400,
    error: true
  },
  // ...
]
```

### 프론트엔드에서 사용하는 필드
- `trace.traceID` 또는 `trace.traceId` → 트레이스 ID 표시
- `trace.duration` 또는 `trace.durationMs` → 지속 시간 표시
  - `duration`이 나노초 단위면: `(trace.duration / 1000000).toFixed(2) + "ms"`
  - `durationMs`가 있으면: `durationMs + "ms"`
- `trace.serviceName` 또는 `trace.service` → 서비스 이름 표시
- `trace.startTimeUnixNano` 또는 `trace.startTime` → 시작 시간 표시
  - `startTimeUnixNano`가 나노초 단위면: `new Date(trace.startTimeUnixNano / 1000000).toLocaleString()`
  - `startTime`이 있으면: `new Date(trace.startTime).toLocaleString()`

---

## 🔍 데이터 필터링 및 정렬

### Logs
- **Slow Traces**: `duration` 또는 `durationMs` 기준으로 내림차순 정렬
- **Error Traces**: `startTimeUnixNano` 또는 `startTime` 기준으로 내림차순 정렬 (최신순)
- **Error Traces 필터링 조건**:
  ```javascript
  t.tags?.error === 'true' || 
  t.tags?.status_code >= 400 ||
  t.statusCode >= 400 ||
  t.error === true
  ```

### Logs
- 시간순 정렬 (최신순): `logs.sort((a, b) => b.timestamp - a.timestamp)`
- 레벨 필터링: `log.level === levelFilter`

---

## 📝 참고사항

1. **Loki 쿼리 형식**:
   - `{namespace=~"bravo-.*"}`: bravo-로 시작하는 모든 네임스페이스
   - `|= "error"`: "error" 문자열이 포함된 로그
   - `| json`: JSON 파싱
   - `level="error"`: level 필드가 "error"인 로그

2. **Tempo 쿼리 형식**:
   - 빈 쿼리(`""`)는 모든 트레이스 검색
   - 쿼리 예시: `duration > 1s`, `status_code >= 400 OR error=true`

3. **타임스탬프 변환**:
   - **Loki**: 나노초 → 밀리초 (`timestamp / 1000000`)
   - **Tempo**: 나노초 → 밀리초 (`startTimeUnixNano / 1000000`)
   - **Tempo API**: 밀리초 → 초 (`Math.floor(time / 1000)`)

4. **에러 처리**:
   - Loki 쿼리 실패 시: 빈 배열 반환 또는 에러 throw
   - Tempo 쿼리 실패 시: 빈 배열 반환 (400 에러는 쿼리 형식 문제로 간주)

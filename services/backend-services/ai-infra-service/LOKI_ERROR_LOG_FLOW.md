# Loki/Promtail Error Log 카드 데이터 흐름

## 개요
Loki/Promtail Error Log 카드는 3개 섹션으로 구성되어 있으며, 각각 다른 방식으로 데이터를 수집하고 표시합니다.

---

## 1. 시간별 에러 로그 수 (왼쪽 그래프)

### 프론트엔드 (main.js)
- **함수**: `updateErrorLogs()` (1328줄)
- **API 호출**: 
  ```
  GET /api/monitoring/errors/log-count?start={start}&end={end}&source=app
  ```
- **차트**: `errorLogCountChart` (Chart.js Line Chart)
- **표시 위치**: `#errorLogCountChart`

### 데이터 가공 (프론트엔드)
```javascript
// 응답 데이터: [[timestamp, count], [timestamp, count], ...]
const labels = counts.map(c => new Date(c[0]).toLocaleTimeString())  // 시간 라벨
const data = counts.map(c => c[1])  // 카운트 값

// 최근 20개만 표시
errorLogCountChart.data.labels = labels.slice(-20)
errorLogCountChart.data.datasets[0].data = data.slice(-20)
errorLogCountChart.update()
```

### 백엔드 (routes/errors.js)
- **엔드포인트**: `GET /errors/log-count`
- **서비스**: `lokiService.getErrorLogCountOverTime(start, end, source)`

### 데이터 소스 (services/loki.js)
- **함수**: `getErrorLogCountOverTime()` (160줄)
- **Loki 쿼리**:
  - `source=app`: `{namespace=~"bravo-.*"} |= "error"`
  - `source=loki`: `{job="loki"} |= "error"`
  - `source=promtail`: `{job="promtail"} |= "error"`
- **Loki API**: `/loki/api/v1/query_range`

### 데이터 가공 (백엔드)
1. **Loki 쿼리 실행**: `queryLoki(query, start, end)`
2. **시간별 그룹화** (1분 단위):
   ```javascript
   const timeGroups = {}
   results.forEach(stream => {
     stream.values.forEach(([timestamp, message]) => {
       const time = parseInt(timestamp) / 1000000  // nanoseconds → milliseconds
       const minute = Math.floor(time / 60000) * 60000  // 1분 단위로 반올림
       
       if (!timeGroups[minute]) {
         timeGroups[minute] = 0
       }
       timeGroups[minute]++
     })
   })
   ```
3. **배열로 변환 및 정렬**:
   ```javascript
   return Object.entries(timeGroups)
     .map(([time, count]) => [parseInt(time), count])
     .sort((a, b) => a[0] - b[0])
   ```

### 반환 데이터 형식
```json
[
  [1699123456000, 5],   // [timestamp(ms), count]
  [1699123516000, 8],
  [1699123576000, 3]
]
```

### 필요한 키/레이블
- **Loki 레이블**: `namespace`, `job`
- **로그 메시지**: "error" 문자열 포함 여부

---

## 2. Namespace/서비스별 최근 에러 로그 (오른쪽 상단)

### 프론트엔드 (main.js)
- **함수**: `updateErrorLogs()` → `updateServiceErrorList()` (1364줄)
- **API 호출**:
  ```
  GET /api/monitoring/errors/service-errors?start={start}&end={end}&limit=30
  ```
- **표시 위치**: `#serviceErrorList`

### 데이터 가공 (프론트엔드)
```javascript
// 로그가 없으면
if (!logs || logs.length === 0) {
  list.innerHTML = '<p>에러 로그가 없습니다.</p>'
  return
}

// 각 로그 항목 생성
logs.forEach(log => {
  const item = document.createElement('div')
  item.innerHTML = `
    <div class="log-item-header">
      <span>${log.namespace || 'unknown'}</span>
      <span>${log.service || 'unknown'}</span>
      <span>${new Date(log.timestamp).toLocaleString()}</span>
    </div>
    <div class="log-item-message">${escapeHtml(log.message)}</div>
    <div class="log-item-level">${log.level}</div>
  `
  list.appendChild(item)
})
```

### 백엔드 (routes/errors.js)
- **엔드포인트**: `GET /errors/service-errors`
- **서비스**: `lokiService.getServiceErrors(start, end, limit)`

### 데이터 소스 (services/loki.js)
- **함수**: `getServiceErrors()` (195줄)
- **Loki 쿼리**: `{namespace=~"bravo-.*"} |= "error"`
- **Loki API**: `/loki/api/v1/query_range`

### 데이터 가공 (백엔드)
1. **Loki 쿼리 실행**: `queryLoki(query, start, end)`
2. **스트림별 파싱**:
   ```javascript
   results.forEach(stream => {
     const namespace = stream.stream?.namespace || 'unknown'
     const pod = stream.stream?.pod || 'unknown'
     const container = stream.stream?.container || 'unknown'
     
     stream.values.forEach(([timestamp, message]) => {
       try {
         const logEntry = JSON.parse(message)  // JSON 파싱 시도
         logs.push({
           timestamp: parseInt(timestamp) / 1000000,  // nanoseconds → milliseconds
           message: logEntry.message || message,
           level: logEntry.level || 'error',
           namespace: namespace,
           service: pod,  // Pod 이름을 서비스로 사용
           container: container
         })
       } catch (e) {
         // JSON 파싱 실패 시 원본 메시지 사용
         logs.push({
           timestamp: parseInt(timestamp) / 1000000,
           message: message || 'No message',
           level: 'error',
           namespace: namespace,
           service: pod,
           container: container
         })
       }
     })
   })
   ```
3. **정렬 및 제한**:
   ```javascript
   return logs.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit)
   ```

### 반환 데이터 형식
```json
[
  {
    "timestamp": 1699123456000,
    "message": "Connection timeout",
    "level": "error",
    "namespace": "bravo-ai-integration-ns",
    "service": "ai-service-xxx",
    "container": "ai-service"
  }
]
```

### 필요한 키/레이블
- **Loki 레이블**: `namespace`, `pod`, `container`
- **로그 메시지**: "error" 문자열 포함 여부
- **JSON 필드** (선택적): `message`, `level`

---

## 3. Top N 에러 메시지 (오른쪽 하단)

### 프론트엔드 (main.js)
- **함수**: `updateErrorLogs()` → `updateTopErrorMessagesList()` (1392줄)
- **API 호출**:
  ```
  GET /api/monitoring/errors/top-errors?start={start}&end={end}&topN=10
  ```
- **표시 위치**: `#topErrorMessagesList`

### 데이터 가공 (프론트엔드)
```javascript
// 에러가 없으면
if (!topErrors || topErrors.length === 0) {
  list.innerHTML = '<p>에러 메시지가 없습니다.</p>'
  return
}

// Top N 에러 표시
topErrors.forEach((error, index) => {
  const item = document.createElement('div')
  item.innerHTML = `
    <div class="top-error-rank">#${index + 1}</div>
    <div class="top-error-content">
      <div class="top-error-header">
        <span>${error.count}회 발생</span>
        <span>${error.level}</span>
        <span>최근: ${new Date(error.lastOccurred).toLocaleString()}</span>
      </div>
      <div class="top-error-message">${escapeHtml(error.message)}</div>
    </div>
  `
  list.appendChild(item)
})
```

### 백엔드 (routes/errors.js)
- **엔드포인트**: `GET /errors/top-errors`
- **서비스**: `lokiService.getTopErrorMessages(start, end, topN)`

### 데이터 소스 (services/loki.js)
- **함수**: `getTopErrorMessages()` (245줄)
- **Loki 쿼리**: `{namespace=~"bravo-.*"} |= "error"`
- **Loki API**: `/loki/api/v1/query_range`

### 데이터 가공 (백엔드)
1. **Loki 쿼리 실행**: `queryLoki(query, start, end)`
2. **에러 메시지별 카운팅**:
   ```javascript
   const messageCounts = {}
   
   results.forEach(stream => {
     stream.values.forEach(([timestamp, message]) => {
       try {
         const logEntry = JSON.parse(message)
         const errorMessage = logEntry.message || message || 'No message'
         
         // 메시지 정규화 (공백 제거, 소문자 변환)
         const normalizedMessage = errorMessage.trim().toLowerCase()
         
         if (!messageCounts[normalizedMessage]) {
           messageCounts[normalizedMessage] = {
             message: errorMessage,  // 원본 메시지 보존
             count: 0,
             level: logEntry.level || 'error',
             lastOccurred: parseInt(timestamp) / 1000000
           }
         }
         
         messageCounts[normalizedMessage].count++
         
         // 최신 발생 시간 업데이트
         const msgTime = parseInt(timestamp) / 1000000
         if (msgTime > messageCounts[normalizedMessage].lastOccurred) {
           messageCounts[normalizedMessage].lastOccurred = msgTime
         }
       } catch (e) {
         // JSON 파싱 실패 시 원본 메시지 사용
         // 동일한 로직 반복
       }
     })
   })
   ```
3. **빈도순 정렬 및 Top N 추출**:
   ```javascript
   return Object.values(messageCounts)
     .sort((a, b) => b.count - a.count)  // 빈도 내림차순
     .slice(0, topN)
   ```

### 반환 데이터 형식
```json
[
  {
    "message": "Connection timeout",
    "count": 25,
    "level": "error",
    "lastOccurred": 1699123456000
  },
  {
    "message": "Database connection failed",
    "count": 18,
    "level": "error",
    "lastOccurred": 1699123516000
  }
]
```

### 필요한 키/레이블
- **Loki 레이블**: `namespace`
- **로그 메시지**: "error" 문자열 포함 여부
- **JSON 필드** (선택적): `message`, `level`

---

## 전체 데이터 흐름 요약

```
프론트엔드 (main.js)
  ↓ updateErrorLogs() 호출
  ↓
  ├─→ GET /api/monitoring/errors/log-count
  │     ↓
  │   백엔드 (routes/errors.js)
  │     ↓
  │   lokiService.getErrorLogCountOverTime()
  │     ↓
  │   Loki API: /loki/api/v1/query_range
  │     ↓
  │   쿼리: {namespace=~"bravo-.*"} |= "error"
  │     ↓
  │   시간별 그룹화 (1분 단위)
  │     ↓
  │   반환: [[timestamp, count], ...]
  │     ↓
  │   프론트엔드: Chart.js로 그래프 표시
  │
  ├─→ GET /api/monitoring/errors/service-errors
  │     ↓
  │   백엔드 (routes/errors.js)
  │     ↓
  │   lokiService.getServiceErrors()
  │     ↓
  │   Loki API: /loki/api/v1/query_range
  │     ↓
  │   쿼리: {namespace=~"bravo-.*"} |= "error"
  │     ↓
  │   스트림별 파싱 (namespace, pod, container 추출)
  │     ↓
  │   JSON 파싱 시도 (message, level 추출)
  │     ↓
  │   시간순 정렬 (최신순)
  │     ↓
  │   반환: [{timestamp, message, level, namespace, service, container}, ...]
  │     ↓
  │   프론트엔드: 리스트로 표시
  │
  └─→ GET /api/monitoring/errors/top-errors
        ↓
      백엔드 (routes/errors.js)
        ↓
      lokiService.getTopErrorMessages()
        ↓
      Loki API: /loki/api/v1/query_range
        ↓
      쿼리: {namespace=~"bravo-.*"} |= "error"
        ↓
      메시지별 카운팅 및 정규화
        ↓
      빈도순 정렬 (내림차순)
        ↓
      반환: [{message, count, level, lastOccurred}, ...]
        ↓
      프론트엔드: Top N 리스트로 표시
```

---

## 데이터가 표시되지 않는 경우

### 가능한 원인
1. **Loki에 에러 로그가 없음**
   - `{namespace=~"bravo-.*"} |= "error"` 쿼리 결과가 빈 배열
   - 실제로 에러가 발생하지 않았거나, 로그에 "error" 문자열이 없음

2. **Loki 레이블 불일치**
   - `namespace` 레이블이 `bravo-`로 시작하지 않음
   - `job` 레이블이 `loki` 또는 `promtail`이 아님

3. **로그 형식 문제**
   - 로그가 JSON 형식이 아니거나, `message` 필드가 없음
   - 로그 메시지에 "error" 문자열이 포함되지 않음

4. **시간 범위 문제**
   - `start`와 `end` 파라미터가 올바르지 않음
   - 해당 시간 범위에 로그가 없음

5. **Loki 연결 문제**
   - `LOKI_URL` 환경 변수가 잘못 설정됨
   - Loki 서비스에 접근할 수 없음

---

## 확인 방법

### 1. Loki에 직접 쿼리
```bash
curl "http://loki.bravo-monitoring-ns:3100/loki/api/v1/query_range?query={namespace=~\"bravo-.*\"}%20|=%20\"error\"&start=1699123456000000000&end=1699127056000000000"
```

### 2. 백엔드 로그 확인
```bash
kubectl logs -n bravo-ai-integration-ns -l app=ai-infra-service | grep -i "loki\|error"
```

### 3. Loki Pod 로그 확인
```bash
kubectl logs -n bravo-monitoring-ns -l app=loki
```

### 4. Promtail 설정 확인
- Promtail이 올바른 레이블로 로그를 수집하는지 확인
- `namespace`, `pod`, `container` 레이블이 제대로 설정되어 있는지 확인


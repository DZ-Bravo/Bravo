# 서버 재시작 시 발생한 오류 및 해결 방법

## 📋 목차
1. [등산코스가 나오지 않는 문제](#등산코스가-나오지-않는-문제)
2. [등산코스가 0개로 나오는 문제 (설악산, 검단산 등)](#등산코스가-0개로-나오는-문제-설악산-검단산-등)
3. [등산 코스 필터링 및 Mountain 데이터 복사](#등산-코스-필터링-및-mountain-데이터-복사)
4. [Elasticsearch 검색 최적화](#elasticsearch-검색-최적화)
5. [PVC ReadWriteOnce 문제](#pvc-readwriteonce-문제)
6. [서비스 재시작 방법](#서비스-재시작-방법)
7. [카카오 맵 API 키 문제](#7-카카오-맵-api-키-문제)

---

## 1. 등산코스가 나오지 않는 문제

### 문제 상황
- 등산코스 API (`/api/mountains/:code/courses`)가 빈 배열을 반환
- mountain 폴더의 GeoJSON 파일을 읽지 못함

### 원인
- 코드에서 하드코딩된 경로 `/app/mountain` 사용
- Docker 환경과 로컬 환경에서 경로가 다름
- Docker: `/app/mountain` (볼륨 마운트)
- 로컬: `/home/bravo/LABs/mountain`

### 해결 방법
**파일:** `services/backend-services/mountain-service/server.js`

```javascript
// mountain 폴더 경로 결정 (Docker 또는 로컬 환경)
const getMountainPath = () => {
  const dockerPath = '/app/mountain'
  const localPath = join(__dirname, '../../..', 'mountain')
  
  // Docker 경로가 존재하면 사용, 아니면 로컬 경로 사용
  if (existsSync(dockerPath)) {
    return dockerPath
  }
  return localPath
}

const MOUNTAIN_BASE_PATH = getMountainPath()
console.log('[Mountain Service] Mountain 폴더 경로:', MOUNTAIN_BASE_PATH)
```

**변경된 위치:**
1. 정적 파일 서빙: `app.use('/mountain', ...)` - line 89
2. 등산 코스 API: `/api/mountains/:code/courses` - line 1151
3. 테마별 코스 API: `/api/courses/theme/:theme` - line 2056

**배포 방법:**
```bash
# 1. 이미지 빌드
cd /home/bravo/LABs/services
docker build -f backend-services/mountain-service/Dockerfile -t 192.168.0.244:30305/bravo/hiking-mountain-service:latest .

# 2. 이미지 푸시
docker push 192.168.0.244:30305/bravo/hiking-mountain-service:latest

# 3. Deployment 재시작
kubectl rollout restart deployment/mountain-service -n bravo-core-ns
```

---

## 3. 등산 코스 필터링 및 Mountain 데이터 복사

### 문제 상황
- 등산 코스가 너무 많아서 짧은 코스(0.5km 이하, 10분 이하)가 포함됨
- PVC에 mountain 데이터가 일부만 복사되어 일부 산의 코스가 표시되지 않음
- PVC 크기가 부족하여 모든 데이터를 복사할 수 없음

### 해결 방법

#### 3.1 0.5km 10분 필터링 추가
**파일:** `services/backend-services/mountain-service/server.js` (line 1274-1290)

**변경 내용:**
- 등산 코스 API에 0.5km 10분 필터링 추가
- 10분 이하 또는 0.5km 이하 코스는 제외

```javascript
.filter(course => {
  if (!course) return false
  const name = course.properties?.name || course.properties?.PMNTN_NM || ''
  if (!name || name.trim() === '') return false
  
  // 0.5km 10분 필터링: 10분 이하 또는 0.5km 이하 제외
  const props = course.properties || {}
  let totalTime = 0
  if (props.upTime !== undefined && props.downTime !== undefined) {
    totalTime = (props.upTime || 0) + (props.downTime || 0)
  } else if (props.PMNTN_UPPL !== undefined || props.PMNTN_GODN !== undefined) {
    totalTime = (props.PMNTN_UPPL || 0) + (props.PMNTN_GODN || 0)
  }
  const distance = props.distance || props.PMNTN_LT || 0
  
  // 10분 이하 또는 0.5km 이하인 경우 제외
  if (totalTime <= 10 || distance <= 0.5) {
    return false
  }
  
  return true
})
```

#### 3.2 Mountain 데이터 복사
**문제:** PVC에 mountain 데이터가 일부만 복사되어 있음 (131개 → 4934개 geojson 폴더)

**해결 방법:**
1. **PVC 크기 확인 및 확장**
   - 현재 PVC 크기: 10Gi (초기 2Gi에서 확장)
   - 로컬 mountain 데이터: 약 2.7GB
   - 필요한 최소 크기: 4Gi 이상

2. **Mountain 데이터 복사 스크립트**
   - 스크립트 위치: `/home/bravo/LABs/k8s/core-ns/copy-mountain-data-retry.sh`
   - Job 매니페스트: `/home/bravo/LABs/k8s/core-ns/mountain-data-copy-job.yaml`

**복사 방법:**
```bash
# 1. mountain-service 스케일 다운 (ReadWriteOnce 제약)
kubectl scale deployment mountain-service --replicas=0 -n bravo-core-ns

# 2. 복사 스크립트 실행
/home/bravo/LABs/k8s/core-ns/copy-mountain-data-retry.sh

# 3. mountain-service 스케일 업
kubectl scale deployment mountain-service --replicas=2 -n bravo-core-ns
```

**복사 결과:**
- 최종 geojson 폴더 개수: 4934개
- 최종 전체 폴더 개수: 17604개
- 로컬 geojson 폴더 개수: 14946개 (일부만 복사됨, PVC 크기 제약)

**참고:**
- PVC 크기는 확장만 가능 (축소 불가)
- Longhorn StorageClass는 PVC 확장을 지원함
- 복사 중에는 mountain-service를 스케일 다운해야 함 (ReadWriteOnce 제약)

---

## 2. 등산코스가 0개로 나오는 문제 (설악산, 검단산 등)

### 문제 상황
- 설악산(428302602), 검단산(413603404) 등 일부 산의 등산코스가 0개로 반환됨
- API 응답: `{courses: Array(0)}`
- mountain 폴더에는 파일이 존재함

### 원인
1. **입력 code를 그대로 사용하지 않음**: DB에서 mntilistno를 찾으려고 시도하여 실제 mountain 폴더의 code와 불일치
2. **PVC 마운트 경로 문제**: PVC에 mountain 데이터가 `/app/mountain/mountain/` 구조로 마운트됨 (mountain 폴더가 중복)

### 해결 방법

#### 2.1 입력 code를 그대로 사용하도록 수정
**파일:** `services/backend-services/mountain-service/server.js`

**변경 내용:**
- ObjectId가 아닌 숫자 코드는 DB 조회 없이 입력 code를 그대로 사용
- ObjectId인 경우에만 DB에서 실제 mntilistno를 찾아 변환

```javascript
// 입력된 code를 그대로 사용 (mountain 폴더에서 직접 찾기)
let actualMountainCode = code

// ObjectId인 경우에만 DB에서 실제 mntilistno 찾기
if (isObjectId) {
  // ... DB 조회 로직
} else {
  // 숫자 코드는 그대로 사용
  console.log(`등산 코스 요청 - 입력 code: ${code}, 사용할 code: ${actualMountainCode}`)
}
```

#### 2.2 PVC 마운트 경로 대응
**파일:** `services/backend-services/mountain-service/server.js` (line 1150-1160)

**변경 내용:**
- 두 가지 경로를 모두 확인하도록 수정
  1. `/app/mountain/{code}_geojson` (기본)
  2. `/app/mountain/mountain/{code}_geojson` (PVC 구조)

```javascript
// 실제 mntilistno로 파일 경로 생성 (두 가지 경로 시도)
let geojsonDir = join(MOUNTAIN_BASE_PATH, `${actualMountainCode}_geojson`)

// PVC에 mountain/mountain 구조로 마운트된 경우를 대비해 두 경로 모두 확인
if (!existsSync(geojsonDir)) {
  const altPath = join(MOUNTAIN_BASE_PATH, 'mountain', `${actualMountainCode}_geojson`)
  if (existsSync(altPath)) {
    geojsonDir = altPath
  }
}
```

#### 2.3 MongoDB 폴백 제거
**파일:** `services/backend-services/mountain-service/server.js`

**변경 내용:**
- mountain 폴더에 파일이 없으면 빈 배열 반환
- MongoDB의 trail_files로 기본 코스를 생성하는 폴백 로직 제거

```javascript
} else {
  console.log(`mountain 폴더 경로가 존재하지 않음: ${geojsonDir}`)
  // mountain 폴더에 파일이 없으면 빈 배열 반환 (MongoDB 폴백 제거)
  courses = []
}
```

**배포 방법:**
```bash
# 1. 이미지 빌드
cd /home/bravo/LABs/services
docker build -f backend-services/mountain-service/Dockerfile -t 192.168.0.244:30305/bravo/hiking-mountain-service:latest .

# 2. 이미지 푸시
docker push 192.168.0.244:30305/bravo/hiking-mountain-service:latest

# 3. Deployment 재시작
kubectl rollout restart deployment/mountain-service -n bravo-core-ns

# 4. 기존 pod 삭제하여 새 pod 시작
kubectl delete pod -n bravo-core-ns <old-pod-name>
```

**확인 방법:**
```bash
# Pod에서 파일 확인
kubectl exec -n bravo-core-ns <pod-name> -- ls -la /app/mountain/mountain/428302602_geojson/

# 로그 확인
kubectl logs -n bravo-core-ns <pod-name> | grep "등산 코스"
```

---

## 4. Elasticsearch 검색 최적화

### 문제 상황
- 검색 속도가 느림
- 불필요한 Fuzzy 검색으로 인한 성능 저하
- 정확한 매칭이 아닌 유연한 검색 사용

### 해결 방법

#### 2.1 정확 매칭으로 변경
**파일:** `services/shared/utils/search.js`

기존: `exactMatch: false` (기본값)
변경: `exactMatch: true` 사용

**변경된 파일:**
1. `services/backend-services/community-service/posts.js`
   - 산 검색: line 641
   - 게시글 검색: line 410, 541

2. `services/backend-services/store-service/store.js`
   - 상품 검색: line 436

**변경 내용:**
```javascript
// 이전
const searchQuery = buildFuzzySearchQuery(query, searchFields, {
  fuzziness: 'AUTO',
  prefixLength: 1
})

// 변경 후
const searchQuery = buildFuzzySearchQuery(query, searchFields, {
  exactMatch: true  // 정확 매칭 사용
})
```

#### 2.2 검색 결과 개수 제한
**성능 개선을 위한 size 제한:**

1. **산 검색** (`community-service/posts.js` line 647):
   ```javascript
   size: Math.min(limit, 100)  // 최대 100개로 제한
   ```

2. **게시글 검색** (`community-service/posts.js` line 416, 546):
   ```javascript
   size: Math.min(limit, 100)  // 최대 100개로 제한
   ```

3. **상품 검색** (`store-service/store.js` line 456):
   ```javascript
   size: Math.min(limit, 50)  // 최대 50개로 제한
   ```

#### 2.3 기존 최적화 설정
**파일:** `services/shared/utils/search.js`

- **Timeout 설정:** 5초 (line 288, 297)
- **인덱스 설정:** shards=1, replicas=0 (line 41-42)
- **Fuzzy 검색 제거:** 주석 처리됨 (line 249-250)

**재시작 방법:**
```bash
kubectl rollout restart deployment/community-service -n bravo-core-ns
kubectl rollout restart deployment/store-service -n bravo-core-ns
```

---

### Elasticsearch 상태 확인

**현재 상태:**
- Elasticsearch Pod: `elasticsearch-0` (Running)
- Elasticsearch Service: `elasticsearch.bravo-efk-ns.svc.cluster.local:9200`
- Cluster Health: `yellow` (정상, 단일 노드이므로 yellow는 정상)
- Monstache Pod: `monstache-7f4f95db4-72gnm` (Running, MongoDB → Elasticsearch 동기화)

**Elasticsearch 인덱스:**
- `mountains`: green (552 문서)
- `hiking.users`: yellow (2 문서)
- `hiking.notices`: yellow (3 문서)
- `hiking.comments`: yellow (0 문서)
- `posts`: yellow (13 문서)
- `hiking.notifications`: yellow (40 문서)

**확인 방법:**
```bash
# Elasticsearch Pod 상태
kubectl get pods -n bravo-efk-ns -l app=elasticsearch

# Elasticsearch 클러스터 상태
kubectl exec -n bravo-efk-ns elasticsearch-0 -- curl -s http://localhost:9200/_cluster/health

# Elasticsearch 인덱스 목록
kubectl exec -n bravo-efk-ns elasticsearch-0 -- curl -s http://localhost:9200/_cat/indices

# Monstache 상태
kubectl get pods -n bravo-efk-ns -l app=monstache
kubectl logs -n bravo-efk-ns -l app=monstache --tail=20
```

**참고:**
- Elasticsearch는 정상 작동 중
- Monstache: MongoDB 연결 문제 해결 완료 (2024-12-23)
  - 문제: 개별 Pod 이름(`mongodb-0.mongodb.bravo-mongo-ns.svc.cluster.local`) 사용으로 DNS 해석 실패
  - 해결: 서비스 이름(`mongodb.bravo-mongo-ns.svc.cluster.local`) 사용으로 변경
  - 결과: MongoDB 및 Elasticsearch 연결 성공

---

## 5. PVC ReadWriteOnce 문제

### 문제 상황
- 서비스 재시작 시 일부 pod가 `ContainerCreating` 상태에서 멈춤
- PVC가 이미 다른 pod에 마운트되어 있어 새 pod가 시작되지 않음

### 원인
- PersistentVolumeClaim이 `ReadWriteOnce` 모드
- 한 번에 하나의 pod만 볼륨을 마운트할 수 있음
- 여러 pod가 동시에 시작하려고 할 때 충돌 발생

### 해결 방법

#### 방법 1: 기존 pod 강제 삭제 후 재시작
```bash
# 1. 기존 pod 삭제
kubectl delete pod -n bravo-core-ns <pod-name>

# 2. Deployment 재시작
kubectl rollout restart deployment/<service-name> -n bravo-core-ns

# 3. 상태 확인
kubectl get pods -n bravo-core-ns | grep <service-name>
```

#### 방법 2: Deployment 직접 재시작
```bash
# Deployment 재시작 (자동으로 pod 교체)
kubectl rollout restart deployment/<service-name> -n bravo-core-ns

# Rollout 상태 확인
kubectl rollout status deployment/<service-name> -n bravo-core-ns
```

#### 방법 3: 문제가 있는 pod만 삭제
```bash
# ContainerCreating 상태인 pod만 삭제
kubectl delete pod -n bravo-core-ns --field-selector=status.phase!=Running -l app=<service-name>
```

**영향을 받는 서비스:**
- `community-service`: `community-uploads-pvc` 사용
- `mountain-service`: `mountain-data-pvc` 사용

**참고:** ReadWriteOnce PVC를 사용하는 서비스는 replicas를 1로 설정하는 것이 안전합니다.

**실제 해결 사례 (2024-12-23):**
- `mountain-service`의 replicas가 2로 설정되어 있어 두 번째 Pod가 `ContainerCreating` 상태에서 멈춤
- 에러 메시지: `Multi-Attach error for volume "pvc-..." Volume is already used by pod(s)`
- 해결: `k8s/core-ns/mountain-service.yaml`에서 `replicas: 2` → `replicas: 1`로 변경
- 결과: Pod 1개만 Running 상태로 정상 작동, API 정상 응답 (552개 산 데이터)

---

## 6. 서비스 재시작 방법

### 전체 서비스 재시작
```bash
# 모든 core-ns 서비스 재시작
kubectl rollout restart deployment -n bravo-core-ns

# 특정 서비스만 재시작
kubectl rollout restart deployment/<service-name> -n bravo-core-ns
```

### 재시작 후 확인
```bash
# Pod 상태 확인
kubectl get pods -n bravo-core-ns

# 로그 확인
kubectl logs -n bravo-core-ns <pod-name> --tail=50

# Rollout 상태 확인
kubectl rollout status deployment/<service-name> -n bravo-core-ns
```

### 이미지 재빌드 및 배포
```bash
# 1. 서비스 디렉토리로 이동
cd /home/bravo/LABs/services

# 2. 이미지 빌드 (예: mountain-service)
docker build -f backend-services/mountain-service/Dockerfile \
  -t 192.168.0.244:30305/bravo/hiking-mountain-service:latest .

# 3. 이미지 푸시
docker push 192.168.0.244:30305/bravo/hiking-mountain-service:latest

# 4. Deployment 재시작
kubectl rollout restart deployment/mountain-service -n bravo-core-ns
```

---

## 6. 자주 발생하는 문제 및 해결

### 5.1 Pod가 계속 ContainerCreating 상태
**원인:** PVC 충돌, 리소스 부족, 이미지 pull 실패

**해결:**
```bash
# Pod 이벤트 확인
kubectl describe pod -n bravo-core-ns <pod-name>

# 문제가 있는 pod 삭제
kubectl delete pod -n bravo-core-ns <pod-name>
```

### 5.2 MongoDB 연결 실패
**확인 사항:**
- MongoDB 서비스가 실행 중인지 확인
- 연결 문자열이 올바른지 확인
- 네트워크 정책 확인

**해결:**
```bash
# MongoDB pod 확인
kubectl get pods -n bravo-mongo-ns

# MongoDB 연결 테스트
kubectl exec -it -n bravo-mongo-ns <mongodb-pod> -- mongosh
```

### 5.3 Elasticsearch 연결 실패
**확인 사항:**
- Elasticsearch 서비스가 실행 중인지 확인
- 환경 변수 `ELASTICSEARCH_URL` 확인

**해결:**
```bash
# Elasticsearch pod 확인
kubectl get pods -n bravo-efk-ns

# Elasticsearch 연결 테스트
curl http://elasticsearch.bravo-efk-ns.svc.cluster.local:9200
```

---

## 7. 체크리스트

서버 재시작 후 확인할 사항:

- [ ] 모든 pod가 Running 상태인가?
- [ ] MongoDB 연결이 정상인가?
- [ ] Elasticsearch 연결이 정상인가?
- [ ] API 엔드포인트가 정상 작동하는가?
- [ ] 등산코스가 정상적으로 나오는가?
- [ ] 검색 기능이 정상 작동하는가?
- [ ] 로그에 에러가 없는가?

---

## 8. 유용한 명령어

```bash
# 모든 pod 상태 확인
kubectl get pods -n bravo-core-ns

# 특정 서비스의 모든 pod 확인
kubectl get pods -n bravo-core-ns -l app=<service-name>

# Pod 로그 확인
kubectl logs -n bravo-core-ns <pod-name> --tail=100 -f

# Pod 이벤트 확인
kubectl describe pod -n bravo-core-ns <pod-name>

# Deployment 상태 확인
kubectl get deployment -n bravo-core-ns

# Service 상태 확인
kubectl get svc -n bravo-core-ns

# PVC 상태 확인
kubectl get pvc -n bravo-core-ns
```

---

## 9. 참고 정보

### 네임스페이스
- `bravo-core-ns`: 주요 서비스들 (mountain, community, store, auth 등)
- `bravo-mongo-ns`: MongoDB
- `bravo-efk-ns`: Elasticsearch, Kibana

### 주요 서비스 포트
- mountain-service: 3008
- community-service: 3002
- store-service: 3006
- auth-service: 3001

### 이미지 레지스트리
- `192.168.0.244:30305/bravo/<service-name>:latest`

---

## 10. 테마별 코스 큐레이션 문제 해결 (2024-12-23)

### 문제 상황
1. **BEST 숫자에 맞지 않는 문제**: BEST 10, BEST 8, BEST 5 등으로 표시된 개수와 실제 반환되는 코스 개수가 다름
2. **산 코드가 표시되는 문제**: 테마별 코스와 찜 목록에서 "산 (코드: 427300801)" 형식으로 표시됨
3. **난이도, 소요시간, 거리가 정확하지 않은 문제**: GeoJSON 파일에서 제대로 추출하지 못함

### 해결 방법

#### 10.1 BEST 숫자 맞추기
**파일:** `services/backend-services/mountain-service/server.js`

**변경 내용:**
1. Query limit 무시: 테마별 코스는 항상 표시된 개수대로만 반환
2. 3단계 fallback 로직 추가:
   - 1차: 테마별 필터링된 코스 사용
   - 2차: 필터링된 코스가 부족하면 전체 코스 사용
   - 3차: 여전히 부족하면 산 정보가 없는 코스도 포함
3. 우선 코스 limit 제한: 우선 코스가 limit을 초과하지 않도록 제한

```javascript
// 테마별 코스는 항상 표시된 개수대로만 반환 (query limit 무시)
const limit = defaultLimit

// 우선 코스가 limit을 초과하지 않도록 제한
const maxPriorityCourses = Math.min(foundPriorityCourses.length, parseInt(limit))
foundPriorityCourses.splice(maxPriorityCourses)

// 3단계 fallback 로직
let coursesToUse = filtered
if (coursesToUse.length < neededCount) {
  coursesToUse = [...coursesToUse, ...fallbackCourses.filter(...)]
}
if (coursesToUse.length < neededCount) {
  coursesToUse = [...coursesToUse, ...coursesWithoutMountain]
}
```

#### 10.2 산 이름 표시 개선
**파일:** 
- `services/backend-services/mountain-service/server.js`
- `services/backend-services/auth-service/auth.js`

**변경 내용:**
1. 여러 필드에서 산 이름 찾기:
   - `mountain.mntiname`
   - `mountain.name`
   - `mountain.MNTN_NM`
   - `mountain.trail_match?.mountain_info?.mntiname`
   - `mountain.trail_match?.mountain_info?.name`
   - `mountain.trail_match?.mountain_info?.MNTN_NM`
   - `mountain.mountainName`

2. 찜 목록 API 수정: MongoDB에서 실제 산 정보를 조회하도록 변경

```javascript
// 산 이름 찾기 (여러 필드에서 시도)
const mountainName = mountain.mntiname || 
                    mountain.name || 
                    mountain.MNTN_NM ||
                    mountainInfo.mntiname ||
                    mountainInfo.name ||
                    mountainInfo.MNTN_NM ||
                    mountain.mountainName ||
                    null
```

#### 10.3 난이도, 소요시간, 거리 추출 개선
**파일:** `services/backend-services/mountain-service/server.js`

**변경 내용:**
1. 난이도 추정 로직 적용: GeoJSON 파일의 attributes에서 거리, 시간, 표면 재질을 기반으로 난이도 추정
2. 소요시간 추출: `upTime`과 `downTime`으로 계산
3. 거리 추출: 여러 필드에서 거리 추출 및 문자열 변환

```javascript
// 난이도 추정
if (feature.attributes && (!props.difficulty || props.difficulty === '보통')) {
  const difficulty = estimateDifficulty(distance, totalMinutes, surfaceMaterial)
  props.difficulty = difficulty
}

// 소요시간 추출
if (!duration && (props.upTime || props.downTime || ...)) {
  const totalMinutes = upTime + downTime
  // "X시간 Y분" 형식으로 변환
}

// 거리 추출
let distance = course.distance || props.distance || props.PMNTN_LT || 0
if (typeof distance === 'string') {
  distance = parseFloat(distance) || 0
}
```

**배포 방법:**
```bash
# mountain-service
cd /home/bravo/LABs/services
docker build -f backend-services/mountain-service/Dockerfile -t 192.168.0.244:30305/bravo/hiking-mountain-service:latest .
docker push 192.168.0.244:30305/bravo/hiking-mountain-service:latest
kubectl rollout restart deployment/mountain-service -n bravo-core-ns
kubectl delete pod -n bravo-core-ns -l app=mountain-service --field-selector=status.phase=Running

# auth-service
docker build -f backend-services/auth-service/Dockerfile -t 192.168.0.244:30305/bravo/hiking-auth-service:latest .
docker push 192.168.0.244:30305/bravo/hiking-auth-service:latest
kubectl rollout restart deployment/auth-service -n bravo-core-ns
kubectl delete pod -n bravo-core-ns -l app=auth-service --field-selector=status.phase=Running
```

---

## 11. 모든 서비스 시작 명령어

### 전체 서비스 시작 (권장)

```bash
# 1. 네임스페이스 확인
kubectl get namespaces | grep bravo

# 2. ConfigMap 및 Secret 확인
kubectl get configmap -n bravo-core-ns
kubectl get secret -n bravo-core-ns

# 3. 모든 core-ns 서비스 시작
kubectl apply -f /home/bravo/LABs/k8s/core-ns/

# 4. AI 통합 서비스 시작
kubectl apply -f /home/bravo/LABs/k8s/ai-integration-ns/

# 5. 프론트엔드 서비스 시작
kubectl apply -f /home/bravo/LABs/k8s/front-ns/

# 6. 모든 서비스 상태 확인
kubectl get pods -n bravo-core-ns
kubectl get pods -n bravo-ai-integration-ns
kubectl get pods -n bravo-front-ns
```

### 개별 서비스 시작

#### Core 네임스페이스 서비스
```bash
# auth-service
kubectl apply -f /home/bravo/LABs/k8s/core-ns/auth-service.yaml

# community-service
kubectl apply -f /home/bravo/LABs/k8s/core-ns/community-service.yaml

# mountain-service
kubectl apply -f /home/bravo/LABs/k8s/core-ns/mountain-service.yaml

# store-service
kubectl apply -f /home/bravo/LABs/k8s/core-ns/store-service.yaml

# notice-service
kubectl apply -f /home/bravo/LABs/k8s/core-ns/notice-service.yaml

# schedule-service
kubectl apply -f /home/bravo/LABs/k8s/core-ns/schedule-service.yaml

# notification-service
kubectl apply -f /home/bravo/LABs/k8s/core-ns/notification-service.yaml

# stamp-service
kubectl apply -f /home/bravo/LABs/k8s/core-ns/stamp-service.yaml
```

#### AI 통합 네임스페이스 서비스
```bash
# ai-service
kubectl apply -f /home/bravo/LABs/k8s/ai-integration-ns/ai-service.yaml

# chatbot-service
kubectl apply -f /home/bravo/LABs/k8s/ai-integration-ns/chatbot-service.yaml
```

#### 프론트엔드 서비스
```bash
# frontend-service
kubectl apply -f /home/bravo/LABs/k8s/front-ns/frontend-service.yaml
```

### 서비스 재시작 (이미 실행 중인 경우)

```bash
# 모든 core-ns 서비스 재시작
kubectl rollout restart deployment -n bravo-core-ns

# 특정 서비스만 재시작
kubectl rollout restart deployment/<service-name> -n bravo-core-ns

# AI 통합 서비스 재시작
kubectl rollout restart deployment -n bravo-ai-integration-ns

# 프론트엔드 서비스 재시작
kubectl rollout restart deployment -n bravo-front-ns
```

### 서비스 상태 확인

```bash
# 모든 pod 상태 확인
kubectl get pods --all-namespaces | grep bravo

# 특정 네임스페이스의 모든 pod 확인
kubectl get pods -n bravo-core-ns
kubectl get pods -n bravo-ai-integration-ns
kubectl get pods -n bravo-front-ns

# 특정 서비스의 pod 확인
kubectl get pods -n bravo-core-ns -l app=<service-name>

# Pod 로그 확인
kubectl logs -n bravo-core-ns <pod-name> --tail=100 -f

# Deployment 상태 확인
kubectl get deployment -n bravo-core-ns
kubectl get deployment -n bravo-ai-integration-ns

# Service 상태 확인
kubectl get svc -n bravo-core-ns
kubectl get svc -n bravo-ai-integration-ns
```

### 문제 발생 시 해결 방법

#### Pod가 시작되지 않는 경우
```bash
# Pod 이벤트 확인
kubectl describe pod -n bravo-core-ns <pod-name>

# 문제가 있는 pod 삭제
kubectl delete pod -n bravo-core-ns <pod-name>

# PVC 문제인 경우 (ReadWriteOnce)
kubectl delete pod -n bravo-core-ns -l app=<service-name> --field-selector=status.phase=Running
```

#### 이미지 pull 실패
```bash
# 이미지 확인
docker images | grep 192.168.0.244:30305/bravo

# 이미지 재빌드 및 푸시
cd /home/bravo/LABs/services
docker build -f backend-services/<service-name>/Dockerfile -t 192.168.0.244:30305/bravo/hiking-<service-name>:latest .
docker push 192.168.0.244:30305/bravo/hiking-<service-name>:latest

# Deployment 재시작
kubectl rollout restart deployment/<service-name> -n bravo-core-ns
```

### 주요 서비스 포트 및 네임스페이스

| 서비스 | 포트 | 네임스페이스 |
|--------|------|--------------|
| auth-service | 3001 | bravo-core-ns |
| community-service | 3002 | bravo-core-ns |
| notice-service | 3003 | bravo-core-ns |
| schedule-service | 3004 | bravo-core-ns |
| notification-service | 3005 | bravo-core-ns |
| store-service | 3006 | bravo-core-ns |
| chatbot-service | 3007 | bravo-ai-integration-ns |
| mountain-service | 3008 | bravo-core-ns |
| ai-service | 3009 | bravo-ai-integration-ns |
| stamp-service | 3010 | bravo-core-ns |
| frontend-service | 80 | bravo-front-ns |

---

---

## 에러 8: 테마별 코스 큐레이션에서 "BEST 숫자" 텍스트 제거 요청

**날짜**: 2024-12-23

**문제**:
- 테마별 코스 큐레이션 카드와 상세 페이지에 "BEST 10", "BEST 8", "BEST 5" 등의 텍스트가 표시됨
- 사용자가 이 텍스트를 제거하고 싶어함

**해결**:
1. **Home.jsx** 수정:
   - 테마별 코스 큐레이션 카드에서 "BEST 숫자" 텍스트 제거
   - "눈꽃 산행지 BEST 10" → "눈꽃 산행지"
   - "일몰&야경 코스 BEST8" → "일몰&야경 코스"
   - "초보 산쟁이 코스 BEST 5" → "초보 산쟁이 코스"
   - "운해 사냥 코스 BEST5" → "운해 사냥 코스"

2. **CourseDetail.jsx** 수정:
   - 코스 상세 페이지 설명에서 "BEST" 텍스트 제거
   - 모든 테마의 description에서 "BEST" 관련 텍스트 제거
   - "눈꽃 산행지 BEST 코스를 확인하세요!" → "눈꽃 산행지 코스를 확인하세요!"
   - "초보 산쟁이 코스 BEST를 확인하세요!" → "초보 산쟁이 코스를 확인하세요!"
   - "일몰&야경 코스 BEST를 확인하세요!" → "일몰&야경 코스를 확인하세요!"
   - "운해 사냥 추천 코스 BEST 5" → "운해 사냥 추천 코스"
   - "운해 사냥 추천 코스 BEST 8" → "운해 사냥 추천 코스"

**파일 위치**:
- `/home/bravo/LABs/services/frontend-service/src/pages/Home.jsx`
- `/home/bravo/LABs/services/frontend-service/src/pages/CourseDetail.jsx`

**배포**:
```bash
cd /home/bravo/LABs/services/frontend-service
docker build -t 192.168.0.244:30305/bravo/hiking-frontend-service:latest .
docker push 192.168.0.244:30305/bravo/hiking-frontend-service:latest
# 프론트엔드 서비스 재시작 (배포 방식에 따라 다름)
```

**참고**:
- 프론트엔드 서비스는 Kubernetes에 배포되어 있지 않을 수 있음
- 다른 방식으로 배포되어 있다면 해당 방식으로 재배포 필요

---

---

## 7. 카카오 맵 API 키 문제

### 문제 상황
- 브라우저 콘솔에 `[카카오 지도] ❌ API 키가 설정되지 않았습니다.` 오류 발생
- 카카오 맵이 표시되지 않음
- `window.__RUNTIME_ENV__`는 설정되었지만 `getEnv` 함수가 값을 읽지 못함

### 원인
- Vite 환경 변수는 빌드 시점에 번들에 포함됨
- Kubernetes ConfigMap/Secret에서 주입한 환경 변수는 런타임에만 사용 가능
- React 모듈이 로드되기 전에 환경 변수를 주입해야 함

### 해결 방법

#### 7.1 server.js 수정 - 런타임 환경 변수 주입
**파일:** `services/frontend-service/server.js`

```javascript
// 환경 변수를 HTML에 주입하는 함수
function injectEnvToHtml(html) {
  const envScript = `<script>
      (function() {
        window.__RUNTIME_ENV__ = {
          VITE_KAKAO_MAP_API_KEY: ${JSON.stringify(process.env.VITE_KAKAO_MAP_API_KEY || '')},
          VITE_CESIUM_ACCESS_TOKEN: ${JSON.stringify(process.env.VITE_CESIUM_ACCESS_TOKEN || '')}
        };
        console.log('[환경 변수 주입] window.__RUNTIME_ENV__ 설정 완료:', window.__RUNTIME_ENV__);
      })();
    </script>`
  // <head> 태그 바로 다음에 스크립트 삽입 (가장 먼저 실행되도록)
  return html.replace(/<head[^>]*>/, (match) => match + envScript)
}
```

**주요 포인트:**
- `<head>` 태그 바로 다음에 스크립트 삽입 (React 모듈 로드 전 실행)
- IIFE(즉시 실행 함수)로 감싸서 즉시 실행되도록 함
- 디버깅을 위한 콘솔 로그 추가

#### 7.2 getEnv 함수 개선
**파일:** `services/frontend-service/src/utils/api.js`

```javascript
export function getEnv(key) {
  // 런타임 환경 변수 확인 (server.js에서 주입)
  if (typeof window !== 'undefined' && window.__RUNTIME_ENV__) {
    const runtimeValue = window.__RUNTIME_ENV__[key]
    // 값이 존재하면 반환 (빈 문자열도 유효한 값으로 처리)
    if (runtimeValue !== undefined && runtimeValue !== null) {
      return runtimeValue
    }
  }
  
  // 빌드 시점 환경 변수 확인
  return import.meta.env[key] || ''
}
```

#### 7.3 컴포넌트에서 직접 확인
**파일:** `MountainsMap.jsx`, `MountainDetail.jsx`

```javascript
// 카카오 맵 API 키 가져오기 (런타임 환경 변수 우선)
// window.__RUNTIME_ENV__를 직접 확인 (getEnv가 작동하지 않을 경우를 대비)
let apiKey = ''
if (typeof window !== 'undefined' && window.__RUNTIME_ENV__ && window.__RUNTIME_ENV__.VITE_KAKAO_MAP_API_KEY) {
  apiKey = window.__RUNTIME_ENV__.VITE_KAKAO_MAP_API_KEY
  console.log('[카카오 지도] 런타임 환경 변수에서 API 키 가져옴:', apiKey.substring(0, 10) + '...')
} else {
  apiKey = getEnv('VITE_KAKAO_MAP_API_KEY')
  console.log('[카카오 지도] getEnv로 API 키 가져옴:', apiKey ? `${apiKey.substring(0, 10)}...` : '없음')
}
```

#### 7.4 배포 과정
1. **ConfigMap 업데이트**
```bash
kubectl create configmap frontend-server-js \
  --from-file=server.js=/home/bravo/LABs/services/frontend-service/server.js \
  -n bravo-front-ns \
  --dry-run=client -o yaml | kubectl apply -f -
```

2. **프론트엔드 재빌드**
```bash
cd /home/bravo/LABs/services/frontend-service

CESIUM_TOKEN=$(kubectl get secret bravo-secrets -n bravo-front-ns -o jsonpath='{.data.VITE_CESIUM_ACCESS_TOKEN}' | base64 -d)

docker build \
  --build-arg VITE_KAKAO_MAP_API_KEY=650caaa8d67f90186c6a48c0df81607b \
  --build-arg VITE_CESIUM_ACCESS_TOKEN="$CESIUM_TOKEN" \
  -t 192.168.0.244:30305/bravo/hiking-frontend:latest .

docker push 192.168.0.244:30305/bravo/hiking-frontend:latest
```

3. **Deployment 재시작**
```bash
kubectl rollout restart deployment frontend -n bravo-front-ns
```

**관련 파일:**
- `/home/bravo/LABs/services/frontend-service/server.js`
- `/home/bravo/LABs/services/frontend-service/src/utils/api.js`
- `/home/bravo/LABs/services/frontend-service/src/pages/MountainsMap.jsx`
- `/home/bravo/LABs/services/frontend-service/src/components/MountainDetail.jsx`

---

## 8. PVC 크기 및 Mountain 데이터 관리

### 현재 상태
- **Mountain Data PVC**: `mountain-data-pvc` (10Gi)
- **로컬 Mountain 데이터**: 약 2.7GB
- **PVC에 복사된 데이터**: 4934개 geojson 폴더 (17604개 전체 폴더)
- **로컬 전체 데이터**: 14946개 geojson 폴더

### PVC 크기 변경
**파일:** `k8s/core-ns/mountain-service.yaml`

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mountain-data-pvc
  namespace: bravo-core-ns
spec:
  storageClassName: longhorn
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi  # 초기 2Gi에서 확장됨 (현재 설정: 5Gi)
```

**현재 상태:**
- PVC 요청 크기: 5Gi (yaml 파일)
- 로컬 mountain 데이터: 약 2.7GB
- 복사된 데이터: 4934개 geojson 폴더 (5Gi PVC에 복사 완료)

**참고:**
- PVC는 확장만 가능 (축소 불가)
- Longhorn StorageClass는 PVC 확장을 지원함
- yaml 파일의 크기와 실제 PVC 크기가 다를 수 있음 (이전 확장 이력)
- 확장 후 실제 용량 반영까지 시간이 걸릴 수 있음

### Mountain 데이터 복사 스크립트
- **스크립트**: `/home/bravo/LABs/k8s/core-ns/copy-mountain-data-retry.sh`
- **Job 매니페스트**: `/home/bravo/LABs/k8s/core-ns/mountain-data-copy-job.yaml`

**마지막 업데이트:** 2024-12-23
**작성자:** AI Assistant


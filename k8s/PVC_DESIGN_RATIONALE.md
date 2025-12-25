# PVC 설정 설계 근거 (Design Rationale)

## 개요

프로젝트의 PersistentVolumeClaim (PVC) 설정은 각 서비스의 데이터 저장 요구사항, 실제 데이터 크기, 성장 여유를 고려하여 설계되었습니다.

---

## 1. Core 네임스페이스 (bravo-core-ns)

### 1.1 auth-uploads-pvc: 1Gi

**용도:**
- 사용자 프로필 이미지
- 인증 관련 업로드 파일

**설정 이유:**
- 사용자 업로드 파일은 일반적으로 작음 (프로필 이미지 등)
- 1Gi면 수천 명의 사용자 파일 저장 가능
- 필요 시 확장 가능 (PVC는 확장만 가능)

**실제 사용량:**
- 초기 단계: 수백 MB 수준
- 성장 여유: 약 3-5배

---

### 1.2 community-uploads-pvc: 1Gi

**용도:**
- 커뮤니티 게시글 이미지
- 사용자 업로드 사진

**설정 이유:**
- 게시글 이미지는 압축되어 저장
- 평균 게시글당 이미지 크기: 100-500KB
- 1Gi면 수천 개의 게시글 이미지 저장 가능

**실제 사용량:**
- 초기 단계: 수백 MB 수준
- 성장 여유: 약 3-5배

---

### 1.3 mountain-data-pvc: 5Gi ⭐

**용도:**
- 등산 코스 GeoJSON 데이터
- 산별 등산 경로 정보

**설정 이유:**
1. **실제 데이터 크기:**
   - 로컬 데이터: 약 2.7GB
   - 복사된 데이터: 4934개 geojson 폴더
   - 전체 데이터: 14946개 geojson 폴더 (일부만 복사됨)

2. **변경 이력:**
   - 초기: 2Gi → 부족
   - 확장: 5Gi (현재)
   - 실제 사용: 약 2.7GB

3. **성장 여유:**
   - 현재 2.7GB 사용 중
   - 5Gi = 약 5.4GB
   - 약 2배 여유 확보

4. **특수 사항:**
   - ReadWriteOnce 제약으로 단일 Pod만 마운트 가능
   - 데이터 복사 시 서비스 스케일 다운 필요
   - Longhorn StorageClass는 PVC 확장 지원

**참고:**
- PVC는 확장만 가능 (축소 불가)
- 더 많은 데이터 필요 시 추가 확장 가능

---

## 2. EFK 네임스페이스 (bravo-efk-ns)

### 2.1 elasticsearch-data-elasticsearch-0: 5Gi

**용도:**
- Elasticsearch 인덱스 데이터
- 검색 데이터 저장

**설정 이유:**
1. **인덱싱된 데이터:**
   - mountains: 552개 문서
   - posts: 게시글 데이터
   - products: 상품 데이터

2. **Elasticsearch 특성:**
   - 인덱스 오버헤드: 약 20-30%
   - 검색 성능을 위한 인덱스 구조
   - 로그 데이터 (Fluent Bit) 저장

3. **성장 여유:**
   - 초기: 수백 MB
   - 예상 최대: 2-3GB
   - 5Gi면 충분한 여유

4. **StatefulSet 특성:**
   - volumeClaimTemplates 사용
   - 각 Pod마다 독립적인 PVC 생성
   - 현재 단일 노드이므로 1개 PVC만 사용

---

## 3. MongoDB 네임스페이스 (bravo-mongo-ns)

### 3.1 mongodb-data-mongodb-0: 3Gi

**용도:**
- MongoDB 데이터베이스 파일
- 컬렉션 데이터 저장

**설정 이유:**
1. **데이터베이스 크기:**
   - 초기 단계: 수백 MB
   - 사용자 데이터, 게시글, 상품 등
   - 예상 성장: 점진적 증가

2. **MongoDB 특성:**
   - WiredTiger 스토리지 엔진
   - 압축 저장 (약 50% 절약)
   - 인덱스 오버헤드 포함

3. **Replica Set:**
   - Primary-Secondary-Secondary 구성
   - 각 Pod마다 3Gi PVC 필요
   - 총 9Gi (3 Pod × 3Gi)

4. **성장 여유:**
   - 초기: 수백 MB
   - 예상 최대: 1-2GB
   - 3Gi면 충분한 여유

---

### 3.2 mongodb-config-mongodb-0: 512Mi

**용도:**
- MongoDB 설정 파일
- Replica Set 설정

**설정 이유:**
1. **설정 파일 크기:**
   - 설정 파일: 수 KB 수준
   - Keyfile: 756 bytes
   - 기타 설정: 수십 KB

2. **512Mi 설정 이유:**
   - 실제 필요: 수십 MB 이하
   - 여유 확보: 향후 설정 추가 대비
   - 최소 단위 고려

3. **StatefulSet 특성:**
   - volumeClaimTemplates 사용
   - 각 Pod마다 독립적인 PVC 생성

---

## 4. Redis 네임스페이스 (bravo-redis-ns)

### 4.1 redis-data-redis-0: 1Gi

**용도:**
- Redis 데이터 저장
- 캐시 데이터 영구 저장 (선택적)

**설정 이유:**
1. **Redis 특성:**
   - 인메모리 데이터베이스
   - 주로 캐시 용도
   - 영구 저장은 선택적 (RDB/AOF)

2. **데이터 크기:**
   - 캐시 데이터: 수백 MB 수준
   - 세션 데이터: 수십 MB
   - RDB 스냅샷: 수백 MB

3. **성장 여유:**
   - 초기: 수십 MB
   - 예상 최대: 500MB
   - 1Gi면 충분한 여유

4. **StatefulSet 특성:**
   - volumeClaimTemplates 사용
   - Primary-Secondary 구성 시 각 Pod마다 PVC 필요

---

## 5. Platform 네임스페이스 (bravo-platform-ns)

### 5.1 Harbor 관련 PVC들

**용도:**
- 컨테이너 이미지 저장
- Harbor 데이터베이스
- Harbor 레지스트리

**설정 이유:**
1. **harbor-registry: 5Gi**
   - 컨테이너 이미지 저장
   - 이미지 레이어 저장
   - 5Gi면 수십 개의 이미지 저장 가능

2. **harbor-database: 2Gi**
   - Harbor PostgreSQL 데이터베이스
   - 메타데이터 저장

3. **harbor-redis: 1Gi**
   - Harbor Redis 캐시

4. **harbor-jobservice, harbor-trivy: 1Gi**
   - 작업 데이터, 보안 스캔 결과

---

### 5.2 jenkins: 5Gi

**용도:**
- Jenkins 작업 공간
- 빌드 아티팩트
- 플러그인 데이터

**설정 이유:**
1. **빌드 아티팩트:**
   - Docker 이미지 빌드 결과
   - 빌드 로그
   - 작업 공간

2. **데이터 크기:**
   - 초기: 수백 MB
   - 빌드 누적 시: 수 GB
   - 5Gi면 충분한 여유

---

### 5.3 postgres-data: 5Gi

**용도:**
- SonarQube PostgreSQL 데이터베이스
- 코드 품질 분석 데이터

**설정 이유:**
1. **SonarQube 데이터:**
   - 프로젝트 분석 결과
   - 코드 메트릭
   - 히스토리 데이터

2. **데이터 크기:**
   - 초기: 수백 MB
   - 프로젝트 증가 시: 수 GB
   - 5Gi면 충분한 여유

---

### 5.4 sonarqube-data, sonarqube-extensions, sonarqube-logs: 각 2Gi

**용도:**
- SonarQube 데이터
- 플러그인/확장
- 로그 파일

**설정 이유:**
1. **데이터 분리:**
   - 데이터, 확장, 로그를 분리하여 관리
   - 각각 독립적인 스케일링 가능

2. **크기:**
   - 각 2Gi면 충분
   - 필요 시 개별 확장 가능

---

## 6. StorageClass: Longhorn

### 6.1 Longhorn 선택 이유

**특징:**
1. **분산 스토리지:**
   - 클러스터 내 여러 노드에 분산 저장
   - 고가용성 보장

2. **PVC 확장 지원:**
   - 동적 확장 가능
   - 축소는 불가 (Kubernetes 제약)

3. **백업 지원:**
   - 스냅샷 기능
   - Velero와 통합 가능

4. **온프레미스 환경:**
   - 클라우드 스토리지 불필요
   - 로컬 스토리지 활용

---

## 7. AccessMode: ReadWriteOnce

### 7.1 ReadWriteOnce 선택 이유

**특징:**
- 단일 노드에서만 읽기/쓰기 가능
- 여러 Pod에서 동시 마운트 불가

**적용 이유:**
1. **대부분의 서비스:**
   - 단일 Pod 또는 StatefulSet 사용
   - 동시 접근 불필요

2. **예외 사항:**
   - ReadWriteMany가 필요한 경우:
     - 여러 Pod에서 동시 읽기 필요
     - 예: 공유 설정 파일
   - 현재 프로젝트에서는 필요 없음

3. **제약 사항:**
   - mountain-data-pvc: ReadWriteOnce로 인해 단일 Pod만 마운트
   - 데이터 복사 시 서비스 스케일 다운 필요

---

## 8. PVC 크기 결정 원칙

### 8.1 크기 계산 공식

```
필요 크기 = (실제 데이터 크기 × 1.5) + 여유 공간
```

**예시:**
- 실제 데이터: 2.7GB
- 계산: 2.7GB × 1.5 = 4.05GB
- 설정: 5Gi (약 5.4GB)
- 여유: 약 1.3GB

### 8.2 성장 여유 고려

1. **초기 단계:**
   - 실제 사용량의 2-3배

2. **성장 단계:**
   - 예상 성장률 고려
   - 6개월-1년 여유

3. **최대 크기:**
   - 워커 노드 스토리지 제한
   - 비용 고려

---

## 9. PVC 확장 전략

### 9.1 확장 가능한 PVC

**확장 가능:**
- Longhorn StorageClass는 동적 확장 지원
- `kubectl edit pvc <pvc-name>` 또는 YAML 수정

**확장 불가:**
- 축소는 Kubernetes 제약으로 불가
- 삭제 후 재생성 필요 (데이터 백업 필수)

### 9.2 확장 시 주의사항

1. **ReadWriteOnce 제약:**
   - 단일 Pod만 마운트 가능
   - 확장 전 서비스 스케일 다운 필요

2. **데이터 백업:**
   - 확장 전 백업 권장
   - Velero 스냅샷 활용

3. **확장 시간:**
   - 크기에 따라 수분 소요
   - Longhorn이 자동 처리

---

## 10. 요약

| PVC | 크기 | 실제 사용 | 여유 | 주요 이유 |
|-----|------|----------|------|----------|
| auth-uploads-pvc | 1Gi | 수백 MB | 3-5배 | 사용자 프로필 이미지 |
| community-uploads-pvc | 1Gi | 수백 MB | 3-5배 | 게시글 이미지 |
| mountain-data-pvc | 5Gi | 2.7GB | 2배 | GeoJSON 데이터 (확장됨) |
| elasticsearch-data | 5Gi | 수백 MB | 5-10배 | 검색 인덱스 + 로그 |
| mongodb-data | 3Gi | 수백 MB | 3-5배 | 데이터베이스 파일 |
| mongodb-config | 512Mi | 수십 MB | 10배 | 설정 파일 |
| redis-data | 1Gi | 수십 MB | 10배 | 캐시 데이터 |
| jenkins | 5Gi | 수백 MB | 5-10배 | 빌드 아티팩트 |
| postgres-data | 5Gi | 수백 MB | 5-10배 | SonarQube DB |
| harbor-registry | 5Gi | 수백 MB | 5-10배 | 컨테이너 이미지 |

---

## 11. 모니터링 및 최적화

### 11.1 모니터링 지표

- PVC 사용률
- 실제 데이터 크기
- 성장 추이

### 11.2 최적화 가이드

**사용률이 80% 이상:**
- PVC 확장 고려
- 불필요한 데이터 정리

**사용률이 20% 이하:**
- 축소 불가 (Kubernetes 제약)
- 다음 확장 시 적절한 크기 설정

---

**작성일**: 2024-12-25  
**작성자**: AI Assistant  
**버전**: 1.0


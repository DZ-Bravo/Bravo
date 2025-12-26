# HPA 설정 설계 근거 (Design Rationale)

## 개요

프로젝트의 Horizontal Pod Autoscaler (HPA) 설정은 각 서비스의 특성, 트래픽 패턴, 고가용성 요구사항을 고려하여 설계되었습니다.

---

## 1. Replica 설정 (min/max)

### 1.1 최소 Replica (minReplicas)

#### **minReplicas: 2** (대부분의 서비스)
- **적용 서비스**: 
  - `bravo-store-hpa` (store-service)
  - `bravo-mountaincourse-hpa` (mountain-service)
  - `bravo-community-hpa` (community-service)
  - `bravo-chatbot-hpa` (chatbot-service)
  - `bravo-ai-hpa` (ai-service)
  - `bravo-ai-infra-hpa` (ai-infra-service)

**설정 이유:**
1. **고가용성 보장**: 단일 Pod 장애 시에도 서비스 지속 가능
2. **로드 분산**: 기본적으로 2개 Pod로 트래픽 분산
3. **리소스 효율성**: 최소한의 리소스로 안정성 확보
4. **롤링 업데이트**: 배포 시 무중단 업데이트 가능

#### **minReplicas: 3** (프론트엔드 및 Istio Gateway)
- **적용 서비스**:
  - `bravo-front-hpa` (frontend-service)
  - `bravo-istio-hpa` (istio-ingressgateway)

**설정 이유:**
1. **높은 트래픽 처리**: 사용자 요청의 첫 진입점이므로 더 많은 Pod 필요
2. **가용성 강화**: 1개 Pod 장애 시에도 2개 Pod로 서비스 지속
3. **로드 밸런싱 최적화**: 3개 Pod로 더 균등한 트래픽 분산
4. **Istio Gateway**: 모든 트래픽이 통과하는 핵심 컴포넌트이므로 높은 가용성 필요

### 1.2 최대 Replica (maxReplicas)

#### **maxReplicas: 5** (모든 서비스)

**설정 이유:**
1. **리소스 제약 고려**: 
   - 워커 노드 리소스: CPU 22, Memory 30Gi
   - ResourceQuota 제한 내에서 운영 가능
   - 예: `bravo-core-ns` ResourceQuota = CPU 6, Memory 14Gi
   
2. **트래픽 패턴 분석**:
   - 등산 웹사이트는 일반적으로 예측 가능한 트래픽 패턴
   - 급격한 트래픽 증가는 제한적
   - 5개 Pod로 충분한 처리 용량 확보

3. **비용 효율성**:
   - 과도한 스케일링 방지
   - 필요 이상의 리소스 사용 방지

4. **스케일링 속도**:
   - 2→5 Pod로 스케일링 시 충분한 용량 확보
   - 3배 이상의 처리 용량 증가

---

## 2. CPU 타겟 설정

### 2.1 CPU 70% (대부분의 서비스)

**적용 서비스:**
- `bravo-store-hpa`
- `bravo-mountaincourse-hpa`
- `bravo-community-hpa`
- `bravo-chatbot-hpa`
- `bravo-ai-infra-hpa`
- `bravo-front-hpa`
- `bravo-istio-hpa`

**설정 이유:**
1. **버퍼 확보**: 
   - 70% 사용 시 스케일링하여 30% 버퍼 확보
   - 트래픽 급증 시 즉시 대응 가능
   - 스케일링 지연 시간 동안 안정성 확보

2. **일반적인 베스트 프랙티스**:
   - Kubernetes 권장 CPU 사용률: 60-80%
   - 70%는 안정성과 효율성의 균형점

3. **스케일링 안정성**:
   - 너무 낮으면 (50%): 불필요한 스케일링 발생, 비용 증가
   - 너무 높으면 (90%): 스케일링 지연으로 성능 저하 가능

### 2.2 CPU 80% (AI 서비스)

**적용 서비스:**
- `bravo-ai-hpa` (ai-service)

**설정 이유:**
1. **AI 작업 특성**:
   - AI 추천 서비스는 CPU 집약적 작업
   - 일정 수준의 CPU 사용률이 정상
   - 80%까지 허용하여 리소스 효율성 향상

2. **비용 최적화**:
   - AI 서비스는 리소스 사용이 많으므로 높은 사용률 허용
   - 불필요한 스케일링 방지

3. **작업 특성**:
   - 배치 처리 성격의 작업이 많음
   - 일시적 CPU 사용률 증가는 정상

---

## 3. Memory 타겟 설정

### 3.1 Memory 1Gi (대부분의 서비스)

**적용 서비스:**
- `bravo-store-hpa`
- `bravo-mountaincourse-hpa`
- `bravo-community-hpa`
- `bravo-chatbot-hpa`
- `bravo-ai-infra-hpa`
- `bravo-front-hpa`
- `bravo-istio-hpa`

**설정 이유:**
1. **서비스 특성**:
   - Node.js 기반 서비스는 일반적으로 512Mi-1Gi 메모리 사용
   - 1Gi 타겟은 안정적인 운영을 위한 적절한 수준

2. **LimitRange와의 일관성**:
   - `bravo-core-ns` LimitRange: max memory 1Gi
   - HPA 타겟과 일치하여 일관성 유지

3. **메모리 누수 방지**:
   - 1Gi 초과 시 스케일링하여 메모리 압박 완화
   - OOM (Out of Memory) 방지

### 3.2 Memory 2Gi (AI 서비스)

**적용 서비스:**
- `bravo-ai-hpa` (ai-service)

**설정 이유:**
1. **AI 모델 특성**:
   - AI 추천 서비스는 모델 로딩 및 추론에 많은 메모리 필요
   - 2Gi 타겟은 AI 작업에 적합한 수준

2. **LimitRange와의 일관성**:
   - `bravo-ai-integration-ns` LimitRange: max memory 2Gi
   - HPA 타겟과 일치

3. **작업 특성**:
   - 대용량 데이터 처리
   - 모델 캐싱을 위한 메모리 필요

---

## 4. Behavior 설정 (스케일링 정책)

### 4.1 Scale Up 정책

```yaml
scaleUp:
  stabilizationWindowSeconds: 60
  policies:
  - type: Percent
    value: 50
    periodSeconds: 60
  - type: Pods
    value: 2
    periodSeconds: 60
  selectPolicy: Max
```

**설정 이유:**
1. **빠른 대응**:
   - `stabilizationWindowSeconds: 60`: 60초 안정화 창
   - 트래픽 급증 시 빠르게 스케일링

2. **이중 정책**:
   - **Percent 50%**: 현재 Pod 수의 50% 증가
   - **Pods 2**: 최소 2개 Pod 증가
   - `selectPolicy: Max`: 두 정책 중 더 큰 값 선택

3. **예시**:
   - 현재 2개 Pod → 50% = 1개, Pods = 2개 → **2개 증가** (총 4개)
   - 현재 3개 Pod → 50% = 1.5개, Pods = 2개 → **2개 증가** (총 5개)

4. **과도한 스케일링 방지**:
   - 한 번에 최대 2개 Pod만 증가
   - 리소스 급격한 소진 방지

### 4.2 Scale Down 정책

```yaml
scaleDown:
  stabilizationWindowSeconds: 300
  policies:
  - type: Percent
    value: 25
    periodSeconds: 60
  selectPolicy: Min
```

**설정 이유:**
1. **보수적 스케일 다운**:
   - `stabilizationWindowSeconds: 300`: 5분 안정화 창
   - 트래픽이 실제로 감소했는지 확인 후 스케일 다운

2. **점진적 감소**:
   - **Percent 25%**: 현재 Pod 수의 25% 감소
   - `selectPolicy: Min`: 더 작은 값 선택 (보수적)

3. **예시**:
   - 현재 5개 Pod → 25% = 1.25개 → **1개 감소** (총 4개)
   - 현재 4개 Pod → 25% = 1개 → **1개 감소** (총 3개)

4. **안정성 우선**:
   - 빠른 스케일 다운으로 인한 서비스 중단 방지
   - 트래픽 재증가 시 빠른 대응 가능

---

## 5. 서비스별 특수 설정

### 5.1 Frontend Service (minReplicas: 3)

**특징:**
- 사용자 요청의 첫 진입점
- 정적 파일 서빙 (Nginx)
- 가벼운 리소스 사용

**HPA 설정:**
- minReplicas: 3 (높은 가용성)
- maxReplicas: 5
- CPU: 70%
- Memory: 1Gi

**이유:**
- 프론트엔드는 모든 사용자가 접근하는 서비스
- 단일 장애점(Single Point of Failure) 방지
- 빠른 응답 시간 보장

### 5.2 Istio Gateway (minReplicas: 3)

**특징:**
- 모든 트래픽이 통과하는 게이트웨이
- 네트워크 레벨 라우팅
- 높은 처리량 필요

**HPA 설정:**
- minReplicas: 3 (높은 가용성)
- maxReplicas: 5
- CPU: 70%
- Memory: 1Gi

**이유:**
- 게이트웨이 장애 시 전체 서비스 영향
- 네트워크 레벨에서의 고가용성 필수
- 트래픽 분산을 위한 충분한 Pod 수

### 5.3 AI Service (CPU: 80%, Memory: 2Gi)

**특징:**
- AI 모델 추론 작업
- CPU/메모리 집약적
- 배치 처리 성격

**HPA 설정:**
- minReplicas: 2
- maxReplicas: 5
- CPU: 80% (높은 사용률 허용)
- Memory: 2Gi (더 많은 메모리 필요)

**이유:**
- AI 작업은 높은 리소스 사용이 정상
- 80% CPU 사용률까지 허용하여 효율성 향상
- 모델 로딩을 위한 2Gi 메모리 필요

---

## 6. ResourceQuota와의 관계

### 6.1 ResourceQuota 제한

각 네임스페이스의 ResourceQuota는 HPA의 maxReplicas와 연계되어 설정됨:

**bravo-core-ns:**
- ResourceQuota: CPU 6, Memory 14Gi
- HPA maxReplicas: 5
- Pod당 평균: CPU 1.2, Memory 2.8Gi
- **충분한 여유 확보**

**bravo-front-ns:**
- ResourceQuota: CPU 2, Memory 2Gi
- HPA maxReplicas: 5
- Pod당 평균: CPU 0.4, Memory 0.4Gi
- **경량 Pod이므로 충분**

**bravo-ai-integration-ns:**
- ResourceQuota: CPU 4, Memory 8Gi
- HPA maxReplicas: 5
- Pod당 평균: CPU 0.8, Memory 1.6Gi
- **AI 서비스 특성 고려**

### 6.2 LimitRange와의 일관성

HPA의 메모리 타겟은 LimitRange의 max 값과 일치:
- `bravo-core-ns`: LimitRange max 1Gi = HPA target 1Gi
- `bravo-ai-integration-ns`: LimitRange max 2Gi = HPA target 2Gi

**이유:**
- 일관된 리소스 관리
- 예측 가능한 스케일링 동작
- 설정 충돌 방지

---

## 7. 모니터링 및 튜닝

### 7.1 모니터링 지표

HPA 동작을 모니터링하기 위한 지표:
- Pod 수 변화 추이
- CPU/Memory 사용률
- 스케일링 이벤트 빈도
- 응답 시간 변화

### 7.2 튜닝 가이드

**스케일링이 너무 빈번한 경우:**
- stabilizationWindowSeconds 증가
- CPU/Memory 타겟 조정

**스케일링이 느린 경우:**
- stabilizationWindowSeconds 감소
- scaleUp policies 조정

**리소스 부족 시:**
- maxReplicas 증가 (ResourceQuota 확인 필요)
- 워커 노드 추가 고려

---

## 8. 요약

| 서비스 | minReplicas | maxReplicas | CPU | Memory | 주요 이유 |
|--------|------------|-------------|-----|--------|----------|
| Frontend | 3 | 5 | 70% | 1Gi | 높은 가용성, 첫 진입점 |
| Istio Gateway | 3 | 5 | 70% | 1Gi | 모든 트래픽 통과, 핵심 컴포넌트 |
| Store | 2 | 5 | 70% | 1Gi | 일반적인 백엔드 서비스 |
| Mountain | 2 | 5 | 70% | 1Gi | 일반적인 백엔드 서비스 |
| Community | 2 | 5 | 70% | 1Gi | 일반적인 백엔드 서비스 |
| Chatbot | 2 | 5 | 70% | 1Gi | 일반적인 백엔드 서비스 |
| AI Service | 2 | 5 | 80% | 2Gi | AI 작업 특성, 높은 리소스 필요 |
| AI Infra | 2 | 5 | 70% | 1Gi | 모니터링 서비스 |

---

## 9. 참고사항

1. **실제 트래픽 패턴 분석 후 조정 필요**
2. **비용 모니터링 및 최적화 지속**
3. **성능 테스트를 통한 검증 권장**
4. **트래픽 패턴 변화 시 HPA 설정 재검토**

---

**작성일**: 2024-12-25  
**작성자**: AI Assistant  
**버전**: 1.0


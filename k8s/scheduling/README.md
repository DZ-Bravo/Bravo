# 노드 리소스 불균형 해결 가이드

## 문제 상황
특정 노드에 Pod가 집중되어 리소스 부족이 발생하는 경우

## 해결 방법

### 1. 예방: Pod Anti-Affinity 설정 (권장)

**장점:**
- 스케줄링 시점에 자동으로 분산
- 수동 개입 불필요

**적용 방법:**
```bash
# 예제 파일 적용
kubectl apply -f k8s/scheduling/pod-anti-affinity-example.yaml
```

**설정 내용:**
- 같은 앱의 Pod들이 같은 노드에 배치되지 않도록 설정
- `preferredDuringSchedulingIgnoredDuringExecution`: 가능하면 분산 (필수 아님)
- `requiredDuringSchedulingIgnoredDuringExecution`: 반드시 분산 (필수)

### 2. 예방: Topology Spread Constraints

**장점:**
- 노드 간 균등 분산 보장
- maxSkew로 편차 제한

**적용 방법:**
```yaml
topologySpreadConstraints:
- maxSkew: 1
  topologyKey: kubernetes.io/hostname
  whenUnsatisfiable: DoNotSchedule
  labelSelector:
    matchLabels:
      app: my-app
```

### 3. 자동화: Descheduler 설치

**설치:**
```bash
# Descheduler Helm Chart 설치
helm repo add descheduler https://kubernetes-sigs.github.io/descheduler/
helm install descheduler descheduler/descheduler \
  --namespace kube-system \
  --set configMap=descheduler-config
```

**기능:**
- LowNodeUtilization: 사용률이 낮은 노드의 Pod를 다른 노드로 이동
- RemoveDuplicates: 같은 노드의 중복 Pod 제거
- 자동으로 주기적 실행 (CronJob)

### 4. 모니터링 및 알림

**Prometheus Alert 설정:**
```bash
kubectl apply -f k8s/scheduling/monitoring-alert.yaml
```

**알림 조건:**
- 노드 메모리 사용률 > 80%
- 노드 CPU 사용률 > 80%
- 노드 간 리소스 불균형 > 30%

### 5. 수동 스크립트 (긴급 상황)

**사용법:**
```bash
chmod +x k8s/scheduling/resource-rebalance-script.sh
./k8s/scheduling/resource-rebalance-script.sh
```

**기능:**
- 모든 노드 리소스 사용률 확인
- 임계값 초과 노드 자동 감지
- Deployment Pod 자동 재스케줄링
- StatefulSet/DaemonSet은 보호

## 권장 적용 순서

1. **즉시 적용**: Pod Anti-Affinity 설정
2. **단기**: Topology Spread Constraints 추가
3. **중기**: Descheduler 설치
4. **장기**: 모니터링 및 알림 설정

## 주의사항

- **StatefulSet**: PVC 바인딩으로 인해 이동 불가 (데이터 마이그레이션 필요)
- **DaemonSet**: 모든 노드에 필수 배치
- **Job/CronJob**: 일시적이므로 재스케줄링 불필요

## 모니터링 명령어

```bash
# 노드별 리소스 사용률 확인
kubectl top nodes

# 노드별 Pod 분산 확인
for node in node1 node2 node3 node4 node5; do
  echo "=== $node ==="
  kubectl get pods -A -o wide --field-selector spec.nodeName=$node --no-headers | wc -l
done

# 특정 노드의 리소스 상세 확인
kubectl describe node node1 | grep -A 10 "Allocated resources"
```





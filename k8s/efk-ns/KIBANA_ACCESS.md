# 키바나 접속 방법

## 방법 1: Port-Forward (로컬 접속)

가장 간단한 방법입니다. 로컬 머신에서 다음 명령어를 실행하세요:

```bash
kubectl port-forward -n bravo-efk-ns svc/kibana 5601:5601
```

그 후 브라우저에서 접속:
- URL: `http://localhost:5601`

**백그라운드 실행:**
```bash
kubectl port-forward -n bravo-efk-ns svc/kibana 5601:5601 &
```

**종료:**
```bash
# 포그라운드 실행 중이면 Ctrl+C
# 백그라운드 실행 중이면:
pkill -f "kubectl port-forward.*kibana"
```

---

## 방법 2: Istio Gateway를 통한 접속 (도메인으로 접속)

도메인을 통해 접속하려면 Istio Gateway에 키바나 라우트를 추가해야 합니다.

### 1. VirtualService에 키바나 라우트 추가

`k8s/ingress/istio-gateway.yaml` 파일의 VirtualService에 다음을 추가:

```yaml
  http:
  # ... 기존 라우트들 ...
  
  # Kibana
  - match:
    - uri:
        prefix: /kibana
    rewrite:
      uri: /
    route:
    - destination:
        host: kibana.bravo-efk-ns.svc.cluster.local
        port:
          number: 5601
```

### 2. 적용

```bash
kubectl apply -f k8s/ingress/istio-gateway.yaml
```

### 3. 접속

브라우저에서 접속:
- URL: `https://hiker-cloud.site/kibana`

---

## 방법 3: NodePort로 변경 (임시 접속)

Service를 NodePort로 변경하여 직접 접속:

```bash
kubectl patch svc kibana -n bravo-efk-ns -p '{"spec":{"type":"NodePort"}}'
kubectl get svc kibana -n bravo-efk-ns
```

출력된 NodePort 번호를 확인한 후:
- URL: `http://192.168.0.244:<NodePort>`

**다시 ClusterIP로 되돌리기:**
```bash
kubectl patch svc kibana -n bravo-efk-ns -p '{"spec":{"type":"ClusterIP"}}'
```

---

## 상태 확인

```bash
# Pod 상태 확인
kubectl get pods -n bravo-efk-ns | grep kibana

# Service 확인
kubectl get svc kibana -n bravo-efk-ns

# 로그 확인
kubectl logs -n bravo-efk-ns -l app=kibana --tail=50
```

---

## 참고

- 키바나가 완전히 시작되는데 1-2분 정도 걸릴 수 있습니다.
- Elasticsearch가 정상적으로 실행 중이어야 키바나가 제대로 작동합니다.
- 보안이 비활성화되어 있어 인증 없이 접속 가능합니다.



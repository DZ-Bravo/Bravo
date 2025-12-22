# Route 53 DNS 설정 가이드

## 도메인: hiker-cloud.site

## 필수 설정

### 1. A 레코드 추가 (메인 도메인)

Route 53 Console → Hosted zones → `hiker-cloud.site` → 레코드 생성:

- **레코드 이름**: `hiker-cloud.site` (또는 `@`)
- **레코드 유형**: `A`
- **값/트래픽 라우팅 대상**: `192.168.0.244` (또는 Istio Gateway의 실제 외부 IP)
- **TTL**: `300` (5분)
- **라우팅 정책**: `단순 라우팅`

### 2. A 레코드 추가 (www 서브도메인)

- **레코드 이름**: `www`
- **레코드 유형**: `A`
- **값/트래픽 라우팅 대상**: `192.168.0.244` (또는 Istio Gateway의 실제 외부 IP)
- **TTL**: `300` (5분)
- **라우팅 정책**: `단순 라우팅`

### 3. cert-manager가 생성한 TXT 레코드 확인

cert-manager가 자동으로 생성한 TXT 레코드가 있는지 확인:
- `_acme-challenge.hiker-cloud.site` (TXT)
- `_acme-challenge.www.hiker-cloud.site` (TXT)

이 레코드들은 cert-manager가 인증서 발급을 위해 자동으로 생성합니다.

## Istio Gateway 외부 IP 확인

```bash
kubectl get svc istio-ingressgateway -n istio-system
```

- LoadBalancer 타입인 경우: `EXTERNAL-IP` 사용
- NodePort 타입인 경우: 노드 IP 사용 (현재: `192.168.0.244`)
- 포트: `443` (HTTPS)

## DNS 전파 확인

DNS 변경 후 전파까지 시간이 걸릴 수 있습니다:
- 최소: 몇 분
- 최대: 48시간 (보통 몇 시간 이내)

확인 방법:
```bash
# DNS 조회
nslookup hiker-cloud.site
dig hiker-cloud.site

# TXT 레코드 확인 (cert-manager가 생성한 레코드)
dig _acme-challenge.hiker-cloud.site TXT
```

## 인증서 발급 확인

```bash
# Certificate 상태
kubectl get certificate -n istio-system

# Challenge 상태
kubectl get challenge -n istio-system

# 인증서 Secret 확인 (발급 완료 시)
kubectl get secret hiking-tls-secret -n istio-system
```

## 트러블슈팅

### 인증서가 발급되지 않는 경우

1. **Route 53 TXT 레코드 확인**
   - Route 53 Console에서 `_acme-challenge.*` TXT 레코드가 생성되었는지 확인
   - cert-manager가 자동으로 생성하므로 수동 생성 불필요

2. **DNS 전파 확인**
   - TXT 레코드가 Route 53에 생성되었어도 DNS 전파에 시간이 걸릴 수 있음
   - Let's Encrypt는 Route 53 네임서버를 통해 직접 확인하므로 전파는 빠름

3. **IAM 권한 확인**
   ```bash
   kubectl get secret route53-credentials -n cert-manager
   ```

4. **Challenge 로그 확인**
   ```bash
   kubectl logs -n cert-manager -l app=cert-manager | grep -i challenge
   kubectl describe challenge -n istio-system
   ```

### DNS 전파 확인 실패

cert-manager가 클러스터 내부 DNS를 사용해서 전파를 확인하려고 하지만, Route 53 레코드를 조회하지 못할 수 있습니다. 이는 정상이며, Let's Encrypt는 Route 53 네임서버를 통해 직접 확인하므로 인증서 발급에는 문제가 없습니다.


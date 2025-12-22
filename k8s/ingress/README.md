# Route 53 + cert-manager 설정 가이드

## 도메인: hiker-cloud.site

## 설정 단계

### 1. AWS IAM User 생성 및 권한 설정

1. AWS Console → IAM → Users → Create User
2. User name: `cert-manager-route53` (또는 원하는 이름)
3. Attach policies directly → Create policy
4. JSON 탭에 다음 정책 붙여넣기:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "route53:GetChange",
        "route53:ListHostedZones",
        "route53:ListResourceRecordSets"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "route53:ChangeResourceRecordSets"
      ],
      "Resource": "arn:aws:route53:::hostedzone/*"
    }
  ]
}
```

5. Policy name: `cert-manager-route53-policy`
6. User에 정책 연결
7. Security credentials → Create access key → Application running outside AWS
8. Access Key ID와 Secret Access Key 복사

### 2. AWS Secret 생성

```bash
# 방법 1: kubectl 명령어로 직접 생성 (권장)
kubectl create secret generic route53-credentials \
  --from-literal=access-key-id=YOUR_ACCESS_KEY_ID \
  --from-literal=secret-access-key=YOUR_SECRET_ACCESS_KEY \
  -n cert-manager

# 방법 2: 파일 사용 (cert-manager-route53-secret.yaml 수정 후)
# 파일에서 YOUR_ACCESS_KEY_ID_HERE와 YOUR_SECRET_ACCESS_KEY_HERE를 실제 값으로 변경
kubectl apply -f k8s/ingress/cert-manager-route53-secret.yaml
```

### 3. ClusterIssuer 및 Certificate 배포

```bash
# ClusterIssuer 배포
kubectl apply -f k8s/ingress/cert-manager-route53-issuer.yaml

# Certificate 배포
kubectl apply -f k8s/ingress/certificate.yaml

# 상태 확인
kubectl get clusterissuer
kubectl get certificate -n istio-system
kubectl describe certificate hiking-tls-cert -n istio-system
```

### 4. Route 53 A 레코드 추가

AWS Route 53 Console에서:

1. 호스팅 영역 `hiker-cloud.site` 선택
2. 레코드 생성
3. 레코드 이름: `hiker-cloud.site` (또는 `@`)
4. 레코드 유형: `A`
5. 값/트래픽 라우팅 대상: `192.168.0.244` (또는 Istio Gateway의 실제 외부 IP)
6. TTL: `300` (5분)
7. 레코드 생성

www 서브도메인도 추가:
1. 레코드 이름: `www`
2. 나머지 동일

### 5. Istio Gateway 업데이트

```bash
kubectl apply -f k8s/ingress/istio-gateway.yaml
```

### 6. 인증서 발급 확인

```bash
# 인증서 상태 확인
kubectl get certificate -n istio-system
kubectl describe certificate hiking-tls-cert -n istio-system

# 인증서 요청 상태 확인
kubectl get certificaterequest -n istio-system
kubectl describe certificaterequest -n istio-system

# Challenge 상태 확인
kubectl get challenge -n istio-system
kubectl describe challenge -n istio-system

# Secret 생성 확인 (인증서가 발급되면 자동 생성됨)
kubectl get secret hiking-tls-secret -n istio-system
```

### 7. 테스트

```bash
# DNS 전파 확인 (몇 분 소요될 수 있음)
nslookup hiker-cloud.site
dig hiker-cloud.site

# HTTPS 접근 테스트
curl -I https://hiker-cloud.site
```

## 트러블슈팅

### 인증서가 발급되지 않는 경우

1. **IAM 권한 확인**
   ```bash
   # Secret이 올바르게 생성되었는지 확인
   kubectl get secret route53-credentials -n cert-manager
   ```

2. **Route 53 호스팅 영역 확인**
   - 도메인이 올바른 호스팅 영역에 있는지 확인
   - 호스팅 영역 ID 확인

3. **Challenge 로그 확인**
   ```bash
   kubectl logs -n cert-manager -l app=cert-manager
   kubectl describe challenge -n istio-system
   ```

4. **DNS 레코드 확인**
   - Route 53에서 TXT 레코드가 자동으로 생성되는지 확인
   - cert-manager가 DNS-01 challenge를 위해 TXT 레코드를 생성함

### 인증서는 발급되었지만 연결이 안 되는 경우

1. **Gateway 설정 확인**
   ```bash
   kubectl get gateway -n istio-system
   kubectl describe gateway hiking-gateway -n istio-system
   ```

2. **DNS 전파 확인**
   - DNS 변경 후 전파까지 시간이 걸릴 수 있음 (최대 48시간, 보통 몇 분~몇 시간)

3. **포트 확인**
   - Istio Gateway가 올바른 포트로 노출되어 있는지 확인
   - 방화벽에서 80, 443 포트가 열려 있는지 확인

## 참고

- 인증서는 자동으로 30일 전에 갱신됩니다
- cert-manager는 Route 53에 TXT 레코드를 자동으로 생성/삭제합니다
- DNS-01 challenge는 HTTP-01보다 안정적이며 와일드카드 인증서도 지원합니다


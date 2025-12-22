# Route 53 호스팅 영역 ID 확인 방법

## 방법 1: Route 53 Console에서 확인

1. AWS Console → Route 53 → Hosted zones
2. `hiker-cloud.site` 호스팅 영역 클릭
3. 상단에 "호스팅 영역 ID" 또는 "Hosted zone ID" 표시됨
   - 형식: `Z1234567890ABC` (Z로 시작하는 문자열)

## 방법 2: AWS CLI로 확인

```bash
aws route53 list-hosted-zones --query "HostedZones[?Name=='hiker-cloud.site.'].Id" --output text
```

## 호스팅 영역 ID를 ClusterIssuer에 추가

호스팅 영역 ID를 확인한 후, `cert-manager-route53-issuer.yaml` 파일을 수정:

```yaml
solvers:
- dns01:
    route53:
      region: ap-northeast-2
      hostedZoneID: Z1234567890ABC  # 여기에 실제 호스팅 영역 ID 입력
      accessKeyIDSecretRef:
        name: route53-credentials
        key: access-key-id
      secretAccessKeySecretRef:
        name: route53-credentials
        key: secret-access-key
```

그 다음:
```bash
kubectl apply -f k8s/ingress/cert-manager-route53-issuer.yaml
kubectl delete certificate hiking-tls-cert -n istio-system
kubectl apply -f k8s/ingress/certificate.yaml
```


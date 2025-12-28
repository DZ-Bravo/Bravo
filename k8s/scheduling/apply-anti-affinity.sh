#!/bin/bash
# =================================================
# 모든 Core 서비스에 Pod Anti-Affinity 자동 적용
# =================================================

NAMESPACE="bravo-core-ns"
SERVICES=(
  "auth-service"
  "community-service"
  "notice-service"
  "schedule-service"
  "notification-service"
  "store-service"
  "mountain-service"
  "stamp-service"
)

echo "=== Pod Anti-Affinity 적용 시작 ==="

for service in "${SERVICES[@]}"; do
  echo "Processing: $service"
  
  # 현재 affinity 설정 확인
  current_affinity=$(kubectl get deployment $service -n $NAMESPACE -o jsonpath='{.spec.template.spec.affinity}')
  
  if [ -z "$current_affinity" ] || [ "$current_affinity" == "null" ]; then
    # Anti-Affinity 추가
    kubectl patch deployment $service -n $NAMESPACE --type='json' -p="[
      {
        \"op\": \"add\",
        \"path\": \"/spec/template/spec/affinity\",
        \"value\": {
          \"podAntiAffinity\": {
            \"preferredDuringSchedulingIgnoredDuringExecution\": [
              {
                \"weight\": 100,
                \"podAffinityTerm\": {
                  \"labelSelector\": {
                    \"matchExpressions\": [
                      {
                        \"key\": \"app\",
                        \"operator\": \"In\",
                        \"values\": [\"$service\"]
                      }
                    ]
                  },
                  \"topologyKey\": \"kubernetes.io/hostname\"
                }
              }
            ]
          }
        }
      }
    ]"
    echo "✓ $service: Anti-Affinity 추가 완료"
  else
    echo "⚠ $service: 이미 affinity 설정이 있습니다. 수동 확인 필요"
  fi
done

echo "=== 적용 완료 ==="
echo ""
echo "Pod 재시작을 위해 rollout restart 실행:"
echo "kubectl rollout restart deployment -n $NAMESPACE"



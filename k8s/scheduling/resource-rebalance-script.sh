#!/bin/bash
# =================================================
# 노드 리소스 불균형 자동 해결 스크립트
# =================================================

# 설정
MEMORY_THRESHOLD=80  # 메모리 사용률 임계값 (%)
CPU_THRESHOLD=80     # CPU 사용률 임계값 (%)

# 노드별 리소스 사용률 확인
check_node_resources() {
    local node=$1
    local memory_usage=$(kubectl describe node $node | grep -A 5 "Allocated resources" | grep memory | awk '{print $2}' | sed 's/%//' | sed 's/(.*//')
    local cpu_usage=$(kubectl describe node $node | grep -A 5 "Allocated resources" | grep cpu | awk '{print $2}' | sed 's/%//' | sed 's/(.*//')
    
    echo "$node: Memory=${memory_usage}%, CPU=${cpu_usage}%"
    
    # 임계값 초과 확인
    if (( $(echo "$memory_usage > $MEMORY_THRESHOLD" | bc -l) )) || (( $(echo "$cpu_usage > $CPU_THRESHOLD" | bc -l) )); then
        return 1  # 임계값 초과
    fi
    return 0  # 정상
}

# 특정 노드의 Deployment Pod 찾기
find_deployment_pods() {
    local node=$1
    kubectl get pods -A -o wide --field-selector spec.nodeName=$node --no-headers | \
        grep -v "StatefulSet\|DaemonSet\|Job\|CronJob" | \
        awk '{print $1, $2}'
}

# Pod 재스케줄링 (Deployment만)
reschedule_pods() {
    local node=$1
    local target_node=$2
    
    echo "=== $node에서 $target_node로 Pod 이동 시작 ==="
    
    # 노드 cordon
    kubectl cordon $node
    
    # Deployment Pod 찾기 및 삭제
    local pods=$(find_deployment_pods $node)
    while IFS= read -r line; do
        if [ -n "$line" ]; then
            local namespace=$(echo $line | awk '{print $1}')
            local pod=$(echo $line | awk '{print $2}')
            echo "Deleting pod: $namespace/$pod"
            kubectl delete pod $pod -n $namespace --grace-period=30
        fi
    done <<< "$pods"
    
    # 다른 노드들 cordon, 타겟 노드만 uncordon
    for n in node1 node2 node3 node4 node5; do
        if [ "$n" != "$node" ] && [ "$n" != "$target_node" ]; then
            kubectl cordon $n 2>/dev/null
        fi
    done
    kubectl uncordon $target_node
    
    # 재스케줄링 대기
    echo "Waiting for pods to reschedule..."
    sleep 30
    
    # 모든 노드 uncordon
    for n in node1 node2 node3 node4 node5; do
        kubectl uncordon $n 2>/dev/null
    done
    
    echo "=== Pod 이동 완료 ==="
}

# 메인 로직
main() {
    echo "=== 노드 리소스 상태 확인 ==="
    
    # 모든 노드 확인
    local overloaded_nodes=()
    local available_nodes=()
    
    for node in node1 node2 node3 node4 node5; do
        if check_node_resources $node; then
            available_nodes+=($node)
            echo "✓ $node: 정상"
        else
            overloaded_nodes+=($node)
            echo "✗ $node: 리소스 부족"
        fi
    done
    
    # 부하가 높은 노드가 있고 여유 노드가 있으면 재분산
    if [ ${#overloaded_nodes[@]} -gt 0 ] && [ ${#available_nodes[@]} -gt 0 ]; then
        for overloaded in "${overloaded_nodes[@]}"; do
            # 가장 여유가 많은 노드 선택
            local target=$(echo "${available_nodes[@]}" | tr ' ' '\n' | head -1)
            if [ -n "$target" ]; then
                reschedule_pods $overloaded $target
            fi
        done
    else
        echo "재분산이 필요하지 않습니다."
    fi
}

# 실행
main





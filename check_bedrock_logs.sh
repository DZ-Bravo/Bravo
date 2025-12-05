#!/bin/bash
# Bedrock 응답 디버깅 로그 확인 스크립트

echo "=== 최근 Bedrock 응답 디버깅 로그 확인 ==="
echo ""

# 최근 200줄에서 Bedrock 관련 로그만 필터링
docker logs hiking-backend 2>&1 | tail -200 | grep -A 15 "Bedrock 응답 디버깅" | head -50

echo ""
echo "=== 전체 최근 로그 (챗봇 관련) ==="
docker logs hiking-backend 2>&1 | tail -50 | grep -E "(챗봇|chatbot|Bedrock|응답)" || echo "챗봇 관련 로그 없음"

echo ""
echo "=========================================="
echo "테스트 방법:"
echo "1. 웹 브라우저에서 챗봇 열기"
echo "2. '하이' 또는 '괄롬쉘롬' 같은 메시지 보내기"
echo "3. 이 스크립트 다시 실행: ./check_bedrock_logs.sh"
echo "또는 실시간 모니터링: docker logs hiking-backend -f"


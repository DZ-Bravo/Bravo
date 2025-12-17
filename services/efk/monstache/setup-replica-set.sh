#!/bin/bash
# MongoDB Replica Set 초기화 스크립트
# Monstache를 사용하려면 MongoDB가 Replica Set 모드로 실행되어야 합니다.

echo "MongoDB Replica Set 초기화 중..."

# MongoDB가 시작될 때까지 대기
sleep 5

# Replica Set 초기화
docker exec hiking-mongodb mongosh --eval "
rs.initiate({
  _id: 'rs0',
  members: [
    { _id: 0, host: 'localhost:27017' }
  ]
})
" --quiet

echo "Replica Set 초기화 완료!"
echo "상태 확인: docker exec hiking-mongodb mongosh --eval 'rs.status()'"


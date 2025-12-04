#!/bin/bash

# 백업 디렉토리 생성
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

# 백업 파일명 (날짜/시간 포함)
BACKUP_NAME="hiking_backup_$(date +%Y%m%d_%H%M%S)"

echo "MongoDB 백업 시작..."
echo "백업 이름: $BACKUP_NAME"

# 컨테이너 내부에서 백업 실행
docker compose exec -T mongodb mongodump \
  --uri="mongodb://admin:admin123@localhost:27017/hiking?authSource=admin" \
  --out="/tmp/$BACKUP_NAME"

# 백업 파일을 호스트로 복사
echo "백업 파일을 호스트로 복사 중..."
docker compose cp "mongodb:/tmp/$BACKUP_NAME" "$BACKUP_DIR/"

# 컨테이너 내부 임시 파일 삭제
echo "임시 파일 삭제 중..."
docker compose exec -T mongodb rm -rf "/tmp/$BACKUP_NAME"

# 압축
echo "압축 중..."
cd "$BACKUP_DIR"
tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"

echo ""
echo "백업 완료!"
echo "백업 파일: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"


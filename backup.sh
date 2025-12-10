#!/bin/bash

# 백업 디렉토리 생성
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

# 백업 파일명 (날짜/시간 포함)
BACKUP_NAME="hiking_backup_$(date +%Y%m%d_%H%M%S)"

echo "MongoDB 백업 시작..."
echo "백업 이름: $BACKUP_NAME"

# MongoDB 컨테이너 이름 확인 (우선순위: ReplicaSet Primary -> 단독 인스턴스)
PRIMARY_CONTAINER="mongodb-primary-243"
STANDALONE_CONTAINER="hiking-mongodb"
CONTAINER_NAME=""
MONGO_URI=""

# 우선 ReplicaSet Primary 확인
if docker ps | grep -q "$PRIMARY_CONTAINER"; then
    CONTAINER_NAME="$PRIMARY_CONTAINER"
    MONGO_URI="mongodb://admin:admin123@localhost:27017/hiking?authSource=admin&replicaSet=rs0"
else
    # 단독 인스턴스 사용
    if docker ps | grep -q "$STANDALONE_CONTAINER"; then
        CONTAINER_NAME="$STANDALONE_CONTAINER"
        MONGO_URI="mongodb://admin:admin123@localhost:27017/hiking?authSource=admin"
    fi
fi

# 컨테이너가 실행 중인지 확인
if [ -z "$CONTAINER_NAME" ]; then
    echo "오류: MongoDB 컨테이너(ReplicaSet Primary 또는 단독)가 실행 중이 아닙니다."
    exit 1
fi

echo "MongoDB 컨테이너 확인: $CONTAINER_NAME"
echo "백업 대상 URI: $MONGO_URI"

# 컨테이너 내부에서 백업 실행
echo "백업 실행 중..."
docker exec "$CONTAINER_NAME" mongodump \
  --uri="$MONGO_URI" \
  --out="/tmp/$BACKUP_NAME"

# 백업 결과 확인
if [ $? -ne 0 ]; then
    echo "오류: 백업 실행 실패"
    exit 1
fi

# 백업 파일이 생성되었는지 확인
BACKUP_CHECK=$(docker exec "$CONTAINER_NAME" ls -la /tmp/$BACKUP_NAME 2>/dev/null)
if [ -z "$BACKUP_CHECK" ]; then
    echo "오류: 백업 파일이 생성되지 않았습니다."
    exit 1
fi

# 백업 파일을 호스트로 복사
echo "백업 파일을 호스트로 복사 중..."
docker cp "$CONTAINER_NAME:/tmp/$BACKUP_NAME" "$BACKUP_DIR/"

if [ $? -ne 0 ]; then
    echo "오류: 백업 파일 복사 실패"
    exit 1
fi

# 컨테이너 내부 임시 파일 삭제
echo "임시 파일 삭제 중..."
docker exec "$CONTAINER_NAME" rm -rf "/tmp/$BACKUP_NAME"

# 백업 디렉토리 확인
if [ ! -d "$BACKUP_DIR/$BACKUP_NAME" ]; then
    echo "오류: 백업 디렉토리가 생성되지 않았습니다."
    exit 1
fi

# 백업 크기 확인
BACKUP_SIZE=$(du -sh "$BACKUP_DIR/$BACKUP_NAME" | cut -f1)
echo "백업 크기: $BACKUP_SIZE"

# 압축
echo "압축 중..."
cd "$BACKUP_DIR"
tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"

if [ $? -ne 0 ]; then
    echo "오류: 압축 실패"
    exit 1
fi

# 압축 파일 크기 확인
COMPRESSED_SIZE=$(du -sh "${BACKUP_NAME}.tar.gz" | cut -f1)
echo "압축된 백업 크기: $COMPRESSED_SIZE"

# 원본 디렉토리 삭제
rm -rf "$BACKUP_NAME"

echo ""
echo "백업 완료!"
echo "백업 파일: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"
echo "백업 크기: $COMPRESSED_SIZE"


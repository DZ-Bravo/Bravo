# Monstache 설정 가이드

Monstache는 MongoDB의 Change Streams를 사용하여 Elasticsearch로 실시간 데이터 동기화를 수행하는 도구입니다.

## 기능

- **실시간 동기화**: MongoDB의 변경사항을 즉시 Elasticsearch에 반영
- **자동 인덱싱**: 새로 생성/수정/삭제된 데이터를 자동으로 Elasticsearch에 동기화
- **Change Streams**: MongoDB의 변경 스트림을 활용하여 효율적인 동기화

## 동기화 대상

1. **산 데이터**: `Mountain_list` 컬렉션 → `mountains` 인덱스
2. **게시글**: `posts` 컬렉션 → `posts` 인덱스
3. **스토어 상품**: `shoes`, `top`, `bottom`, `goods` 컬렉션 → `products` 인덱스

## 설정 파일

설정 파일 위치: `services/efk/monstache/config.toml`

### 주요 설정

- **MongoDB 연결**: Replica Set 사용
  - Primary: `192.168.0.243:27017`
  - Secondary: `192.168.0.243:27018`, `192.168.0.242:27019`
  - Connection String: `mongodb://admin:admin123@192.168.0.243:27017,192.168.0.243:27018,192.168.0.242:27019/hiking?authSource=admin&replicaSet=rs0&readPreference=primaryPreferred`
- **Elasticsearch 연결**: `http://elasticsearch:9200`
- **컬렉션 매핑**: 각 MongoDB 컬렉션을 Elasticsearch 인덱스에 매핑

## 시작 방법

```bash
# Monstache만 시작
cd /home/bravo/LABs/services
docker-compose up -d monstache

# 전체 서비스와 함께 시작
docker-compose up -d
```

## 로그 확인

```bash
# Monstache 로그 확인
docker logs hiking-monstache

# 실시간 로그 확인
docker logs -f hiking-monstache
```

## 동기화 확인

### Elasticsearch에서 확인

```bash
# 인덱스 목록 확인
curl http://localhost:9200/_cat/indices?v

# 인덱스 문서 수 확인
curl http://localhost:9200/mountains/_count
curl http://localhost:9200/posts/_count
curl http://localhost:9200/products/_count
```

### Kibana에서 확인

1. Kibana 접속: http://localhost:5601
2. Dev Tools에서 확인:
   ```json
   GET /mountains/_count
   GET /posts/_count
   GET /products/_count
   ```

## 문제 해결

### Monstache가 시작되지 않는 경우

1. MongoDB 연결 확인:
   ```bash
   docker exec hiking-mongodb mongosh --eval "db.adminCommand('ping')"
   ```

2. Elasticsearch 연결 확인:
   ```bash
   curl http://localhost:9200
   ```

3. 설정 파일 확인:
   ```bash
   cat services/efk/monstache/config.toml
   ```

### 데이터가 동기화되지 않는 경우

1. Monstache 로그 확인:
   ```bash
   docker logs hiking-monstache
   ```

2. MongoDB Change Streams 활성화 확인:
   - MongoDB 3.6 이상 필요
   - Replica Set 또는 Sharded Cluster 필요

3. 컬렉션 이름 확인:
   - 실제 MongoDB 컬렉션 이름과 설정 파일의 namespace가 일치하는지 확인

## 주의사항

1. **MongoDB Replica Set**: Monstache는 Change Streams를 사용하므로 MongoDB가 Replica Set 모드로 실행되어야 합니다.
   - **Replica Set 구성**:
     - Primary: `192.168.0.243:27017`
     - Secondary: `192.168.0.243:27018`, `192.168.0.242:27019`
   - Replica Set은 이미 설정되어 있으므로 추가 설정 불필요
   - Monstache는 Primary에 연결하여 Change Streams를 수신합니다

2. **초기 동기화**: Monstache는 변경사항만 동기화하므로, 기존 데이터는 수동 인덱싱 API를 사용해야 합니다.

3. **인덱스 매핑**: Elasticsearch 인덱스가 먼저 생성되어 있어야 합니다. 인덱싱 API를 먼저 실행하거나 Monstache가 자동으로 생성하도록 설정할 수 있습니다.

4. **컬렉션 이름**: 실제 MongoDB 컬렉션 이름과 config.toml의 namespace가 일치해야 합니다.
   - `hiking.Mountain_list` (대소문자 주의)
   - `hiking.posts`
   - `hiking.shoes`, `hiking.top`, `hiking.bottom`, `hiking.goods`

## 초기 데이터 인덱싱

Monstache는 변경사항만 동기화하므로, 기존 데이터는 먼저 인덱싱해야 합니다:

```bash
# 산 데이터 인덱싱
POST /api/mountains/index/init

# 스토어 데이터 인덱싱
POST /api/store/index/init

# 게시글 데이터 인덱싱
POST /api/posts/index/init
```

이후 Monstache가 실시간으로 변경사항을 동기화합니다.


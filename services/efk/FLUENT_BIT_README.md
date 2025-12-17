# Fluent Bit 설정 가이드

Fluent Bit는 경량 로그 수집기로, Docker 컨테이너 로그와 애플리케이션 로그를 수집하여 Elasticsearch로 전송합니다.

## 기능

- **Docker 컨테이너 로그 수집**: 모든 Docker 컨테이너의 로그를 자동으로 수집
- **애플리케이션 로그 수집**: 백엔드 서비스의 로그 파일 수집
- **Elasticsearch 전송**: 수집한 로그를 Elasticsearch로 전송
- **Kibana 시각화**: Kibana에서 로그를 검색하고 시각화

## 설정 파일

### 1. Fluent Bit 메인 설정 (`fluent-bit.conf`)

- **입력 (INPUT)**:
  - Docker 컨테이너 로그: `/var/lib/docker/containers/*/*-json.log`
  - 애플리케이션 로그: `/var/log/app/*.log`
  - 시스템 로그: systemd 로그

- **필터 (FILTER)**:
  - Docker 로그 파싱
  - JSON 로그 파싱
  - 로그 메타데이터 추가

- **출력 (OUTPUT)**:
  - Elasticsearch로 전송
  - 인덱스: `docker-logs`
  - Logstash 형식: `docker-YYYY.MM.DD`

### 2. 파서 설정 (`parsers.conf`)

- **docker**: Docker JSON 로그 파싱
- **json**: JSON 형식 로그 파싱
- **multiline_log**: 멀티라인 로그 파싱

## 시작 방법

```bash
# Fluent Bit만 시작
cd /home/bravo/LABs/services
docker-compose up -d fluent-bit

# 전체 EFK 스택 시작
docker-compose up -d elasticsearch kibana fluent-bit
```

## 로그 확인

```bash
# Fluent Bit 로그 확인
docker logs hiking-fluent-bit

# 실시간 로그 확인
docker logs -f hiking-fluent-bit
```

## Elasticsearch에서 로그 확인

### Kibana Dev Tools에서 확인

```json
# 로그 인덱스 목록 확인
GET /_cat/indices?v

# 최근 로그 조회
GET /docker-logs-*/_search
{
  "size": 10,
  "sort": [
    {
      "@timestamp": {
        "order": "desc"
      }
    }
  ]
}

# 특정 컨테이너 로그 조회
GET /docker-logs-*/_search
{
  "query": {
    "match": {
      "container_name": "hiking-frontend"
    }
  },
  "size": 20,
  "sort": [
    {
      "@timestamp": {
        "order": "desc"
      }
    }
  ]
}

# ERROR 레벨 로그만 조회
GET /docker-logs-*/_search
{
  "query": {
    "match": {
      "log": "ERROR"
    }
  },
  "size": 50
}
```

## Kibana에서 로그 시각화

1. Kibana 접속: http://192.168.0.242:5601
2. **Stack Management** → **Index Patterns** → **Create index pattern**
3. 인덱스 패턴: `docker-logs-*`
4. 시간 필드: `@timestamp`
5. **Discover**에서 로그 검색 및 필터링
6. **Dashboard**에서 로그 시각화 대시보드 생성

## 수집되는 로그

### Docker 컨테이너 로그
- 모든 컨테이너의 stdout/stderr 로그
- 컨테이너 이름, 이미지, 태그 등 메타데이터 포함

### 애플리케이션 로그
- `/var/log/app/*.log` 경로의 로그 파일
- 백엔드 서비스에서 이 경로로 로그를 출력하면 자동 수집

## 문제 해결

### Fluent Bit가 로그를 수집하지 않는 경우

1. Docker 소켓 확인:
   ```bash
   ls -la /var/run/docker.sock
   ```

2. 컨테이너 로그 경로 확인:
   ```bash
   ls -la /var/lib/docker/containers/
   ```

3. Fluent Bit 로그 확인:
   ```bash
   docker logs hiking-fluent-bit
   ```

### Elasticsearch로 로그가 전송되지 않는 경우

1. Elasticsearch 연결 확인:
   ```bash
   curl http://elasticsearch:9200
   ```

2. Fluent Bit 설정 확인:
   ```bash
   docker exec hiking-fluent-bit cat /fluent-bit/etc/fluent-bit.conf
   ```

3. Elasticsearch 인덱스 확인:
   ```bash
   curl http://localhost:9200/_cat/indices?v | grep docker
   ```

## 성능 최적화

- **Mem_Buf_Limit**: 메모리 버퍼 제한 (50MB)
- **Flush**: 로그 플러시 간격 (1초)
- **Refresh_Interval**: 파일 새로고침 간격 (5초)

## 주의사항

1. **로그 볼륨**: 로그가 많으면 디스크 공간을 많이 사용할 수 있습니다.
2. **성능**: 많은 컨테이너가 있으면 Fluent Bit의 CPU/메모리 사용량이 증가할 수 있습니다.
3. **인덱스 관리**: Elasticsearch 인덱스가 계속 증가하므로 인덱스 라이프사이클 정책을 설정하는 것이 좋습니다.


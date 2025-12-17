# Kibana Dev Tools 검색 쿼리 예시

## ✅ 현재 인덱싱된 데이터

- **mountains**: 552개 (산 데이터)
- **products**: 아직 없음
- **posts**: 아직 없음

## Kibana Dev Tools 사용 방법

1. Kibana 접속: http://192.168.0.242:5601
2. 왼쪽 메뉴에서 **Dev Tools** 클릭
3. Console에서 아래 쿼리 실행

## 기본 검색 쿼리

### 1. 전체 산 데이터 조회
```json
GET /mountains/_search
{
  "size": 10
}
```

### 2. 특정 산 검색 (이름으로)
```json
GET /mountains/_search
{
  "query": {
    "match": {
      "name": "한라산"
    }
  }
}
```

### 3. Fuzzy 검색 (오타 허용)
```json
GET /mountains/_search
{
  "query": {
    "multi_match": {
      "query": "한라산",
      "fields": ["name^3", "location^2", "description"],
      "fuzziness": "AUTO"
    }
  }
}
```

### 4. 위치로 검색
```json
GET /mountains/_search
{
  "query": {
    "match": {
      "location": "서울"
    }
  }
}
```

### 5. 여러 조건 검색
```json
GET /mountains/_search
{
  "query": {
    "bool": {
      "should": [
        { "match": { "name": "북한산" } },
        { "match": { "location": "서울" } }
      ]
    }
  }
}
```

### 6. 인덱스 통계 확인
```json
GET /mountains/_count
```

### 7. 인덱스 매핑 확인
```json
GET /mountains/_mapping
```

## 검색 결과 예시

성공적으로 검색되면 다음과 같은 형식으로 결과가 나옵니다:

```json
{
  "took": 5,
  "timed_out": false,
  "_shards": {
    "total": 1,
    "successful": 1,
    "skipped": 0,
    "failed": 0
  },
  "hits": {
    "total": {
      "value": 552,
      "relation": "eq"
    },
    "max_score": 1.0,
    "hits": [
      {
        "_index": "mountains",
        "_id": "287201304",
        "_score": 1.0,
        "_source": {
          "code": "287201304",
          "name": "북한산",
          "location": "서울특별시 종로구",
          "height": "836m",
          "description": "",
          "image": null
        }
      }
    ]
  }
}
```

## 주의사항

- **Kibana Dev Tools는 Elasticsearch API만 호출**합니다
- 백엔드 API(`/api/mountains/index/init` 등)는 HTTP 클라이언트로 호출해야 합니다
- 검색 쿼리는 Kibana Dev Tools에서 실행하면 됩니다


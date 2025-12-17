# EFK Stack (Elasticsearch, Kibana)

검색 기능을 위한 Elasticsearch와 Kibana 스택입니다.

## 목적
- 메인페이지 검색 기능 (산, 게시글, 상품)
- 스토어 페이지 검색 기능
- 오타 허용 검색 (Fuzzy Search)
- 검색 속도 최적화

## 서비스 구성

### Elasticsearch
- **포트**: 9200 (HTTP), 9300 (Transport)
- **컨테이너명**: `hiking-elasticsearch`
- **용도**: 검색 엔진, 인덱싱 및 검색 수행

### Kibana
- **포트**: 5601
- **컨테이너명**: `hiking-kibana`
- **용도**: Elasticsearch 관리, 인덱스 관리, 검색 쿼리 테스트

## 사용 방법

### 1. 서비스 시작
```bash
# 메인 docker-compose.yml에서 전체 서비스 시작
cd /home/bravo/LABs/services
docker-compose up -d elasticsearch kibana

# 또는 EFK만 별도로 시작
cd /home/bravo/LABs/services/efk
docker-compose up -d
```

### 2. Elasticsearch 상태 확인
```bash
curl http://localhost:9200/_cluster/health
curl http://localhost:9200
```

### 3. Kibana 접속
- URL: http://localhost:5601
- Elasticsearch 연결: 자동으로 `elasticsearch:9200`에 연결됨

## 인덱스 생성 예시

### 산 정보 인덱스
```bash
curl -X PUT "localhost:9200/mountains" -H 'Content-Type: application/json' -d'
{
  "settings": {
    "analysis": {
      "analyzer": {
        "korean_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "name": {
        "type": "text",
        "analyzer": "korean_analyzer",
        "fields": {
          "keyword": {
            "type": "keyword"
          }
        }
      },
      "location": {
        "type": "text"
      },
      "height": {
        "type": "integer"
      }
    }
  }
}
'
```

### 상품 인덱스 (Fuzzy Search 지원)
```bash
curl -X PUT "localhost:9200/products" -H 'Content-Type: application/json' -d'
{
  "settings": {
    "analysis": {
      "analyzer": {
        "korean_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "name": {
        "type": "text",
        "analyzer": "korean_analyzer"
      },
      "description": {
        "type": "text",
        "analyzer": "korean_analyzer"
      },
      "price": {
        "type": "integer"
      },
      "category": {
        "type": "keyword"
      }
    }
  }
}
'
```

## Fuzzy Search 쿼리 예시

### 오타 허용 검색 (Fuzziness)
```json
{
  "query": {
    "multi_match": {
      "query": "한라산",
      "fields": ["name", "description"],
      "fuzziness": "AUTO",
      "prefix_length": 1
    }
  }
}
```

### 한국어 검색 최적화
```json
{
  "query": {
    "bool": {
      "should": [
        {
          "match": {
            "name": {
              "query": "검색어",
              "fuzziness": "AUTO"
            }
          }
        },
        {
          "match_phrase": {
            "name": {
              "query": "검색어",
              "slop": 2
            }
          }
        }
      ]
    }
  }
}
```

## 백엔드 연동

### Node.js 예시
```javascript
const { Client } = require('@elastic/elasticsearch');
const client = new Client({ node: 'http://elasticsearch:9200' });

// 검색 함수
async function searchProducts(query) {
  const result = await client.search({
    index: 'products',
    body: {
      query: {
        multi_match: {
          query: query,
          fields: ['name^3', 'description'],
          fuzziness: 'AUTO',
          prefix_length: 1
        }
      }
    }
  });
  return result.body.hits.hits;
}
```

## 성능 최적화

- **메모리**: 기본 1GB 할당 (필요시 조정)
- **인덱스 샤딩**: 단일 노드이므로 샤드 1개 권장
- **리프레시 간격**: 검색 속도 최적화를 위해 조정 가능

## 참고사항

- Elasticsearch는 메모리를 많이 사용하므로 서버 리소스 확인 필요
- 프로덕션 환경에서는 보안 설정(xpack.security) 활성화 권장
- 한국어 분석을 더 정확하게 하려면 Nori 플러그인 설치 고려


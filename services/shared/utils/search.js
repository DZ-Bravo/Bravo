import { getElasticsearchClient } from '../config/elasticsearch.js'

/**
 * 인덱스 생성 및 매핑 설정
 */
export const createIndex = async (indexName, mapping) => {
  try {
    const client = await getElasticsearchClient()
    if (!client) {
      throw new Error('Elasticsearch 클라이언트를 사용할 수 없습니다.')
    }

    // 인덱스 존재 여부 확인
    const exists = await client.indices.exists({ index: indexName })
    
    if (exists) {
      console.log(`인덱스 "${indexName}"가 이미 존재합니다.`)
      return { created: false, index: indexName }
    }

    // 인덱스 생성
    await client.indices.create({
      index: indexName,
      body: {
        settings: {
          analysis: {
            analyzer: {
              korean_analyzer: {
                type: 'standard',
                tokenizer: 'standard',
                filter: ['lowercase', 'stop']
              }
            },
            filter: {
              stop: {
                type: 'stop',
                stopwords: ['의', '가', '이', '은', '는', '을', '를', '에', '와', '과', '도', '로', '으로', '에서', '에게', '께', '한테', '에게서', '한테서', '의', '께서']
              }
            }
          },
          number_of_shards: 1,
          number_of_replicas: 0
        },
        mappings: mapping
      }
    })

    console.log(`인덱스 "${indexName}" 생성 완료`)
    return { created: true, index: indexName }
  } catch (error) {
    console.error(`인덱스 "${indexName}" 생성 실패:`, error.message)
    throw error
  }
}

/**
 * 문서 인덱싱
 */
export const indexDocument = async (indexName, id, document) => {
  try {
    const client = await getElasticsearchClient()
    if (!client) {
      throw new Error('Elasticsearch 클라이언트를 사용할 수 없습니다.')
    }

    await client.index({
      index: indexName,
      id: id,
      body: document
    })

    return { success: true, id }
  } catch (error) {
    console.error(`문서 인덱싱 실패 (${indexName}/${id}):`, error.message)
    throw error
  }
}

/**
 * 여러 문서 일괄 인덱싱
 */
export const bulkIndex = async (indexName, documents) => {
  try {
    const client = await getElasticsearchClient()
    if (!client) {
      throw new Error('Elasticsearch 클라이언트를 사용할 수 없습니다.')
    }

    const body = documents.flatMap(doc => [
      { index: { _index: indexName, _id: doc.id } },
      doc.data
    ])

    const response = await client.bulk({ body, refresh: true })
    
    if (response.errors) {
      const erroredDocuments = []
      response.items.forEach((action, i) => {
        const operation = Object.keys(action)[0]
        if (action[operation].error) {
          erroredDocuments.push({
            status: action[operation].status,
            error: action[operation].error,
            operation: body[i * 2],
            document: body[i * 2 + 1]
          })
        }
      })
      console.error('일부 문서 인덱싱 실패:', erroredDocuments)
    }

    return {
      success: true,
      indexed: response.items.length,
      errors: response.errors ? response.items.filter(item => item.index?.error).length : 0
    }
  } catch (error) {
    console.error(`일괄 인덱싱 실패 (${indexName}):`, error.message)
    throw error
  }
}

/**
 * Fuzzy Search 쿼리 생성
 */
export const buildFuzzySearchQuery = (query, fields, options = {}) => {
  const {
    fuzziness = 'AUTO',
    prefixLength = 1,
    maxExpansions = 50,
    boost = 1.0,
    exactMatch = false  // 정확한 매칭만 사용할지 여부
  } = options

  if (!query || !query.trim()) {
    return { match_all: {} }
  }

  // 정확한 매칭만 사용하는 경우 (오타 허용 없음)
  if (exactMatch) {
    const shouldQueries = []
    fields.forEach(field => {
      const fieldName = field.includes('^') ? field.split('^')[0] : field
      const fieldBoost = field.includes('^') ? parseFloat(field.split('^')[1]) : 1.0
      
      // 1. 정확한 구문 매칭 (가장 높은 우선순위) - slop: 0으로 엄격하게
      shouldQueries.push({
        match_phrase: {
          [fieldName]: {
            query: query,
            slop: 0,  // 단어 순서와 위치가 정확히 일치해야 함
            boost: boost * fieldBoost * 3
          }
        }
      })
      
      // 2. 모든 단어가 포함되어야 하는 매칭 (더 엄격한 조건)
      shouldQueries.push({
        match: {
          [fieldName]: {
            query: query,
            operator: 'and',  // 모든 단어가 포함되어야 함
            fuzziness: 0,      // 오타 허용 안 함
            boost: boost * fieldBoost * 2
          }
        }
      })
    })
    
    // should 조건 사용 - 하나 이상의 조건을 만족해야 함
    return {
      bool: {
        should: shouldQueries,
        minimum_should_match: 1
      }
    }
  }

  // 한 글자 검색어의 경우 wildcard 검색 우선 사용 (keyword 필드 사용)
  if (query.length === 1) {
    const shouldQueries = []
    fields.forEach(field => {
      const fieldName = field.includes('^') ? field.split('^')[0] : field
      // analyzed 필드와 keyword 필드 모두 시도
      shouldQueries.push({
        wildcard: {
          [`${fieldName}.keyword`]: {
            value: `*${query}*`,
            boost: boost * 1.0
          }
        }
      })
      shouldQueries.push({
        wildcard: {
          [fieldName]: {
            value: `*${query}*`,
            boost: boost * 0.8
          }
        }
      })
      // match 쿼리도 추가 (한글 토큰화 지원)
      shouldQueries.push({
        match: {
          [fieldName]: {
            query: query,
            operator: 'or',
            boost: boost * 0.5
          }
        }
      })
    })
    return {
      bool: {
        should: shouldQueries,
        minimum_should_match: 1
      }
    }
  }

  // Multi-match 쿼리로 여러 필드에서 검색
  const shouldQueries = []

  // 정확한 매치 (높은 점수) - 우선순위 최상
  fields.forEach(field => {
    const fieldName = field.includes('^') ? field.split('^')[0] : field
    shouldQueries.push({
      match_phrase: {
        [fieldName]: {
          query: query,
          boost: boost * 3  // 정확한 매칭에 더 높은 점수
        }
      }
    })
  })

  // Prefix match (접두사 검색) - "설악산" 검색 시 "설악산..." 으로 시작하는 것만
  fields.forEach(field => {
    const fieldName = field.includes('^') ? field.split('^')[0] : field
    shouldQueries.push({
      prefix: {
        [fieldName]: {
          value: query,
          boost: boost * 1.5
        }
      }
    })
  })

  // Fuzzy match는 제거 (오타 허용 안 함)
  // Wildcard match도 제거 (부분 일치 검색 안 함)

  return {
    bool: {
      should: shouldQueries,
      minimum_should_match: 1
    }
  }
}

/**
 * 검색 실행
 */
export const search = async (indexName, query, options = {}) => {
  try {
    const client = await getElasticsearchClient()
    if (!client) {
      throw new Error('Elasticsearch 클라이언트를 사용할 수 없습니다.')
    }

    // 인덱스 존재 여부 확인
    const indexExists = await client.indices.exists({ index: indexName })
    if (!indexExists) {
      throw new Error(`인덱스 "${indexName}"가 존재하지 않습니다.`)
    }

    const {
      from = 0,
      size = 20,
      sort = []
    } = options

    const searchBody = {
      query: query,
      from,
      size,
      ...(sort.length > 0 && { sort }),
      // 성능 최적화: timeout 설정 및 불필요한 필드 제외
      timeout: '5s',
      _source: {
        excludes: [] // 필요한 필드만 반환하도록 최적화 가능
      }
    }

    const response = await client.search({
      index: indexName,
      body: searchBody,
      requestTimeout: 5000 // 5초 timeout
    })

    // Elasticsearch 클라이언트 버전에 따라 응답 형식이 다를 수 있음
    const hits = response.body?.hits?.hits || response.hits?.hits || []
    const total = response.body?.hits?.total?.value || response.body?.hits?.total || response.hits?.total?.value || response.hits?.total || 0
    const max_score = response.body?.hits?.max_score || response.hits?.max_score || 0

    return {
      hits: hits.map(hit => ({
        ...hit._source,
        _id: hit._id,
        _score: hit._score
      })),
      total: total,
      max_score: max_score
    }
  } catch (error) {
    console.error(`검색 실패 (${indexName}):`, error.message)
    throw error
  }
}

/**
 * 문서 삭제
 */
export const deleteDocument = async (indexName, id) => {
  try {
    const client = await getElasticsearchClient()
    if (!client) {
      throw new Error('Elasticsearch 클라이언트를 사용할 수 없습니다.')
    }

    await client.delete({
      index: indexName,
      id: id
    })

    return { success: true, id }
  } catch (error) {
    if (error.meta?.statusCode === 404) {
      return { success: false, id, error: '문서를 찾을 수 없습니다.' }
    }
    console.error(`문서 삭제 실패 (${indexName}/${id}):`, error.message)
    throw error
  }
}

/**
 * 인덱스 삭제
 */
export const deleteIndex = async (indexName) => {
  try {
    const client = await getElasticsearchClient()
    if (!client) {
      throw new Error('Elasticsearch 클라이언트를 사용할 수 없습니다.')
    }

    const exists = await client.indices.exists({ index: indexName })
    if (!exists) {
      return { success: false, message: '인덱스가 존재하지 않습니다.' }
    }

    await client.indices.delete({ index: indexName })
    console.log(`인덱스 "${indexName}" 삭제 완료`)
    return { success: true, index: indexName }
  } catch (error) {
    console.error(`인덱스 "${indexName}" 삭제 실패:`, error.message)
    throw error
  }
}


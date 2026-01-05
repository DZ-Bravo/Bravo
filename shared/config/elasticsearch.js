import { Client } from '@elastic/elasticsearch'

let elasticsearchClient = null
let isConnecting = false

/**
 * Elasticsearch 클라이언트 초기화 및 반환
 */
export const getElasticsearchClient = async () => {
  if (elasticsearchClient) {
    return elasticsearchClient
  }

  if (isConnecting) {
    // 연결 중이면 잠시 대기
    await new Promise(resolve => setTimeout(resolve, 100))
    return getElasticsearchClient()
  }

  try {
    isConnecting = true
    
    const node = process.env.ELASTICSEARCH_URL || 'http://elasticsearch:9200'
    
    elasticsearchClient = new Client({
      node,
      requestTimeout: 30000,
      pingTimeout: 3000,
      maxRetries: 3,
    })

    // 연결 테스트
    const health = await elasticsearchClient.cluster.health()
    console.log('Elasticsearch 연결 성공:', health.cluster_name)
    
    isConnecting = false
    return elasticsearchClient
  } catch (error) {
    console.error('Elasticsearch 연결 실패:', error.message)
    elasticsearchClient = null
    isConnecting = false
    return null
  }
}

/**
 * Elasticsearch 클라이언트 반환 (연결 없이)
 */
export const getClient = () => {
  return elasticsearchClient
}

export default getElasticsearchClient


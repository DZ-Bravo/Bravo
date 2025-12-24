import express from 'express'
import mongoose from 'mongoose'
import User from './shared/models/User.js'
import { authenticateToken, optionalAuthenticateToken } from './shared/utils/auth.js'
import { createClient } from 'redis'
import { getElasticsearchClient } from './shared/config/elasticsearch.js'
import { buildFuzzySearchQuery, search, createIndex } from './shared/utils/search.js'

const router = express.Router()

// Redis 클라이언트 (server.js에서 초기화된 것을 사용하거나 여기서 초기화)
let redisClient = null
let redisConnecting = false

const getRedisClient = async () => {
  if (redisClient && redisClient.isOpen) {
    return redisClient
  }
  
  if (redisConnecting) {
    // 연결 중이면 잠시 대기
    await new Promise(resolve => setTimeout(resolve, 100))
    return getRedisClient()
  }
  
  if (!redisClient) {
    redisConnecting = true
    try {
      redisClient = createClient({
        socket: {
          host: process.env.REDIS_HOST || '192.168.0.243',
          port: parseInt(process.env.REDIS_PORT || '6379')
        }
      })
      redisClient.on('error', (err) => {
        console.error('Redis 오류:', err)
        redisClient = null
        redisConnecting = false
      })
      redisClient.on('connect', () => {
        console.log('Redis 연결 성공 (store.js)')
        redisConnecting = false
      })
      await redisClient.connect()
      redisConnecting = false
      return redisClient
    } catch (error) {
      console.error('Redis 연결 실패:', error)
      redisClient = null
      redisConnecting = false
      return null
    }
  }
  
  return redisClient
}

// MongoDB에서 직접 컬렉션 접근
const getCollection = async (collectionName) => {
  if (!mongoose.connection.db) {
    throw new Error('MongoDB 연결이 없습니다.')
  }
  const db = mongoose.connection.db
  return db.collection(collectionName)
}

// 최근 본 상품 조회 - /:category보다 먼저 정의
router.get('/recent', optionalAuthenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || null
    const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId || null

    console.log('[최근 본 상품 API] 조회 요청 - userId:', userId, 'sessionId:', sessionId)

    // 비회원은 최근 본 상품 조회 불가
    if (!userId) {
      console.log('[최근 본 상품 API] 비회원 - 조회 불가')
      return res.json({ products: [] })
    }

    const client = await getRedisClient()
    if (!client) {
      console.warn('[최근 본 상품 API] Redis 클라이언트 없음')
      return res.json({ products: [] })
    }

    const key = userId 
      ? `recent:products:${userId}` 
      : `recent:products:session:${sessionId || 'anonymous'}`
    
    console.log('[최근 본 상품 API] Redis 키:', key)
    
    // 최근 5개 가져오기 (최신순)
    const productIds = await client.zRange(key, -5, -1, {
      REV: true // 역순 (최신순)
    })
    
    console.log('[최근 본 상품 API] Redis에서 가져온 productIds:', productIds)
    
    if (productIds.length === 0) {
      return res.json({ products: [] })
    }

    // 상품 정보 조회 (모든 카테고리에서 찾기)
    const products = []
    const categoryMap = {
      'shoes': 'shoes',
      'top': 'top',
      'bottom': 'bottom',
      'goods': 'goods'
    }

    for (const category of Object.values(categoryMap)) {
      try {
        const collection = await getCollection(category)
        const productObjectIds = productIds
          .filter(id => mongoose.Types.ObjectId.isValid(id))
          .map(id => new mongoose.Types.ObjectId(id))
        
        if (productObjectIds.length > 0) {
          const categoryProducts = await collection
            .find({ _id: { $in: productObjectIds } })
            .toArray()
          
          // 썸네일 정보 추가
          const thumbnailsCollectionName = `${category}_thumbnails`
          let thumbnailsMap = {}
          
          try {
            const thumbnailsCollection = await getCollection(thumbnailsCollectionName)
            const thumbnails = await thumbnailsCollection.find({}).toArray()
            
            thumbnails.forEach(thumb => {
              const title = thumb.title || thumb.name
              if (title) {
                thumbnailsMap[title] = thumb.thumbnails || thumb.thumbnail || thumb.image || thumb.url || null
              }
            })
          } catch (error) {
            console.warn(`${thumbnailsCollectionName} 썸네일 조회 실패:`, error.message)
          }

          categoryProducts.forEach(product => {
            const productTitle = product.title || product.name || ''
            const thumbnailUrl = thumbnailsMap[productTitle] || product.thumbnails || product.thumbnail || product.image || null
            
            products.push({
              _id: product._id,
              id: product._id?.toString() || product.id,
              title: productTitle,
              brand: product.brand || product.brandName || product.manufacturer || null,
              price: product.price || 0,
              original_price: product.original_price || product.originalPrice || null,
              discount_rate: product.discount_rate || product.discountRate || null,
              thumbnails: thumbnailUrl,
              url: product.url || product.link || product.productUrl || product.product_link || null,
              category: category
            })
          })
        }
      } catch (error) {
        console.warn(`${category} 컬렉션 조회 실패:`, error.message)
      }
    }

    // 조회 순서 유지 (최신순)
    const orderedProducts = productIds
      .map(id => products.find(p => p._id.toString() === id || p.id === id))
      .filter(p => p !== undefined)
      .slice(0, 5) // 최대 5개

    res.json({ products: orderedProducts })
  } catch (error) {
    console.error('최근 본 상품 조회 오류:', error)
    res.json({ products: [] })
  }
})

// 최근 본 상품 기록 - /:category보다 먼저 정의
router.post('/recent/:productId', optionalAuthenticateToken, async (req, res) => {
  try {
    const { productId } = req.params
    const userId = req.user?.userId || null
    let sessionId = req.headers['x-session-id'] || req.cookies?.sessionId || null

    console.log('[최근 본 상품 API] 기록 요청 - productId:', productId, 'userId:', userId, 'sessionId:', sessionId)

    // 비회원은 최근 본 상품 기록 불가
    if (!userId) {
      console.log('[최근 본 상품 API] 비회원 - 기록 불가')
      return res.json({ success: false, message: '로그인이 필요합니다' })
    }

    const client = await getRedisClient()
    if (!client) {
      console.warn('[최근 본 상품 API] Redis 클라이언트 없음')
      return res.json({ success: true, message: 'Redis 미사용' })
    }

    const key = `recent:products:${userId}`
    
    console.log('[최근 본 상품 API] Redis 키:', key)
    
    const timestamp = Date.now()
    
    // 기존에 같은 상품이 있으면 먼저 제거 (중복 방지 및 최신 위치로 이동)
    const removed = await client.zRem(key, productId)
    const wasDuplicate = removed > 0
    if (wasDuplicate) {
      console.log('[최근 본 상품 API] 기존 상품 제거됨 (중복) - productId:', productId)
    }
    
    // 현재 저장된 개수 확인 (중복 제거 후)
    const currentCount = await client.zCard(key)
    console.log('[최근 본 상품 API] 중복 제거 후 현재 저장된 개수:', currentCount)
    
    // 5개가 꽉 찬 상태에서 새 상품 추가 시, 가장 오래된 것 삭제
    // 중복이 아닌 경우에만 삭제 (중복이면 이미 제거했으므로 개수가 4개가 됨)
    if (!wasDuplicate && currentCount >= 5) {
      // 가장 오래된 항목 1개 삭제 (점수가 가장 낮은 것 = 인덱스 0)
      const deleted = await client.zRemRangeByRank(key, 0, 0)
      console.log('[최근 본 상품 API] 가장 오래된 항목 1개 삭제 (5개 제한) - 삭제된 개수:', deleted, '현재 개수:', currentCount)
    }
    
    // Sorted Set에 추가 (최신순 정렬) - 항상 첫 번째에 추가됨
    const added = await client.zAdd(key, {
      score: timestamp,
      value: productId
    })
    
    // TTL 설정: 24시간 (86400초)
    await client.expire(key, 86400)
    
    console.log('[최근 본 상품 API] 새 상품 추가 완료 - productId:', productId, '추가됨:', added > 0, 'TTL: 24시간')
    
    // 최종 개수 확인 및 5개 초과 시 정리
    const finalCount = await client.zCard(key)
    console.log('[최근 본 상품 API] 최종 저장된 개수:', finalCount)
    
    if (finalCount > 5) {
      // 혹시 5개를 초과하면 가장 오래된 것부터 삭제
      const excessCount = finalCount - 5
      await client.zRemRangeByRank(key, 0, excessCount - 1)
      console.log(`[최근 본 상품 API] ${excessCount}개 오래된 항목 추가 삭제`)
    }
    
    // 최종 목록 확인 (디버깅)
    const allItems = await client.zRange(key, 0, -1, { REV: true })
    console.log('[최근 본 상품 API] 현재 저장된 모든 상품 ID (최신순):', allItems)
    
    // 30일 TTL 설정
    await client.expire(key, 30 * 24 * 60 * 60)
    
    console.log('[최근 본 상품 API] 기록 성공')
    res.json({ success: true })
  } catch (error) {
    console.error('[최근 본 상품 API] 기록 오류:', error)
    console.error('[최근 본 상품 API] 오류 상세:', error.stack)
    // 오류가 발생해도 사용자 경험을 해치지 않도록 성공 응답
    res.json({ success: true, message: '기록 실패했지만 계속 진행', error: error.message })
  }
})

// 스토어 즐겨찾기 목록 조회 (인증 필요) - /:category보다 먼저 정의
router.get('/favorites/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId

    const user = await User.findById(userId).populate('favoriteStores')
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }

    const favoriteStores = user.favoriteStores || []
    
    // 각 카테고리에서 상품 정보 가져오기
    const products = []
    const categoryMap = {
      'shoes': 'shoes',
      'top': 'top',
      'bottom': 'bottom',
      'goods': 'goods'
    }

    for (const category of Object.values(categoryMap)) {
      try {
        const collection = await getCollection(category)
        const productIds = favoriteStores.map(id => new mongoose.Types.ObjectId(id))
        
        if (productIds.length > 0) {
          const categoryProducts = await collection
            .find({ _id: { $in: productIds } })
            .toArray()
          
          // 썸네일 정보 추가
          const thumbnailsCollectionName = `${category}_thumbnails`
          let thumbnailsMap = {}
          
          try {
            const thumbnailsCollection = await getCollection(thumbnailsCollectionName)
            const thumbnails = await thumbnailsCollection.find({}).toArray()
            
            thumbnails.forEach(thumb => {
              const title = thumb.title || thumb.name
              if (title) {
                thumbnailsMap[title] = thumb.thumbnails || thumb.thumbnail || thumb.image || thumb.url || null
              }
            })
          } catch (error) {
            console.warn(`${thumbnailsCollectionName} 컬렉션 조회 실패:`, error.message)
          }

          categoryProducts.forEach(product => {
            const productTitle = product.title || product.name || ''
            const thumbnailUrl = thumbnailsMap[productTitle] || product.thumbnails || product.thumbnail || product.image || null
            
            products.push({
              _id: product._id,
              id: product._id?.toString() || product.id,
              title: productTitle,
              brand: product.brand || product.brandName || product.manufacturer || null,
              price: product.price || 0,
              original_price: product.original_price || product.originalPrice || null,
              discount_rate: product.discount_rate || product.discountRate || null,
              thumbnails: thumbnailUrl,
              url: product.url || product.link || product.productUrl || product.product_link || null,
              category: category
            })
          })
        }
      } catch (error) {
        console.warn(`${category} 컬렉션 조회 실패:`, error.message)
      }
    }

    res.json({ 
      products: products,
      count: products.length
    })
  } catch (error) {
    console.error('스토어 즐겨찾기 목록 조회 오류:', error)
    res.status(500).json({ error: '즐겨찾기 목록을 불러오는 중 오류가 발생했습니다.' })
  }
})

// 스토어 즐겨찾기 토글 (인증 필요) - /:category보다 먼저 정의
router.post('/:productId/favorite', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const { productId } = req.params

    console.log('스토어 즐겨찾기 토글 요청 - userId:', userId, 'productId:', productId)

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }

    // 즐겨찾기 목록 초기화 (없으면)
    if (!user.favoriteStores) {
      user.favoriteStores = []
    }

    console.log('현재 즐겨찾기 목록:', user.favoriteStores)

    // ObjectId로 변환 (유효성 검사)
    let productObjectId
    try {
      productObjectId = new mongoose.Types.ObjectId(productId)
    } catch (error) {
      return res.status(400).json({ error: '유효하지 않은 상품 ID입니다.' })
    }

    const favoriteIndex = user.favoriteStores.findIndex(
      id => {
        const idStr = id.toString()
        const productIdStr = productId.toString()
        return idStr === productIdStr || (id.equals && id.equals(productObjectId))
      }
    )

    if (favoriteIndex > -1) {
      // 이미 즐겨찾기에 있으면 제거
      user.favoriteStores.splice(favoriteIndex, 1)
      // user.save() 대신 findByIdAndUpdate 사용 (email 검증 오류 방지)
      await User.findByIdAndUpdate(userId, { favoriteStores: user.favoriteStores }, { runValidators: false })
      console.log('즐겨찾기 제거 완료 - 새로운 목록:', user.favoriteStores)
      res.json({ 
        isFavorited: false, 
        message: '즐겨찾기에서 제거되었습니다.' 
      })
    } else {
      // 즐겨찾기에 추가
      user.favoriteStores.push(productObjectId)
      // user.save() 대신 findByIdAndUpdate 사용 (email 검증 오류 방지)
      await User.findByIdAndUpdate(userId, { favoriteStores: user.favoriteStores }, { runValidators: false })
      console.log('즐겨찾기 추가 완료 - 새로운 목록:', user.favoriteStores)
      res.json({ 
        isFavorited: true, 
        message: '즐겨찾기에 추가되었습니다.' 
      })
    }
  } catch (error) {
    console.error('스토어 즐겨찾기 처리 오류:', error)
    res.status(500).json({ error: '즐겨찾기 처리 중 오류가 발생했습니다.' })
  }
})

// 상품 검색 API (Elasticsearch 사용) - /:category보다 먼저 정의해야 함!
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q || ''
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    // category가 'null' 문자열이거나 빈 문자열이면 null로 처리
    let category = req.query.category
    if (category === 'null' || category === '' || category === undefined) {
      category = null
    }

    if (!query.trim()) {
      return res.json({ products: [], total: 0, page, totalPages: 0 })
    }

    const client = await getElasticsearchClient()
    let useElasticsearch = false
    let searchResult = null
    
    if (client) {
      try {
        // 인덱스 존재 여부 확인
        const indexExists = await client.indices.exists({ index: 'products' })
        if (indexExists) {
          // 검색 쿼리 생성
          const searchFields = ['title^3', 'brand^2', 'description']
          const searchQuery = buildFuzzySearchQuery(query, searchFields, {
            exactMatch: true  // 정확 매칭 사용
          })

          // 카테고리 필터 추가
          let finalQuery = searchQuery
          if (category) {
            finalQuery = {
              bool: {
                must: [searchQuery],
                filter: [
                  { term: { category: category } }
                ]
              }
            }
          }

          // 검색 실행 (성능 최적화: size 제한)
          searchResult = await search('products', finalQuery, {
            from: (page - 1) * limit,
            size: Math.min(limit, 50),  // 최대 50개로 제한하여 성능 개선
            sort: [{ _score: { order: 'desc' } }, { createdAt: { order: 'desc' } }]
          })
          useElasticsearch = true
        }
      } catch (esError) {
        console.warn('Elasticsearch 검색 실패:', esError.message)
      }
    }

    // Elasticsearch 실패 또는 인덱스 없음 시 MongoDB로 폴백
    if (!useElasticsearch) {
      console.log('MongoDB 폴백: 상품 검색')
      const categories = category ? [category] : ['shoes', 'top', 'bottom', 'goods']
      const allProducts = []
      
      for (const cat of categories) {
        try {
          const collection = await getCollection(cat)
          const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const categoryProducts = await collection.find({
            $or: [
              { title: { $regex: escapedQuery, $options: 'i' } },
              { brand: { $regex: escapedQuery, $options: 'i' } },
              { name: { $regex: escapedQuery, $options: 'i' } }
            ]
          }).limit(limit * 2).toArray()

          // 썸네일 정보 추가
          const thumbnailsCollection = await getCollection(`${cat}_thumbnails`)
          const thumbnails = await thumbnailsCollection.find({}).toArray()
          const thumbnailsMap = {}
          thumbnails.forEach(thumb => {
            const title = thumb.title || thumb.name
            if (title) {
              thumbnailsMap[title] = thumb.thumbnails || thumb.thumbnail || thumb.image || thumb.url || null
            }
          })

          categoryProducts.forEach(product => {
            const productTitle = product.title || product.name || ''
            const thumbnailUrl = thumbnailsMap[productTitle] || product.thumbnails || product.thumbnail || product.image || null

            allProducts.push({
              _id: product._id,
              id: product._id?.toString() || product.id,
              title: productTitle,
              brand: product.brand || product.brandName || product.manufacturer || null,
              price: product.price || 0,
              original_price: product.original_price || product.originalPrice || null,
              discount_rate: product.discount_rate || product.discountRate || null,
              thumbnails: thumbnailUrl,
              url: product.url || product.link || product.productUrl || product.product_link || null,
              category: cat
            })
          })
        } catch (error) {
          console.warn(`${cat} 컬렉션 조회 실패:`, error.message)
        }
      }

      return res.json({
        products: allProducts.slice(0, limit),
        total: allProducts.length,
        page,
        totalPages: Math.ceil(allProducts.length / limit)
      })
    }

    // Elasticsearch 검색 결과 처리
    // MongoDB에서 상세 정보 가져오기 (썸네일 등)
    if (!searchResult || !searchResult.hits) {
      return res.json({
        products: [],
        total: 0,
        page,
        totalPages: 0
      })
    }

    const productIds = searchResult.hits.map(hit => hit._id)
    const products = []

    if (productIds.length > 0) {
      // 각 카테고리에서 상품 조회
      const categories = category ? [category] : ['shoes', 'top', 'bottom', 'goods']
      
      for (const cat of categories) {
        try {
          const collection = await getCollection(cat)
          const categoryProducts = await collection.find({
            _id: { $in: productIds.map(id => new mongoose.Types.ObjectId(id)) }
          }).toArray()

          // 썸네일 정보 추가
          const thumbnailsCollection = await getCollection(`${cat}_thumbnails`)
          const thumbnails = await thumbnailsCollection.find({}).toArray()
          const thumbnailsMap = {}
          thumbnails.forEach(thumb => {
            const title = thumb.title || thumb.name
            if (title) {
              thumbnailsMap[title] = thumb.thumbnails || thumb.thumbnail || thumb.image || thumb.url || null
            }
          })

          categoryProducts.forEach(product => {
            const productTitle = product.title || product.name || ''
            const thumbnailUrl = thumbnailsMap[productTitle] || product.thumbnails || product.thumbnail || product.image || null

            products.push({
              _id: product._id,
              id: product._id?.toString() || product.id,
              title: productTitle,
              brand: product.brand || product.brandName || product.manufacturer || null,
              price: product.price || 0,
              original_price: product.original_price || product.originalPrice || null,
              discount_rate: product.discount_rate || product.discountRate || null,
              thumbnails: thumbnailUrl,
              url: product.url || product.link || product.productUrl || product.product_link || null,
              category: cat,
              _score: (useElasticsearch && searchResult?.hits) ? searchResult.hits.find(h => h._id === product._id?.toString())?._score || 0 : 0
            })
          })
        } catch (error) {
          console.warn(`${cat} 컬렉션 조회 실패:`, error.message)
        }
      }

      // 점수 순으로 정렬
      products.sort((a, b) => (b._score || 0) - (a._score || 0))
    }

    res.json({
      products: products.slice(0, limit),
      total: (useElasticsearch && searchResult) ? searchResult.total : products.length,
      page,
      totalPages: (useElasticsearch && searchResult) ? Math.ceil(searchResult.total / limit) : Math.ceil(products.length / limit)
    })
  } catch (error) {
    console.error('상품 검색 오류:', error)
    res.status(500).json({ 
      error: '검색 중 오류가 발생했습니다.',
      details: error.message 
    })
  }
})

// 상품 목록 조회 (카테고리별) - 마지막에 정의
router.get('/:category', async (req, res) => {
  try {
    const { category } = req.params
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 1000 // 모든 데이터 가져오기
    const skip = (page - 1) * limit

    // 카테고리 매핑
    const categoryMap = {
      'shoes': 'shoes',
      'top': 'top',
      'bottom': 'bottom',
      'goods': 'goods'
    }

    const collectionName = categoryMap[category]
    if (!collectionName) {
      return res.status(400).json({ error: '유효하지 않은 카테고리입니다.' })
    }

    // MongoDB 연결 확인
    if (!mongoose.connection.db) {
      return res.status(500).json({ error: 'MongoDB 연결이 없습니다.' })
    }

    const collection = await getCollection(collectionName)
    
    // 컬렉션 존재 여부 확인
    const collections = await mongoose.connection.db.listCollections().toArray()
    const collectionExists = collections.some(c => c.name === collectionName)
    
    if (!collectionExists) {
      console.log(`컬렉션 "${collectionName}"이 존재하지 않습니다.`)
      console.log('사용 가능한 컬렉션:', collections.map(c => c.name))
      return res.json({
        products: [],
        total: 0,
        page: 1,
        totalPages: 0
      })
    }
    
    // 컬렉션에서 데이터 가져오기
    const products = await collection
      .find({})
      .skip(skip)
      .limit(limit)
      .toArray()
    
    console.log(`${collectionName} 컬렉션에서 ${products.length}개 상품 조회`)

    // 썸네일 컬렉션에서 데이터 가져오기
    const thumbnailsCollectionName = `${collectionName}_thumbnails`
    let thumbnailsMap = {}
    
    try {
      const thumbnailsCollection = await getCollection(thumbnailsCollectionName)
      const thumbnails = await thumbnailsCollection.find({}).toArray()
      
      // title을 키로 하는 맵 생성
      thumbnails.forEach(thumb => {
        const title = thumb.title || thumb.name
        if (title) {
          thumbnailsMap[title] = thumb.thumbnails || thumb.thumbnail || thumb.image || thumb.url || null
        }
      })
      
      console.log(`${thumbnailsCollectionName} 컬렉션에서 ${thumbnails.length}개 썸네일 조회`)
    } catch (error) {
      console.warn(`${thumbnailsCollectionName} 컬렉션 조회 실패:`, error.message)
    }

    // 데이터 포맷팅
    const formattedProducts = products.map(product => {
      const productTitle = product.title || product.name || ''
      const thumbnailUrl = thumbnailsMap[productTitle] || product.thumbnails || product.thumbnail || product.image || null
      
      return {
        _id: product._id,
        id: product._id?.toString() || product.id,
        title: productTitle,
        brand: product.brand || product.brandName || product.manufacturer || null,
        price: product.price || 0,
        original_price: product.original_price || product.originalPrice || null,
        discount_rate: product.discount_rate || product.discountRate || null,
        thumbnails: thumbnailUrl,
        url: product.url || product.link || product.productUrl || product.product_link || null,
        category: collectionName
      }
    })

    res.json({
      products: formattedProducts,
      total: formattedProducts.length,
      page,
      totalPages: Math.ceil(formattedProducts.length / limit)
    })
  } catch (error) {
    console.error(`${req.params.category} 상품 목록 조회 오류:`, error)
    console.error('에러 상세:', error.message, error.stack)
    
    // MongoDB 연결 오류인 경우
    if (error.message.includes('MongoDB') || error.message.includes('connection')) {
      return res.status(500).json({ 
        error: 'MongoDB 연결 오류가 발생했습니다.',
        details: error.message 
      })
    }
    
    res.status(500).json({ 
      error: '상품 목록을 불러오는 중 오류가 발생했습니다.',
      details: error.message 
    })
  }
})

// 상품 인덱싱 초기화 (관리자용)
router.post('/index/init', authenticateToken, async (req, res) => {
  try {
    // 관리자 권한 확인 (간단한 예시)
    const user = await User.findById(req.user.userId)
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' })
    }

    const client = await getElasticsearchClient()
    if (!client) {
      return res.status(503).json({ error: 'Elasticsearch 연결 실패' })
    }

    // 인덱스 매핑 정의
    const mapping = {
      properties: {
        title: {
          type: 'text',
          analyzer: 'korean_analyzer',
          fields: {
            keyword: { type: 'keyword' }
          }
        },
        brand: {
          type: 'text',
          analyzer: 'korean_analyzer',
          fields: {
            keyword: { type: 'keyword' }
          }
        },
        description: {
          type: 'text',
          analyzer: 'korean_analyzer'
        },
        category: { type: 'keyword' },
        price: { type: 'integer' },
        createdAt: { type: 'date' }
      }
    }

    // 인덱스 생성
    await createIndex('products', mapping)

    // 모든 카테고리의 상품을 인덱싱
    const categories = ['shoes', 'top', 'bottom', 'goods']
    let totalIndexed = 0

    for (const category of categories) {
      try {
        const collection = await getCollection(category)
        const products = await collection.find({}).toArray()

        const documents = products.map(product => ({
          id: product._id?.toString(),
          data: {
            _id: product._id?.toString(),
            title: product.title || product.name || '',
            brand: product.brand || product.brandName || product.manufacturer || '',
            description: product.description || '',
            category: category,
            price: product.price || 0,
            createdAt: product.createdAt || new Date()
          }
        }))

        if (documents.length > 0) {
          const { bulkIndex } = await import('./shared/utils/search.js')
          const result = await bulkIndex('products', documents)
          totalIndexed += result.indexed
          console.log(`${category}: ${result.indexed}개 상품 인덱싱 완료`)
        }
      } catch (error) {
        console.error(`${category} 인덱싱 실패:`, error.message)
      }
    }

    res.json({
      success: true,
      message: '상품 인덱싱 완료',
      totalIndexed
    })
  } catch (error) {
    console.error('인덱싱 초기화 오류:', error)
    res.status(500).json({ 
      error: '인덱싱 초기화 중 오류가 발생했습니다.',
      details: error.message 
    })
  }
})


export default router


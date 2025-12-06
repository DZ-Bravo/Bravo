import express from 'express'
import mongoose from 'mongoose'
import User from '../models/User.js'
import { authenticateToken } from './auth.js'

const router = express.Router()

// MongoDB에서 직접 컬렉션 접근
const getCollection = async (collectionName) => {
  if (!mongoose.connection.db) {
    throw new Error('MongoDB 연결이 없습니다.')
  }
  const db = mongoose.connection.db
  return db.collection(collectionName)
}

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
      await user.save()
      console.log('즐겨찾기 제거 완료 - 새로운 목록:', user.favoriteStores)
      res.json({ 
        isFavorited: false, 
        message: '즐겨찾기에서 제거되었습니다.' 
      })
    } else {
      // 즐겨찾기에 추가
      user.favoriteStores.push(productObjectId)
      await user.save()
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

export default router


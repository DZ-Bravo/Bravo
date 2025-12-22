import express from 'express'
import Post from './shared/models/Post.js'
import User from './shared/models/User.js'
import Comment from './shared/models/Comment.js'
import Course from './shared/models/Course.js'
import Notification from './shared/models/Notification.js'
import { authenticateToken } from './shared/utils/auth.js'
import axios from 'axios'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import fs from 'fs'
import { getElasticsearchClient } from './shared/config/elasticsearch.js'
import { buildFuzzySearchQuery, search } from './shared/utils/search.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = express.Router()

// Elasticsearch 인덱싱 헬퍼 함수
const indexPostToElasticsearch = async (post) => {
  try {
    const esClient = await getElasticsearchClient()
    if (!esClient) {
      return // Elasticsearch 없이도 동작
    }

    const { indexDocument } = await import('./shared/utils/search.js')
    const { createIndex } = await import('./shared/utils/search.js')

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
        content: {
          type: 'text',
          analyzer: 'korean_analyzer'
        },
        category: { type: 'keyword' },
        authorId: { type: 'keyword' },
        authorName: { type: 'text' },
        createdAt: { type: 'date' }
      }
    }

    // 인덱스가 없으면 생성
    try {
      await createIndex('posts', mapping)
    } catch (error) {
      // 이미 존재하면 무시
      if (!error.message.includes('resource_already_exists_exception')) {
        console.warn('인덱스 생성 실패:', error.message)
      }
    }

    // 문서 인덱싱
    await indexDocument('posts', post._id.toString(), {
      _id: post._id.toString(),
      title: post.title || '',
      content: post.content ? post.content.replace(/<[^>]*>/g, '') : '', // HTML 태그 제거
      category: post.category || '',
      authorId: post.author ? post.author.toString() : '',
      authorName: post.authorName || '',
      createdAt: post.createdAt || new Date()
    })
  } catch (error) {
    console.warn('Elasticsearch 인덱싱 실패 (무시됨):', error.message)
  }
}

const deletePostFromElasticsearch = async (postId) => {
  try {
    const esClient = await getElasticsearchClient()
    if (!esClient) {
      return
    }

    const { deleteDocument } = await import('./shared/utils/search.js')
    await deleteDocument('posts', postId.toString())
  } catch (error) {
    console.warn('Elasticsearch 삭제 실패 (무시됨):', error.message)
  }
}

// 게시글 이미지 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads/posts')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, 'post-' + uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB 제한
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)
    
    if (extname && mimetype) {
      return cb(null, true)
    } else {
      cb(new Error('이미지 파일만 업로드 가능합니다.'))
    }
  }
})

// 북마크 목록 조회 (인증 필요) - /:id보다 먼저 정의해야 함
router.get('/bookmarks/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit

    const user = await User.findById(userId).populate('favorites')
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }

    const favoritePostIds = user.favorites || []
    const total = favoritePostIds.length
    
    console.log('북마크 목록 조회 - 사용자 ID:', userId, '북마크 개수:', total, '북마크 ID 목록:', favoritePostIds.map(id => id.toString()))

    // 모든 게시글 조회 (정렬 없이)
    const allPosts = await Post.find({ _id: { $in: favoritePostIds } })
      .populate('author', 'id name profileImage')
      .select('title content category author authorName views likes likedBy createdAt images')
      .lean()
    
    console.log('조회된 게시글 개수:', allPosts.length)

    // user.favorites 배열의 순서를 유지하면서 게시글 정렬 (최신 북마크 순)
    const postMap = new Map(allPosts.map(post => [post._id.toString(), post]))
    const orderedPosts = favoritePostIds
      .map(id => {
        const postId = id.toString()
        return postMap.get(postId)
      })
      .filter(Boolean) // 존재하지 않는 게시글 제거
      .reverse() // 최신 북마크 순 (배열의 마지막이 최신)

    // 페이지네이션 적용
    const posts = orderedPosts.slice(skip, skip + limit)
    console.log('페이지네이션 후 게시글 개수:', posts.length)

    // 날짜 포맷팅 및 본문 미리보기 생성
    const formattedPosts = await Promise.all(posts.map(async (post) => {
      const contentPreview = post.content
        ? post.content.replace(/<[^>]*>/g, '').substring(0, 100) + (post.content.length > 100 ? '...' : '')
        : ''
      
      const thumbnail = post.images && post.images.length > 0 ? post.images[0] : null
      
      const dateStr = new Date(post.createdAt).toISOString().split('T')[0]
      const [year, month, day] = dateStr.split('-')
      const formattedDate = `${year}.${month}.${day}`
      
      const commentCount = await Comment.countDocuments({ post: post._id })
      
      // 좋아요 상태 확인
      let isLiked = false
      if (post.likedBy && Array.isArray(post.likedBy)) {
        const userIdStr = userId.toString()
        isLiked = post.likedBy.some(likedUserId => {
          const likedIdStr = likedUserId.toString ? likedUserId.toString() : String(likedUserId)
          return likedIdStr === userIdStr
        })
      }
      
      return {
        id: post._id,
        title: post.title,
        content: contentPreview,
        category: post.category,
        author: post.authorName || (post.author && post.author.name) || '알 수 없음',
        authorId: post.author && post.author.id,
        date: formattedDate,
        views: post.views || 0,
        likes: post.likes || 0,
        isFavorited: true,
        isBookmarked: true,
        isLiked: isLiked,
        thumbnail: thumbnail,
        comments: commentCount
      }
    }))

    console.log('북마크 목록 조회 완료 - 반환할 게시글 개수:', formattedPosts.length)
    
    res.json({
      posts: formattedPosts,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('북마크 목록 조회 오류:', error)
    res.status(500).json({ error: '북마크 목록을 불러오는 중 오류가 발생했습니다.' })
  }
})

// 즐겨찾기 목록 조회 (하위 호환성을 위해 유지)
router.get('/favorites/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit

    // 스토어/산 정보와 동일한 방식으로 조회 (populate 제거, lean 사용)
    const user = await User.findById(userId).select('favorites').lean()
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }

    const favoritePostIds = (user.favorites || []).map(id => id.toString())
    const total = favoritePostIds.length
    
    console.log('[커뮤니티 즐겨찾기] 사용자 ID:', userId, '즐겨찾기 개수:', total, 'ID 목록:', favoritePostIds)

    if (favoritePostIds.length === 0) {
      return res.json({
        posts: [],
        total: 0,
        page,
        totalPages: 0
      })
    }

    // 모든 게시글 조회 (정렬 없이)
    const allPosts = await Post.find({ _id: { $in: favoritePostIds } })
      .populate('author', 'id name profileImage')
      .select('title content category author authorName views likes createdAt images')
      .lean()
    
    console.log('[커뮤니티 즐겨찾기] 조회된 게시글 개수:', allPosts.length)

    // user.favorites 배열의 순서를 유지하면서 게시글 정렬 (최신 즐겨찾기 순)
    const postMap = new Map(allPosts.map(post => [post._id.toString(), post]))
    const orderedPosts = favoritePostIds
      .map(postIdStr => {
        return postMap.get(postIdStr)
      })
      .filter(Boolean) // 존재하지 않는 게시글 제거
      .reverse() // 최신 즐겨찾기 순 (배열의 마지막이 최신)
    
    console.log('[커뮤니티 즐겨찾기] 정렬된 게시글 개수:', orderedPosts.length)

    // 페이지네이션 적용
    const posts = orderedPosts.slice(skip, skip + limit)

    // 날짜 포맷팅 및 본문 미리보기 생성
    const formattedPosts = await Promise.all(posts.map(async (post) => {
      const contentPreview = post.content
        ? post.content.replace(/<[^>]*>/g, '').substring(0, 100) + (post.content.length > 100 ? '...' : '')
        : ''
      
      const thumbnail = post.images && post.images.length > 0 ? post.images[0] : null
      
      const dateStr = new Date(post.createdAt).toISOString().split('T')[0]
      const [year, month, day] = dateStr.split('-')
      const formattedDate = `${year}.${month}.${day}`
      
      const commentCount = await Comment.countDocuments({ post: post._id })
      
      return {
        id: post._id,
        title: post.title,
        content: contentPreview,
        category: post.category,
        author: post.authorName || (post.author && post.author.name) || '알 수 없음',
        authorId: post.author && post.author.id,
        date: formattedDate,
        views: post.views || 0,
        likes: post.likes || 0,
        thumbnail: thumbnail,
        comments: commentCount
      }
    }))

    console.log('[커뮤니티 즐겨찾기] 최종 반환할 게시글 개수:', formattedPosts.length)

    res.json({
      posts: formattedPosts,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('[커뮤니티 즐겨찾기] 즐겨찾기 목록 조회 오류:', error)
    res.status(500).json({ error: '즐겨찾기 목록을 불러오는 중 오류가 발생했습니다.' })
  }
})

// 내 게시글 조회 (인증 필요)
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit

    // 카테고리 필터링 (선택적)
    const { category } = req.query
    let query = { author: userId }
    if (category && ['diary', 'qa', 'free'].includes(category)) {
      query.category = category
    }
    
    const posts = await Post.find(query)
      .populate('author', 'id name profileImage')
      .select('title content category author authorName views likes createdAt images mountainCode courseName courseDistance courseDurationMinutes hashtags')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    const total = await Post.countDocuments(query)

    // 날짜 포맷팅 및 본문 미리보기 생성
    const formattedPosts = await Promise.all(posts.map(async (post) => {
      // 본문 미리보기 (100자 제한, HTML 태그 제거)
      const contentPreview = post.content
        ? post.content.replace(/<[^>]*>/g, '').substring(0, 100) + (post.content.length > 100 ? '...' : '')
        : ''
      
      // 첫 번째 이미지를 썸네일로 사용
      const thumbnail = post.images && post.images.length > 0 ? post.images[0] : null
      
      // 날짜 포맷팅 (YYYY-MM-DD)
      const dateStr = new Date(post.createdAt).toISOString().split('T')[0]
      const [year, month, day] = dateStr.split('-')
      const formattedDate = `${year}.${month}.${day}`
      
      // 댓글 수 가져오기
      const commentCount = await Comment.countDocuments({ post: post._id })
      
      return {
        id: post._id,
        title: post.title,
        content: contentPreview,
        category: post.category,
        author: post.authorName || (post.author && post.author.name) || '알 수 없음',
        authorId: post.author && post.author.id,
        date: formattedDate,
        views: post.views || 0,
        likes: post.likes || 0,
        thumbnail: thumbnail,
        comments: commentCount,
        mountainCode: post.mountainCode,
        courseName: post.courseName,
        courseDistance: post.courseDistance,
        courseDurationMinutes: post.courseDurationMinutes,
        createdAt: post.createdAt
      }
    }))

    res.json({
      posts: formattedPosts,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('내 게시글 조회 오류:', error)
    res.status(500).json({ error: '내 게시글을 불러오는 중 오류가 발생했습니다.' })
  }
})

// 게시글 검색 (Elasticsearch 우선, 실패 시 MongoDB 폴백)
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q || ''
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit

    if (!query.trim()) {
      return res.json({ posts: [], total: 0, page, totalPages: 0 })
    }

    const esClient = await getElasticsearchClient()
    let posts = []
    let total = 0

    // Elasticsearch 사용 시도
    if (esClient) {
      try {
        const searchFields = ['title^3', 'content']
        const searchQuery = buildFuzzySearchQuery(query, searchFields, {
          fuzziness: 'AUTO',
          prefixLength: 1
        })

        const searchResult = await search('posts', searchQuery, {
          from: skip,
          size: limit,
          sort: [{ _score: { order: 'desc' } }, { createdAt: { order: 'desc' } }]
        })

        total = searchResult.total

        if (searchResult.hits.length > 0) {
          const postIds = searchResult.hits.map(hit => hit._id)
          const dbPosts = await Post.find({
            _id: { $in: postIds }
          })
            .populate('author', 'id name profileImage')
            .select('title content category author authorName views likes createdAt images')
            .lean()

          // 검색어가 제목에 포함되어 있는지 필터링
          const queryLower = query.toLowerCase().trim()
          const filteredPosts = dbPosts.filter(post => {
            if (!post.title) return false
            const titleLower = String(post.title).toLowerCase()
            // 검색어가 제목에 포함되어 있으면 포함
            return titleLower.includes(queryLower)
          })

          // 점수 순으로 정렬 (제목 시작 부분 일치가 우선)
          const postsWithScore = filteredPosts.map(post => {
            const hit = searchResult.hits.find(h => h._id === post._id.toString())
            const titleLower = String(post.title || '').toLowerCase()
            const startsWithQuery = titleLower.startsWith(queryLower) ? 1 : 0
            return {
              ...post,
              _score: (hit?._score || 0) + startsWithQuery * 1000 // 제목 시작 부분 일치 시 점수 추가
            }
          })
          postsWithScore.sort((a, b) => (b._score || 0) - (a._score || 0))
          posts = postsWithScore
        }
      } catch (esError) {
        console.warn('Elasticsearch 검색 실패, MongoDB로 폴백:', esError.message)
        // MongoDB 폴백으로 계속 진행
      }
    }

    // MongoDB 폴백 (Elasticsearch 실패 또는 미사용 시)
    if (posts.length === 0) {
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      
      const searchCondition = {
        $or: [
          { title: { $regex: escapedQuery, $options: 'i' } },
          { content: { $regex: escapedQuery, $options: 'i' } }
        ]
      }
      
      posts = await Post.find(searchCondition)
        .populate('author', 'id name profileImage')
        .select('title content category author authorName views likes createdAt images')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()

      total = await Post.countDocuments(searchCondition)
    }

    // 날짜 포맷팅 및 본문 미리보기 생성
    const formattedPosts = posts.map((post) => {
      const contentPreview = post.content
        ? post.content.replace(/<[^>]*>/g, '').substring(0, 100) + (post.content.length > 100 ? '...' : '')
        : ''
      
      const thumbnailImage = post.images && post.images.length > 0 ? post.images[0] : null
      const dateStr = new Date(post.createdAt).toISOString().split('T')[0]

      return {
        ...post,
        id: post._id.toString(),
        authorId: post.author ? post.author.id : post.authorName,
        previewContent: contentPreview,
        thumbnailImage,
        date: dateStr
      }
    })

    res.json({
      posts: formattedPosts,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('게시글 검색 오류:', error)
    res.status(500).json({ error: '게시글 검색 중 오류가 발생했습니다.' })
  }
})

// 통합 검색 API (산, 게시글, 상품) - /:id 라우트보다 먼저 정의해야 함
router.get('/unified-search', async (req, res) => {
  try {
    const query = req.query.q || ''
    const limit = parseInt(req.query.limit) || 1000  // 기본값을 1000으로 증가 (산 데이터 552개 모두 표시)

    if (!query.trim()) {
      return res.json({
        mountains: [],
        posts: [],
        products: [],
        total: 0
      })
    }

    const results = {
      mountains: [],
      posts: [],
      products: [],
      total: 0
    }

    // Elasticsearch 클라이언트 확인
    const esClient = await getElasticsearchClient()

    // 1. 게시글 검색 (Elasticsearch 우선, 실패 시 MongoDB)
    try {
      if (esClient) {
        const searchFields = ['title^3', 'content']
        const searchQuery = buildFuzzySearchQuery(query, searchFields)
        const searchResult = await search('posts', searchQuery, {
          from: 0,
          size: limit
        })

        // MongoDB에서 상세 정보 가져오기
        const postIds = searchResult.hits.map(hit => hit._id)
        if (postIds.length > 0) {
          const posts = await Post.find({
            _id: { $in: postIds }
          })
            .populate('author', 'id name profileImage')
            .select('title content category author authorName views likes createdAt images')
            .lean()

          // 검색어가 제목에 포함되어 있는지 필터링
          const queryLower = query.toLowerCase().trim()
          const filteredPosts = posts.filter(post => {
            if (!post.title) return false
            const titleLower = String(post.title).toLowerCase()
            // 검색어가 제목에 포함되어 있으면 포함
            return titleLower.includes(queryLower)
          })

          // 점수 순으로 정렬 (제목 시작 부분 일치가 우선)
          const postsWithScore = filteredPosts.map(post => {
            const hit = searchResult.hits.find(h => h._id === post._id.toString())
            const titleLower = String(post.title || '').toLowerCase()
            const startsWithQuery = titleLower.startsWith(queryLower) ? 1 : 0
            return {
              ...post,
              id: post._id.toString(),
              _score: (hit?._score || 0) + startsWithQuery * 1000 // 제목 시작 부분 일치 시 점수 추가
            }
          })
          postsWithScore.sort((a, b) => (b._score || 0) - (a._score || 0))

          results.posts = postsWithScore.slice(0, limit).map(post => {
            const contentPreview = post.content
              ? post.content.replace(/<[^>]*>/g, '').substring(0, 100) + (post.content.length > 100 ? '...' : '')
              : ''
            const thumbnailImage = post.images && post.images.length > 0 ? post.images[0] : null
            const dateStr = new Date(post.createdAt).toISOString().split('T')[0]

            return {
              ...post,
              previewContent: contentPreview,
              thumbnailImage,
              date: dateStr
            }
          })
        }
      } else {
        // MongoDB 폴백
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const posts = await Post.find({
          $or: [
            { title: { $regex: escapedQuery, $options: 'i' } },
            { content: { $regex: escapedQuery, $options: 'i' } }
          ]
        })
          .populate('author', 'id name profileImage')
          .select('title content category author authorName views likes createdAt images')
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()

        results.posts = posts.map(post => {
          const contentPreview = post.content
            ? post.content.replace(/<[^>]*>/g, '').substring(0, 100) + (post.content.length > 100 ? '...' : '')
            : ''
          const thumbnailImage = post.images && post.images.length > 0 ? post.images[0] : null
          const dateStr = new Date(post.createdAt).toISOString().split('T')[0]

          return {
            ...post,
            id: post._id.toString(),
            previewContent: contentPreview,
            thumbnailImage,
            date: dateStr
          }
        })
      }
    } catch (error) {
      console.error('게시글 검색 오류:', error.message)
    }

    // 2. 산 검색 (Elasticsearch 사용, 실패 시 API 폴백)
    try {
      let useElasticsearch = false
      if (esClient) {
        try {
          // 인덱스 존재 여부 확인
          const indexExists = await esClient.indices.exists({ index: 'mountains' })
          console.log(`[통합 검색] mountains 인덱스 존재: ${indexExists}, 검색어: ${query}`)
          if (indexExists) {
            const searchFields = ['name^3', 'location^2', 'description']
            const searchQuery = buildFuzzySearchQuery(query, searchFields)  // 유연한 검색 사용
            console.log(`[통합 검색] 산 검색 쿼리 실행 중...`)
            const searchResult = await search('mountains', searchQuery, {
              from: 0,
              size: Math.min(limit, 100),  // 성능 개선: 1000 → 100으로 제한
              sort: [{ _score: { order: 'desc' } }]  // 정렬 추가
            })
            console.log(`[통합 검색] 산 검색 결과: ${searchResult.hits.length}개 히트`)

            if (searchResult.hits && searchResult.hits.length > 0) {
              // 검색어로 필터링하여 정확도 향상
              const queryLower = query.toLowerCase().trim()
              const filteredHits = searchResult.hits.filter(hit => {
                if (!hit.name) return false
                const nameLower = String(hit.name).toLowerCase()
                
                // 검색어가 이름에 포함되어 있으면 포함
                // 단, 검색어가 2글자 이상일 때는 시작 부분 일치를 우선하되, 포함되어 있으면 모두 포함
                if (queryLower.length >= 2) {
                  // 검색어가 이름에 포함되어 있으면 포함 (예: "북한" → "북한산" 포함)
                  return nameLower.includes(queryLower)
                } else {
                  // 1글자 검색어는 이름에 포함되어 있으면 포함
                  return nameLower.includes(queryLower)
                }
              })
              console.log(`[통합 검색] 필터링 후: ${filteredHits.length}개`)
              
              // 정확도 순으로 정렬 (시작 부분 일치가 우선)
              filteredHits.sort((a, b) => {
                const aName = String(a.name || '').toLowerCase()
                const bName = String(b.name || '').toLowerCase()
                const aStarts = aName.startsWith(queryLower) ? 1 : 0
                const bStarts = bName.startsWith(queryLower) ? 1 : 0
                return bStarts - aStarts
              })
              
              results.mountains = filteredHits.map(hit => ({
                id: hit.code || hit._id,
                name: hit.name,
                code: hit.code,
                location: hit.location || '',
                height: hit.height || '',
                image: hit.image || null
              }))
              useElasticsearch = true
            }
          }
        } catch (esError) {
          console.warn('Elasticsearch 산 검색 실패:', esError.message)
        }
      }

      // Elasticsearch 실패 또는 인덱스 없음 시 API 호출로 폴백
      if (!useElasticsearch) {
        const MOUNTAIN_API_URL = process.env.MOUNTAIN_API_URL || 'http://mountain-service.bravo-core-ns.svc.cluster.local:3008'
        const mountainsResponse = await axios.get(`${MOUNTAIN_API_URL}/api/mountains`, {
          timeout: 5000
        })

        if (mountainsResponse.data && mountainsResponse.data.mountains) {
          const allMountains = mountainsResponse.data.mountains || []
          const searchTerm = query.toLowerCase().trim()

          const matchedMountains = allMountains
            .filter(mountain => {
              if (!mountain || !mountain.name) return false

              const name = String(mountain.name || '').toLowerCase()
              
              // 검색어가 이름에 포함되어 있으면 포함
              return name.includes(searchTerm)
            })
            .sort((a, b) => {
              // 정확도 순으로 정렬 (시작 부분 일치가 우선)
              const aName = String(a.name || '').toLowerCase()
              const bName = String(b.name || '').toLowerCase()
              const aStarts = aName.startsWith(searchTerm) ? 1 : 0
              const bStarts = bName.startsWith(searchTerm) ? 1 : 0
              return bStarts - aStarts
            })
            .slice(0, limit)
            .map(mountain => ({
              id: mountain.code || mountain._id,
              name: mountain.name,
              code: mountain.code,
              location: mountain.location || '',
              height: mountain.height || '',
              image: mountain.image || mountain.thumbnail || null
            }))

          results.mountains = matchedMountains
        }
      }
    } catch (error) {
      console.error('산 검색 오류:', error.message)
    }

    // 3. 상품 검색 (Store Service API 직접 호출 - Elasticsearch는 스토어 서비스에서 처리)
    try {
      // 내부 네트워크를 통해 직접 호출 (Traefik을 거치지 않음)
      const STORE_API_URL = process.env.STORE_API_URL || 'http://store-service:3006'
      console.log(`스토어 검색 시도: ${STORE_API_URL}/api/store/search?q=${query}&limit=${limit}`)
      
      try {
        // category 파라미터를 명시적으로 제외 (null로 설정)
        const productsResponse = await axios.get(`${STORE_API_URL}/api/store/search`, {
          params: { 
            q: query, 
            limit: limit,
            category: null  // category를 명시적으로 null로 설정
          },
          timeout: 10000,
          validateStatus: (status) => status < 500 // 400 에러도 처리
        })

        if (productsResponse.status === 200 && productsResponse.data && productsResponse.data.products) {
          results.products = productsResponse.data.products.slice(0, limit)
          console.log(`스토어 검색 성공: ${results.products.length}개 상품`)
        } else {
          console.warn(`스토어 API 응답 오류: ${productsResponse.status}`, productsResponse.data)
        }
      } catch (apiError) {
        console.error('스토어 검색 실패:', apiError.message)
        if (apiError.response) {
          console.error('응답 상태:', apiError.response.status, '데이터:', apiError.response.data)
        }
        // API 실패 시 빈 배열 유지
      }
    } catch (error) {
      console.error('상품 검색 오류:', error.message)
    }

    results.total = results.mountains.length + results.posts.length + results.products.length

    res.json(results)
  } catch (error) {
    console.error('통합 검색 오류:', error)
    res.status(500).json({ 
      error: '검색 중 오류가 발생했습니다.',
      details: error.message 
    })
  }
})

// 게시글 목록 조회 (카테고리별)
router.get('/', async (req, res) => {
  try {
    const { category } = req.query
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit

    // 카테고리 필터링 (정확히 일치하는 것만)
    let query = {}
    if (category && ['diary', 'qa', 'free'].includes(category)) {
      query = { category: category }
    }
    
    console.log('게시글 목록 조회 - 요청 카테고리:', category, '필터 쿼리:', JSON.stringify(query))
    
    const posts = await Post.find(query)
      .populate('author', 'id name profileImage')
      .select('title content category author authorName views likes likedBy createdAt images mountainCode courseName courseDistance courseDurationMinutes hashtags')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    const total = await Post.countDocuments(query)
    
    console.log('게시글 목록 조회 결과 - 카테고리:', category, '조회된 게시글 수:', posts.length, '게시글 카테고리들:', posts.map(p => ({ title: p.title, category: p.category })))

    // 즐겨찾기 및 좋아요 상태 확인 (인증된 사용자인 경우)
    let userFavorites = []
    let userId = null
    const authHeader = req.headers['authorization']
    if (authHeader) {
      const token = authHeader.split(' ')[1]
      if (token) {
        try {
          const jwt = await import('jsonwebtoken')
          const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
          const decoded = jwt.default.verify(token, JWT_SECRET)
          userId = decoded.userId
          const user = await User.findById(userId).select('favorites').lean()
          if (user && user.favorites) {
            userFavorites = user.favorites.map(favId => favId.toString())
          }
        } catch (err) {
          // 토큰이 유효하지 않으면 무시
        }
      }
    }

    // 날짜 포맷팅 및 본문 미리보기 생성
    const formattedPosts = await Promise.all(posts.map(async (post) => {
      // 본문 미리보기 (100자 제한, HTML 태그 제거)
      const contentPreview = post.content
        ? post.content.replace(/<[^>]*>/g, '').substring(0, 100) + (post.content.length > 100 ? '...' : '')
        : ''
      
      // 첫 번째 이미지를 썸네일로 사용
      const thumbnail = post.images && post.images.length > 0 ? post.images[0] : null
      
      // 날짜 포맷팅 (YYYY-MM-DD)
      const dateStr = new Date(post.createdAt).toISOString().split('T')[0]
      const [year, month, day] = dateStr.split('-')
      const formattedDate = `${year}.${month}.${day}`
      
      // 댓글 수 가져오기
      const commentCount = await Comment.countDocuments({ post: post._id })
      
      // 즐겨찾기 상태 확인
      const isFavorited = userFavorites.includes(post._id.toString())
      
      // 좋아요 상태 확인
      let isLiked = false
      if (userId && post.likedBy && Array.isArray(post.likedBy)) {
        const userIdStr = userId.toString()
        isLiked = post.likedBy.some(likedUserId => {
          const likedIdStr = likedUserId.toString ? likedUserId.toString() : String(likedUserId)
          return likedIdStr === userIdStr
        })
      }
      
      // 등산일지인 경우 산 이름 가져오기
      let mountainName = null
      if (post.category === 'diary' && post.mountainCode) {
        try {
          const mongoose = await import('mongoose')
          const db = mongoose.default.connection.db
          const collections = await db.listCollections().toArray()
          const collectionNames = collections.map(c => c.name)
          
          let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
          if (!mountainListCollectionName) {
            mountainListCollectionName = collectionNames.find(name => name.toLowerCase() === 'mountain_list') || 'Mountain_list'
          }
          const actualCollection = db.collection(mountainListCollectionName)
          
          const code = String(post.mountainCode)
          const codeNum = parseInt(code)
          const isObjectId = /^[0-9a-fA-F]{24}$/.test(code)
          
          let mountain = null
          if (isObjectId) {
            try {
              const objectId = new mongoose.default.Types.ObjectId(code)
              mountain = await actualCollection.findOne({ _id: objectId })
            } catch (e) {
              // ObjectId 변환 실패
            }
          } else {
            // 더 넓은 범위로 검색 시도
            const searchQueries = [
              { mntilistno: codeNum },
              { mntilistno: Number(code) },
              { mntilistno: code },
              { mntilistno: String(codeNum) },
              { 'trail_match.mountain_info.mntilistno': codeNum },
              { 'trail_match.mountain_info.mntilistno': Number(code) },
              { 'trail_match.mountain_info.mntilistno': code },
              { 'trail_match.mountain_info.mntilistno': String(codeNum) },
              { code: codeNum },
              { code: Number(code) },
              { code: code },
              { code: String(codeNum) }
            ]
            
            for (const query of searchQueries) {
              mountain = await actualCollection.findOne(query)
              if (mountain) {
                console.log(`게시글 산 이름 찾음 - code: ${code}, 쿼리:`, query)
                break
              }
            }
            
            // 그래도 못 찾으면 모든 문서를 확인 (디버깅용)
            if (!mountain && code === '287201304') {
              console.log('게시글 - 북한산을 찾지 못함 - 모든 문서 확인 중...')
              const allMountains = await actualCollection.find({}).limit(10).toArray()
              console.log('샘플 문서들:', allMountains.map(m => ({
                mntilistno: m.mntilistno,
                mntiname: m.mntiname,
                name: m.name,
                _id: m._id
              })))
            }
          }
          
          if (mountain) {
            // DB에 저장된 실제 필드에서 산 이름 가져오기
            // mntiname 필드를 우선 사용 (DB에 실제 저장된 필드)
            const fullName = mountain.mntiname || 
                          mountain.trail_match?.mountain_info?.mntiname || 
                          mountain.name ||
                          mountain.MNTN_NM ||
                          mountain.mountainName ||
                          null
            
            // 목록에서는 짧은 이름 사용 (예: "북한산 백운대" -> "북한산")
            // "백운대", "대청봉", "천왕봉" 등 봉우리 이름 제거
            if (fullName) {
              mountainName = fullName
                .replace(/\s+(백운대|대청봉|천왕봉|인수봉|만경대|주봉|정상).*$/, '')
                .trim()
            }
          }
        } catch (error) {
          console.error('산 이름 조회 오류:', error)
        }
      }
      
      return {
        id: post._id,
        title: post.title,
        content: contentPreview,
        category: post.category,
        author: post.authorName || (post.author && post.author.name) || '알 수 없음',
        authorId: post.author && post.author.id,
        authorProfileImage: post.author && post.author.profileImage,
        date: formattedDate,
        views: post.views || 0,
        likes: post.likes || 0,
        isFavorited,
        isLiked,
        thumbnail: thumbnail,
        comments: commentCount,
        mountainCode: post.mountainCode || null,
        mountainName: mountainName || null,
        hashtags: post.hashtags || []
      }
    }))

    res.json({
      posts: formattedPosts,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('게시글 목록 조회 오류:', error)
    res.status(500).json({ error: '게시글 목록을 불러오는 중 오류가 발생했습니다.' })
  }
})

// 게시글 상세 조회
router.get('/:id', async (req, res) => {
  try {
    // "search", "my", "unified-search" 등의 특수 경로는 ObjectId가 아니므로 404 반환
    const id = req.params.id
    if (id === 'search' || id === 'my' || id === 'favorites' || id === 'bookmarks' || id === 'unified-search') {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' })
    }
    
    const post = await Post.findById(id)
      .populate('author', 'id name profileImage')
      .select('title content category author authorName views likes likedBy createdAt updatedAt images mountainCode courseName courseDistance courseDurationMinutes hashtags')
      .lean()

    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' })
    }

    // 해시태그가 없거나 undefined인 경우 빈 배열로 설정
    if (!post.hashtags || !Array.isArray(post.hashtags)) {
      post.hashtags = []
    }
    console.log('게시글 상세 조회 - 해시태그:', post.hashtags, '타입:', typeof post.hashtags, '배열 여부:', Array.isArray(post.hashtags))

    // 등산일지인 경우 산 이름 조회
    let mountainName = null
    if (post.category === 'diary' && post.mountainCode) {
      try {
        const mongoose = await import('mongoose')
        const db = mongoose.default.connection.db
        const collections = await db.listCollections().toArray()
        const collectionNames = collections.map(c => c.name)
        
        let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
        if (!mountainListCollectionName) {
          mountainListCollectionName = collectionNames.find(name => name.toLowerCase() === 'mountain_list') || 'Mountain_list'
        }
        const actualCollection = db.collection(mountainListCollectionName)
        
        const code = String(post.mountainCode)
        const codeNum = parseInt(code)
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(code)
        
        let mountain = null
        if (isObjectId) {
          try {
            const objectId = new mongoose.default.Types.ObjectId(code)
            mountain = await actualCollection.findOne({ _id: objectId })
          } catch (e) {
            console.error('ObjectId 변환 실패:', e)
          }
        }
        
        if (!mountain) {
          const searchQueries = [
            { mntilistno: codeNum },
            { mntilistno: Number(code) },
            { mntilistno: code },
            { mntilistno: String(codeNum) },
            { 'trail_match.mountain_info.mntilistno': codeNum },
            { 'trail_match.mountain_info.mntilistno': Number(code) },
            { 'trail_match.mountain_info.mntilistno': code },
            { 'trail_match.mountain_info.mntilistno': String(codeNum) }
          ]
          
          for (const query of searchQueries) {
            mountain = await actualCollection.findOne(query)
            if (mountain) break
          }
        }
        
        if (mountain) {
          const fullName = mountain.trail_match?.mountain_info?.mntiname ||
                          mountain.mntiname ||
                          mountain.name ||
                          mountain.mountainName ||
                          null
          
          if (fullName) {
            mountainName = fullName
              .replace(/\s+(백운대|대청봉|천왕봉|인수봉|만경대|주봉|정상).*$/, '')
              .trim()
          }
        }
      } catch (error) {
        console.error('산 이름 조회 오류:', error)
      }
    }

    // 조회수 증가 (한 번만 실행되도록 await 사용)
    const updatedPost = await Post.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    ).select('likedBy likes views')

    // 즐겨찾기 및 좋아요 상태 확인 (인증된 사용자인 경우)
    let isFavorited = false
    let isLiked = false
    const authHeader = req.headers['authorization']
    if (authHeader) {
      const token = authHeader.split(' ')[1]
      if (token) {
        try {
          const jwt = await import('jsonwebtoken')
          const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
          const decoded = jwt.default.verify(token, JWT_SECRET)
          const userId = decoded.userId
          
          // 즐겨찾기 상태 확인
          const user = await User.findById(userId).select('favorites').lean()
          if (user && user.favorites) {
            isFavorited = user.favorites.some(favId => favId.toString() === post._id.toString())
          }
          
          // 좋아요 상태 확인 (updatedPost 객체의 likedBy 사용)
          const likedByArray = (updatedPost && updatedPost.likedBy) || []
          if (Array.isArray(likedByArray) && likedByArray.length > 0) {
            // userId를 문자열로 변환
            const userIdStr = userId.toString ? userId.toString() : String(userId)
            
            isLiked = likedByArray.some(likedUserId => {
              // ObjectId를 문자열로 변환
              let likedIdStr
              if (likedUserId && likedUserId.toString) {
                likedIdStr = likedUserId.toString()
              } else if (likedUserId && likedUserId._id) {
                likedIdStr = likedUserId._id.toString()
              } else {
                likedIdStr = String(likedUserId)
              }
              return likedIdStr === userIdStr
            })
          }
          console.log('좋아요 상태 확인 - userId:', userId, 'userIdStr:', userId.toString(), 'likedBy length:', likedByArray.length, 'isLiked:', isLiked)
        } catch (err) {
          // 토큰이 유효하지 않으면 무시
          console.error('인증 오류:', err)
        }
      }
    }

    res.json({
      id: post._id,
      title: post.title,
      content: post.content,
      category: post.category,
      author: post.authorName || (post.author && post.author.name) || '알 수 없음',
      authorId: post.author && post.author.id,
      authorProfileImage: post.author && post.author.profileImage,
      date: new Date(post.createdAt).toISOString().split('T')[0],
      views: (updatedPost && updatedPost.views) || (post.views || 0) + 1,
      likes: (updatedPost && updatedPost.likes) || post.likes || 0,
      isFavorited,
      isLiked,
      images: post.images || [],
      hashtags: post.hashtags || [],
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      // 등산일지 전용 필드
      mountainCode: post.mountainCode || null,
      mountainName: mountainName || null,
      courseName: post.courseName || null,
      courseDistance: post.courseDistance || null,
      courseDurationMinutes: post.courseDurationMinutes || null
    })
  } catch (error) {
    console.error('게시글 상세 조회 오류:', error)
    res.status(500).json({ error: '게시글을 불러오는 중 오류가 발생했습니다.' })
  }
})

// 게시글 작성 (인증 필요)
router.post('/', authenticateToken, upload.array('images', 5), async (req, res) => {
  try {
    const { title, content, category } = req.body
    const userId = req.user.userId

    console.log('게시글 작성 요청 - 받은 데이터:', { title, content, category, bodyKeys: Object.keys(req.body) })
    console.log('req.body 전체:', JSON.stringify(req.body))

    if (!title || !content || !category) {
      console.log('필수 필드 누락:', { title: !!title, content: !!content, category: !!category })
      return res.status(400).json({ error: '제목, 내용, 카테고리를 입력해주세요.' })
    }

    // 카테고리 검증 및 정규화 (먼저 정규화 후 검증)
    const normalizedCategory = String(category || '').toLowerCase().trim()
    console.log('카테고리 처리 - 원본:', category, '타입:', typeof category, '정규화:', normalizedCategory)
    
    if (!['diary', 'qa', 'free'].includes(normalizedCategory)) {
      console.log('유효하지 않은 카테고리:', category, '-> 정규화:', normalizedCategory)
      return res.status(400).json({ error: '유효하지 않은 카테고리입니다.' })
    }

    // 작성자 정보 가져오기
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }

    // 이미지 경로 처리
    const images = req.files ? req.files.map(file => `/uploads/posts/${file.filename}`) : []

    // 등산일지 전용 필드 추출
    let mountainCode = null
    let courseName = null
    let courseDistance = null
    let courseDurationMinutes = null

    if (normalizedCategory === 'diary') {
      let receivedMountainCode = req.body.mountainCode || null
      courseName = req.body.courseName || null
      
      // mountainCode를 mntilistno로 변환
      if (receivedMountainCode) {
        try {
          const mongoose = await import('mongoose')
          const db = mongoose.default.connection.db
          const collections = await db.listCollections().toArray()
          const collectionNames = collections.map(c => c.name)
          
          let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
          if (!mountainListCollectionName) {
            mountainListCollectionName = collectionNames.find(name => name.toLowerCase() === 'mountain_list') || 'Mountain_list'
          }
          const actualCollection = db.collection(mountainListCollectionName)
          
          const codeStr = String(receivedMountainCode)
          const codeNum = parseInt(codeStr)
          const isObjectId = /^[0-9a-fA-F]{24}$/.test(codeStr)
          
          let mountain = null
          
          // ObjectId인 경우 _id로 검색
          if (isObjectId) {
            try {
              const objectId = new mongoose.default.Types.ObjectId(codeStr)
              mountain = await actualCollection.findOne({ _id: objectId })
            } catch (e) {
              console.error('[등산일지] ObjectId 변환 실패:', e)
            }
          }
          
          // ObjectId가 아니거나 찾지 못한 경우 mntilistno로 검색
          if (!mountain) {
            const searchQueries = [
              { mntilistno: codeNum },
              { mntilistno: Number(codeStr) },
              { mntilistno: codeStr },
              { mntilistno: String(codeNum) },
              { 'trail_match.mountain_info.mntilistno': codeNum },
              { 'trail_match.mountain_info.mntilistno': Number(codeStr) },
              { 'trail_match.mountain_info.mntilistno': codeStr }
            ]
            
            for (const query of searchQueries) {
              mountain = await actualCollection.findOne(query)
              if (mountain) break
            }
          }
          
          // mountain을 찾았으면 mntilistno 추출
          if (mountain) {
            let extractedMntilistno = null
            
            // trail_match.mountain_info.mntilistno 우선 확인
            if (mountain.trail_match?.mountain_info?.mntilistno) {
              extractedMntilistno = mountain.trail_match.mountain_info.mntilistno
              console.log(`[등산일지] mntilistno 추출 성공 (trail_match): ${extractedMntilistno}`)
            } 
            // 없으면 직접 mntilistno 필드 확인
            else if (mountain.mntilistno) {
              extractedMntilistno = mountain.mntilistno
              console.log(`[등산일지] mntilistno 추출 성공 (직접): ${extractedMntilistno}`)
            }
            
            // mntilistno를 숫자로 정규화한 후 문자열로 변환
            if (extractedMntilistno !== null) {
              const numValue = parseInt(extractedMntilistno)
              if (!isNaN(numValue)) {
                mountainCode = String(numValue)
                console.log(`[등산일지] mntilistno 정규화 완료: ${mountainCode} (원본: ${extractedMntilistno})`)
              } else {
                mountainCode = String(extractedMntilistno)
                console.log(`[등산일지] mntilistno 숫자 변환 실패, 문자열로 저장: ${mountainCode}`)
              }
            } else {
              // 둘 다 없으면 원본 코드를 숫자로 정규화 시도
              const numValue = parseInt(codeStr)
              if (!isNaN(numValue)) {
                mountainCode = String(numValue)
                console.log(`[등산일지] 원본 코드를 숫자로 정규화: ${mountainCode}`)
              } else {
                mountainCode = codeStr
                console.log(`[등산일지] mntilistno를 찾을 수 없어 원본 코드 사용: ${mountainCode}`)
              }
            }
          } else {
            // mountain을 찾지 못한 경우 원본 코드를 숫자로 정규화 시도
            const numValue = parseInt(codeStr)
            if (!isNaN(numValue)) {
              mountainCode = String(numValue)
              console.log(`[등산일지] 산을 찾지 못했지만 원본 코드를 숫자로 정규화: ${mountainCode}`)
            } else {
              mountainCode = codeStr
              console.log(`[등산일지] 산을 찾을 수 없어 원본 코드 사용: ${mountainCode}`)
            }
          }
        } catch (error) {
          console.error('[등산일지] mntilistno 변환 오류:', error)
          // 오류 발생 시 원본 코드 사용
          mountainCode = String(receivedMountainCode)
        }
      } else {
        mountainCode = null
      }

      // 프론트엔드에서 전송한 거리 정보 사용
      if (req.body.courseDistance) {
        const distanceNum = parseFloat(req.body.courseDistance)
        if (!isNaN(distanceNum) && distanceNum > 0) {
          courseDistance = distanceNum
        }
      }

      // 프론트엔드에서 전송한 시간 정보 사용 (문자열을 분 단위로 변환)
      if (req.body.courseDuration) {
        const durationStr = String(req.body.courseDuration).trim()
        let minutes = 0
        
        // "1시간 30분" 형식 파싱
        const hourMatch = durationStr.match(/(\d+)\s*시간/)
        const minuteMatch = durationStr.match(/(\d+)\s*분/)
        
        if (hourMatch) {
          minutes += parseInt(hourMatch[1], 10) * 60
        }
        if (minuteMatch) {
          minutes += parseInt(minuteMatch[1], 10)
        }
        
        // 숫자만 있는 경우 (분 단위로 가정)
        if (minutes === 0 && /^\d+$/.test(durationStr)) {
          minutes = parseInt(durationStr, 10)
        }
        
        if (minutes > 0) {
          courseDurationMinutes = minutes
        }
      }

      // 프론트엔드에서 정보가 없으면 Course 컬렉션에서 조회 (fallback)
      if ((!courseDistance || !courseDurationMinutes) && mountainCode && courseName) {
        try {
          const course = await Course.findOne({
            mountainCode: mountainCode,
            courseName: courseName
          }).lean()

          if (course) {
            // 거리가 없으면 Course에서 가져오기
            if (!courseDistance && typeof course.distance === 'number') {
              courseDistance = course.distance
            }

            // 시간이 없으면 Course에서 가져오기
            if (!courseDurationMinutes && course.duration && typeof course.duration === 'string') {
              const durationStr = course.duration
              let minutes = 0
              const hourMatch = durationStr.match(/(\d+)\s*시간/)
              const minuteMatch = durationStr.match(/(\d+)\s*분/)
              if (hourMatch) {
                minutes += parseInt(hourMatch[1], 10) * 60
              }
              if (minuteMatch) {
                minutes += parseInt(minuteMatch[1], 10)
              }
              if (minutes > 0) {
                courseDurationMinutes = minutes
              }
            }
          }
        } catch (e) {
          console.error('등산 코스 정보 조회 오류 (포스트 작성 중):', e)
        }
      }

      console.log('등산일지 작성 - 코스 정보:', {
        mountainCode,
        courseName,
        courseDistance,
        courseDurationMinutes,
        receivedDistance: req.body.courseDistance,
        receivedDuration: req.body.courseDuration
      })
    }

    // 해시태그 처리
    let hashtags = []
    console.log('해시태그 처리 시작 - req.body 키:', Object.keys(req.body))
    console.log('해시태그 원본 데이터:', req.body.hashtags, '타입:', typeof req.body.hashtags)
    
    // FormData에서 배열로 전송된 경우 (hashtags[0], hashtags[1] 형식)
    if (req.body.hashtags && Array.isArray(req.body.hashtags)) {
      hashtags = req.body.hashtags
    } 
    // JSON 문자열로 전송된 경우
    else if (req.body.hashtags && typeof req.body.hashtags === 'string') {
      try {
        hashtags = JSON.parse(req.body.hashtags)
      } catch (e) {
        console.error('해시태그 JSON 파싱 오류:', e)
        hashtags = []
      }
    }
    // 개별 필드로 전송된 경우 (hashtags[0], hashtags[1] 등)
    else {
      const hashtagKeys = Object.keys(req.body).filter(key => key.startsWith('hashtags['))
      if (hashtagKeys.length > 0) {
        hashtags = hashtagKeys
          .sort()
          .map(key => req.body[key])
          .filter(tag => tag && typeof tag === 'string')
      }
    }
    
    // 해시태그 유효성 검사 (최대 15자, 최대 5개)
    if (hashtags.length > 0) {
      hashtags = hashtags
        .filter(tag => tag && typeof tag === 'string' && tag.length > 0 && tag.length <= 15)
        .slice(0, 5)
        .map(tag => tag.replace(/^#+/, '').trim()) // # 제거 및 공백 제거
        .filter(tag => tag.length > 0)
      console.log('처리된 해시태그:', hashtags)
    } else {
      console.log('해시태그가 없거나 처리할 수 없음')
    }

    const post = new Post({
      title,
      content,
      category: normalizedCategory,
      author: userId,
      authorName: user.name,
      images,
      mountainCode,
      courseName,
      courseDistance,
      courseDurationMinutes,
      hashtags
    })

    await post.save()
    console.log('게시글 작성 완료 - 원본 카테고리:', category, '정규화된 카테고리:', normalizedCategory, '저장된 카테고리:', post.category, '제목:', title, '해시태그:', post.hashtags)
    console.log('[스탬프] 저장된 mountainCode:', mountainCode, '타입:', typeof mountainCode)
    
    // Elasticsearch 인덱싱 (비동기, 실패해도 게시글 작성은 성공)
    indexPostToElasticsearch(post).catch(err => 
      console.warn('Elasticsearch 인덱싱 실패 (무시됨):', err.message)
    )
    
    // 등산일지 작성 시 스탬프 자동 생성 (stamp-service API 호출)
    let updatedPoints = user.points || 0
    if (normalizedCategory === 'diary' && mountainCode) {
      // mountainCode를 Number로 변환하여 스탬프 생성
      try {
        // mountainCode가 이미 mntilistno로 변환된 숫자 문자열인지 확인
        let codeNum = null
        
        // 1. 이미 숫자 문자열인 경우
        const codeStr = String(mountainCode).trim()
        codeNum = parseInt(codeStr)
        
        // 2. parseInt가 실패하면 (ObjectId 등), mountain_list에서 실제 mntilistno 찾기
        if (isNaN(codeNum) || codeNum === 0) {
          console.log(`[스탬프] mountainCode가 숫자가 아님, mountain_list에서 mntilistno 찾기 시도: ${codeStr}`)
          
          try {
            const mongoose = await import('mongoose')
            const db = mongoose.default.connection.db
            const collections = await db.listCollections().toArray()
            const collectionNames = collections.map(c => c.name)
            
            let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
            if (!mountainListCollectionName) {
              mountainListCollectionName = collectionNames.find(name => 
                name.toLowerCase() === 'mountain_list'
              ) || 'Mountain_list'
            }
            const actualCollection = db.collection(mountainListCollectionName)
            
            // ObjectId로 검색 시도
            const isObjectId = /^[0-9a-fA-F]{24}$/.test(codeStr)
            let mountain = null
            
            if (isObjectId) {
              try {
                const objectId = new mongoose.default.Types.ObjectId(codeStr)
                mountain = await actualCollection.findOne({ _id: objectId })
              } catch (e) {
                console.error('[스탬프] ObjectId 변환 실패:', e)
              }
            }
            
            // mntilistno로 검색 시도
            if (!mountain) {
              const searchQueries = [
                { mntilistno: parseInt(codeStr) },
                { mntilistno: Number(codeStr) },
                { mntilistno: codeStr },
                { 'trail_match.mountain_info.mntilistno': parseInt(codeStr) },
                { 'trail_match.mountain_info.mntilistno': Number(codeStr) },
                { 'trail_match.mountain_info.mntilistno': codeStr }
              ]
              
              for (const query of searchQueries) {
                mountain = await actualCollection.findOne(query)
                if (mountain) break
              }
            }
            
            if (mountain) {
              const mntilistno = mountain.mntilistno || mountain.trail_match?.mountain_info?.mntilistno
              if (mntilistno !== undefined && mntilistno !== null) {
                codeNum = parseInt(String(mntilistno))
                console.log(`[스탬프] mountain_list에서 mntilistno 찾음: ${codeNum} (원본: ${codeStr})`)
              }
            }
          } catch (dbError) {
            console.error('[스탬프] mountain_list 조회 오류:', dbError)
          }
        }
        
        // 유효한 숫자 코드가 있으면 스탬프 생성 API 호출
        if (codeNum && !isNaN(codeNum) && codeNum > 0) {
          console.log(`[스탬프] 스탬프 생성 API 호출 시도 - userId: ${userId}, mountainCode: ${codeNum}`)
          
          // stamp-service API 호출 (비동기, 실패해도 게시글 작성은 계속)
          // Docker 네트워크 내에서 컨테이너 이름으로 접근
          const STAMP_SERVICE_URL = process.env.STAMP_SERVICE_URL || 'http://hiking-stamp-service:3010'
          axios.post(`${STAMP_SERVICE_URL}/api/stamps`, {
            mountainCode: codeNum
          }, {
            headers: {
              'Authorization': req.headers['authorization'] // JWT 토큰 전달
            },
            timeout: 5000 // 5초 타임아웃
          }).then((response) => {
            console.log(`[스탬프] 등산일지 작성 시 자동 생성 성공 - userId: ${userId}, mountainCode: ${codeNum}`, response.status)
          }).catch((error) => {
            // 스탬프 생성 실패해도 게시글 작성은 계속 진행
            if (error.response?.status === 200 || error.response?.status === 201) {
              // 이미 존재하는 스탬프인 경우
              console.log(`[스탬프] 이미 존재하는 스탬프 - userId: ${userId}, mountainCode: ${codeNum}`)
            } else {
              console.error('[스탬프] 등산일지 작성 시 스탬프 생성 오류:', error.message)
              if (error.response) {
                console.error('[스탬프] 오류 응답:', error.response.status, error.response.data)
              }
              if (error.code === 'ECONNREFUSED') {
                console.error('[스탬프] stamp-service 연결 실패 - 서비스가 실행 중인지 확인하세요')
              }
            }
          })
        } else {
          console.warn(`[스탬프] 유효한 mountainCode를 찾을 수 없음 - userId: ${userId}, 원본 mountainCode: ${mountainCode}, 변환 시도 결과: ${codeNum}`)
        }
      } catch (stampError) {
        // 스탬프 생성 실패해도 게시글 작성은 계속 진행
        console.error('[스탬프] 등산일지 작성 시 스탬프 생성 오류:', stampError)
      }
    }
    
    if (normalizedCategory === 'diary') {
      const currentPoints = user.points || 0
      updatedPoints = currentPoints + 100
      // findByIdAndUpdate를 사용하여 포인트만 업데이트 (스키마 검증 우회)
      await User.findByIdAndUpdate(userId, { points: updatedPoints }, { runValidators: false })
      console.log(`등산일지 작성 포인트 지급: 사용자 ${user.name} (${user.id})에게 +100 포인트 지급. 현재 포인트: ${updatedPoints}`)
      
      // 포인트 적립 알림 생성
      const notification = new Notification({
        user: userId,
        type: 'point_earned',
        title: '포인트 적립',
        message: '등산일지 작성으로 100포인트가 적립되었습니다.',
        relatedId: post._id,
        relatedModel: 'Post'
      })
      await notification.save()
    }
    
    // 저장 후 실제 DB에서 확인
    const savedPost = await Post.findById(post._id).select('category title').lean()
    console.log('DB에 저장된 실제 값:', savedPost)

    res.status(201).json({
      message: normalizedCategory === 'diary' ? '게시글이 작성되었습니다. 포인트 100점이 지급되었습니다!' : '게시글이 작성되었습니다.',
      post: {
        id: post._id,
        title: post.title,
        category: post.category,
        author: post.authorName,
        date: new Date(post.createdAt).toISOString().split('T')[0],
        views: post.views,
        likes: post.likes
      },
      pointsAdded: normalizedCategory === 'diary' ? 100 : 0,
      currentPoints: normalizedCategory === 'diary' ? updatedPoints : undefined
    })
  } catch (error) {
    console.error('게시글 작성 오류:', error)
    res.status(500).json({ error: '게시글 작성 중 오류가 발생했습니다.' })
  }
})

// 게시글 수정 (인증 필요, 작성자만)
router.put('/:id', authenticateToken, upload.array('images', 5), async (req, res) => {
  try {
    const { title, content, category, removedImages } = req.body
    const userId = req.user.userId
    const postId = req.params.id

    const post = await Post.findById(postId)
    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' })
    }

    // 작성자 또는 관리자만 수정 가능
    // JWT 토큰에서 role 확인 (DB 조회 최소화)
    let userRole = req.user.role
    if (!userRole) {
      // JWT에 role이 없으면 DB에서 확인
      const user = await User.findById(userId).select('role').lean()
      userRole = user ? (user.role || 'user') : 'user'
    }
    
    if (post.author.toString() !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: '게시글을 수정할 권한이 없습니다.' })
    }

    // 제거할 이미지 처리
    if (removedImages) {
      let removedImagePaths = []
      try {
        removedImagePaths = JSON.parse(removedImages)
      } catch (e) {
        removedImagePaths = Array.isArray(removedImages) ? removedImages : []
      }

      // 이미지 파일 삭제
      removedImagePaths.forEach(imagePath => {
        const fullPath = path.join(__dirname, '..', imagePath)
        if (fs.existsSync(fullPath)) {
          try {
            fs.unlinkSync(fullPath)
          } catch (err) {
            console.error('이미지 삭제 오류:', err)
          }
        }
      })

      // 배열에서 제거
      post.images = (post.images || []).filter(img => !removedImagePaths.includes(img))
    }

    // 새 이미지 추가
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => `/uploads/posts/${file.filename}`)
      post.images = [...(post.images || []), ...newImages]
    }

    if (title) post.title = title
    if (content) post.content = content
    if (category) post.category = category
    post.updatedAt = new Date()

    await post.save()

    // Elasticsearch 인덱싱 업데이트
    indexPostToElasticsearch(post).catch(err => 
      console.warn('Elasticsearch 인덱싱 실패 (무시됨):', err.message)
    )

    res.json({
      message: '게시글이 수정되었습니다.',
      post: {
        id: post._id,
        title: post.title,
        content: post.content,
        category: post.category,
        images: post.images
      }
    })
  } catch (error) {
    console.error('게시글 수정 오류:', error)
    res.status(500).json({ error: '게시글 수정 중 오류가 발생했습니다.' })
  }
})

// 게시글 삭제 (인증 필요, 작성자만)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const postId = req.params.id

    const post = await Post.findById(postId)
    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' })
    }

    // 작성자 또는 관리자만 삭제 가능
    // JWT 토큰에서 role 확인 (DB 조회 최소화)
    let userRole = req.user.role
    if (!userRole) {
      // JWT에 role이 없으면 DB에서 확인
      const user = await User.findById(userId).select('role').lean()
      userRole = user ? (user.role || 'user') : 'user'
    }
    
    if (post.author.toString() !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: '게시글을 삭제할 권한이 없습니다.' })
    }

    // 이미지 파일 삭제
    if (post.images && post.images.length > 0) {
      post.images.forEach(imagePath => {
        const fullPath = path.join(__dirname, '..', imagePath)
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath)
        }
      })
    }

    // 댓글도 함께 삭제
    await Comment.deleteMany({ post: postId })

    // Elasticsearch에서 삭제
    deletePostFromElasticsearch(postId).catch(err => 
      console.warn('Elasticsearch 삭제 실패 (무시됨):', err.message)
    )

    await Post.findByIdAndDelete(postId)

    res.json({ message: '게시글이 삭제되었습니다.' })
  } catch (error) {
    console.error('게시글 삭제 오류:', error)
    res.status(500).json({ error: '게시글 삭제 중 오류가 발생했습니다.' })
  }
})

// 댓글 작성 (인증 필요)
router.post('/:id/comments', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body
    const userId = req.user.userId
    const postId = req.params.id

    if (!content || !content.trim()) {
      return res.status(400).json({ error: '댓글 내용을 입력해주세요.' })
    }

    const post = await Post.findById(postId)
    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }

    const comment = new Comment({
      post: postId,
      author: userId,
      authorName: user.name,
      content: content.trim()
    })

    await comment.save()

    // 댓글 알림 생성 (게시글 작성자에게만, 자기 자신이 아닌 경우)
    // post.author가 populate되지 않았을 수 있으므로 ObjectId로 처리
    const postAuthorId = post.author.toString ? post.author.toString() : String(post.author)
    const commenterId = userId.toString()
    
    console.log('댓글 알림 체크 - postAuthorId:', postAuthorId, 'commenterId:', commenterId)
    
    if (postAuthorId !== commenterId) {
      try {
        const commenterName = user.name || '누군가'
        
        console.log('댓글 알림 생성 시도 - 작성자:', postAuthorId, '댓글 작성자:', commenterName)
        
        const notification = new Notification({
          user: post.author,
          type: 'comment',
          title: '댓글 알림',
          message: `${commenterName}님이 "${post.title}" 게시글에 댓글을 남겼습니다.`,
          relatedId: postId,
          relatedModel: 'Post'
        })
        await notification.save()
        console.log('댓글 알림 생성 완료:', notification._id)
      } catch (error) {
        console.error('댓글 알림 생성 오류:', error)
      }
    } else {
      console.log('댓글 알림 스킵 - 자기 자신의 게시글')
    }

    res.status(201).json({
      message: '댓글이 작성되었습니다.',
      comment: {
        id: comment._id,
        content: comment.content,
        author: comment.authorName,
        authorId: user.id,
        date: new Date(comment.createdAt).toISOString().split('T')[0],
        createdAt: comment.createdAt
      }
    })
  } catch (error) {
    console.error('댓글 작성 오류:', error)
    res.status(500).json({ error: '댓글 작성 중 오류가 발생했습니다.' })
  }
})

// 댓글 목록 조회
router.get('/:id/comments', async (req, res) => {
  try {
    const postId = req.params.id
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
    const skip = (page - 1) * limit

    const post = await Post.findById(postId)
    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' })
    }

    const comments = await Comment.find({ post: postId })
      .populate('author', 'id name profileImage')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean()

    const total = await Comment.countDocuments({ post: postId })

    const formattedComments = comments.map(comment => {
      const dateStr = new Date(comment.createdAt).toISOString().split('T')[0]
      const [year, month, day] = dateStr.split('-')
      const formattedDate = `${year}.${month}.${day}`

      return {
        id: comment._id,
        content: comment.content,
        author: comment.authorName || (comment.author && comment.author.name) || '알 수 없음',
        authorId: comment.author && comment.author.id,
        authorProfileImage: comment.author && comment.author.profileImage,
        date: formattedDate,
        createdAt: comment.createdAt
      }
    })

    res.json({
      comments: formattedComments,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('댓글 목록 조회 오류:', error)
    res.status(500).json({ error: '댓글 목록을 불러오는 중 오류가 발생했습니다.' })
  }
})

// 댓글 수정 (인증 필요, 작성자만)
router.put('/:postId/comments/:commentId', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body
    const userId = req.user.userId
    const { postId, commentId } = req.params

    if (!content || !content.trim()) {
      return res.status(400).json({ error: '댓글 내용을 입력해주세요.' })
    }

    const comment = await Comment.findById(commentId)
    if (!comment) {
      return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' })
    }

    if (comment.post.toString() !== postId) {
      return res.status(400).json({ error: '잘못된 요청입니다.' })
    }

    if (comment.author.toString() !== userId) {
      return res.status(403).json({ error: '댓글을 수정할 권한이 없습니다.' })
    }

    comment.content = content.trim()
    comment.updatedAt = new Date()
    await comment.save()

    res.json({
      message: '댓글이 수정되었습니다.',
      comment: {
        id: comment._id,
        content: comment.content
      }
    })
  } catch (error) {
    console.error('댓글 수정 오류:', error)
    res.status(500).json({ error: '댓글 수정 중 오류가 발생했습니다.' })
  }
})

// 댓글 삭제 (인증 필요, 작성자만)
router.delete('/:postId/comments/:commentId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const { postId, commentId } = req.params

    const comment = await Comment.findById(commentId)
    if (!comment) {
      return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' })
    }

    if (comment.post.toString() !== postId) {
      return res.status(400).json({ error: '잘못된 요청입니다.' })
    }

    if (comment.author.toString() !== userId) {
      return res.status(403).json({ error: '댓글을 삭제할 권한이 없습니다.' })
    }

    await Comment.findByIdAndDelete(commentId)

    res.json({ message: '댓글이 삭제되었습니다.' })
  } catch (error) {
    console.error('댓글 삭제 오류:', error)
    res.status(500).json({ error: '댓글 삭제 중 오류가 발생했습니다.' })
  }
})

// 좋아요 토글 (인증 필요)
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const postId = req.params.id

    const post = await Post.findById(postId)
    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' })
    }

    // userId를 문자열로 변환하여 비교
    const userIdStr = userId.toString ? userId.toString() : String(userId)
    const likedIndex = post.likedBy.findIndex(id => {
      const idStr = id.toString ? id.toString() : String(id)
      return idStr === userIdStr
    })
    if (likedIndex > -1) {
      // 이미 좋아요를 눌렀으면 취소
      post.likedBy.splice(likedIndex, 1)
      post.likes = Math.max(0, post.likes - 1)
    } else {
      // 좋아요 추가
      post.likedBy.push(userId)
      post.likes = post.likes + 1
    }

    await post.save()

    res.json({
      likes: post.likes,
      isLiked: post.likedBy.includes(userId)
    })
  } catch (error) {
    console.error('좋아요 처리 오류:', error)
    res.status(500).json({ error: '좋아요 처리 중 오류가 발생했습니다.' })
  }
})

// 북마크 토글 (인증 필요)
router.post('/:id/bookmark', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const postId = req.params.id

    const post = await Post.findById(postId)
    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }

    // ObjectId 비교를 위해 문자열로 변환
    const postIdStr = postId.toString()
    const mongooseModule = await import('mongoose')
    const mongoose = mongooseModule.default
    
    // favorites 배열을 복사 (Mongoose 문서의 배열을 직접 수정하지 않기 위해)
    const currentFavorites = (user.favorites || []).map(id => id.toString())
    const favoriteIndex = currentFavorites.findIndex(favIdStr => favIdStr === postIdStr)
    
    let updatedFavorites
    
    if (favoriteIndex > -1) {
      // 이미 북마크에 있으면 제거
      updatedFavorites = currentFavorites.filter(favIdStr => favIdStr !== postIdStr)
      console.log('북마크 제거:', postId, '현재 북마크 개수:', updatedFavorites.length)
      
      // $set 연산자 사용하여 배열 업데이트
      await User.findByIdAndUpdate(
        userId, 
        { $set: { favorites: updatedFavorites.map(id => new mongoose.Types.ObjectId(id)) } }, 
        { runValidators: false }
      )
      
      res.json({
        isFavorited: false,
        isBookmarked: false,
        message: '북마크가 해제되었습니다.'
      })
    } else {
      // 북마크 추가
      updatedFavorites = [...currentFavorites, postIdStr]
      console.log('북마크 추가:', postId, '현재 북마크 개수:', updatedFavorites.length)
      
      // $set 연산자 사용하여 배열 업데이트
      await User.findByIdAndUpdate(
        userId, 
        { $set: { favorites: updatedFavorites.map(id => new mongoose.Types.ObjectId(id)) } }, 
        { runValidators: false }
      )
      
      res.json({
        isFavorited: true,
        isBookmarked: true,
        message: '북마크에 추가되었습니다.'
      })
    }
  } catch (error) {
    console.error('북마크 처리 오류:', error)
    res.status(500).json({ error: '북마크 처리 중 오류가 발생했습니다.' })
  }
})

// 사용자의 등산 완료 산 목록 가져오기 (스탬프용)
router.get('/stamps/completed', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    console.log(`[스탬프] API 호출됨 - 사용자 ID: ${userId}, 타입: ${typeof userId}`)
    
    // 사용자가 작성한 등산일지(diary)에서 mountainCode 추출
    const userDiaries = await Post.find({
      author: userId,
      category: 'diary',
      mountainCode: { $exists: true, $ne: null, $ne: '' }
    }).select('mountainCode title createdAt').lean()
    
    console.log(`[스탬프] 사용자 ${userId}의 등산일지 개수: ${userDiaries.length}`)
    
    // 등산일지 상세 정보 로그
    if (userDiaries.length > 0) {
      console.log(`[스탬프] 등산일지 상세:`, userDiaries.map(d => ({
        title: d.title,
        mountainCode: d.mountainCode,
        mountainCodeType: typeof d.mountainCode,
        createdAt: d.createdAt
      })))
    } else {
      console.warn(`[스탬프] 사용자 ${userId}의 등산일지가 없습니다.`)
    }
    
    // mountainCode 추출 및 유효성 검사
    const mountainCodes = userDiaries
      .map(diary => {
        const code = diary.mountainCode
        if (!code) {
          console.log(`[스탬프] mountainCode 없음 - 제목: ${diary.title}`)
          return null
        }
        
        // String으로 변환하고 빈 문자열 체크
        let codeStr = String(code).trim()
        if (codeStr === '' || codeStr === 'null' || codeStr === 'undefined') {
          console.log(`[스탬프] 유효하지 않은 mountainCode - 제목: ${diary.title}, 코드: ${codeStr}`)
          return null
        }
        
        // 숫자로 변환 가능한 경우 숫자로 정규화 (앞뒤 공백 제거 후)
        const codeNum = parseInt(codeStr)
        if (!isNaN(codeNum)) {
          codeStr = String(codeNum) // 숫자로 정규화
        }
        
        console.log(`[스탬프] 유효한 mountainCode - 제목: ${diary.title}, 코드: ${codeStr} (원본: ${code}, 타입: ${typeof code})`)
        return codeStr
      })
      .filter(code => code !== null)

    console.log(`[스탬프] 추출된 mountainCode 개수: ${mountainCodes.length}`)
    if (mountainCodes.length > 0) {
      console.log(`[스탬프] mountainCode 전체 목록:`, mountainCodes)
      console.log(`[스탬프] mountainCode 타입 확인:`, mountainCodes.map(c => ({ code: c, type: typeof c })))
    }

    // 중복 제거하여 완료한 산 코드 목록 생성
    const completedMountainCodes = [...new Set(mountainCodes)]

    console.log(`[스탬프] 최종 완료 산 개수: ${completedMountainCodes.length}`)

    res.json({
      completedMountainCodes,
      count: completedMountainCodes.length
    })
  } catch (error) {
    console.error('등산 완료 산 목록 조회 오류:', error)
    res.status(500).json({ error: '등산 완료 산 목록을 가져오는데 실패했습니다.' })
  }
})

// 게시글 일괄 인덱싱 (관리자용) - 기존 MongoDB 데이터를 Elasticsearch로 옮기기
router.post('/index/init', authenticateToken, async (req, res) => {
  try {
    // 관리자 권한 확인
    const user = await User.findById(req.user.userId)
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' })
    }

    const esClient = await getElasticsearchClient()
    if (!esClient) {
      return res.status(503).json({ error: 'Elasticsearch 연결 실패' })
    }

    const { createIndex, bulkIndex } = await import('./shared/utils/search.js')

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
        content: {
          type: 'text',
          analyzer: 'korean_analyzer'
        },
        category: { type: 'keyword' },
        authorId: { type: 'keyword' },
        authorName: { type: 'text' },
        createdAt: { type: 'date' }
      }
    }

    // 인덱스 생성
    await createIndex('posts', mapping)

    // 모든 게시글 가져오기
    const allPosts = await Post.find({})
      .select('_id title content category author authorName createdAt')
      .lean()

    console.log(`총 ${allPosts.length}개의 게시글을 인덱싱합니다.`)

    // 일괄 인덱싱을 위한 문서 배열 생성
    const documents = allPosts.map(post => ({
      id: post._id.toString(),
      data: {
        _id: post._id.toString(),
        title: post.title || '',
        content: post.content ? post.content.replace(/<[^>]*>/g, '') : '', // HTML 태그 제거
        category: post.category || '',
        authorId: post.author ? post.author.toString() : '',
        authorName: post.authorName || '',
        createdAt: post.createdAt || new Date()
      }
    }))

    // 배치 단위로 인덱싱 (한 번에 너무 많이 하면 메모리 문제 발생 가능)
    const batchSize = 100
    let totalIndexed = 0
    let totalErrors = 0

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize)
      try {
        const result = await bulkIndex('posts', batch)
        totalIndexed += result.indexed
        totalErrors += result.errors
        console.log(`배치 ${Math.floor(i / batchSize) + 1}: ${result.indexed}개 인덱싱 완료`)
      } catch (error) {
        console.error(`배치 ${Math.floor(i / batchSize) + 1} 인덱싱 실패:`, error.message)
        totalErrors += batch.length
      }
    }

    res.json({
      success: true,
      message: '게시글 인덱싱 완료',
      total: allPosts.length,
      indexed: totalIndexed,
      errors: totalErrors
    })
  } catch (error) {
    console.error('게시글 인덱싱 초기화 오류:', error)
    res.status(500).json({ 
      error: '인덱싱 초기화 중 오류가 발생했습니다.',
      details: error.message 
    })
  }
})

export default router


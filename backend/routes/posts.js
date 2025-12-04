import express from 'express'
import Post from '../models/Post.js'
import User from '../models/User.js'
import Comment from '../models/Comment.js'
import Course from '../models/Course.js'
import Notification from '../models/Notification.js'
import { authenticateToken } from './auth.js'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = express.Router()

// 게시글 이미지 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/posts')
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

// 즐겨찾기 목록 조회 (인증 필요) - /:id보다 먼저 정의해야 함
router.get('/favorites/my', authenticateToken, async (req, res) => {
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

    const posts = await Post.find({ _id: { $in: favoritePostIds } })
      .populate('author', 'id name profileImage')
      .select('title content category author authorName views likes createdAt images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

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

    res.json({
      posts: formattedPosts,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('즐겨찾기 목록 조회 오류:', error)
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
      .select('title content category author authorName views likes createdAt images mountainCode courseName courseDistance courseDurationMinutes')
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

// 게시글 검색 (인증 불필요)
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q || ''
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit

    if (!query.trim()) {
      return res.json({ posts: [], total: 0 })
    }

    // 제목 또는 내용에서 검색 (한글 검색 지원)
    // 특수문자 이스케이프 (한글은 이스케이프 불필요)
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    
    console.log('검색어:', query, '이스케이프된 검색어:', escapedQuery)
    
    // MongoDB $regex를 사용하여 대소문자 구분 없이 검색
    const searchCondition = {
      $or: [
        { title: { $regex: escapedQuery, $options: 'i' } },
        { content: { $regex: escapedQuery, $options: 'i' } }
      ]
    }
    
    console.log('검색 조건:', { query: escapedQuery, options: 'i' })
    
    const posts = await Post.find(searchCondition)
      .populate('author', 'id name profileImage')
      .select('title content category author authorName views likes createdAt images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    const total = await Post.countDocuments(searchCondition)

    console.log('검색 쿼리:', query, '검색 결과 수:', total)
    if (posts.length > 0) {
      console.log('검색된 게시글 제목들:', posts.map(p => p.title))
    }

    // 날짜 포맷팅 및 본문 미리보기 생성
    const formattedPosts = posts.map((post) => {
      // 본문 미리보기 (100자 제한, HTML 태그 제거)
      const contentPreview = post.content
        ? post.content.replace(/<[^>]*>/g, '').substring(0, 100) + (post.content.length > 100 ? '...' : '')
        : ''
      
      // 첫 번째 이미지를 썸네일로 사용
      const thumbnailImage = post.images && post.images.length > 0 ? post.images[0] : null
      
      // 날짜 포맷팅 (YYYY-MM-DD)
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
      .select('title content category author authorName views likes createdAt images mountainCode courseName courseDistance courseDurationMinutes')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    const total = await Post.countDocuments(query)
    
    console.log('게시글 목록 조회 결과 - 카테고리:', category, '조회된 게시글 수:', posts.length, '게시글 카테고리들:', posts.map(p => ({ title: p.title, category: p.category })))

    // 즐겨찾기 상태 확인 (인증된 사용자인 경우)
    let userFavorites = []
    const authHeader = req.headers['authorization']
    if (authHeader) {
      const token = authHeader.split(' ')[1]
      if (token) {
        try {
          const jwt = await import('jsonwebtoken')
          const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
          const decoded = jwt.default.verify(token, JWT_SECRET)
          const user = await User.findById(decoded.userId).select('favorites').lean()
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
        isFavorited,
        thumbnail: thumbnail,
        comments: commentCount
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
    // "search", "my" 등의 특수 경로는 ObjectId가 아니므로 404 반환
    const id = req.params.id
    if (id === 'search' || id === 'my' || id === 'favorites') {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' })
    }
    
    const post = await Post.findById(id)
      .populate('author', 'id name profileImage')
      .select('title content category author authorName views likes likedBy createdAt updatedAt images mountainCode courseName courseDistance courseDurationMinutes')
      .lean()

    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' })
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
      createdAt: post.createdAt,
      updatedAt: post.updatedAt
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
      mountainCode = req.body.mountainCode || null
      courseName = req.body.courseName || null

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
      courseDurationMinutes
    })

    await post.save()
    console.log('게시글 작성 완료 - 원본 카테고리:', category, '정규화된 카테고리:', normalizedCategory, '저장된 카테고리:', post.category, '제목:', title)
    
    // 등산일지 작성 시 포인트 +100 지급 및 알림 생성
    if (normalizedCategory === 'diary') {
      const currentPoints = user.points || 0
      user.points = currentPoints + 100
      await user.save()
      console.log(`등산일지 작성 포인트 지급: 사용자 ${user.name} (${user.id})에게 +100 포인트 지급. 현재 포인트: ${user.points}`)
      
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
      currentPoints: normalizedCategory === 'diary' ? user.points : undefined
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
    const user = await User.findById(userId)
    if (post.author.toString() !== userId && (!user || user.role !== 'admin')) {
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
    const user = await User.findById(userId)
    if (post.author.toString() !== userId && (!user || user.role !== 'admin')) {
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

// 즐겨찾기 토글 (인증 필요)
router.post('/:id/favorite', authenticateToken, async (req, res) => {
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

    const favoriteIndex = user.favorites.indexOf(postId)
    if (favoriteIndex > -1) {
      // 이미 즐겨찾기에 있으면 제거
      user.favorites.splice(favoriteIndex, 1)
      await user.save()
      res.json({
        isFavorited: false,
        message: '즐겨찾기가 해제되었습니다.'
      })
    } else {
      // 즐겨찾기 추가
      user.favorites.push(postId)
      await user.save()
      res.json({
        isFavorited: true,
        message: '즐겨찾기에 추가되었습니다.'
      })
    }
  } catch (error) {
    console.error('즐겨찾기 처리 오류:', error)
    res.status(500).json({ error: '즐겨찾기 처리 중 오류가 발생했습니다.' })
  }
})

export default router


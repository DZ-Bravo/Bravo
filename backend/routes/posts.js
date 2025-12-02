import express from 'express'
import Post from '../models/Post.js'
import User from '../models/User.js'
import Comment from '../models/Comment.js'
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

// 내 게시글 조회 (인증 필요)
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit

    const posts = await Post.find({ author: userId })
      .populate('author', 'id name profileImage')
      .select('title content category author authorName views likes createdAt images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    const total = await Post.countDocuments({ author: userId })

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
      .select('title content category author authorName views likes createdAt images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    const total = await Post.countDocuments(query)
    
    console.log('게시글 목록 조회 결과 - 카테고리:', category, '조회된 게시글 수:', posts.length, '게시글 카테고리들:', posts.map(p => ({ title: p.title, category: p.category })))

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
    if (id === 'search' || id === 'my') {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' })
    }
    
    const post = await Post.findById(id)
      .populate('author', 'id name profileImage')
      .lean()

    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' })
    }

    // 조회수 증가 (한 번만 실행되도록 await 사용)
    const updatedPost = await Post.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    )

    res.json({
      id: post._id,
      title: post.title,
      content: post.content,
      category: post.category,
      author: post.authorName || (post.author && post.author.name) || '알 수 없음',
      authorId: post.author && post.author.id,
      authorProfileImage: post.author && post.author.profileImage,
      date: new Date(post.createdAt).toISOString().split('T')[0],
      views: updatedPost.views || (post.views || 0) + 1,
      likes: post.likes || 0,
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

    const post = new Post({
      title,
      content,
      category: normalizedCategory,
      author: userId,
      authorName: user.name,
      images
    })

    await post.save()
    console.log('게시글 작성 완료 - 원본 카테고리:', category, '정규화된 카테고리:', normalizedCategory, '저장된 카테고리:', post.category, '제목:', title)
    
    // 저장 후 실제 DB에서 확인
    const savedPost = await Post.findById(post._id).select('category title').lean()
    console.log('DB에 저장된 실제 값:', savedPost)

    res.status(201).json({
      message: '게시글이 작성되었습니다.',
      post: {
        id: post._id,
        title: post.title,
        category: post.category,
        author: post.authorName,
        date: new Date(post.createdAt).toISOString().split('T')[0],
        views: post.views,
        likes: post.likes
      }
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

    const likedIndex = post.likedBy.indexOf(userId)
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

export default router


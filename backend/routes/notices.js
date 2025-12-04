import express from 'express'
import Notice from '../models/Notice.js'
import User from '../models/User.js'
import Notification from '../models/Notification.js'
import { authenticateToken } from './auth.js'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import fs from 'fs'
import mongoose from 'mongoose'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = express.Router()

// 이미지 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/notices')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, 'notice-' + uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB 제한
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)

    if (extname && mimetype) {
      return cb(null, true)
    } else {
      cb(new Error('이미지 파일만 업로드 가능합니다.'))
    }
  }
})

// 관리자 권한 체크 미들웨어
const requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId)
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' })
    }
    next()
  } catch (error) {
    console.error('관리자 권한 체크 오류:', error)
    res.status(500).json({ error: '권한 확인 중 오류가 발생했습니다.' })
  }
}

// 공지사항 목록 조회
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit

    const notices = await Notice.find()
      .populate('author', 'id name profileImage')
      .select('title content icon type author authorName views createdAt images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    const total = await Notice.countDocuments()

    // 날짜 포맷팅
    const formattedNotices = notices.map(notice => {
      const dateStr = new Date(notice.createdAt).toISOString().split('T')[0]
      const [year, month, day] = dateStr.split('-')
      const formattedDate = `${year}-${month}-${day}`

      return {
        id: notice._id,
        title: notice.title,
        content: notice.content,
        icon: notice.icon || '📢',
        type: notice.type || 'announcement',
        author: notice.authorName || (notice.author && notice.author.name) || '관리자',
        date: formattedDate,
        views: notice.views || 0,
        images: notice.images || []
      }
    })

    res.json({
      notices: formattedNotices,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('공지사항 목록 조회 오류:', error)
    res.status(500).json({ error: '공지사항 목록을 불러오는 중 오류가 발생했습니다.' })
  }
})

// 공지사항 상세 조회
router.get('/:id', async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id)
      .populate('author', 'id name profileImage')
      .lean()

    if (!notice) {
      return res.status(404).json({ error: '공지사항을 찾을 수 없습니다.' })
    }

    // 조회수 증가
    await Notice.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } })

    const dateStr = new Date(notice.createdAt).toISOString().split('T')[0]
    const [year, month, day] = dateStr.split('-')
    const formattedDate = `${year}-${month}-${day}`

    res.json({
      id: notice._id,
      title: notice.title,
      content: notice.content,
      icon: notice.icon || '📢',
      type: notice.type || 'announcement',
      author: notice.authorName || (notice.author && notice.author.name) || '관리자',
      authorId: notice.author && notice.author.id,
      date: formattedDate,
      views: (notice.views || 0) + 1,
      images: notice.images || [],
      createdAt: notice.createdAt,
      updatedAt: notice.updatedAt
    })
  } catch (error) {
    console.error('공지사항 상세 조회 오류:', error)
    res.status(500).json({ error: '공지사항을 불러오는 중 오류가 발생했습니다.' })
  }
})

// 공지사항 작성 (관리자만)
router.post('/', authenticateToken, requireAdmin, upload.array('images', 5), async (req, res) => {
  try {
    const { title, content, icon, type } = req.body
    const userId = req.user.userId

    if (!title || !content) {
      return res.status(400).json({ error: '제목과 내용을 입력해주세요.' })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }

    const images = req.files ? req.files.map(file => `/uploads/notices/${file.filename}`) : []

    const notice = new Notice({
      title,
      content,
      icon: icon || '📢',
      type: type || 'announcement',
      author: userId,
      authorName: user.name,
      images
    })

    await notice.save()

    // 공지사항 작성 시 모든 사용자에게 알림 생성
    try {
      const allUsers = await User.find({}).select('_id').lean()
      console.log(`공지사항 알림 생성 - 전체 사용자 수: ${allUsers.length}`)
      
      const notifications = allUsers.map(user => ({
        user: user._id,
        type: 'announcement',
        title: '공지사항',
        message: `새로운 공지사항: "${title}"`,
        relatedId: notice._id,
        relatedModel: 'Notice'
      }))
      
      // 대량 삽입 (성능 최적화)
      if (notifications.length > 0) {
        await Notification.insertMany(notifications)
        console.log(`공지사항 알림 생성 완료 - ${notifications.length}개 알림 생성`)
      }
    } catch (error) {
      console.error('공지사항 알림 생성 오류:', error)
      // 알림 생성 실패해도 공지사항 작성은 성공으로 처리
    }

    res.status(201).json({
      message: '공지사항이 작성되었습니다.',
      notice: {
        id: notice._id,
        title: notice.title,
        content: notice.content,
        icon: notice.icon,
        type: notice.type,
        images: notice.images
      }
    })
  } catch (error) {
    console.error('공지사항 작성 오류:', error)
    res.status(500).json({ error: '공지사항 작성 중 오류가 발생했습니다.' })
  }
})

// 공지사항 수정 (관리자만)
router.put('/:id', authenticateToken, requireAdmin, upload.array('images', 5), async (req, res) => {
  try {
    const { title, content, icon, type, removedImages: removedImagesJson } = req.body
    const noticeId = req.params.id

    const notice = await Notice.findById(noticeId)
    if (!notice) {
      return res.status(404).json({ error: '공지사항을 찾을 수 없습니다.' })
    }

    // 기존 이미지 삭제 처리
    let removedImages = []
    if (removedImagesJson) {
      removedImages = JSON.parse(removedImagesJson)
      for (const imageUrl of removedImages) {
        const filename = path.basename(imageUrl)
        const filePath = path.join(__dirname, '../uploads/notices', filename)
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      }
      notice.images = notice.images.filter(img => !removedImages.includes(img))
    }

    // 새로 추가할 이미지 처리
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => `/uploads/notices/${file.filename}`)
      notice.images = [...(notice.images || []), ...newImages]
    }

    if (title) notice.title = title
    if (content) notice.content = content
    if (icon) notice.icon = icon
    if (type) notice.type = type
    notice.updatedAt = new Date()

    await notice.save()

    res.json({
      message: '공지사항이 수정되었습니다.',
      notice: {
        id: notice._id,
        title: notice.title,
        content: notice.content,
        icon: notice.icon,
        type: notice.type,
        images: notice.images
      }
    })
  } catch (error) {
    console.error('공지사항 수정 오류:', error)
    res.status(500).json({ error: '공지사항 수정 중 오류가 발생했습니다.' })
  }
})

// 공지사항 삭제 (관리자만)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const noticeId = req.params.id

    const notice = await Notice.findById(noticeId)
    if (!notice) {
      return res.status(404).json({ error: '공지사항을 찾을 수 없습니다.' })
    }

    // 이미지 파일 삭제
    if (notice.images && notice.images.length > 0) {
      for (const imageUrl of notice.images) {
        const filename = path.basename(imageUrl)
        const filePath = path.join(__dirname, '../uploads/notices', filename)
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      }
    }

    await Notice.findByIdAndDelete(noticeId)

    res.json({ message: '공지사항이 삭제되었습니다.' })
  } catch (error) {
    console.error('공지사항 삭제 오류:', error)
    res.status(500).json({ error: '공지사항 삭제 중 오류가 발생했습니다.' })
  }
})

export default router


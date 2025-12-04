import express from 'express'
import Notification from '../models/Notification.js'
import { authenticateToken } from './auth.js'

const router = express.Router()

// 알림 목록 조회
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const { limit = 50, unreadOnly = false } = req.query

    console.log('알림 조회 요청 - userId:', userId, 'limit:', limit, 'unreadOnly:', unreadOnly)

    let query = { user: userId }
    if (unreadOnly === 'true') {
      query.read = false
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean()

    // 읽지 않은 알림 수
    const unreadCount = await Notification.countDocuments({ user: userId, read: false })

    console.log('알림 조회 결과 - userId:', userId, '알림 수:', notifications.length, '읽지 않은 알림:', unreadCount)

    res.json({
      notifications,
      unreadCount
    })
  } catch (error) {
    console.error('알림 조회 오류:', error)
    res.status(500).json({ error: '알림을 불러오는 중 오류가 발생했습니다.' })
  }
})

// 알림 읽음 처리
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const notificationId = req.params.id

    const notification = await Notification.findOne({ _id: notificationId, user: userId })

    if (!notification) {
      return res.status(404).json({ error: '알림을 찾을 수 없습니다.' })
    }

    notification.read = true
    await notification.save()

    res.json({ message: '알림이 읽음 처리되었습니다.' })
  } catch (error) {
    console.error('알림 읽음 처리 오류:', error)
    res.status(500).json({ error: '알림 읽음 처리 중 오류가 발생했습니다.' })
  }
})

// 모든 알림 읽음 처리
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId

    await Notification.updateMany(
      { user: userId, read: false },
      { read: true }
    )

    res.json({ message: '모든 알림이 읽음 처리되었습니다.' })
  } catch (error) {
    console.error('알림 일괄 읽음 처리 오류:', error)
    res.status(500).json({ error: '알림 읽음 처리 중 오류가 발생했습니다.' })
  }
})

// 알림 삭제
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const notificationId = req.params.id

    const notification = await Notification.findOne({ _id: notificationId, user: userId })

    if (!notification) {
      return res.status(404).json({ error: '알림을 찾을 수 없습니다.' })
    }

    await Notification.findByIdAndDelete(notificationId)

    res.json({ message: '알림이 삭제되었습니다.' })
  } catch (error) {
    console.error('알림 삭제 오류:', error)
    res.status(500).json({ error: '알림 삭제 중 오류가 발생했습니다.' })
  }
})

export default router


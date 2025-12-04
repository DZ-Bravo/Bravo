import express from 'express'
import Schedule from '../models/Schedule.js'
import Notification from '../models/Notification.js'
import { authenticateToken } from './auth.js'

// 등산일정 알림 생성 헬퍼 함수
async function createScheduleReminderIfNeeded(schedule) {
  try {
    // 내일 날짜 계산
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    
    const tomorrowEnd = new Date(tomorrow)
    tomorrowEnd.setHours(23, 59, 59, 999)
    
    // 등산일정 날짜
    const scheduleDate = new Date(schedule.scheduledDate)
    scheduleDate.setHours(0, 0, 0, 0)
    
    // 등산일정이 내일인지 확인
    if (scheduleDate >= tomorrow && scheduleDate <= tomorrowEnd) {
      // 이미 오늘 알림이 있는지 확인 (중복 방지)
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      
      const existingNotification = await Notification.findOne({
        user: schedule.user,
        type: 'schedule_reminder',
        relatedId: schedule._id,
        createdAt: {
          $gte: todayStart
        }
      })
      
      if (!existingNotification) {
        const notification = new Notification({
          user: schedule.user,
          type: 'schedule_reminder',
          title: '등산일정 알림',
          message: `내일 ${schedule.mountainName} 등산일정이 있습니다.`,
          relatedId: schedule._id,
          relatedModel: 'Schedule'
        })
        await notification.save()
        console.log(`등산일정 추가 시 알림 생성: ${schedule.mountainName} - ${schedule.scheduledDate}`)
      }
    }
  } catch (error) {
    console.error('등산일정 알림 생성 오류:', error)
    // 알림 생성 실패해도 일정 추가는 성공으로 처리
  }
}

const router = express.Router()

// 등산일정 생성
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const { mountainCode, mountainName, scheduledDate, scheduledTime, courseName, notes } = req.body

    if (!mountainCode || !mountainName || !scheduledDate) {
      return res.status(400).json({ error: '산 코드, 산 이름, 일정 날짜는 필수입니다.' })
    }

    // 날짜 형식 검증 및 정규화 (YYYY-MM-DD 형식을 한국 시간대로 처리)
    // scheduledDate는 "YYYY-MM-DD" 형식으로 오므로, 한국 시간대(KST, UTC+9) 기준으로 날짜 생성
    const dateStr = scheduledDate.trim()
    const [year, month, day] = dateStr.split('-').map(Number)
    
    if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
      return res.status(400).json({ error: '유효하지 않은 날짜 형식입니다.' })
    }

    // 한국 시간대(KST, UTC+9) 기준으로 날짜 생성 (자정 00:00:00)
    // UTC로 변환하면 하루 전날이 될 수 있으므로, 로컬 시간대 기준으로 생성
    const date = new Date(year, month - 1, day, 0, 0, 0, 0)
    
    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: '유효하지 않은 날짜 형식입니다.' })
    }

    // 날짜 범위 설정 (같은 날짜의 00:00:00 ~ 23:59:59)
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0)
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)

    // 이미 같은 날짜에 같은 산 일정이 있는지 확인
    const existingSchedule = await Schedule.findOne({
      user: userId,
      mountainCode: mountainCode,
      scheduledDate: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    })

    if (existingSchedule) {
      return res.status(400).json({ error: '해당 날짜에 이미 등산일정이 있습니다.' })
    }

    const schedule = new Schedule({
      user: userId,
      mountainCode,
      mountainName,
      scheduledDate: date, // 한국 시간대 기준 날짜 저장
      scheduledTime: scheduledTime || '09:00',
      courseName: courseName || null,
      notes: notes || null
    })

    await schedule.save()

    // 등산일정이 내일이면 바로 알림 생성
    await createScheduleReminderIfNeeded(schedule)

    res.status(201).json({
      message: '등산일정이 추가되었습니다.',
      schedule: {
        id: schedule._id,
        mountainCode: schedule.mountainCode,
        mountainName: schedule.mountainName,
        scheduledDate: schedule.scheduledDate,
        scheduledTime: schedule.scheduledTime,
        courseName: schedule.courseName
      }
    })
  } catch (error) {
    console.error('등산일정 생성 오류:', error)
    res.status(500).json({ error: '등산일정 추가 중 오류가 발생했습니다.' })
  }
})

// 등산일정 목록 조회
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const { year, month } = req.query

    let query = { user: userId }

    // 년/월 필터링
    if (year && month) {
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1)
      const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999)
      query.scheduledDate = {
        $gte: startDate,
        $lte: endDate
      }
    }

    const schedules = await Schedule.find(query)
      .sort({ scheduledDate: 1, scheduledTime: 1 })
      .lean()

    res.json({ schedules })
  } catch (error) {
    console.error('등산일정 조회 오류:', error)
    res.status(500).json({ error: '등산일정을 불러오는 중 오류가 발생했습니다.' })
  }
})

// 등산일정 삭제
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const scheduleId = req.params.id

    const schedule = await Schedule.findOne({ _id: scheduleId, user: userId })

    if (!schedule) {
      return res.status(404).json({ error: '등산일정을 찾을 수 없습니다.' })
    }

    await Schedule.findByIdAndDelete(scheduleId)

    res.json({ message: '등산일정이 삭제되었습니다.' })
  } catch (error) {
    console.error('등산일정 삭제 오류:', error)
    res.status(500).json({ error: '등산일정 삭제 중 오류가 발생했습니다.' })
  }
})

// 등산일정 수정
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const scheduleId = req.params.id
    const { scheduledDate, scheduledTime, courseName, notes } = req.body

    const schedule = await Schedule.findOne({ _id: scheduleId, user: userId })

    if (!schedule) {
      return res.status(404).json({ error: '등산일정을 찾을 수 없습니다.' })
    }

    if (scheduledDate) {
      // 날짜 형식 검증 및 정규화 (YYYY-MM-DD 형식을 한국 시간대로 처리)
      const dateStr = scheduledDate.trim()
      const [year, month, day] = dateStr.split('-').map(Number)
      
      if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
        return res.status(400).json({ error: '유효하지 않은 날짜 형식입니다.' })
      }

      // 한국 시간대(KST, UTC+9) 기준으로 날짜 생성 (자정 00:00:00)
      const date = new Date(year, month - 1, day, 0, 0, 0, 0)
      
      if (isNaN(date.getTime())) {
        return res.status(400).json({ error: '유효하지 않은 날짜 형식입니다.' })
      }
      
      schedule.scheduledDate = date
    }

    if (scheduledTime) schedule.scheduledTime = scheduledTime
    if (courseName !== undefined) schedule.courseName = courseName
    if (notes !== undefined) schedule.notes = notes

    await schedule.save()

    res.json({
      message: '등산일정이 수정되었습니다.',
      schedule: {
        id: schedule._id,
        mountainCode: schedule.mountainCode,
        mountainName: schedule.mountainName,
        scheduledDate: schedule.scheduledDate,
        scheduledTime: schedule.scheduledTime,
        courseName: schedule.courseName
      }
    })
  } catch (error) {
    console.error('등산일정 수정 오류:', error)
    res.status(500).json({ error: '등산일정 수정 중 오류가 발생했습니다.' })
  }
})

export default router


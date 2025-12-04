import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Schedule from '../models/Schedule.js'
import Notification from '../models/Notification.js'
import connectDB from '../config/database.js'

dotenv.config()

async function checkScheduleReminders() {
  try {
    await connectDB()
    
    // 내일 날짜 계산
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    
    const tomorrowEnd = new Date(tomorrow)
    tomorrowEnd.setHours(23, 59, 59, 999)
    
    // 내일 등산일정이 있는 사용자 찾기
    const schedules = await Schedule.find({
      scheduledDate: {
        $gte: tomorrow,
        $lte: tomorrowEnd
      }
    }).populate('user', 'id name').lean()
    
    console.log(`내일 등산일정이 있는 사용자 수: ${schedules.length}`)
    
    for (const schedule of schedules) {
      // 이미 알림이 있는지 확인 (중복 방지)
      const existingNotification = await Notification.findOne({
        user: schedule.user._id,
        type: 'schedule_reminder',
        relatedId: schedule._id,
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      })
      
      if (!existingNotification) {
        const notification = new Notification({
          user: schedule.user._id,
          type: 'schedule_reminder',
          title: '등산일정 알림',
          message: `내일 ${schedule.mountainName} 등산일정이 있습니다.`,
          relatedId: schedule._id,
          relatedModel: 'Schedule'
        })
        await notification.save()
        console.log(`알림 생성: ${schedule.user.name} - ${schedule.mountainName}`)
      }
    }
    
    console.log('등산일정 알림 체크 완료')
    process.exit(0)
  } catch (error) {
    console.error('등산일정 알림 체크 오류:', error)
    process.exit(1)
  }
}

checkScheduleReminders()


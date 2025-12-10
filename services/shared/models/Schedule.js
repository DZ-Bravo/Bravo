import mongoose from 'mongoose'

const scheduleSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  mountainCode: {
    type: String,
    required: true
  },
  mountainName: {
    type: String,
    required: true
  },
  scheduledDate: {
    type: Date,
    required: true,
    index: true
  },
  scheduledTime: {
    type: String, // "09:00" 형식
    default: '09:00'
  },
  courseName: {
    type: String
  },
  notes: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
})

// 사용자별 날짜별 인덱스
scheduleSchema.index({ user: 1, scheduledDate: 1 })

const Schedule = mongoose.model('Schedule', scheduleSchema)

export default Schedule


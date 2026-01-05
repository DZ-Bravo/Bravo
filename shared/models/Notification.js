import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['schedule_reminder', 'like', 'comment', 'point_earned', 'announcement'],
    index: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedModel'
  },
  relatedModel: {
    type: String,
    enum: ['Schedule', 'Post', 'Comment', 'Notice', null]
  },
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
})

// 사용자별 읽지 않은 알림 인덱스
notificationSchema.index({ user: 1, read: 1, createdAt: -1 })

const Notification = mongoose.model('Notification', notificationSchema)

export default Notification


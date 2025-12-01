import mongoose from 'mongoose'

const noticeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  icon: {
    type: String,
    default: '📢'
  },
  type: {
    type: String,
    enum: ['info', 'announcement', 'update', 'event'],
    default: 'announcement'
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  authorName: {
    type: String,
    required: true
  },
  images: [{
    type: String // 이미지 파일 경로
  }],
  views: {
    type: Number,
    default: 0
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

// 인덱스 추가
noticeSchema.index({ createdAt: -1 })
noticeSchema.index({ author: 1, createdAt: -1 })

const Notice = mongoose.model('Notice', noticeSchema)

export default Notice


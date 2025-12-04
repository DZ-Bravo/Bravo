import mongoose from 'mongoose'

const postSchema = new mongoose.Schema({
  // 기본 게시글 정보
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['diary', 'qa', 'free'],
    required: true,
    index: true
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
  // 등산일지 전용 필드
  mountainCode: {
    type: String
  },
  courseName: {
    type: String
  },
  courseDistance: {
    type: Number // km 단위
  },
  courseDurationMinutes: {
    type: Number // 분 단위
  },
  views: {
    type: Number,
    default: 0
  },
  likes: {
    type: Number,
    default: 0
  },
  likedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  images: [{
    type: String // 이미지 파일 경로
  }],
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

// 인덱스 추가 (조회 성능 향상)
postSchema.index({ category: 1, createdAt: -1 })
postSchema.index({ author: 1, createdAt: -1 })

const Post = mongoose.model('Post', postSchema)

export default Post


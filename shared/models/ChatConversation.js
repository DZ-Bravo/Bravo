import mongoose from 'mongoose'

const chatConversationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  title: {
    type: String,
    default: '새 대화'
  },
  messages: [{
    userId: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      required: true
    }
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

// updatedAt 자동 업데이트
chatConversationSchema.pre('save', function(next) {
  this.updatedAt = Date.now()
  next()
})

const ChatConversation = mongoose.model('ChatConversation', chatConversationSchema)

export default ChatConversation






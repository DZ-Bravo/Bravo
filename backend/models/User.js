import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  gender: {
    type: String,
    enum: ['male', 'female'],
    required: true
  },
  fitnessLevel: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: false,
    trim: true
  },
  birthYear: {
    type: Number,
    required: true
  },
  profileImage: {
    type: String, // 파일 경로 또는 URL 저장
    default: null
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
})

// 비밀번호 해싱 미들웨어
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next()
  }
  
  try {
    const salt = await bcrypt.genSalt(10)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// 비밀번호 비교 메서드
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password)
}

const User = mongoose.model('User', userSchema)

export default User


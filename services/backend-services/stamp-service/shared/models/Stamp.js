import mongoose from 'mongoose'

const stampSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
    index: true
  },
  mountainCode: {
    type: Number,
    required: true,
    index: true
  },
  stampedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
})

// userId + mountainCode 조합을 unique index로 설정
stampSchema.index({ userId: 1, mountainCode: 1 }, { unique: true })

const Stamp = mongoose.model('Stamp', stampSchema)

export default Stamp


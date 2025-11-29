import mongoose from 'mongoose'

const courseSchema = new mongoose.Schema({
  mountainCode: {
    type: String,
    required: true,
    index: true
  },
  courseName: {
    type: String,
    required: true
  },
  courseData: {
    type: mongoose.Schema.Types.Mixed
  },
  difficulty: {
    type: String
  },
  distance: {
    type: Number
  },
  duration: {
    type: String
  }
}, {
  timestamps: true
})

const Course = mongoose.model('Course', courseSchema)

export default Course



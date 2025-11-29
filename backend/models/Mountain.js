import mongoose from 'mongoose'

const mountainSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  height: {
    type: String
  },
  location: {
    type: String
  },
  description: {
    type: String
  },
  center: {
    lat: Number,
    lon: Number
  },
  zoom: {
    type: Number,
    default: 13
  },
  origin: {
    type: String
  }
}, {
  timestamps: true
})

const Mountain = mongoose.model('Mountain', mountainSchema)

export default Mountain




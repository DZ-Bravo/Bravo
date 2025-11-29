import mongoose from 'mongoose'

const spotSchema = new mongoose.Schema({
  mountainCode: {
    type: String,
    required: true,
    index: true
  },
  spotName: {
    type: String,
    required: true
  },
  spotData: {
    type: mongoose.Schema.Types.Mixed
  },
  coordinates: {
    lat: Number,
    lon: Number
  },
  spotType: {
    type: String
  }
}, {
  timestamps: true
})

const Spot = mongoose.model('Spot', spotSchema)

export default Spot



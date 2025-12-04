import mongoose from 'mongoose'

// lodging 컬렉션은 유연한 스키마로 정의 (기존 데이터 구조를 그대로 활용)
const lodgingSchema = new mongoose.Schema({}, {
  strict: false,
  timestamps: true
})

// 명시적으로 컬렉션 이름을 'lodging'으로 지정
const Lodging = mongoose.model('Lodging', lodgingSchema, 'lodging')

export default Lodging



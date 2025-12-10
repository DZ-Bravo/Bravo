import mongoose from 'mongoose'

// Mountain_list 컬렉션은 실제 DB 구조가 다를 수 있으므로 유연한 스키마 사용
const mountainSchema = new mongoose.Schema({}, {
  strict: false, // 스키마에 정의되지 않은 필드도 허용
  timestamps: true
})

// 인덱스는 code 필드가 있을 경우를 대비해 추가
mountainSchema.index({ code: 1 })
mountainSchema.index({ MNTN_CD: 1 })
mountainSchema.index({ mountainCode: 1 })

const Mountain = mongoose.model('Mountain', mountainSchema)
// Mountain_list 컬렉션을 위한 모델 (같은 스키마 사용)
// 컬렉션 이름을 명시적으로 지정
const MountainList = mongoose.model('Mountain_list', mountainSchema, 'Mountain_list')

export default Mountain
export { MountainList }



import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017/hiking'

async function addMountain() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB 연결 성공')
    
    const db = mongoose.connection.db
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    
    let mountainListCollectionName = collectionNames.find(name => name === 'Mountain_list')
    if (!mountainListCollectionName) {
      mountainListCollectionName = collectionNames.find(name => 
        name.toLowerCase() === 'mountain_list'
      ) || 'Mountain_list'
    }
    
    const actualCollection = db.collection(mountainListCollectionName)
    
    // 북한산 백운대 데이터
    const mountainData = {
      mntilistno: 113050202,
      mntiname: '북한산 백운대',
      mntiadd: '서울특별시',
      mntihigh: 836, // 백운대 높이 (대략)
      mntiadmin: '국립공원관리공단',
      center: {
        lat: 37.6584,
        lon: 126.9994
      },
      zoom: 13,
      code: '113050202',
      MNTN_CD: '113050202',
      MNTN_NM: '북한산 백운대',
      MNTN_LOC: '서울특별시',
      MNTN_HG: 836
    }
    
    // 이미 존재하는지 확인
    const existing = await actualCollection.findOne({
      $or: [
        { mntilistno: 113050202 },
        { code: '113050202' },
        { MNTN_CD: '113050202' }
      ]
    })
    
    if (existing) {
      console.log('이미 존재하는 산입니다. 업데이트합니다...')
      await actualCollection.updateOne(
        { mntilistno: 113050202 },
        { $set: mountainData }
      )
      console.log('산 정보 업데이트 완료')
    } else {
      await actualCollection.insertOne(mountainData)
      console.log('산 정보 추가 완료')
    }
    
    console.log('추가된 산 정보:', mountainData)
    
    await mongoose.disconnect()
    process.exit(0)
  } catch (error) {
    console.error('오류:', error)
    process.exit(1)
  }
}

addMountain()


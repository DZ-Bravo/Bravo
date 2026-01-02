const { MongoClient } = require('mongodb')

const MONGODB_URI = process.env.MONGODB_URI

let mongoClient = null

async function getMongoClient() {
  if (mongoClient) {
    return mongoClient
  }
  
  mongoClient = new MongoClient(MONGODB_URI)
  await mongoClient.connect()
  return mongoClient
}

exports.handler = async (event) => {
  try {
    const username = event.request.userAttributes['cognito:username'] || event.request.userAttributes.username
    
    // MongoDB에서 사용자 정보 조회
    let user = null
    try {
      const client = await getMongoClient()
      const db = client.db()
      const usersCollection = db.collection('users')
      
      user = await usersCollection.findOne({ id: username })
    } catch (mongoError) {
      console.error('MongoDB 조회 오류:', mongoError)
      // MongoDB 조회 실패해도 계속 진행
    }
    
    // 커스텀 클레임 추가
    const claimsToAddOrOverride = {}
    
    if (user) {
      claimsToAddOrOverride['custom:userId'] = user._id.toString()
      claimsToAddOrOverride['custom:userRole'] = user.role || 'user'
      claimsToAddOrOverride['custom:mongoId'] = user._id.toString()
    } else {
      // MongoDB에 사용자가 없으면 Cognito sub를 사용
      claimsToAddOrOverride['custom:userId'] = event.request.userAttributes.sub
      claimsToAddOrOverride['custom:userRole'] = 'user'
      claimsToAddOrOverride['custom:mongoId'] = event.request.userAttributes.sub
    }
    
    event.response.claimsOverrideDetails = {
      claimsToAddOrOverride: claimsToAddOrOverride
    }
    
    return event
  } catch (error) {
    console.error('Pre Token Generation 오류:', error)
    // 오류가 발생해도 기본 토큰은 발급
    return event
  }
}


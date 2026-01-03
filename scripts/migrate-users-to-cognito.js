#!/usr/bin/env node

/**
 * 기존 MongoDB 사용자를 Cognito로 마이그레이션하는 스크립트
 * 사용법: node scripts/migrate-users-to-cognito.js
 */

import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand } from '@aws-sdk/client-cognito-identity-provider'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hiking'
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID
const CLIENT_ID = process.env.COGNITO_CLIENT_ID
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2'

if (!USER_POOL_ID || !CLIENT_ID) {
  console.error('❌ COGNITO_USER_POOL_ID 또는 COGNITO_CLIENT_ID 환경 변수가 설정되지 않았습니다.')
  process.exit(1)
}

const cognitoClient = new CognitoIdentityProviderClient({ region: AWS_REGION })

// MongoDB 스키마 (간단한 버전)
const userSchema = new mongoose.Schema({
  id: String,
  name: String,
  email: String,
  password: String,
  gender: String,
  fitnessLevel: String,
  birthYear: Number,
  phone: String,
  profileImage: String,
  role: { type: String, default: 'user' }
}, { collection: 'users' })

const User = mongoose.model('User', userSchema)

async function migrateUsers() {
  try {
    console.log('📦 MongoDB 연결 중...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ MongoDB 연결 성공')
    
    console.log('👥 MongoDB 사용자 조회 중...')
    const users = await User.find({}).select('id name email password gender fitnessLevel birthYear phone profileImage role')
    console.log(`✅ ${users.length}명의 사용자 발견`)
    
    let successCount = 0
    let skipCount = 0
    let errorCount = 0
    
    for (const user of users) {
      try {
        // Cognito에 사용자가 이미 있는지 확인
        try {
          const { AdminGetUserCommand } = await import('@aws-sdk/client-cognito-identity-provider')
          const getUserCommand = new AdminGetUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: user.id
          })
          await cognitoClient.send(getUserCommand)
          console.log(`⏭️  사용자 ${user.id}는 이미 Cognito에 존재합니다. 건너뜁니다.`)
          skipCount++
          continue
        } catch (checkError) {
          if (checkError.name !== 'UserNotFoundException') {
            throw checkError
          }
          // UserNotFoundException이면 사용자가 없으므로 생성 진행
        }
        
        // Cognito 사용자 생성
        const createUserCommand = new AdminCreateUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: user.id,
          UserAttributes: [
            { Name: 'email', Value: user.email || `${user.id}@temp.com` },
            { Name: 'name', Value: user.name || user.id },
            { Name: 'custom:provider', Value: 'local' }
          ],
          MessageAction: 'SUPPRESS'
        })
        await cognitoClient.send(createUserCommand)
        console.log(`✅ Cognito 사용자 생성: ${user.id}`)
        
        // 비밀번호 설정 (MongoDB의 해시된 비밀번호는 사용할 수 없으므로, 임시 비밀번호 설정 후 사용자가 변경해야 함)
        // 또는 사용자에게 알림을 보내야 함
        // 여기서는 임시 비밀번호를 설정하되, 사용자가 다음 로그인 시 변경하도록 해야 함
        const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase()
        const setPasswordCommand = new AdminSetUserPasswordCommand({
          UserPoolId: USER_POOL_ID,
          Username: user.id,
          Password: tempPassword,
          Permanent: false // 사용자가 다음 로그인 시 비밀번호 변경 필요
        })
        await cognitoClient.send(setPasswordCommand)
        console.log(`⚠️  사용자 ${user.id}의 임시 비밀번호 설정됨. 사용자가 비밀번호를 변경해야 합니다.`)
        
        successCount++
      } catch (error) {
        console.error(`❌ 사용자 ${user.id} 마이그레이션 실패:`, error.message)
        errorCount++
      }
    }
    
    console.log('\n📊 마이그레이션 결과:')
    console.log(`   ✅ 성공: ${successCount}명`)
    console.log(`   ⏭️  건너뜀: ${skipCount}명`)
    console.log(`   ❌ 실패: ${errorCount}명`)
    console.log(`   📝 총: ${users.length}명`)
    
    await mongoose.disconnect()
    console.log('\n✅ 마이그레이션 완료')
  } catch (error) {
    console.error('❌ 마이그레이션 오류:', error)
    process.exit(1)
  }
}

migrateUsers()

import express from 'express'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import User from './shared/models/User.js'
import Post from './shared/models/Post.js'
import Comment from './shared/models/Comment.js'
import Schedule from './shared/models/Schedule.js'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import fs from 'fs'
import AWS from 'aws-sdk'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { createClient } from 'redis'
import { getMountainInfo } from './shared/utils/mountainRoutes.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = express.Router()

// JWT 시크릿 키 (환경 변수에서 가져오기)3
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

// 프로필 이미지 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // __dirname은 /app이므로 uploads/profiles는 /app/uploads/profiles
    const uploadDir = path.join(__dirname, 'uploads', 'profiles')
    
    console.log('=== Multer Destination 설정 ===')
    console.log('__dirname:', __dirname)
    console.log('uploadDir (절대 경로):', uploadDir)
    console.log('uploadDir exists:', fs.existsSync(uploadDir))
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
      console.log('디렉토리 생성됨:', uploadDir)
    }
    
    // 절대 경로를 명시적으로 전달
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB 제한
  },
  fileFilter: (req, file, cb) => {
    // 파일이 없으면 통과
    if (!file) {
      return cb(null, true)
    }
    
    const allowedTypes = /jpeg|jpg|png|gif/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)
    
    if (extname && mimetype) {
      return cb(null, true)
    } else {
      cb(new Error('이미지 파일만 업로드 가능합니다.'))
    }
  }
})

// ID 중복 체크
router.post('/check-id', async (req, res) => {
  try {
    const { id } = req.body
    
    if (!id) {
      return res.status(400).json({ error: 'ID를 입력해주세요.' })
    }
    
    // MongoDB 연결 확인
    if (mongoose.connection.readyState !== 1) {
      console.warn('MongoDB 연결되지 않음, ID 중복체크 불가')
      return res.status(503).json({ error: '데이터베이스 연결이 필요합니다.' })
    }
    
    const existingUser = await User.findOne({ id })
    
    if (existingUser) {
      return res.status(409).json({ error: '이미 사용 중인 ID입니다.' })
    }
    
    res.json({ message: '사용 가능한 ID입니다.', available: true })
  } catch (error) {
    console.error('ID 중복 체크 오류:', error)
    res.status(500).json({ error: '서버 오류가 발생했습니다.', details: error.message })
  }
})

// 이름/닉네임 중복 체크
router.post('/check-name', async (req, res) => {
  try {
    const { name } = req.body
    
    if (!name) {
      return res.status(400).json({ error: '이름/닉네임을 입력해주세요.' })
    }
    
    // MongoDB 연결 확인
    if (mongoose.connection.readyState !== 1) {
      console.warn('MongoDB 연결되지 않음, 이름/닉네임 중복체크 불가')
      return res.status(503).json({ error: '데이터베이스 연결이 필요합니다.' })
    }
    
    const existingUser = await User.findOne({ name })
    
    if (existingUser) {
      return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' })
    }
    
    res.json({ message: '사용 가능한 이름/닉네임입니다.', available: true })
  } catch (error) {
    console.error('이름/닉네임 중복 체크 오류:', error)
    res.status(500).json({ error: '서버 오류가 발생했습니다.', details: error.message })
  }
})

// AWS SES 초기화 (IRSA 사용 - 자격 증명 자동 인식)
const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'ap-northeast-2'
  // credentials를 명시하지 않으면 IRSA가 자동으로 자격 증명 제공
})

const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@hiker-cloud.site'

// 이메일 인증번호 전송 (회원가입용)
router.post('/send-email-verification', async (req, res) => {
  try {
    console.log('=== 이메일 인증번호 전송 요청 ===')
    console.log('요청 시간:', new Date().toISOString())
    console.log('req.body:', req.body)
    
    const { email } = req.body

    if (!email) {
      console.log('이메일 없음, 400 반환')
      return res.status(400).json({ error: '이메일을 입력해주세요.' })
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      console.log('이메일 형식 오류, 400 반환')
      return res.status(400).json({ error: '올바른 이메일 형식이 아닙니다.' })
    }

    // 회원가입 시에는 중복된 이메일 확인 (타임아웃 2초, 비동기 처리)
    console.log('MongoDB 사용자 확인 시작 (비동기):', email)
    let isEmailDuplicate = false
    
    // MongoDB 쿼리를 비동기로 실행 (응답을 막지 않음)
    Promise.race([
      User.findOne({ email }).maxTimeMS(2000).lean(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('MongoDB timeout')), 2000))
    ]).then(existingUser => {
      if (existingUser) {
        console.log('이미 사용 중인 이메일 발견 (비동기):', email)
        isEmailDuplicate = true
      } else {
        console.log('MongoDB 사용자 확인 완료: 중복 없음 (비동기)')
      }
    }).catch(mongoError => {
      console.warn('MongoDB 쿼리 실패 (비동기), 이메일 전송은 계속 진행:', mongoError.message)
      // MongoDB 쿼리 실패해도 이메일 전송은 계속 진행
    })

    // 인증번호 생성 (6자리)
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    console.log(`인증번호 생성 완료: ${code}`)
    
    // Redis에 저장 (비동기, 응답을 막지 않음)
    getRedisClient().then(client => {
      if (client) {
        const key = `verification:email:signup:${email}`
        client.setEx(key, 300, code).then(() => {
          console.log(`이메일 인증번호 Redis 저장 완료: ${email} -> ${code} (5분 TTL)`)
        }).catch(redisError => {
          console.warn('Redis 저장 실패, 이메일 전송은 계속 진행:', redisError.message)
        })
      } else {
        console.warn('Redis 연결 실패, 이메일 전송은 계속 진행 (Redis 없이 작동)')
      }
    }).catch(() => {
      console.warn('Redis 클라이언트 가져오기 실패, 이메일 전송은 계속 진행')
    })

    // AWS SES로 이메일 전송 (비동기로 처리하되, 응답은 즉시 반환)
    console.log('SES 이메일 전송 시작:', email)
    const sendEmailPromise = (async () => {
      try {
      const emailParams = {
        Source: `HIKER <${SES_FROM_EMAIL}>`,
        Destination: {
          ToAddresses: [email]
        },
        Message: {
          Subject: {
            Data: '[HIKER] 이메일 인증번호',
            Charset: 'UTF-8'
          },
          Body: {
            Html: {
              Data: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #333;">이메일 인증번호</h2>
                  <p>안녕하세요, HIKER입니다.</p>
                  <p>회원가입을 위한 이메일 인증번호는 다음과 같습니다:</p>
                  <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
                    <h1 style="color: #000; margin: 0; font-size: 32px; letter-spacing: 5px;">${code}</h1>
                  </div>
                  <p>이 인증번호는 5분간 유효합니다.</p>
                  <p style="color: #999; font-size: 12px; margin-top: 30px;">본인이 요청하지 않은 경우 이 이메일을 무시하셔도 됩니다.</p>
                </div>
              `,
              Charset: 'UTF-8'
            }
          }
        }
      }

        const command = new SendEmailCommand(emailParams)
        const result = await sesClient.send(command)

        console.log(`이메일 전송 성공: ${email}, Message ID: ${result.MessageId}`)
      } catch (emailError) {
        console.error('이메일 전송 오류:', emailError)
        // 에러는 로그만 남기고, 응답은 이미 전송됨
      }
    })()

    // 즉시 응답 반환 (이메일 전송은 백그라운드에서 진행)
    res.json({
      message: '인증번호가 전송되었습니다.',
      // 개발 환경에서만 인증번호 반환
      code: process.env.NODE_ENV === 'development' ? code : undefined
    })
    
    // 이메일 전송은 백그라운드에서 계속 진행
    sendEmailPromise.catch(emailError => {
      console.error('이메일 전송 오류 (백그라운드):', emailError)
      // AWS 자격 증명 오류인 경우
      if (emailError.name === 'InvalidClientTokenId' || emailError.name === 'UnrecognizedClientException') {
        console.error('AWS 자격 증명 오류:', emailError.message)
      }
      // SES Sandbox 모드에서는 인증된 이메일로만 전송 가능
      else if (emailError.name === 'MessageRejected' || emailError.message?.includes('Email address not verified')) {
        console.log('SES Sandbox 모드: 인증되지 않은 이메일 주소')
      }
      // 다른 오류인 경우
      else {
        console.error('SES 전송 실패:', emailError.message)
      }
    })
  } catch (error) {
    console.error('이메일 인증번호 전송 오류:', error)
    res.status(500).json({ error: '인증번호 전송 중 오류가 발생했습니다.' })
  }
})

// 이메일 인증번호 검증 (회원가입용)
router.post('/verify-email-code', async (req, res) => {
  try {
    const { email, verificationCode } = req.body

    if (!email || !verificationCode) {
      return res.status(400).json({ error: '이메일과 인증번호를 입력해주세요.' })
    }

    // Redis에서 인증번호 확인
    const client = await getRedisClient()
    if (!client) {
      return res.status(500).json({ error: '인증번호 확인에 실패했습니다.' })
    }

    const key = `verification:email:signup:${email}`
    const storedCode = await client.get(key)
    
    if (!storedCode) {
      return res.status(400).json({ error: '인증번호가 만료되었거나 존재하지 않습니다. 다시 요청해주세요.' })
    }

    if (storedCode !== verificationCode) {
      return res.status(400).json({ error: '인증번호가 일치하지 않습니다.' })
    }

    // 인증번호 확인 후 인증 완료 표시를 위한 키 설정 (회원가입 시 확인용)
    // 원래 키는 삭제하지 않고, 인증 완료 키도 별도로 설정
    const verifiedKey = `email-verification:${email}`
    await client.setEx(verifiedKey, 600, 'verified') // 10분간 유지 (회원가입 완료까지 충분한 시간)
    
    console.log(`이메일 인증 완료: ${email}, 인증 완료 키 설정: ${verifiedKey}`)
    
    res.json({
      message: '인증번호가 확인되었습니다.',
      verified: true
    })
  } catch (error) {
    console.error('이메일 인증번호 검증 오류:', error)
    res.status(500).json({ error: '인증번호 검증 중 오류가 발생했습니다.' })
  }
})

// 회원가입
router.post('/signup', upload.single('profileImage'), async (req, res) => {
  try {
    // 디버깅: 받은 데이터 확인
    console.log('=== 회원가입 요청 ===')
    console.log('req.body:', req.body)
    console.log('req.file:', req.file ? req.file.filename : '없음')
    
    const { id, name, password, confirmPassword, email, gender, fitnessLevel, birthYear } = req.body
    
    console.log('파싱된 필드:', {
      id: id || '없음',
      name: name || '없음',
      password: password ? '***' : '없음',
      confirmPassword: confirmPassword ? '***' : '없음',
      email: email || '없음',
      gender: gender || '없음',
      fitnessLevel: fitnessLevel || '없음',
      birthYear: birthYear || '없음'
    })
    
    // birthYear를 숫자로 변환
    const birthYearNum = birthYear ? parseInt(birthYear) : null
    
    // 필수 필드 검증 (빈 문자열도 체크)
    const isEmpty = (value) => !value || (typeof value === 'string' && value.trim() === '')
    
    if (isEmpty(id) || isEmpty(name) || isEmpty(password) || isEmpty(email) || isEmpty(gender) || isEmpty(fitnessLevel) || !birthYearNum || isNaN(birthYearNum)) {
      const missingFields = []
      if (isEmpty(id)) missingFields.push('ID')
      if (isEmpty(name)) missingFields.push('이름/닉네임')
      if (isEmpty(password)) missingFields.push('비밀번호')
      if (isEmpty(email)) missingFields.push('이메일')
      if (isEmpty(gender)) missingFields.push('성별')
      if (isEmpty(fitnessLevel)) missingFields.push('등력')
      if (!birthYearNum || isNaN(birthYearNum)) missingFields.push('출생년도')
      
      console.log('누락된 필드:', missingFields)
      console.log('실제 값:', { id, name, email, gender, fitnessLevel, birthYear, birthYearNum })
      
      return res.status(400).json({ 
        error: `다음 항목을 입력해주세요: ${missingFields.join(', ')}` 
      })
    }
    
    // 이메일 형식 검증
    if (!email.includes('@')) {
      return res.status(400).json({ error: '올바른 이메일 형식을 입력해주세요.' })
    }
    
    // 이메일 인증 여부 확인 (Redis에서 인증번호가 존재하는지 확인)
    const client = await getRedisClient()
    if (!client) {
      return res.status(500).json({ error: '회원가입에 실패했습니다. (Redis 연결 오류)' })
    }
    const emailRedisKey = `email-verification:${email}`
    const isEmailVerifiedInRedis = await client.get(emailRedisKey)
    if (!isEmailVerifiedInRedis) {
      return res.status(400).json({ error: '이메일 인증을 완료해주세요.' })
    }
    
    // 비밀번호 길이 검증
    if (password.length < 6) {
      return res.status(400).json({ error: '비밀번호는 최소 6자 이상이어야 합니다.' })
    }
    
    // 비밀번호 확인
    if (password !== confirmPassword) {
      return res.status(400).json({ error: '비밀번호가 일치하지 않습니다.' })
    }
    
    // ID 중복 체크
    const existingUser = await User.findOne({ id })
    if (existingUser) {
      return res.status(409).json({ error: '이미 사용 중인 ID입니다.' })
    }
    
    // 프로필 이미지 경로 처리
    let profileImagePath = null
    if (req.file) {
      profileImagePath = `/uploads/profiles/${req.file.filename}`
      
      // 파일 메타데이터를 MongoDB에 저장
      try {
        const mongoose = await import('mongoose')
        const db = mongoose.default.connection.db
        const profileFilesCollection = db.collection('profile_files')
        
        await profileFilesCollection.insertOne({
          filename: req.file.filename,
          path: `/uploads/profiles/${req.file.filename}`,
          size: req.file.size,
          uploadedAt: new Date(),
          type: 'profile',
          createdAt: new Date()
        })
        console.log(`[파일 메타데이터] 프로필 이미지 메타데이터 저장 완료: ${req.file.filename}`)
      } catch (error) {
        console.error('[파일 메타데이터] 저장 실패 (무시됨):', error.message)
      }
      const actualFilePath = path.join(req.file.destination, req.file.filename)
      console.log('=== 프로필 이미지 업로드 (회원가입) ===')
      console.log('파일명:', req.file.filename)
      console.log('destination:', req.file.destination)
      console.log('req.file.path:', req.file.path)
      console.log('실제 파일 경로:', actualFilePath)
      console.log('DB 저장 경로:', profileImagePath)
      console.log('파일 존재 확인 (req.file.path):', fs.existsSync(req.file.path))
      console.log('파일 존재 확인 (actualFilePath):', fs.existsSync(actualFilePath))
      console.log('파일 크기:', req.file.size, 'bytes')
      
      // 파일이 실제로 존재하는지 확인
      if (!fs.existsSync(actualFilePath)) {
        console.error('❌ 파일이 저장되지 않았습니다!')
        console.error('예상 경로:', actualFilePath)
        // 디렉토리 내용 확인
        try {
          const files = fs.readdirSync(req.file.destination)
          console.error('디렉토리 내용:', files)
        } catch (err) {
          console.error('디렉토리 읽기 실패:', err.message)
        }
      } else {
        console.log('✅ 파일이 정상적으로 저장되었습니다.')
      }
    }
    
    // 이름/닉네임 중복 체크
    const existingNameUser = await User.findOne({ name })
    if (existingNameUser) {
      return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' })
    }
    
    // 사용자 생성
    const user = new User({
      id,
      name,
      password,
      email: email.trim(),
      gender,
      fitnessLevel,
      birthYear: birthYearNum,
      phone: req.body.phone || '',
      profileImage: profileImagePath
    })
    
    try {
      await user.save()
    } catch (error) {
      console.error('사용자 저장 오류:', error)
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(err => {
          if (err.path === 'password' && err.kind === 'minlength') {
            return '비밀번호는 최소 6자 이상이어야 합니다.'
          }
          return err.message
        })
        return res.status(400).json({ 
          error: validationErrors.join(', ') 
        })
      }
      return res.status(500).json({ 
        error: '회원가입 중 오류가 발생했습니다.',
        details: error.message 
      })
    }
    
    // 회원가입 완료 시 이메일 인증번호 삭제
    await client.del(emailRedisKey)
    console.log(`회원가입 완료 - 이메일 인증번호 삭제: ${email}`)
    
    // Cognito에 사용자 생성
    let cognitoTokens = null
    try {
      const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, InitiateAuthCommand } = await import('@aws-sdk/client-cognito-identity-provider')
      const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'ap-northeast-2' })
      const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID
      const CLIENT_ID = process.env.COGNITO_CLIENT_ID
      
      if (USER_POOL_ID && CLIENT_ID) {
        // Cognito User Pool이 UsernameAttributes: email로 설정되어 있으므로 email을 username으로 사용
        const cognitoUsername = email.trim()
        
        // Cognito 사용자 생성
        const createUserCommand = new AdminCreateUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: cognitoUsername, // email을 username으로 사용
          UserAttributes: [
            { Name: 'email', Value: email.trim() },
            { Name: 'name', Value: name },
            { Name: 'custom:provider', Value: 'local' },
            { Name: 'custom:userId', Value: id } // MongoDB ID를 custom attribute로 저장
          ],
          MessageAction: 'SUPPRESS' // 이메일 인증 스킵 (이미 이메일 인증 완료)
        })
        await cognitoClient.send(createUserCommand)
        console.log(`Cognito 사용자 생성 완료: ${cognitoUsername} (MongoDB ID: ${id})`)
        
        // 비밀번호 설정
        const setPasswordCommand = new AdminSetUserPasswordCommand({
          UserPoolId: USER_POOL_ID,
          Username: cognitoUsername, // email을 username으로 사용
          Password: password,
          Permanent: true
        })
        await cognitoClient.send(setPasswordCommand)
        console.log(`Cognito 비밀번호 설정 완료: ${cognitoUsername}`)
        
        // Cognito 로그인하여 토큰 획득
        const authCommand = new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: CLIENT_ID,
          AuthParameters: {
            USERNAME: cognitoUsername, // email을 username으로 사용
            PASSWORD: password
          }
        })
        const authResponse = await cognitoClient.send(authCommand)
        
        if (authResponse.AuthenticationResult) {
          cognitoTokens = {
            idToken: authResponse.AuthenticationResult.IdToken,
            accessToken: authResponse.AuthenticationResult.AccessToken,
            refreshToken: authResponse.AuthenticationResult.RefreshToken
          }
          console.log(`Cognito 토큰 획득 완료: ${id}`)
        }
      } else {
        console.warn('Cognito 환경 변수가 설정되지 않아 Cognito 사용자 생성을 건너뜁니다.')
      }
    } catch (cognitoError) {
      console.error('Cognito 사용자 생성 오류:', cognitoError)
      // Cognito 오류가 발생해도 MongoDB 저장은 완료되었으므로 계속 진행
      // 단, 로그는 남김
    }
    
    // 응답 반환 (Cognito 토큰이 있으면 Cognito 토큰, 없으면 JWT 토큰)
    if (cognitoTokens) {
      res.status(201).json({
        message: '회원가입이 완료되었습니다.',
        idToken: cognitoTokens.idToken,
        accessToken: cognitoTokens.accessToken,
        refreshToken: cognitoTokens.refreshToken,
        user: {
          id: user.id,
          name: user.name,
          gender: user.gender,
          fitnessLevel: user.fitnessLevel,
          profileImage: user.profileImage,
          role: user.role || 'user'
        }
      })
    } else {
      // Cognito 토큰이 없으면 JWT 토큰 반환 (하위 호환성)
      const token = jwt.sign(
        { userId: user._id, id: user.id, role: user.role || 'user' },
        JWT_SECRET,
        { expiresIn: '7d' }
      )
      res.status(201).json({
        message: '회원가입이 완료되었습니다.',
        token,
        user: {
          id: user.id,
          name: user.name,
          gender: user.gender,
          fitnessLevel: user.fitnessLevel,
          profileImage: user.profileImage,
          role: user.role || 'user'
        }
      })
    }
  } catch (error) {
    console.error('회원가입 오류:', error)
    if (error.code === 11000) {
      return res.status(409).json({ error: '이미 사용 중인 ID입니다.' })
    }
    res.status(500).json({ error: '회원가입 중 오류가 발생했습니다.' })
  }
})

// 로그인 (Cognito 사용)
router.post('/login', async (req, res) => {
  try {
    const { id, password } = req.body
    
    if (!id || !password) {
      return res.status(400).json({ error: 'ID와 비밀번호를 입력해주세요.' })
    }
    
    // Cognito User Pool이 UsernameAttributes: email로 설정되어 있으므로
    // 먼저 MongoDB에서 사용자를 찾아 email을 가져와야 함
    const user = await User.findOne({ id })
    if (!user) {
      return res.status(401).json({ error: 'ID 또는 비밀번호가 올바르지 않습니다.' })
    }
    
    // email을 username으로 사용 (email이 없으면 Cognito 로그인 시도하지 않음)
    const cognitoUsername = user.email
    
    // email이 없으면 Cognito 로그인 시도하지 않고 MongoDB로 직접 로그인
    if (!cognitoUsername) {
      console.log(`사용자 email이 없음: ${id}, MongoDB로 직접 로그인 시도`)
      // 비밀번호 확인
      const bcrypt = await import('bcryptjs')
      const isPasswordValid = await bcrypt.default.compare(password, user.password)
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'ID 또는 비밀번호가 올바르지 않습니다.' })
      }
      
      // JWT 토큰 생성
      const token = jwt.sign(
        { userId: user._id, id: user.id, role: user.role || 'user' },
        JWT_SECRET,
        { expiresIn: '7d' }
      )
      
      return res.json({
        message: '로그인 성공 (MongoDB)',
        token,
        user: {
          id: user.id,
          name: user.name,
          gender: user.gender,
          fitnessLevel: user.fitnessLevel,
          profileImage: user.profileImage,
          role: user.role || 'user'
        }
      })
    }
    
    // Cognito 로그인
    const { CognitoIdentityProviderClient, InitiateAuthCommand } = await import('@aws-sdk/client-cognito-identity-provider')
    const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'ap-northeast-2' })
    const CLIENT_ID = process.env.COGNITO_CLIENT_ID
    
    if (!CLIENT_ID) {
      console.error('COGNITO_CLIENT_ID 환경 변수가 설정되지 않았습니다.')
      return res.status(500).json({ error: '인증 서비스 설정 오류가 발생했습니다.' })
    }
    
    try {
      const command = new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: {
          USERNAME: cognitoUsername, // email을 username으로 사용
          PASSWORD: password
        }
      })
      
      const response = await cognitoClient.send(command)
      
      res.json({
        message: '로그인 성공',
        AccessToken: response.AuthenticationResult.AccessToken,
        RefreshToken: response.AuthenticationResult.RefreshToken,
        IdToken: response.AuthenticationResult.IdToken,
        user: {
          id: user.id,
          name: user.name,
          gender: user.gender,
          fitnessLevel: user.fitnessLevel,
          profileImage: user.profileImage,
          role: user.role || 'user'
        }
      })
    } catch (cognitoError) {
      console.error('Cognito 로그인 오류:', cognitoError)
      console.error('Cognito 오류 상세:', {
        name: cognitoError.name,
        message: cognitoError.message,
        code: cognitoError.code
      })
      
      // Cognito에 사용자가 없거나 인증 실패한 경우, MongoDB로 폴백 (기존 사용자 지원)
      // UserNotFoundException: Cognito에 사용자가 없음
      // NotAuthorizedException: Cognito에 사용자가 있지만 비밀번호가 틀림 (하지만 Cognito 전 회원은 Cognito에 없을 수 있으므로 폴백 시도)
      if (cognitoError.name === 'UserNotFoundException' || cognitoError.name === 'NotAuthorizedException') {
        console.log(`Cognito 로그인 실패 (${cognitoError.name}): ${cognitoUsername}, MongoDB로 폴백 시도`)
        
        // 비밀번호 확인
        const bcrypt = await import('bcryptjs')
        const isPasswordValid = await bcrypt.default.compare(password, user.password)
        if (!isPasswordValid) {
          return res.status(401).json({ error: 'ID 또는 비밀번호가 올바르지 않습니다.' })
        }
        
        // JWT 토큰 생성 (하위 호환성)
        const token = jwt.sign(
          { userId: user._id, id: user.id, role: user.role || 'user' },
          JWT_SECRET,
          { expiresIn: '7d' }
        )
        
        // Cognito에 사용자 생성 시도 (백그라운드) - UserNotFoundException인 경우만
        if (cognitoError.name === 'UserNotFoundException') {
          try {
            const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand } = await import('@aws-sdk/client-cognito-identity-provider')
            const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'ap-northeast-2' })
            const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID
            const CLIENT_ID = process.env.COGNITO_CLIENT_ID
            
            if (USER_POOL_ID && CLIENT_ID && cognitoUsername) {
              // 비동기로 Cognito에 사용자 생성 (응답을 막지 않음)
              Promise.resolve().then(async () => {
                try {
                  const createUserCommand = new AdminCreateUserCommand({
                    UserPoolId: USER_POOL_ID,
                    Username: cognitoUsername, // email을 username으로 사용
                    UserAttributes: [
                      { Name: 'email', Value: user.email || `${user.id}@temp.com` },
                      { Name: 'name', Value: user.name || user.id },
                      { Name: 'custom:provider', Value: 'local' },
                      { Name: 'custom:userId', Value: user.id } // MongoDB ID를 custom attribute로 저장
                    ],
                    MessageAction: 'SUPPRESS'
                  })
                  await cognitoClient.send(createUserCommand)
                  
                  const setPasswordCommand = new AdminSetUserPasswordCommand({
                    UserPoolId: USER_POOL_ID,
                    Username: cognitoUsername, // email을 username으로 사용
                    Password: password,
                    Permanent: true
                  })
                  await cognitoClient.send(setPasswordCommand)
                  console.log(`기존 사용자 Cognito 마이그레이션 완료: ${cognitoUsername} (MongoDB ID: ${user.id})`)
                } catch (migrationError) {
                  console.error(`기존 사용자 Cognito 마이그레이션 실패: ${cognitoUsername}`, migrationError)
                }
              })
            }
          } catch (migrationSetupError) {
            console.error('Cognito 마이그레이션 설정 오류:', migrationSetupError)
          }
        }
        
        return res.json({
          message: '로그인 성공 (MongoDB)',
          token,
          user: {
            id: user.id,
            name: user.name,
            gender: user.gender,
            fitnessLevel: user.fitnessLevel,
            profileImage: user.profileImage,
            role: user.role || 'user'
          }
        })
      }
      
      if (cognitoError.name === 'UserNotConfirmedException') {
        return res.status(401).json({ error: '이메일 인증이 완료되지 않았습니다.' })
      }
      
      // 기타 Cognito 오류는 500 에러로 반환
      throw cognitoError
    }
  } catch (error) {
    console.error('로그인 오류:', error)
    res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' })
  }
})

// AWS SNS 설정
const sns = new AWS.SNS({
  region: process.env.AWS_REGION || 'ap-northeast-2',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
})

// Redis 클라이언트 (인증번호 저장용)
let redisClient = null
let redisConnecting = false

const getRedisClient = async () => {
  if (redisClient && redisClient.isOpen) {
    return redisClient
  }
  
  if (redisConnecting) {
    await new Promise(resolve => setTimeout(resolve, 100))
    return getRedisClient()
  }
  
  if (!redisClient) {
    redisConnecting = true
    try {
      redisClient = createClient({
        socket: {
          host: process.env.REDIS_HOST || 'redis',
          port: parseInt(process.env.REDIS_PORT || '6379')
        }
      })
      redisClient.on('error', (err) => {
        console.error('Redis 오류:', err)
        redisClient = null
        redisConnecting = false
      })
      redisClient.on('connect', () => {
        console.log('Redis 연결 성공 (auth.js)')
        redisConnecting = false
      })
      await redisClient.connect()
      redisConnecting = false
      return redisClient
    } catch (error) {
      console.error('Redis 연결 실패:', error)
      redisClient = null
      redisConnecting = false
      return null
    }
  }
  
  return redisClient
}

// 회원가입용 인증번호 전송 (기존 회원 확인 없음)
router.post('/send-verification-code-signup', async (req, res) => {
  try {
    const { phone } = req.body

    if (!phone) {
      return res.status(400).json({ error: '휴대폰 번호를 입력해주세요.' })
    }

    // 휴대폰 번호 형식 검증
    const phoneRegex = /^010-\d{4}-\d{4}$/
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ error: '올바른 휴대폰 번호 형식이 아닙니다. (010-1111-2222)' })
    }

    // 회원가입 시에는 중복된 휴대폰 번호 확인
    const existingUser = await User.findOne({ phone })
    if (existingUser) {
      return res.status(409).json({ error: '이미 사용 중인 휴대폰 번호입니다.' })
    }

    // 인증번호 생성 (6자리)
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    
    // Redis에 저장 (5분 TTL - 자동 만료)
    const client = await getRedisClient()
    if (client) {
      const key = `verification:signup:${phone}`
      await client.setEx(key, 300, code) // 5분 = 300초, TTL 설정으로 자동 삭제
      console.log(`회원가입 인증번호 Redis 저장: ${phone} -> ${code} (5분 TTL)`)
    } else {
      console.warn('Redis 연결 실패, 이메일 전송은 계속 진행 (Redis 없이 작동)')
      // Redis 연결 실패해도 이메일 전송은 계속 진행
    }

    // AWS SNS로 SMS 전송
    try {
      // 하이픈 제거하고 국가 코드 추가 (한국: +82)
      // 010-1234-5678 → +821012345678
      const phoneNumber = `+82${phone.replace(/-/g, '').substring(1)}`
      const message = `[오늘의 등산] 인증번호는 ${code}입니다. 5분 내에 입력해주세요.`
      
      console.log(`SMS 전송 시도: ${phoneNumber}`)
      
      const result = await sns.publish({
        PhoneNumber: phoneNumber,
        Message: message
      }).promise()
      
      console.log(`SMS 전송 성공: ${result.MessageId}`)
      
      res.json({
        message: '인증번호가 전송되었습니다.',
        // 개발 환경에서만 인증번호 반환 (실제 운영에서는 제거)
        code: process.env.NODE_ENV === 'development' ? code : undefined
      })
    } catch (snsError) {
      console.error('SNS 전송 오류:', snsError)
      console.error('SNS 오류 상세:', {
        code: snsError.code,
        message: snsError.message,
        statusCode: snsError.statusCode,
        requestId: snsError.requestId,
        stack: snsError.stack
      })
      
      // Sandbox 모드 오류 확인
      if (snsError.code === 'OptedOut' || snsError.message?.includes('sandbox') || snsError.message?.includes('Sandbox')) {
        return res.status(400).json({ 
          error: 'SMS 전송 실패: AWS SNS Sandbox 모드입니다. AWS 콘솔에서 Production 모드로 전환하거나 Sandbox에서 번호를 인증해주세요.',
          details: snsError.message,
          code: process.env.NODE_ENV === 'development' ? code : undefined
        })
      }
      
      // SNS 전송 실패해도 인증번호는 생성되었으므로 개발 환경에서는 반환
      res.json({
        message: '인증번호가 전송되었습니다.',
        code: process.env.NODE_ENV === 'development' ? code : undefined,
        warning: `SMS 전송 중 오류가 발생했습니다: ${snsError.message}. 개발 모드에서는 인증번호를 확인할 수 있습니다.`
      })
    }
  } catch (error) {
    console.error('회원가입 인증번호 전송 오류:', error)
    res.status(500).json({ error: '인증번호 전송 중 오류가 발생했습니다.' })
  }
})

// 회원가입용 인증번호 검증
router.post('/verify-code-signup', async (req, res) => {
  try {
    const { phone, verificationCode } = req.body

    if (!phone || !verificationCode) {
      return res.status(400).json({ error: '휴대폰 번호와 인증번호를 입력해주세요.' })
    }

    // Redis에서 인증번호 확인
    const client = await getRedisClient()
    if (!client) {
      return res.status(500).json({ error: '인증번호 확인에 실패했습니다.' })
    }

    const key = `verification:signup:${phone}`
    const storedCode = await client.get(key)
    
    if (!storedCode) {
      return res.status(400).json({ error: '인증번호가 만료되었거나 존재하지 않습니다. 다시 요청해주세요.' })
    }

    if (storedCode !== verificationCode) {
      return res.status(400).json({ error: '인증번호가 일치하지 않습니다.' })
    }

    // 인증번호 확인 후 삭제하지 않음 (회원가입 완료 시까지 유지)
    // 회원가입 완료 시 삭제됨
    
    res.json({
      message: '인증번호가 확인되었습니다.',
      verified: true
    })
  } catch (error) {
    console.error('회원가입 인증번호 검증 오류:', error)
    res.status(500).json({ error: '인증번호 검증 중 오류가 발생했습니다.' })
  }
})

// 아이디 찾기용 이메일 인증번호 전송
router.post('/send-email-verification-find-id', async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: '이메일을 입력해주세요.' })
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: '올바른 이메일 형식이 아닙니다.' })
    }

    // 인증번호 생성 (6자리)
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    console.log(`아이디 찾기 인증번호 생성 완료: ${code}`)
    
    // Redis에 저장 (비동기, 응답을 막지 않음)
    getRedisClient().then(client => {
      if (client) {
        const key = `verification:email:find-id:${email}`
        client.setEx(key, 300, code).then(() => {
          console.log(`아이디 찾기 이메일 인증번호 Redis 저장 완료: ${email} -> ${code} (5분 TTL)`)
        }).catch(redisError => {
          console.warn('Redis 저장 실패, 이메일 전송은 계속 진행:', redisError.message)
        })
      } else {
        console.warn('Redis 연결 실패, 이메일 전송은 계속 진행 (Redis 없이 작동)')
      }
    }).catch(() => {
      console.warn('Redis 클라이언트 가져오기 실패, 이메일 전송은 계속 진행')
    })

    // AWS SES로 이메일 전송 (비동기로 처리하되, 응답은 즉시 반환)
    console.log('SES 이메일 전송 시작 (아이디 찾기):', email)
    const sendEmailPromise = (async () => {
      try {
        const emailParams = {
          Source: `HIKER <${SES_FROM_EMAIL}>`,
          Destination: {
            ToAddresses: [email]
          },
          Message: {
            Subject: {
              Data: '[HIKER] 아이디 찾기 인증번호',
              Charset: 'UTF-8'
            },
            Body: {
              Html: {
                Data: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">아이디 찾기 인증번호</h2>
                    <p>안녕하세요, HIKER입니다.</p>
                    <p>아이디 찾기를 위한 이메일 인증번호는 다음과 같습니다:</p>
                    <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
                      <h1 style="color: #000; margin: 0; font-size: 32px; letter-spacing: 5px;">${code}</h1>
                    </div>
                    <p>이 인증번호는 5분간 유효합니다.</p>
                    <p style="color: #999; font-size: 12px; margin-top: 30px;">본인이 요청하지 않은 경우 이 이메일을 무시하셔도 됩니다.</p>
                  </div>
                `,
                Charset: 'UTF-8'
              }
            }
          }
        }

        const command = new SendEmailCommand(emailParams)
        const result = await sesClient.send(command)

        console.log(`이메일 전송 성공 (아이디 찾기): ${email}, Message ID: ${result.MessageId}`)
      } catch (emailError) {
        console.error('이메일 전송 오류 (아이디 찾기):', emailError)
        // 에러는 로그만 남기고, 응답은 이미 전송됨
      }
    })()

    // 즉시 응답 반환 (이메일 전송은 백그라운드에서 진행)
    res.json({
      message: '인증번호가 전송되었습니다.',
      code: process.env.NODE_ENV === 'development' ? code : undefined
    })
    
    // 이메일 전송은 백그라운드에서 계속 진행
    sendEmailPromise.catch(emailError => {
      console.error('이메일 전송 오류 (백그라운드, 아이디 찾기):', emailError)
      // AWS 자격 증명 오류인 경우
      if (emailError.name === 'InvalidClientTokenId' || emailError.name === 'UnrecognizedClientException') {
        console.error('AWS 자격 증명 오류:', emailError.message)
      }
      // SES Sandbox 모드에서는 인증된 이메일로만 전송 가능
      else if (emailError.name === 'MessageRejected' || emailError.message?.includes('Email address not verified')) {
        console.log('SES Sandbox 모드: 인증되지 않은 이메일 주소')
      }
      // 다른 오류인 경우
      else {
        console.error('SES 전송 실패:', emailError.message)
      }
    })
  } catch (error) {
    console.error('이메일 인증번호 전송 오류:', error)
    res.status(500).json({ error: '인증번호 전송 중 오류가 발생했습니다.' })
  }
})

// 아이디 찾기용 이메일 인증번호 검증
router.post('/verify-email-code-find-id', async (req, res) => {
  try {
    const { email, verificationCode } = req.body

    if (!email || !verificationCode) {
      return res.status(400).json({ error: '이메일과 인증번호를 입력해주세요.' })
    }

    // Redis에서 인증번호 확인
    const client = await getRedisClient()
    if (!client) {
      return res.status(500).json({ error: '인증번호 확인에 실패했습니다.' })
    }

    const key = `verification:email:find-id:${email}`
    const storedCode = await client.get(key)
    
    if (!storedCode) {
      return res.status(400).json({ error: '인증번호가 만료되었거나 존재하지 않습니다. 다시 요청해주세요.' })
    }

    if (storedCode !== verificationCode) {
      return res.status(400).json({ error: '인증번호가 일치하지 않습니다.' })
    }

    // 인증번호 확인 후 인증 완료 표시를 위한 키 설정
    const verifiedKey = `email-verification:find-id:${email}`
    await client.setEx(verifiedKey, 600, 'verified') // 10분간 유지
    
    console.log(`아이디 찾기 이메일 인증 완료: ${email}, 인증 완료 키 설정: ${verifiedKey}`)
    
    res.json({
      message: '인증번호가 확인되었습니다.',
      verified: true
    })
  } catch (error) {
    console.error('이메일 인증번호 검증 오류:', error)
    res.status(500).json({ error: '인증번호 검증 중 오류가 발생했습니다.' })
  }
})

// 아이디 찾기 (이메일 인증)
router.post('/find-id', async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: '이메일을 입력해주세요.' })
    }

    // 이메일 인증 여부 확인 (Redis에서 인증 완료 키 확인)
    const client = await getRedisClient()
    if (!client) {
      return res.status(500).json({ error: '인증 확인에 실패했습니다. (Redis 연결 오류)' })
    }

    const verifiedKey = `email-verification:find-id:${email}`
    const isEmailVerified = await client.get(verifiedKey)
    
    if (!isEmailVerified) {
      return res.status(400).json({ error: '이메일 인증을 완료해주세요.' })
    }

    // 사용자 찾기
    const user = await User.findOne({ email })
      .select('id name createdAt')

    if (!user) {
      // 인증은 완료되었지만 사용자가 없는 경우
      return res.status(404).json({ error: '존재하는 아이디가 없습니다.' })
    }

    // 인증 완료 키 삭제
    await client.del(verifiedKey)

    res.json({
      message: '아이디를 찾았습니다.',
      id: user.id,
      createdAt: user.createdAt
    })
  } catch (error) {
    console.error('아이디 찾기 오류:', error)
    res.status(500).json({ error: '아이디 찾기 중 오류가 발생했습니다.' })
  }
})

// 비밀번호 찾기용 이메일 인증번호 전송
router.post('/send-email-verification-password', async (req, res) => {
  try {
    const { id, email } = req.body

    if (!id || !email) {
      return res.status(400).json({ error: 'ID와 이메일을 입력해주세요.' })
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: '올바른 이메일 형식이 아닙니다.' })
    }

    // 아이디로 사용자 확인
    const userById = await User.findOne({ id })
    if (!userById) {
      return res.status(404).json({ error: '해당 아이디가 없습니다.' })
    }

    // 이메일로 사용자 확인
    const userByEmail = await User.findOne({ email })
    if (!userByEmail) {
      return res.status(404).json({ error: '해당 이메일이 없습니다.' })
    }

    // 아이디와 이메일이 같은 사용자에게 속하는지 확인
    if (userById._id.toString() !== userByEmail._id.toString()) {
      return res.status(400).json({ error: '아이디와 이메일이 일치하지 않습니다.' })
    }

    // 인증번호 생성 (6자리)
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    
    // Redis에 저장 (5분 TTL - 자동 만료)
    const client = await getRedisClient()
    if (client) {
      const redisKey = `verification:email:password:${id}:${email}`
      await client.setEx(redisKey, 300, code) // 5분 = 300초, TTL 설정으로 자동 삭제
      console.log(`비밀번호 찾기 이메일 인증번호 Redis 저장: ${id} / ${email} -> ${code} (5분 TTL)`)
    } else {
      console.warn('Redis 연결 실패, 이메일 전송은 계속 진행 (Redis 없이 작동)')
      // Redis 연결 실패해도 이메일 전송은 계속 진행
    }

    // AWS SES로 이메일 전송
    try {
      const emailParams = {
        Source: `HIKER <${SES_FROM_EMAIL}>`,
        Destination: {
          ToAddresses: [email]
        },
        Message: {
          Subject: {
            Data: '[HIKER] 비밀번호 찾기 인증번호',
            Charset: 'UTF-8'
          },
          Body: {
            Html: {
              Data: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #333;">비밀번호 찾기 인증번호</h2>
                  <p>안녕하세요, HIKER입니다.</p>
                  <p>비밀번호 찾기를 위한 이메일 인증번호는 다음과 같습니다:</p>
                  <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
                    <h1 style="color: #000; margin: 0; font-size: 32px; letter-spacing: 5px;">${code}</h1>
                  </div>
                  <p>이 인증번호는 5분간 유효합니다.</p>
                  <p style="color: #999; font-size: 12px; margin-top: 30px;">본인이 요청하지 않은 경우 이 이메일을 무시하셔도 됩니다.</p>
                </div>
              `,
              Charset: 'UTF-8'
            }
          }
        }
      }

      const command = new SendEmailCommand(emailParams)
      const result = await sesClient.send(command)

      console.log(`이메일 전송 성공: ${email}, Message ID: ${result.MessageId}`)
      
      res.json({
        message: '인증번호가 전송되었습니다.',
        code: process.env.NODE_ENV === 'development' ? code : undefined
      })
    } catch (emailError) {
      console.error('이메일 전송 오류:', emailError)
      // AWS 자격 증명 오류인 경우
      if (emailError.name === 'InvalidClientTokenId' || emailError.name === 'UnrecognizedClientException') {
        console.error('AWS 자격 증명 오류:', emailError.message)
        return res.status(500).json({ 
          error: '이메일 전송 서비스 설정 오류가 발생했습니다. 관리자에게 문의해주세요.',
          details: 'AWS 자격 증명 오류'
        })
      }
      // SES Sandbox 모드에서는 인증된 이메일로만 전송 가능
      if (emailError.name === 'MessageRejected' || emailError.message?.includes('Email address not verified')) {
        console.log('SES Sandbox 모드: 인증되지 않은 이메일 주소')
        return res.status(400).json({
          error: '이메일 전송에 실패했습니다. (SES Sandbox 모드: 인증된 이메일로만 전송 가능)',
          code: process.env.NODE_ENV === 'development' ? code : undefined
        })
      }
      // 다른 오류인 경우
      console.error('SES 전송 실패:', emailError.message)
      return res.status(500).json({ 
        error: '이메일 전송에 실패했습니다. 잠시 후 다시 시도해주세요.',
        details: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      })
    }
  } catch (error) {
    console.error('이메일 인증번호 전송 오류:', error)
    res.status(500).json({ error: '인증번호 전송 중 오류가 발생했습니다.' })
  }
})

// 비밀번호 찾기용 이메일 인증번호 검증
router.post('/verify-email-code-password', async (req, res) => {
  try {
    const { id, email, verificationCode } = req.body

    if (!id || !email || !verificationCode) {
      return res.status(400).json({ error: 'ID, 이메일, 인증번호를 모두 입력해주세요.' })
    }

    // Redis에서 인증번호 확인
    const client = await getRedisClient()
    if (!client) {
      return res.status(500).json({ error: '인증번호 확인에 실패했습니다.' })
    }

    const redisKey = `verification:email:password:${id}:${email}`
    const storedCode = await client.get(redisKey)
    
    if (!storedCode) {
      return res.status(400).json({ error: '인증번호가 만료되었거나 존재하지 않습니다. 다시 요청해주세요.' })
    }

    if (storedCode !== verificationCode) {
      return res.status(400).json({ error: '인증번호가 일치하지 않습니다.' })
    }

    // 아이디와 이메일로 사용자 확인
    const userById = await User.findOne({ id })
    if (!userById) {
      return res.status(404).json({ error: '해당 아이디가 없습니다.' })
    }

    const userByEmail = await User.findOne({ email })
    if (!userByEmail) {
      return res.status(404).json({ error: '해당 이메일이 없습니다.' })
    }

    // 아이디와 이메일이 같은 사용자에게 속하는지 확인
    if (userById._id.toString() !== userByEmail._id.toString()) {
      return res.status(400).json({ error: '아이디와 이메일이 일치하지 않습니다.' })
    }

    // 인증번호 확인 후 인증 완료 표시를 위한 키 설정
    const verifiedKey = `email-verification:password:${id}:${email}`
    await client.setEx(verifiedKey, 600, 'verified') // 10분간 유지
    
    console.log(`비밀번호 찾기 이메일 인증 완료: ${id} / ${email}, 인증 완료 키 설정: ${verifiedKey}`)
    
    res.json({
      message: '인증번호가 확인되었습니다.',
      verified: true
    })
  } catch (error) {
    console.error('이메일 인증번호 검증 오류:', error)
    res.status(500).json({ error: '인증번호 검증 중 오류가 발생했습니다.' })
  }
})

// 비밀번호 재설정
router.post('/reset-password', async (req, res) => {
  try {
    const { id, email, newPassword } = req.body

    if (!id || !email || !newPassword) {
      return res.status(400).json({ error: 'ID, 이메일, 새 비밀번호를 모두 입력해주세요.' })
    }

    // 비밀번호 길이 검증
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '비밀번호는 최소 6자 이상이어야 합니다.' })
    }

    // 이메일 인증 여부 확인 (Redis에서 인증 완료 키 확인)
    const client = await getRedisClient()
    if (!client) {
      return res.status(500).json({ error: '인증 확인에 실패했습니다. (Redis 연결 오류)' })
    }

    const verifiedKey = `email-verification:password:${id}:${email}`
    const isEmailVerified = await client.get(verifiedKey)
    
    if (!isEmailVerified) {
      return res.status(400).json({ error: '이메일 인증을 완료해주세요.' })
    }

    // 아이디로 사용자 확인
    const userById = await User.findOne({ id })
    if (!userById) {
      return res.status(404).json({ error: '해당 아이디가 없습니다.' })
    }

    // 이메일로 사용자 확인
    const userByEmail = await User.findOne({ email })
    if (!userByEmail) {
      return res.status(404).json({ error: '해당 이메일이 없습니다.' })
    }

    // 아이디와 이메일이 같은 사용자에게 속하는지 확인
    if (userById._id.toString() !== userByEmail._id.toString()) {
      return res.status(400).json({ error: '아이디와 이메일이 일치하지 않습니다.' })
    }

    // 비밀번호 업데이트
    userById.password = newPassword
    await userById.save()

    // 인증 완료 키 삭제
    await client.del(verifiedKey)
    const redisKey = `verification:email:password:${id}:${email}`
    await client.del(redisKey)

    console.log(`비밀번호 재설정 완료: ${id} / ${email}`)

    res.json({
      message: '비밀번호가 성공적으로 변경되었습니다.',
      success: true
    })
  } catch (error) {
    console.error('비밀번호 재설정 오류:', error)
    res.status(500).json({ error: '비밀번호 재설정 중 오류가 발생했습니다.' })
  }
})

// Cognito 인증 미들웨어 사용
import { authenticateCognitoToken, optionalAuthenticateCognitoToken } from '../../shared/utils/cognito-auth.js'

// 사용자 찾기 헬퍼 함수 (userId가 MongoDB ObjectId가 아닐 수 있으므로 email로도 찾기)
const findUserByIdOrEmail = async (userId, email) => {
  // MongoDB ObjectId 형식인지 확인 (24자리 16진수)
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(userId)
  
  if (isObjectId) {
    // ObjectId 형식이면 직접 찾기
    const user = await User.findById(userId)
    if (user) return user
  }
  
  // ObjectId가 아니거나 찾지 못한 경우 email로 찾기
  if (email) {
    const userByEmail = await User.findOne({ email })
    if (userByEmail) return userByEmail
  }
  
  // userId가 email 형식일 수도 있음
  if (userId && userId.includes('@')) {
    const userByEmail = await User.findOne({ email: userId })
    if (userByEmail) return userByEmail
  }
  
  return null
}

// 현재 사용자 정보 가져오기
router.get('/me', authenticateCognitoToken, async (req, res) => {
  try {
    const user = await findUserByIdOrEmail(req.user.userId, req.user.email)
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }
    res.json({ user: { ...user.toObject(), password: undefined } })
  } catch (error) {
    console.error('사용자 정보 조회 오류:', error)
    res.status(500).json({ error: '사용자 정보를 가져오는 중 오류가 발생했습니다.' })
  }
})

// 회원정보 수정
router.put('/update', authenticateCognitoToken, upload.single('profileImage'), async (req, res) => {
  try {
    const userId = req.user.userId
    const { name, password, gender, fitnessLevel, birthYear, phone } = req.body
    
    console.log('=== 회원정보 수정 요청 ===')
    console.log('userId:', userId)
    console.log('받은 데이터:', {
      name: name || '없음',
      password: password ? '***' : '없음',
      gender: gender || '없음',
      fitnessLevel: fitnessLevel || '없음',
      birthYear: birthYear || '없음',
      phone: phone || '없음',
      profileImage: req.file ? req.file.filename : '없음'
    })
    
    const user = await findUserByIdOrEmail(userId, req.user.email)
    if (!user) {
      console.error('사용자를 찾을 수 없음:', userId, req.user.email)
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }
    
    console.log('수정 전 사용자 정보:', {
      name: user.name,
      gender: user.gender,
      fitnessLevel: user.fitnessLevel,
      birthYear: user.birthYear,
      phone: user.phone,
      email: user.email
    })
    
    // 업데이트할 필드 객체 생성 (email은 제외하고 업데이트)
    const updateFields = {}
    
    if (name !== undefined && name !== null) {
      const trimmedName = name.trim()
      if (trimmedName !== '') {
        updateFields.name = trimmedName
        console.log('이름 업데이트:', trimmedName)
      }
    }
    if (gender !== undefined && gender !== null && gender !== '') {
      updateFields.gender = gender
      console.log('성별 업데이트:', gender)
    }
    if (fitnessLevel !== undefined && fitnessLevel !== null && fitnessLevel !== '') {
      updateFields.fitnessLevel = fitnessLevel
      console.log('등력 업데이트:', fitnessLevel)
    }
    if (birthYear !== undefined && birthYear !== null && birthYear !== '') {
      const birthYearNum = parseInt(birthYear)
      if (!isNaN(birthYearNum) && birthYearNum > 1900 && birthYearNum <= new Date().getFullYear()) {
        updateFields.birthYear = birthYearNum
        console.log('출생년도 업데이트:', birthYearNum)
      }
    }
    if (phone !== undefined) {
      updateFields.phone = phone || ''
      console.log('전화번호 업데이트:', phone || '')
    }
    
    // 비밀번호 변경 (입력된 경우에만)
    if (password && password.trim() !== '') {
      if (password.length < 6) {
        return res.status(400).json({ error: '비밀번호는 최소 6자 이상이어야 합니다.' })
      }
      updateFields.password = password
      console.log('비밀번호 업데이트됨')
    }
    
    // 프로필 이미지 업데이트
    if (req.file) {
      // 기존 이미지 삭제 (있는 경우)
      if (user.profileImage && !user.profileImage.startsWith('http')) {
        const oldImagePath = path.join(__dirname, '..', user.profileImage)
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath)
          console.log('기존 프로필 이미지 삭제:', oldImagePath)
        }
      }
      updateFields.profileImage = `/uploads/profiles/${req.file.filename}`
      
      // 파일 메타데이터를 MongoDB에 저장
      try {
        const mongoose = await import('mongoose')
        const db = mongoose.default.connection.db
        const profileFilesCollection = db.collection('profile_files')
        
        await profileFilesCollection.insertOne({
          filename: req.file.filename,
          path: `/uploads/profiles/${req.file.filename}`,
          size: req.file.size,
          uploadedAt: new Date(),
          type: 'profile',
          createdAt: new Date()
        })
        console.log(`[파일 메타데이터] 프로필 이미지 메타데이터 저장 완료: ${req.file.filename}`)
      } catch (error) {
        console.error('[파일 메타데이터] 저장 실패 (무시됨):', error.message)
      }
      const actualFilePath = path.join(req.file.destination, req.file.filename)
      console.log('=== 프로필 이미지 업데이트 ===')
      console.log('파일명:', req.file.filename)
      console.log('destination:', req.file.destination)
      console.log('req.file.path:', req.file.path)
      console.log('실제 파일 경로:', actualFilePath)
      console.log('DB 저장 경로:', updateFields.profileImage)
      console.log('파일 존재 확인 (req.file.path):', fs.existsSync(req.file.path))
      console.log('파일 존재 확인 (actualFilePath):', fs.existsSync(actualFilePath))
      console.log('파일 크기:', req.file.size, 'bytes')
      
      // 파일이 실제로 존재하는지 확인
      if (!fs.existsSync(actualFilePath)) {
        console.error('❌ 파일이 저장되지 않았습니다!')
        console.error('예상 경로:', actualFilePath)
        // 디렉토리 내용 확인
        try {
          const files = fs.readdirSync(req.file.destination)
          console.error('디렉토리 내용:', files)
        } catch (err) {
          console.error('디렉토리 읽기 실패:', err.message)
        }
      } else {
        console.log('✅ 파일이 정상적으로 저장되었습니다.')
      }
    }
    
    // findByIdAndUpdate 사용 (email 필드는 자동으로 유지됨)
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $set: updateFields },
      { new: true, runValidators: false } // runValidators: false로 설정하여 email validation 우회
    )
    
    if (!updatedUser) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }
    console.log('DB 저장 완료')
    console.log('수정 후 사용자 정보:', {
      name: updatedUser.name,
      gender: updatedUser.gender,
      fitnessLevel: updatedUser.fitnessLevel,
      birthYear: updatedUser.birthYear,
      phone: updatedUser.phone,
      profileImage: updatedUser.profileImage,
      email: updatedUser.email
    })
    
    res.json({
      message: '회원정보가 수정되었습니다.',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        gender: updatedUser.gender,
        fitnessLevel: updatedUser.fitnessLevel,
        birthYear: updatedUser.birthYear,
        phone: updatedUser.phone,
        profileImage: updatedUser.profileImage,
        role: updatedUser.role || 'user'
      }
    })
  } catch (error) {
    console.error('회원정보 수정 오류:', error)
    res.status(500).json({ 
      error: '회원정보 수정 중 오류가 발생했습니다.',
      details: error.message 
    })
  }
})

// 사용자 통계 가져오기
router.get('/stats', authenticateCognitoToken, async (req, res) => {
  try {
    const user = await findUserByIdOrEmail(req.user.userId, req.user.email)
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }
    
    const userId = user._id
    
    // 아래에서 등산일지 기반으로 계산
    
    // 작성한 글 수
    const postCount = await Post.countDocuments({ author: userId })
    
    // 등산일지 수 및 내역 (카테고리가 정확히 'diary'인 게시글만 카운트)
    const diaryPosts = await Post.find({ 
      author: userId, 
      category: { $eq: 'diary' } 
    }).select('title createdAt mountainCode courseDurationMinutes courseDistance').sort({ createdAt: -1 }).lean()
    const hikingLogs = diaryPosts.length
    
    // 디버깅: 사용자의 모든 게시글 카테고리 확인
    const allUserPosts = await Post.find({ author: userId }).select('category title').lean()
    console.log('사용자 ID:', userId, '전체 게시글 카테고리:', allUserPosts.map(p => ({ category: p.category, title: p.title })))
    console.log('등산일지 카운트:', hikingLogs)
    
    // 받은 좋아요 수 (작성한 모든 게시글의 likes 합계)
    const posts = await Post.find({ author: userId }).select('likes category').lean()
    const totalLikes = posts.reduce((sum, post) => sum + (post.likes || 0), 0)
    
    // 등산일지 좋아요 수 (카테고리가 'diary'인 게시글들의 likes 합계)
    const diaryLikes = posts
      .filter(post => post.category === 'diary')
      .reduce((sum, post) => sum + (post.likes || 0), 0)
    
    // 커뮤니티 좋아요 수 (전체 게시글의 likes 합계)
    const communityLikes = totalLikes
    
    // 즐겨찾기 수 (찜 목록) - 게시글 + 산 즐겨찾기 모두 카운트
    const userData = await User.findById(userId).select('favorites favoriteMountains favoriteStores points').lean()
    let favoriteCount = 0
    
    // 게시글 즐겨찾기 카운트
    if (userData && userData.favorites && userData.favorites.length > 0) {
      // 실제 존재하는 게시글만 카운트
      const existingPosts = await Post.find({ _id: { $in: userData.favorites } }).select('_id').lean()
      favoriteCount += existingPosts.length
      
      // 존재하지 않는 게시글 ID 제거 (정리)
      const existingPostIds = existingPosts.map(p => p._id.toString())
      const invalidFavorites = userData.favorites.filter(favId => !existingPostIds.includes(favId.toString()))
      if (invalidFavorites.length > 0) {
        await User.findByIdAndUpdate(userId, {
          $pull: { favorites: { $in: invalidFavorites } }
        })
        console.log('존재하지 않는 즐겨찾기 제거:', invalidFavorites.length, '개')
      }
    }
    
    // 산 즐겨찾기 카운트
    if (userData && userData.favoriteMountains && userData.favoriteMountains.length > 0) {
      favoriteCount += userData.favoriteMountains.length
    }
    
    // 스토어 즐겨찾기 카운트
    if (userData && userData.favoriteStores && userData.favoriteStores.length > 0) {
      favoriteCount += userData.favoriteStores.length
    }
    
    console.log(
      '사용자 ID:',
      userId,
      '즐겨찾기 수:',
      favoriteCount,
      '(게시글:',
      userData?.favorites?.length || 0,
      '산:',
      userData?.favoriteMountains?.length || 0,
      '스토어:',
      userData?.favoriteStores?.length || 0,
      ') 포인트:',
      userData?.points ?? 0
    )
    
    // 누적 시간/다녀온 산 수 계산
    const totalDurationMinutes = diaryPosts.reduce(
      (sum, post) => sum + (post.courseDurationMinutes || 0),
      0
    )
    // 시간(시간 단위, 소수 1자리까지)
    const totalTime = Number((totalDurationMinutes / 60).toFixed(1))

    // 다녀온 산 수 계산
    const mountainCodes = diaryPosts
      .map(post => post.mountainCode)
      .filter(code => !!code)
    const uniqueMountainCodes = Array.from(new Set(mountainCodes))
    const climbedMountains = uniqueMountainCodes.length

    // 누적고도 계산 (등산 코스의 거리 km 합산)
    const totalElevation = diaryPosts.reduce(
      (sum, post) => {
        const distance = post.courseDistance || 0
        console.log('누적고도 계산 - 포스트:', post.title, '거리:', distance, '타입:', typeof distance)
        return sum + (typeof distance === 'number' ? distance : parseFloat(distance) || 0)
      },
      0
    )
    console.log('누적고도 최종 계산 결과:', totalElevation, '등산일지 수:', diaryPosts.length)

    // 포인트 요약 및 내역 구성
    const currentPoints = userData?.points ?? 0
    const earnedPoints = currentPoints // 현재는 적립만 존재하므로 earned = total
    const usedPoints = 0

    const pointHistory = diaryPosts.map(post => {
      const dateStr = new Date(post.createdAt).toISOString().split('T')[0]
      const [year, month, day] = dateStr.split('-')
      const formattedDate = `${year}.${month}.${day}`
      return {
        title: post.title || '등산일지',
        type: 'earned',
        points: 100,
        date: formattedDate
      }
    })

    // 등산일정 수
    const scheduleCount = await Schedule.countDocuments({ user: userId })

    res.json({
      totalElevation,
      totalTime,
      climbedMountains,
      postCount,
      totalLikes,
      diaryLikes,
      communityLikes,
      hikingLogs,
      points: currentPoints,
      earnedPoints,
      usedPoints,
      history: pointHistory,
      schedules: scheduleCount,
      items: favoriteCount // 즐겨찾기 수
    })
  } catch (error) {
    console.error('사용자 통계 조회 오류:', error)
    res.status(500).json({ error: '사용자 통계를 가져오는 중 오류가 발생했습니다.' })
  }
})

// 산 즐겨찾기 상태 조회
router.get('/mountains/:code/favorite', authenticateCognitoToken, async (req, res) => {
  try {
    const user = await findUserByIdOrEmail(req.user.userId, req.user.email)
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }
    
    const { code } = req.params
    const mountainCode = String(code)

    const userData = await User.findById(user._id).select('favoriteMountains').lean()
    const isFavorited = !!(userData && userData.favoriteMountains && userData.favoriteMountains.includes(mountainCode))

    res.json({ isFavorited })
  } catch (error) {
    console.error('산 즐겨찾기 상태 조회 오류:', error)
    res.status(500).json({ error: '즐겨찾기 상태 조회 중 오류가 발생했습니다.' })
  }
})

// 산 즐겨찾기 토글
router.post('/mountains/:code/favorite', authenticateCognitoToken, async (req, res) => {
  try {
    const user = await findUserByIdOrEmail(req.user.userId, req.user.email)
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }
    
    const { code } = req.params
    const mountainCode = String(code)

    if (!user.favoriteMountains) {
      user.favoriteMountains = []
    }

    const idx = user.favoriteMountains.indexOf(mountainCode)
    if (idx > -1) {
      user.favoriteMountains.splice(idx, 1)
      // user.save() 대신 findByIdAndUpdate 사용 (email 검증 오류 방지)
      await User.findByIdAndUpdate(user._id, { favoriteMountains: user.favoriteMountains }, { runValidators: false })
      return res.json({ isFavorited: false, message: '즐겨찾기에서 제거되었습니다.' })
    } else {
      user.favoriteMountains.push(mountainCode)
      // user.save() 대신 findByIdAndUpdate 사용 (email 검증 오류 방지)
      await User.findByIdAndUpdate(user._id, { favoriteMountains: user.favoriteMountains }, { runValidators: false })
      return res.json({ isFavorited: true, message: '즐겨찾기에 추가되었습니다.' })
    }
  } catch (error) {
    console.error('산 즐겨찾기 처리 오류:', error)
    res.status(500).json({ error: '즐겨찾기 처리 중 오류가 발생했습니다.' })
  }
})

// 즐겨찾기한 산 목록 조회
router.get('/mountains/favorites/my', authenticateCognitoToken, async (req, res) => {
  try {
    const user = await findUserByIdOrEmail(req.user.userId, req.user.email)
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }
    
    const userData = await User.findById(user._id).select('favoriteMountains').lean()
    const favoriteCodes = userData?.favoriteMountains || []

    // MongoDB에서 산 정보 가져오기
    const db = mongoose.connection.db
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' })
    }

    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    const mountainListCollectionName = collectionNames.find(name => 
      name === 'Mountain_list' || name.toLowerCase() === 'mountain_list'
    ) || 'Mountain_list'
    
    const actualCollection = db.collection(mountainListCollectionName)

    // 각 코드에 대해 MongoDB에서 산 정보 찾기
    const mountains = await Promise.all(favoriteCodes.map(async (code) => {
      const codeNum = parseInt(code)
      const codeStr = String(code)
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(code)
      
      let mountain = null
      
      // ObjectId 형식이면 _id로 검색
      if (isObjectId) {
        try {
          const objectId = new mongoose.Types.ObjectId(code)
          mountain = await actualCollection.findOne({ _id: objectId })
        } catch (e) {
          console.error('ObjectId 변환 실패:', e)
        }
      }
      
      // 숫자 코드로 검색
      if (!mountain && !isNaN(codeNum)) {
        mountain = await actualCollection.findOne({
          $or: [
            { mntilistno: codeNum },
            { mntilistno: codeStr },
            { 'trail_match.mountain_info.mntilistno': codeNum },
            { 'trail_match.mountain_info.mntilistno': codeStr }
          ]
        })
      }
      
      if (mountain) {
        const mountainInfo = mountain.trail_match?.mountain_info || {}
        
        // 산 이름 찾기 (여러 필드에서 시도)
        const mountainName = mountain.mntiname || 
                            mountain.name || 
                            mountain.MNTN_NM ||
                            mountainInfo.mntiname ||
                            mountainInfo.name ||
                            mountainInfo.MNTN_NM ||
                            mountain.mountainName ||
                            null
        
        const center = mountain.center || 
          (mountain.lat && mountain.lng ? { lat: mountain.lat, lon: mountain.lng } : null) ||
          (mountain.lat && mountain.lon ? { lat: mountain.lat, lon: mountain.lon } : null) ||
          (mountain.MNTN_CTR ? { 
            lat: mountain.MNTN_CTR.lat || mountain.MNTN_CTR[0], 
            lon: mountain.MNTN_CTR.lon || mountain.MNTN_CTR[1] 
          } : null) ||
          (mountainInfo.lat && mountainInfo.lon ? { lat: mountainInfo.lat, lon: mountainInfo.lon } : null)
        
        return {
          code: String(mountain.mntilistno || mountain.code || code),
          name: mountainName || `산 (코드: ${code})`,
          height: mountain.mntihigh || mountain.height || mountainInfo.mntihigh || null,
          location: mountain.location || mountain.mntiadd || mountainInfo.mntiadd || null,
          center: center ? [center.lat, center.lon] : null
        }
      }
      
      // MongoDB에서 찾지 못하면 하드코딩된 정보 사용
      const info = getMountainInfo(code)
      if (info) return info
      
      return {
        code,
        name: `산 (코드: ${code})`,
        height: null,
        location: null,
        center: null
      }
    }))

    res.json({ mountains })
  } catch (error) {
    console.error('즐겨찾기한 산 목록 조회 오류:', error)
    res.status(500).json({ error: '즐겨찾기한 산 목록을 불러오는 중 오류가 발생했습니다.' })
  }
})

// 회원 탈퇴 (인증 필요)
router.delete('/delete', authenticateCognitoToken, async (req, res) => {
  try {
    const user = await findUserByIdOrEmail(req.user.userId, req.user.email)
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }

    const userId = user._id

    // 관리자는 탈퇴 불가
    if (user.role === 'admin') {
      return res.status(403).json({ error: '관리자는 탈퇴할 수 없습니다.' })
    }

    // 사용자가 작성한 게시글의 이미지 파일 삭제
    const userPosts = await Post.find({ author: userId })
    userPosts.forEach(post => {
      if (post.images && post.images.length > 0) {
        post.images.forEach(imagePath => {
          const fullPath = path.join(__dirname, '..', imagePath)
          if (fs.existsSync(fullPath)) {
            try {
              fs.unlinkSync(fullPath)
            } catch (err) {
              console.error('이미지 삭제 오류:', err)
            }
          }
        })
      }
    })

    // 사용자가 작성한 댓글 삭제
    await Comment.deleteMany({ author: userId })

    // 사용자가 작성한 게시글 삭제
    await Post.deleteMany({ author: userId })

    // 프로필 이미지 삭제
    if (user.profileImage) {
      const profileImagePath = path.join(__dirname, '..', user.profileImage)
      if (fs.existsSync(profileImagePath)) {
        try {
          fs.unlinkSync(profileImagePath)
        } catch (err) {
          console.error('프로필 이미지 삭제 오류:', err)
        }
      }
    }

    // 사용자 삭제
    await User.findByIdAndDelete(user._id)

    res.json({ message: '회원 탈퇴가 완료되었습니다.' })
  } catch (error) {
    console.error('회원 탈퇴 오류:', error)
    res.status(500).json({ error: '회원 탈퇴 중 오류가 발생했습니다.' })
  }
})

// 소셜 로그인 라우트
// 카카오 로그인 시작
router.get('/kakao', (req, res) => {
  const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '75218448ddb01cb67aec079a8dbd61ae'
  // 백엔드로 콜백 받기
  const REDIRECT_URI = process.env.KAKAO_REDIRECT_URI || 'http://192.168.0.242/api/auth/kakao/callback'
  
  // 카카오 OAuth URL 생성 (scope 추가: profile_nickname, account_email 등)
  const kakaoAuthURL = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_API_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=profile_nickname`
  
  console.log('카카오 로그인 시작')
  console.log('- Client ID:', KAKAO_REST_API_KEY)
  console.log('- Redirect URI:', REDIRECT_URI)
  console.log('- Full URL:', kakaoAuthURL)
  
  // CORS 헤더 설정 (필요한 경우)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.redirect(kakaoAuthURL)
})

// 카카오 로그인 콜백 (Cognito 사용)
router.get('/kakao/callback', async (req, res) => {
  try {
    const { code, error, error_description } = req.query
    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://hiker-cloud.site'
    
    console.log('카카오 콜백 받음 - code:', code ? '있음' : '없음', 'error:', error, 'error_description:', error_description)
    
    if (error) {
      console.error('카카오 OAuth 오류:', error, error_description)
      return res.redirect(`${FRONTEND_URL}/login?error=kakao_oauth_error&message=${encodeURIComponent(error_description || error)}`)
    }
    
    if (!code) {
      console.error('카카오 인증 코드 없음')
      return res.redirect(`${FRONTEND_URL}/login?error=kakao_auth_failed`)
    }

    const REDIRECT_URI = process.env.KAKAO_REDIRECT_URI || `${FRONTEND_URL}/api/auth/kakao/callback`
    const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY
    const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID
    const CLIENT_ID = process.env.COGNITO_CLIENT_ID

    if (!KAKAO_REST_API_KEY || !USER_POOL_ID || !CLIENT_ID) {
      console.error('필수 환경 변수가 설정되지 않았습니다.')
      return res.redirect(`${FRONTEND_URL}/login?error=server_config_error`)
    }

    // 1. 카카오 OAuth 토큰 요청
    const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: KAKAO_REST_API_KEY,
        redirect_uri: REDIRECT_URI,
        code: code
      })
    })

    const tokenData = await tokenResponse.json()
    
    if (!tokenData.access_token) {
      console.error('카카오 토큰 요청 실패:', tokenData)
      return res.redirect(`${FRONTEND_URL}/login?error=kakao_token_failed`)
    }

    // 2. 카카오 사용자 정보 요청
    const userInfoResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    })
    const kakaoUser = await userInfoResponse.json()

    if (!kakaoUser.id) {
      console.error('카카오 사용자 정보 요청 실패:', kakaoUser)
      return res.redirect(`${FRONTEND_URL}/login?error=kakao_user_info_failed`)
    }

    const kakaoAccount = kakaoUser.kakao_account || {}
    const profile = kakaoAccount.profile || {}

    const userInfo = {
      id: `kakao_${kakaoUser.id}`,
      email: kakaoAccount.email || `${kakaoUser.id}@kakao.temp`,
      name: profile.nickname || kakaoAccount.name || `카카오사용자${kakaoUser.id}`,
      provider: 'kakao',
      profileImage: profile.profile_image_url || null
    }

    // Cognito User Pool이 email을 username으로 사용하므로, email을 username으로 사용
    const username = userInfo.email // email을 username으로 사용

    // 3. Cognito에서 사용자 찾기 또는 생성
    const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, InitiateAuthCommand } = await import('@aws-sdk/client-cognito-identity-provider')
    const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'ap-northeast-2' })

    let cognitoTokens = null
    let isNewUser = false

    try {
      // Cognito 사용자 생성 시도 (email을 username으로 사용)
      const createUserCommand = new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: userInfo.email, // email을 username으로 사용
        UserAttributes: [
          { Name: 'email', Value: userInfo.email },
          { Name: 'name', Value: userInfo.name }
          // custom:provider는 User Pool에 정의되어 있지 않으므로 제거
        ],
        MessageAction: 'SUPPRESS'
      })
      await cognitoClient.send(createUserCommand)
      isNewUser = true
      console.log(`Cognito 사용자 생성 완료: ${userInfo.email}`)

      // 임시 비밀번호 생성 및 설정
      const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase() + '!@#'
      const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: userInfo.email, // email을 username으로 사용
        Password: tempPassword,
        Permanent: true
      })
      await cognitoClient.send(setPasswordCommand)
      console.log(`Cognito 비밀번호 설정 완료: ${userInfo.email}`)

      // Cognito 로그인하여 토큰 획득
      const authCommand = new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: {
          USERNAME: userInfo.email, // email을 username으로 사용
          PASSWORD: tempPassword
        }
      })
      const authResponse = await cognitoClient.send(authCommand)

      if (authResponse.AuthenticationResult) {
        cognitoTokens = {
          idToken: authResponse.AuthenticationResult.IdToken,
          accessToken: authResponse.AuthenticationResult.AccessToken,
          refreshToken: authResponse.AuthenticationResult.RefreshToken
        }
        console.log(`Cognito 토큰 획득 완료: ${userInfo.email}`)
      }
    } catch (cognitoError) {
      if (cognitoError.name === 'UsernameExistsException') {
        // 사용자가 이미 존재함 - 기존 사용자 로그인 처리
        console.log(`Cognito 사용자 이미 존재: ${userInfo.email}, 기존 사용자 로그인 시도`)
        try {
          // 기존 사용자의 경우 임시 비밀번호를 재설정하고 로그인 시도
          const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase() + '!@#'
          const setPasswordCommand = new AdminSetUserPasswordCommand({
            UserPoolId: USER_POOL_ID,
            Username: userInfo.email,
            Password: tempPassword,
            Permanent: true
          })
          await cognitoClient.send(setPasswordCommand)
          console.log(`기존 Cognito 사용자 비밀번호 재설정 완료: ${userInfo.email}`)

          // Cognito 로그인하여 토큰 획득
          const authCommand = new InitiateAuthCommand({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: CLIENT_ID,
            AuthParameters: {
              USERNAME: userInfo.email,
              PASSWORD: tempPassword
            }
          })
          const authResponse = await cognitoClient.send(authCommand)

          if (authResponse.AuthenticationResult) {
            cognitoTokens = {
              idToken: authResponse.AuthenticationResult.IdToken,
              accessToken: authResponse.AuthenticationResult.AccessToken,
              refreshToken: authResponse.AuthenticationResult.RefreshToken
            }
            console.log(`기존 Cognito 사용자 토큰 획득 완료: ${userInfo.email}`)
          }
        } catch (existingUserError) {
          console.error('기존 Cognito 사용자 로그인 오류:', existingUserError)
          // 기존 사용자 로그인 실패해도 계속 진행 (MongoDB 사용자 정보는 반환)
        }
      } else {
        console.error('Cognito 사용자 생성 오류:', cognitoError)
        // Cognito 오류가 발생해도 계속 진행 (MongoDB 사용자 정보는 반환)
      }
    }

    // 4. MongoDB에서 사용자 정보 조회 또는 생성 (id는 소셜 ID 사용)
    let user = await User.findOne({ id: userInfo.id })
    if (!user) {
      // MongoDB에 사용자 생성 (소셜 로그인은 필수 필드에 기본값 설정)
      user = new User({
        id: userInfo.id, // 소셜 ID 사용
        name: userInfo.name,
        email: userInfo.email,
        password: Math.random().toString(36).slice(-12), // 소셜 로그인은 랜덤 비밀번호 (required 필드)
        socialId: userInfo.kakaoUserId ? `kakao_${userInfo.kakaoUserId}` : userInfo.id, // 소셜 ID 설정 (password required 조건 우회)
        socialProvider: 'kakao',
        gender: 'male', // 기본값 (enum: 'male' 또는 'female')
        fitnessLevel: '초급', // 기본값
        birthYear: 2000, // 기본값 (숫자)
        profileImage: userInfo.profileImage,
        role: 'user'
      })
      await user.save()
      console.log(`MongoDB 사용자 생성 완료: ${userInfo.id}`)
    }

    // 5. Cognito 토큰이 있으면 반환, 없으면 username만 전달
    if (cognitoTokens && cognitoTokens.idToken) {
      const redirectUrl = `${FRONTEND_URL}/auth/success?provider=kakao&username=${encodeURIComponent(userInfo.email)}&idToken=${encodeURIComponent(cognitoTokens.idToken)}&accessToken=${encodeURIComponent(cognitoTokens.accessToken)}&refreshToken=${encodeURIComponent(cognitoTokens.refreshToken)}&user=${encodeURIComponent(JSON.stringify({ id: user.id, name: user.name, email: user.email, profileImage: user.profileImage }))}`
      console.log('카카오 로그인 성공, Cognito 토큰 포함하여 리다이렉트')
      res.redirect(redirectUrl)
    } else {
      // 토큰이 없으면 username만 전달
      const redirectUrl = `${FRONTEND_URL}/auth/success?provider=kakao&username=${encodeURIComponent(userInfo.email)}&user=${encodeURIComponent(JSON.stringify({ id: user.id, name: user.name, email: user.email, profileImage: user.profileImage }))}`
      console.log('카카오 로그인 성공, Cognito 토큰 없음, 사용자명만 전달')
      res.redirect(redirectUrl)
    }
  } catch (error) {
    console.error('카카오 로그인 오류:', error)
    const FRONTEND_URL_ERROR = process.env.FRONTEND_URL || 'https://hiker-cloud.site'
    res.redirect(`${FRONTEND_URL_ERROR}/login?error=kakao_login_failed`)
  }
})

// 네이버 로그인 시작
router.get('/naver', (req, res) => {
  const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || 'bPUAgB6QZBRBZrL3G1CN'
  // 백엔드로 콜백 받기
  const REDIRECT_URI = process.env.NAVER_REDIRECT_URI || 'http://192.168.0.242/api/auth/naver/callback'
  const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  
  // 네이버 OAuth URL 생성 (운영 환경 지원을 위해 추가 파라미터 포함)
  const naverAuthURL = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}&auth_type=reauthenticate`
  
  console.log('네이버 로그인 시작')
  console.log('- Client ID:', NAVER_CLIENT_ID)
  console.log('- Redirect URI:', REDIRECT_URI)
  console.log('- State:', state)
  console.log('- Full URL:', naverAuthURL)
  
  // CORS 헤더 설정 (필요한 경우)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.redirect(naverAuthURL)
})

// 네이버 로그인 콜백 (Cognito 사용)
router.get('/naver/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query
    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://hiker-cloud.site'
    
    console.log('네이버 콜백 받음 - code:', code ? '있음' : '없음', 'error:', error, 'error_description:', error_description)
    
    if (error) {
      console.error('네이버 OAuth 오류:', error, error_description)
      return res.redirect(`${FRONTEND_URL}/login?error=naver_oauth_error&message=${encodeURIComponent(error_description || error)}`)
    }
    
    if (!code) {
      console.error('네이버 인증 코드 없음')
      return res.redirect(`${FRONTEND_URL}/login?error=naver_auth_failed`)
    }

    const REDIRECT_URI = process.env.NAVER_REDIRECT_URI || `${FRONTEND_URL}/api/auth/naver/callback`
    const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID
    const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET
    const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID
    const CLIENT_ID = process.env.COGNITO_CLIENT_ID

    if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET || !USER_POOL_ID || !CLIENT_ID) {
      console.error('필수 환경 변수가 설정되지 않았습니다.')
      return res.redirect(`${FRONTEND_URL}/login?error=server_config_error`)
    }

    // 1. 네이버 OAuth 토큰 요청
    const tokenResponse = await fetch('https://nid.naver.com/oauth2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: NAVER_CLIENT_ID,
        client_secret: NAVER_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code: code,
        state: state
      })
    })

    const tokenData = await tokenResponse.json()
    
    if (!tokenData.access_token) {
      console.error('네이버 토큰 요청 실패:', tokenData)
      return res.redirect(`${FRONTEND_URL}/login?error=naver_token_failed`)
    }

    // 2. 네이버 사용자 정보 요청
    const userInfoResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    })
    const naverUserData = await userInfoResponse.json()

    if (!naverUserData.response || !naverUserData.response.id) {
      console.error('네이버 사용자 정보 요청 실패:', naverUserData)
      return res.redirect(`${FRONTEND_URL}/login?error=naver_user_info_failed`)
    }

    const naverUser = naverUserData.response
    const userInfo = {
      id: `naver_${naverUser.id}`,
      email: naverUser.email || `${naverUser.id}@naver.temp`,
      name: naverUser.nickname || naverUser.name || `네이버사용자${naverUser.id}`,
      provider: 'naver',
      profileImage: naverUser.profile_image || null
    }

    // Cognito User Pool이 email을 username으로 사용하므로, email을 username으로 사용
    const username = userInfo.email // email을 username으로 사용

    // 3. Cognito에서 사용자 찾기 또는 생성
    const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, InitiateAuthCommand } = await import('@aws-sdk/client-cognito-identity-provider')
    const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'ap-northeast-2' })

    let cognitoTokens = null
    let isNewUser = false

    try {
      // Cognito 사용자 생성 시도 (email을 username으로 사용)
      const createUserCommand = new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: userInfo.email, // email을 username으로 사용
        UserAttributes: [
          { Name: 'email', Value: userInfo.email },
          { Name: 'name', Value: userInfo.name }
          // custom:provider는 User Pool에 정의되어 있지 않으므로 제거
        ],
        MessageAction: 'SUPPRESS'
      })
      await cognitoClient.send(createUserCommand)
      isNewUser = true
      console.log(`Cognito 사용자 생성 완료: ${userInfo.email}`)

      // 임시 비밀번호 생성 및 설정
      const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase() + '!@#'
      const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: userInfo.email, // email을 username으로 사용
        Password: tempPassword,
        Permanent: true
      })
      await cognitoClient.send(setPasswordCommand)
      console.log(`Cognito 비밀번호 설정 완료: ${userInfo.email}`)

      // Cognito 로그인하여 토큰 획득
      const authCommand = new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: {
          USERNAME: userInfo.email, // email을 username으로 사용
          PASSWORD: tempPassword
        }
      })
      const authResponse = await cognitoClient.send(authCommand)

      if (authResponse.AuthenticationResult) {
        cognitoTokens = {
          idToken: authResponse.AuthenticationResult.IdToken,
          accessToken: authResponse.AuthenticationResult.AccessToken,
          refreshToken: authResponse.AuthenticationResult.RefreshToken
        }
        console.log(`Cognito 토큰 획득 완료: ${userInfo.email}`)
      }
    } catch (cognitoError) {
      if (cognitoError.name === 'UsernameExistsException') {
        // 사용자가 이미 존재함 - 기존 사용자 로그인 처리
        console.log(`Cognito 사용자 이미 존재: ${userInfo.email}, 기존 사용자 로그인 시도`)
        try {
          // 기존 사용자의 경우 임시 비밀번호를 재설정하고 로그인 시도
          const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase() + '!@#'
          const setPasswordCommand = new AdminSetUserPasswordCommand({
            UserPoolId: USER_POOL_ID,
            Username: userInfo.email,
            Password: tempPassword,
            Permanent: true
          })
          await cognitoClient.send(setPasswordCommand)
          console.log(`기존 Cognito 사용자 비밀번호 재설정 완료: ${userInfo.email}`)

          // Cognito 로그인하여 토큰 획득
          const authCommand = new InitiateAuthCommand({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: CLIENT_ID,
            AuthParameters: {
              USERNAME: userInfo.email,
              PASSWORD: tempPassword
            }
          })
          const authResponse = await cognitoClient.send(authCommand)

          if (authResponse.AuthenticationResult) {
            cognitoTokens = {
              idToken: authResponse.AuthenticationResult.IdToken,
              accessToken: authResponse.AuthenticationResult.AccessToken,
              refreshToken: authResponse.AuthenticationResult.RefreshToken
            }
            console.log(`기존 Cognito 사용자 토큰 획득 완료: ${userInfo.email}`)
          }
        } catch (existingUserError) {
          console.error('기존 Cognito 사용자 로그인 오류:', existingUserError)
          // 기존 사용자 로그인 실패해도 계속 진행 (MongoDB 사용자 정보는 반환)
        }
      } else {
        console.error('Cognito 사용자 생성 오류:', cognitoError)
        // Cognito 오류가 발생해도 계속 진행 (MongoDB 사용자 정보는 반환)
      }
    }

    // 4. MongoDB에서 사용자 정보 조회 또는 생성 (id는 소셜 ID 사용)
    let user = await User.findOne({ id: userInfo.id })
    if (!user) {
      // MongoDB에 사용자 생성 (소셜 로그인은 필수 필드에 기본값 설정)
      user = new User({
        id: userInfo.id, // 소셜 ID 사용
        name: userInfo.name,
        email: userInfo.email,
        password: Math.random().toString(36).slice(-12), // 소셜 로그인은 랜덤 비밀번호 (required 필드)
        socialId: userInfo.naverUserId ? `naver_${userInfo.naverUserId}` : userInfo.id, // 소셜 ID 설정 (password required 조건 우회)
        socialProvider: 'naver',
        gender: 'male', // 기본값 (enum: 'male' 또는 'female')
        fitnessLevel: '초급', // 기본값
        birthYear: 2000, // 기본값 (숫자)
        profileImage: userInfo.profileImage,
        role: 'user'
      })
      await user.save()
      console.log(`MongoDB 사용자 생성 완료: ${userInfo.id}`)
    }

    // 5. Cognito 토큰이 있으면 반환, 없으면 username만 전달
    if (cognitoTokens && cognitoTokens.idToken) {
      const redirectUrl = `${FRONTEND_URL}/auth/success?provider=naver&username=${encodeURIComponent(userInfo.email)}&idToken=${encodeURIComponent(cognitoTokens.idToken)}&accessToken=${encodeURIComponent(cognitoTokens.accessToken)}&refreshToken=${encodeURIComponent(cognitoTokens.refreshToken)}&user=${encodeURIComponent(JSON.stringify({ id: user.id, name: user.name, email: user.email, profileImage: user.profileImage }))}`
      console.log('네이버 로그인 성공, Cognito 토큰 포함하여 리다이렉트')
      res.redirect(redirectUrl)
    } else {
      // 토큰이 없으면 username만 전달
      const redirectUrl = `${FRONTEND_URL}/auth/success?provider=naver&username=${encodeURIComponent(userInfo.email)}&user=${encodeURIComponent(JSON.stringify({ id: user.id, name: user.name, email: user.email, profileImage: user.profileImage }))}`
      console.log('네이버 로그인 성공, Cognito 토큰 없음, 사용자명만 전달')
      res.redirect(redirectUrl)
    }
  } catch (error) {
    console.error('네이버 로그인 오류:', error)
    const FRONTEND_URL_ERROR = process.env.FRONTEND_URL || 'https://hiker-cloud.site'
    res.redirect(`${FRONTEND_URL_ERROR}/login?error=naver_login_failed`)
  }
})

// 소셜 로그인용 JWT 토큰 생성 (Cognito 토큰이 없을 때 사용)
router.post('/social-token', async (req, res) => {
  try {
    const { userId, email } = req.body
    
    if (!userId) {
      return res.status(400).json({ error: '사용자 ID가 필요합니다.' })
    }
    
    // MongoDB에서 사용자 찾기
    const user = await User.findOne({ id: userId })
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }
    
    // JWT 토큰 생성
    const token = jwt.sign(
      { userId: user._id, id: user.id, role: user.role || 'user' },
      JWT_SECRET,
      { expiresIn: '7d' }
    )
    
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        role: user.role || 'user'
      }
    })
  } catch (error) {
    console.error('소셜 로그인 토큰 생성 오류:', error)
    res.status(500).json({ error: '토큰 생성 중 오류가 발생했습니다.' })
  }
})

export default router


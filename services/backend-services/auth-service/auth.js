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
import { createClient } from 'redis'
import { Resend } from 'resend'
import { getMountainInfo } from './shared/utils/mountainRoutes.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = express.Router()

// JWT 시크릿 키 (환경 변수에서 가져오기)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

// 프로필 이미지 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/profiles')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
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

// Resend 초기화
const resend = new Resend(process.env.RESEND_API_KEY || 're_8YDsSjB7_6jvZkSS5tY4GAh5zPytqbG11')

// 이메일 인증번호 전송 (회원가입용)
router.post('/send-email-verification', async (req, res) => {
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

    // 회원가입 시에는 중복된 이메일 확인
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' })
    }

    // 인증번호 생성 (6자리)
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    
    // Redis에 저장 (5분 TTL - 자동 만료)
    const client = await getRedisClient()
    if (client) {
      const key = `verification:email:signup:${email}`
      await client.setEx(key, 300, code) // 5분 = 300초, TTL 설정으로 자동 삭제
      console.log(`이메일 인증번호 Redis 저장: ${email} -> ${code} (5분 TTL)`)
    } else {
      console.warn('Redis 연결 실패, 인증번호 저장 불가')
      return res.status(500).json({ error: '인증번호 저장에 실패했습니다.' })
    }

    // Resend로 이메일 전송
    try {
      const { data, error } = await resend.emails.send({
        from: 'HIKER <onboarding@resend.dev>',
        to: email,
        subject: '[HIKER] 이메일 인증번호',
        html: `
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
        `
      })

      // Resend API의 validation_error는 테스트 모드에서 정상적인 동작이므로 무시
      if (error) {
        console.warn('Resend 이메일 전송 경고:', error)
        // validation_error인 경우 (테스트 모드에서 다른 이메일로 보낼 때) 무시하고 계속 진행
        if (error.name === 'validation_error' && error.message && error.message.includes('testing emails')) {
          console.log('테스트 모드 validation_error 무시, 인증번호는 Redis에 저장되었습니다.')
          // Redis에 저장되었으므로 인증번호를 반환
          return res.json({
            message: '인증번호가 생성되었습니다. (테스트 모드: 이메일 전송 제한)',
            code: code, // 개발/테스트 환경에서는 항상 인증번호 반환
            warning: '테스트 모드에서는 등록된 이메일로만 전송 가능합니다. 인증번호를 직접 확인하세요.'
          })
        }
        // 다른 오류인 경우에만 에러 반환
        console.error('Resend 이메일 전송 오류:', error)
        return res.status(500).json({ 
          error: '이메일 전송에 실패했습니다.',
          details: error.message,
          code: code // 개발 환경에서는 인증번호 반환
        })
      }

      console.log(`이메일 전송 성공: ${email}, Message ID: ${data?.id}`)
      
      res.json({
        message: '인증번호가 전송되었습니다.',
        // 개발 환경에서만 인증번호 반환
        code: process.env.NODE_ENV === 'development' ? code : undefined
      })
    } catch (emailError) {
      console.error('이메일 전송 오류:', emailError)
      // 에러가 발생해도 Redis에 저장되었으므로 인증번호는 사용 가능
      // validation_error인 경우 무시
      if (emailError.name === 'validation_error' || (emailError.message && emailError.message.includes('testing emails'))) {
        console.log('테스트 모드 validation_error 무시, 인증번호는 Redis에 저장되었습니다.')
        return res.json({
          message: '인증번호가 생성되었습니다. (테스트 모드: 이메일 전송 제한)',
          code: code,
          warning: '테스트 모드에서는 등록된 이메일로만 전송 가능합니다. 인증번호를 직접 확인하세요.'
        })
      }
      // 다른 오류인 경우에도 인증번호는 반환 (Redis에 저장되었으므로)
      res.json({
        message: '인증번호가 생성되었습니다.',
        code: code, // 개발 환경에서는 항상 인증번호 반환
        warning: `이메일 전송 중 오류가 발생했습니다: ${emailError.message}. 인증번호는 Redis에 저장되었습니다.`
      })
    }
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
    
    // JWT 토큰 생성
    const token = jwt.sign(
      { userId: user._id, id: user.id },
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
  } catch (error) {
    console.error('회원가입 오류:', error)
    if (error.code === 11000) {
      return res.status(409).json({ error: '이미 사용 중인 ID입니다.' })
    }
    res.status(500).json({ error: '회원가입 중 오류가 발생했습니다.' })
  }
})

// 로그인
router.post('/login', async (req, res) => {
  try {
    const { id, password } = req.body
    
    if (!id || !password) {
      return res.status(400).json({ error: 'ID와 비밀번호를 입력해주세요.' })
    }
    
    // 사용자 찾기
    const user = await User.findOne({ id })
    if (!user) {
      return res.status(401).json({ error: 'ID 또는 비밀번호가 올바르지 않습니다.' })
    }
    
    // 비밀번호 확인
    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'ID 또는 비밀번호가 올바르지 않습니다.' })
    }
    
    // JWT 토큰 생성
    const token = jwt.sign(
      { userId: user._id, id: user.id },
      JWT_SECRET,
      { expiresIn: '7d' }
    )
    
    res.json({
      message: '로그인 성공',
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
      console.warn('Redis 연결 실패, 인증번호 저장 불가')
      return res.status(500).json({ error: '인증번호 저장에 실패했습니다.' })
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
    
    // Redis에 저장 (5분 TTL - 자동 만료)
    const client = await getRedisClient()
    if (client) {
      const key = `verification:email:find-id:${email}`
      await client.setEx(key, 300, code) // 5분 = 300초, TTL 설정으로 자동 삭제
      console.log(`아이디 찾기 이메일 인증번호 Redis 저장: ${email} -> ${code} (5분 TTL)`)
    } else {
      console.warn('Redis 연결 실패, 인증번호 저장 불가')
      return res.status(500).json({ error: '인증번호 저장에 실패했습니다.' })
    }

    // Resend로 이메일 전송
    try {
      const { data, error } = await resend.emails.send({
        from: 'HIKER <onboarding@resend.dev>',
        to: email,
        subject: '[HIKER] 아이디 찾기 인증번호',
        html: `
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
        `
      })

      // Resend API의 validation_error는 테스트 모드에서 정상적인 동작이므로 무시
      if (error) {
        console.warn('Resend 이메일 전송 경고:', error)
        // validation_error인 경우 (테스트 모드에서 다른 이메일로 보낼 때) 무시하고 계속 진행
        if (error.name === 'validation_error' && error.message && error.message.includes('testing emails')) {
          console.log('테스트 모드 validation_error 무시, 인증번호는 Redis에 저장되었습니다.')
          return res.json({
            message: '인증번호가 생성되었습니다. (테스트 모드: 이메일 전송 제한)',
            code: code,
            warning: '테스트 모드에서는 등록된 이메일로만 전송 가능합니다. 인증번호를 직접 확인하세요.'
          })
        }
        // 다른 오류인 경우에만 에러 반환
        console.error('Resend 이메일 전송 오류:', error)
        return res.status(500).json({ 
          error: '이메일 전송에 실패했습니다.',
          details: error.message,
          code: code
        })
      }

      console.log(`이메일 전송 성공: ${email}, Message ID: ${data?.id}`)
      
      res.json({
        message: '인증번호가 전송되었습니다.',
        code: process.env.NODE_ENV === 'development' ? code : undefined
      })
    } catch (emailError) {
      console.error('이메일 전송 오류:', emailError)
      // 에러가 발생해도 Redis에 저장되었으므로 인증번호는 사용 가능
      if (emailError.name === 'validation_error' || (emailError.message && emailError.message.includes('testing emails'))) {
        console.log('테스트 모드 validation_error 무시, 인증번호는 Redis에 저장되었습니다.')
        return res.json({
          message: '인증번호가 생성되었습니다. (테스트 모드: 이메일 전송 제한)',
          code: code,
          warning: '테스트 모드에서는 등록된 이메일로만 전송 가능합니다. 인증번호를 직접 확인하세요.'
        })
      }
      res.json({
        message: '인증번호가 생성되었습니다.',
        code: code,
        warning: `이메일 전송 중 오류가 발생했습니다: ${emailError.message}. 인증번호는 Redis에 저장되었습니다.`
      })
    }
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

// 비밀번호 찾기용 인증번호 전송
router.post('/send-verification-code-password', async (req, res) => {
  try {
    const { id, phone } = req.body

    if (!id || !phone) {
      return res.status(400).json({ error: 'ID와 휴대폰 번호를 입력해주세요.' })
    }

    // 휴대폰 번호 형식 검증
    const phoneRegex = /^010-\d{4}-\d{4}$/
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ error: '올바른 휴대폰 번호 형식이 아닙니다. (010-1111-2222)' })
    }

    // 해당 ID와 휴대폰 번호로 가입된 사용자 확인
    const user = await User.findOne({ id, phone })
    if (!user) {
      return res.status(404).json({ error: '일치하는 회원정보를 찾을 수 없습니다.' })
    }

    // 인증번호 생성 (6자리)
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    
    // Redis에 저장 (5분 TTL - 자동 만료)
    const client = await getRedisClient()
    if (client) {
      const redisKey = `verification:password:${id}:${phone}`
      await client.setEx(redisKey, 300, code) // 5분 = 300초, TTL 설정으로 자동 삭제
      console.log(`비밀번호 찾기 인증번호 Redis 저장: ${id} / ${phone} -> ${code} (5분 TTL)`)
    } else {
      console.warn('Redis 연결 실패, 인증번호 저장 불가')
      return res.status(500).json({ error: '인증번호 저장에 실패했습니다.' })
    }

    // AWS SNS로 SMS 전송
    try {
      // 하이픈 제거하고 국가 코드 추가 (한국: +82)
      const phoneNumber = `+82${phone.replace(/-/g, '').substring(1)}`
      const message = `[오늘의 등산] 비밀번호 찾기 인증번호는 ${code}입니다. 5분 내에 입력해주세요.`
      
      console.log(`비밀번호 찾기 SMS 전송 시도: ${phoneNumber}`)
      
      const result = await sns.publish({
        PhoneNumber: phoneNumber,
        Message: message
      }).promise()
      
      console.log(`비밀번호 찾기 SMS 전송 성공: ${result.MessageId}`)
      
      res.json({
        message: '인증번호가 전송되었습니다.',
        // 개발 환경에서만 인증번호 반환 (실제 운영에서는 제거)
        code: process.env.NODE_ENV === 'development' ? code : undefined
      })
    } catch (snsError) {
      console.error('비밀번호 찾기 SNS 전송 오류:', snsError)
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
    console.error('인증번호 전송 오류:', error)
    res.status(500).json({ error: '인증번호 전송 중 오류가 발생했습니다.' })
  }
})

// 비밀번호 찾기 (임시 비밀번호 발급)
router.post('/find-password', async (req, res) => {
  try {
    const { id, phone, verificationCode } = req.body

    if (!id || !phone || !verificationCode) {
      return res.status(400).json({ error: 'ID, 휴대폰 번호, 인증번호를 모두 입력해주세요.' })
    }

    // Redis에서 인증번호 확인
    const client = await getRedisClient()
    if (!client) {
      return res.status(500).json({ error: '인증번호 확인에 실패했습니다.' })
    }

    const redisKey = `verification:password:${id}:${phone}`
    const storedCode = await client.get(redisKey)
    
    if (!storedCode) {
      return res.status(400).json({ error: '인증번호가 만료되었거나 존재하지 않습니다. 다시 요청해주세요.' })
    }

    if (storedCode !== verificationCode) {
      return res.status(400).json({ error: '인증번호가 일치하지 않습니다.' })
    }

    // 인증번호 확인 후 삭제
    await client.del(redisKey)

    // 사용자 찾기
    const user = await User.findOne({ id, phone })

    if (!user) {
      return res.status(404).json({ error: '일치하는 회원정보를 찾을 수 없습니다.' })
    }

    // 임시 비밀번호 생성 (8자리 랜덤)
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase()
    const tempPasswordShort = tempPassword.slice(0, 8)

    // 비밀번호 업데이트
    user.password = tempPasswordShort
    await user.save()

    res.json({
      message: '임시 비밀번호가 발급되었습니다.',
      tempPassword: tempPasswordShort,
      // 실제 운영 환경에서는 이메일이나 SMS로 전송해야 함
      warning: '임시 비밀번호를 안전하게 보관하시고, 로그인 후 비밀번호를 변경해주세요.'
    })
  } catch (error) {
    console.error('비밀번호 찾기 오류:', error)
    res.status(500).json({ error: '비밀번호 찾기 중 오류가 발생했습니다.' })
  }
})

// 토큰 검증 미들웨어
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN 형식
  
  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' })
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '유효하지 않은 토큰입니다.' })
    }
    req.user = user
    next()
  })
}

// Optional 인증 미들웨어 (토큰이 있으면 req.user 설정, 없으면 통과)
export const optionalAuthenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN 형식
  
  if (!token) {
    // 토큰이 없으면 그냥 통과 (req.user는 undefined)
    return next()
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // 토큰이 유효하지 않아도 통과 (req.user는 undefined)
      return next()
    }
    req.user = user
    next()
  })
}

// 현재 사용자 정보 가져오기
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password')
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }
    res.json({ user })
  } catch (error) {
    console.error('사용자 정보 조회 오류:', error)
    res.status(500).json({ error: '사용자 정보를 가져오는 중 오류가 발생했습니다.' })
  }
})

// 회원정보 수정
router.put('/update', authenticateToken, upload.single('profileImage'), async (req, res) => {
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
    
    const user = await User.findById(userId)
    if (!user) {
      console.error('사용자를 찾을 수 없음:', userId)
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }
    
    console.log('수정 전 사용자 정보:', {
      name: user.name,
      gender: user.gender,
      fitnessLevel: user.fitnessLevel,
      birthYear: user.birthYear,
      phone: user.phone
    })
    
    // 업데이트할 필드 설정 (값이 제공된 경우에만 업데이트)
    if (name !== undefined && name !== null) {
      const trimmedName = name.trim()
      if (trimmedName !== '') {
        user.name = trimmedName
        console.log('이름 업데이트:', user.name)
      }
    }
    if (gender !== undefined && gender !== null && gender !== '') {
      user.gender = gender
      console.log('성별 업데이트:', user.gender)
    }
    if (fitnessLevel !== undefined && fitnessLevel !== null && fitnessLevel !== '') {
      user.fitnessLevel = fitnessLevel
      console.log('등력 업데이트:', user.fitnessLevel)
    }
    if (birthYear !== undefined && birthYear !== null && birthYear !== '') {
      const birthYearNum = parseInt(birthYear)
      if (!isNaN(birthYearNum) && birthYearNum > 1900 && birthYearNum <= new Date().getFullYear()) {
        user.birthYear = birthYearNum
        console.log('출생년도 업데이트:', user.birthYear)
      }
    }
    if (phone !== undefined) {
      user.phone = phone || ''
      console.log('전화번호 업데이트:', user.phone)
    }
    
    // 비밀번호 변경 (입력된 경우에만)
    if (password && password.trim() !== '') {
      if (password.length < 6) {
        return res.status(400).json({ error: '비밀번호는 최소 6자 이상이어야 합니다.' })
      }
      user.password = password
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
      user.profileImage = `/uploads/profiles/${req.file.filename}`
      console.log('프로필 이미지 업데이트:', user.profileImage)
    }
    
    // DB에 저장
    await user.save()
    console.log('DB 저장 완료')
    console.log('수정 후 사용자 정보:', {
      name: user.name,
      gender: user.gender,
      fitnessLevel: user.fitnessLevel,
      birthYear: user.birthYear,
      phone: user.phone,
      profileImage: user.profileImage
    })
    
    res.json({
      message: '회원정보가 수정되었습니다.',
      user: {
        id: user.id,
        name: user.name,
        gender: user.gender,
        fitnessLevel: user.fitnessLevel,
        birthYear: user.birthYear,
        phone: user.phone,
        profileImage: user.profileImage,
        role: user.role || 'user'
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
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    
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
    const user = await User.findById(userId).select('favorites favoriteMountains favoriteStores points').lean()
    let favoriteCount = 0
    
    // 게시글 즐겨찾기 카운트
    if (user && user.favorites && user.favorites.length > 0) {
      // 실제 존재하는 게시글만 카운트
      const existingPosts = await Post.find({ _id: { $in: user.favorites } }).select('_id').lean()
      favoriteCount += existingPosts.length
      
      // 존재하지 않는 게시글 ID 제거 (정리)
      const existingPostIds = existingPosts.map(p => p._id.toString())
      const invalidFavorites = user.favorites.filter(favId => !existingPostIds.includes(favId.toString()))
      if (invalidFavorites.length > 0) {
        await User.findByIdAndUpdate(userId, {
          $pull: { favorites: { $in: invalidFavorites } }
        })
        console.log('존재하지 않는 즐겨찾기 제거:', invalidFavorites.length, '개')
      }
    }
    
    // 산 즐겨찾기 카운트
    if (user && user.favoriteMountains && user.favoriteMountains.length > 0) {
      favoriteCount += user.favoriteMountains.length
    }
    
    // 스토어 즐겨찾기 카운트
    if (user && user.favoriteStores && user.favoriteStores.length > 0) {
      favoriteCount += user.favoriteStores.length
    }
    
    console.log(
      '사용자 ID:',
      userId,
      '즐겨찾기 수:',
      favoriteCount,
      '(게시글:',
      user?.favorites?.length || 0,
      '산:',
      user?.favoriteMountains?.length || 0,
      '스토어:',
      user?.favoriteStores?.length || 0,
      ') 포인트:',
      user?.points ?? 0
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
    const currentPoints = user?.points ?? 0
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
router.get('/mountains/:code/favorite', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const { code } = req.params
    const mountainCode = String(code)

    const user = await User.findById(userId).select('favoriteMountains').lean()
    const isFavorited = !!(user && user.favoriteMountains && user.favoriteMountains.includes(mountainCode))

    res.json({ isFavorited })
  } catch (error) {
    console.error('산 즐겨찾기 상태 조회 오류:', error)
    res.status(500).json({ error: '즐겨찾기 상태 조회 중 오류가 발생했습니다.' })
  }
})

// 산 즐겨찾기 토글
router.post('/mountains/:code/favorite', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const { code } = req.params
    const mountainCode = String(code)

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }

    if (!user.favoriteMountains) {
      user.favoriteMountains = []
    }

    const idx = user.favoriteMountains.indexOf(mountainCode)
    if (idx > -1) {
      user.favoriteMountains.splice(idx, 1)
      await user.save()
      return res.json({ isFavorited: false, message: '즐겨찾기에서 제거되었습니다.' })
    } else {
      user.favoriteMountains.push(mountainCode)
      await user.save()
      return res.json({ isFavorited: true, message: '즐겨찾기에 추가되었습니다.' })
    }
  } catch (error) {
    console.error('산 즐겨찾기 처리 오류:', error)
    res.status(500).json({ error: '즐겨찾기 처리 중 오류가 발생했습니다.' })
  }
})

// 즐겨찾기한 산 목록 조회
router.get('/mountains/favorites/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const user = await User.findById(userId).select('favoriteMountains').lean()
    const favoriteCodes = user?.favoriteMountains || []

    const mountains = favoriteCodes.map(code => {
      const info = getMountainInfo(code)
      if (info) return info
      return {
        code,
        name: `산 (코드: ${code})`,
        height: null,
        location: null,
        center: null
      }
    })

    res.json({ mountains })
  } catch (error) {
    console.error('즐겨찾기한 산 목록 조회 오류:', error)
    res.status(500).json({ error: '즐겨찾기한 산 목록을 불러오는 중 오류가 발생했습니다.' })
  }
})

// 회원 탈퇴 (인증 필요)
router.delete('/delete', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    
    // 사용자 확인
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }

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
    await User.findByIdAndDelete(userId)

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

// 카카오 로그인 콜백
router.get('/kakao/callback', async (req, res) => {
  try {
    const { code, error, error_description } = req.query
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://192.168.0.242'
    
    console.log('카카오 콜백 받음 - code:', code ? '있음' : '없음', 'error:', error, 'error_description:', error_description)
    
    if (error) {
      console.error('카카오 OAuth 오류:', error, error_description)
      return res.redirect(`${FRONTEND_URL}/login?error=kakao_oauth_error&message=${encodeURIComponent(error_description || error)}`)
    }
    
    if (!code) {
      console.error('카카오 인증 코드 없음')
      return res.redirect(`${FRONTEND_URL}/login?error=kakao_auth_failed`)
    }

    const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '75218448ddb01cb67aec079a8dbd61ae'
    const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET || 'jqAC1gVOlf7cBhb500rReivNfJ3o5F59'
    const REDIRECT_URI = process.env.KAKAO_REDIRECT_URI || 'http://192.168.0.242/api/auth/kakao/callback'

    // 액세스 토큰 요청
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: KAKAO_REST_API_KEY,
      redirect_uri: REDIRECT_URI,
      code: code
    })
    
    // Client Secret이 있으면 추가
    if (KAKAO_CLIENT_SECRET) {
      tokenParams.append('client_secret', KAKAO_CLIENT_SECRET)
    }

    const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams
    })

    const tokenData = await tokenResponse.json()
    console.log('카카오 토큰 응답:', tokenData.error ? tokenData : '성공')
    if (!tokenData.access_token) {
      console.error('카카오 토큰 요청 실패:', JSON.stringify(tokenData, null, 2))
      return res.redirect(`${FRONTEND_URL}/login?error=kakao_token_failed&message=${encodeURIComponent(tokenData.error_description || tokenData.error || '토큰 요청 실패')}`)
    }

    // 사용자 정보 요청
    const userInfoResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    })

    const kakaoUser = await userInfoResponse.json()
    console.log('카카오 사용자 정보 응답:', kakaoUser.error ? kakaoUser : '성공')
    if (!kakaoUser.id) {
      console.error('카카오 사용자 정보 요청 실패:', JSON.stringify(kakaoUser, null, 2))
      return res.redirect(`${FRONTEND_URL}/login?error=kakao_user_info_failed&message=${encodeURIComponent(kakaoUser.msg || '사용자 정보 요청 실패')}`)
    }

    // DB에서 사용자 찾기 또는 생성
    const socialId = `kakao_${kakaoUser.id}`
    let user = await User.findOne({ socialId, socialProvider: 'kakao' })

    if (!user) {
      // 신규 사용자 생성
      const kakaoAccount = kakaoUser.kakao_account || {}
      const profile = kakaoAccount.profile || {}
      
      // 고유한 ID 생성 (카카오 ID 기반)
      let userId = `kakao_${kakaoUser.id}`
      let counter = 1
      while (await User.findOne({ id: userId })) {
        userId = `kakao_${kakaoUser.id}_${counter}`
        counter++
      }

      user = new User({
        id: userId,
        name: profile.nickname || kakaoAccount.name || `카카오사용자${kakaoUser.id}`,
        password: Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase(), // 임시 비밀번호
        gender: 'male', // 기본값
        fitnessLevel: 'beginner', // 기본값
        birthYear: new Date().getFullYear() - 25, // 기본값
        socialId: socialId,
        socialProvider: 'kakao',
        profileImage: profile.profile_image_url || null
      })
      await user.save()
      console.log('카카오 신규 사용자 DB 저장 완료:', user.id, user.name)
    }

    // JWT 토큰 생성
    const token = jwt.sign(
      { userId: user._id, id: user.id },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    // 프론트엔드로 리다이렉트 (토큰을 쿼리 파라미터로 전달)
    console.log('카카오 로그인 성공, 사용자:', user.id, user.name)
    res.redirect(`${FRONTEND_URL}/auth/success?token=${token}&user=${encodeURIComponent(JSON.stringify({
      id: user.id,
      name: user.name,
      gender: user.gender,
      fitnessLevel: user.fitnessLevel,
      profileImage: user.profileImage,
      role: user.role || 'user'
    }))}`)
  } catch (error) {
    console.error('카카오 로그인 오류:', error)
    const FRONTEND_URL_ERROR = process.env.FRONTEND_URL || 'http://192.168.0.242'
    res.redirect(`${FRONTEND_URL_ERROR}/login?error=kakao_login_failed`)
  }
})

// 네이버 로그인 시작
router.get('/naver', (req, res) => {
  const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || 'bPUAgB6QZBRBZrL3G1CN'
  // 백엔드로 콜백 받기
  const REDIRECT_URI = process.env.NAVER_REDIRECT_URI || 'http://192.168.0.242/api/auth/naver/callback'
  const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  
  // 네이버 OAuth URL 생성
  const naverAuthURL = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`
  
  console.log('네이버 로그인 시작')
  console.log('- Client ID:', NAVER_CLIENT_ID)
  console.log('- Redirect URI:', REDIRECT_URI)
  console.log('- State:', state)
  console.log('- Full URL:', naverAuthURL)
  
  // CORS 헤더 설정 (필요한 경우)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.redirect(naverAuthURL)
})

// 네이버 로그인 콜백
router.get('/naver/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://192.168.0.242'
    
    console.log('네이버 콜백 받음 - code:', code ? '있음' : '없음', 'error:', error, 'error_description:', error_description)
    
    if (error) {
      console.error('네이버 OAuth 오류:', error, error_description)
      return res.redirect(`${FRONTEND_URL}/login?error=naver_oauth_error&message=${encodeURIComponent(error_description || error)}`)
    }
    
    if (!code) {
      console.error('네이버 인증 코드 없음')
      return res.redirect(`${FRONTEND_URL}/login?error=naver_auth_failed`)
    }

    const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || 'bPUAgB6QZBRBZrL3G1CN'
    const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '9TzCuTvpBJ'
    const REDIRECT_URI = process.env.NAVER_REDIRECT_URI || 'http://192.168.0.242/api/auth/naver/callback'

    // 액세스 토큰 요청
    const tokenResponse = await fetch('https://nid.naver.com/oauth2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
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
    console.log('네이버 토큰 응답:', tokenData.error ? tokenData : '성공')
    if (!tokenData.access_token) {
      console.error('네이버 토큰 요청 실패:', JSON.stringify(tokenData, null, 2))
      return res.redirect(`${FRONTEND_URL}/login?error=naver_token_failed&message=${encodeURIComponent(tokenData.error_description || tokenData.error || '토큰 요청 실패')}`)
    }

    // 사용자 정보 요청
    const userInfoResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    })

    const naverUserData = await userInfoResponse.json()
    console.log('네이버 사용자 정보 응답:', naverUserData.error ? naverUserData : '성공')
    if (!naverUserData.response || !naverUserData.response.id) {
      console.error('네이버 사용자 정보 요청 실패:', JSON.stringify(naverUserData, null, 2))
      return res.redirect(`${FRONTEND_URL}/login?error=naver_user_info_failed&message=${encodeURIComponent(naverUserData.errorMessage || '사용자 정보 요청 실패')}`)
    }

    const naverUser = naverUserData.response

    // DB에서 사용자 찾기 또는 생성
    const socialId = `naver_${naverUser.id}`
    let user = await User.findOne({ socialId, socialProvider: 'naver' })

    if (!user) {
      // 신규 사용자 생성
      let userId = `naver_${naverUser.id}`
      let counter = 1
      while (await User.findOne({ id: userId })) {
        userId = `naver_${naverUser.id}_${counter}`
        counter++
      }

      // 성별 변환 (네이버는 M/F, 우리는 male/female)
      const gender = naverUser.gender === 'M' ? 'male' : (naverUser.gender === 'F' ? 'female' : 'male')
      
      // 출생년도 추출 (YYYY 형식)
      let birthYear = new Date().getFullYear() - 25 // 기본값
      if (naverUser.birthyear) {
        birthYear = parseInt(naverUser.birthyear)
      }

      user = new User({
        id: userId,
        name: naverUser.nickname || naverUser.name || `네이버사용자${naverUser.id}`,
        password: Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase(), // 임시 비밀번호
        gender: gender,
        fitnessLevel: 'beginner', // 기본값
        birthYear: birthYear,
        socialId: socialId,
        socialProvider: 'naver',
        profileImage: naverUser.profile_image || null
      })
      await user.save()
      console.log('네이버 신규 사용자 DB 저장 완료:', user.id, user.name)
    }

    // JWT 토큰 생성
    const token = jwt.sign(
      { userId: user._id, id: user.id },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    // 프론트엔드로 리다이렉트 (토큰을 쿼리 파라미터로 전달)
    console.log('네이버 로그인 성공, 사용자:', user.id, user.name, '신규:', !user.createdAt || user.createdAt > new Date(Date.now() - 10000))
    res.redirect(`${FRONTEND_URL}/auth/success?token=${token}&user=${encodeURIComponent(JSON.stringify({
      id: user.id,
      name: user.name,
      gender: user.gender,
      fitnessLevel: user.fitnessLevel,
      profileImage: user.profileImage,
      role: user.role || 'user'
    }))}`)
  } catch (error) {
    console.error('네이버 로그인 오류:', error)
    const FRONTEND_URL_ERROR = process.env.FRONTEND_URL || 'http://192.168.0.242'
    res.redirect(`${FRONTEND_URL_ERROR}/login?error=naver_login_failed`)
  }
})

export default router


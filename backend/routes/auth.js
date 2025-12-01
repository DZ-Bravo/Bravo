import express from 'express'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import User from '../models/User.js'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import fs from 'fs'

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

// 회원가입
router.post('/signup', upload.single('profileImage'), async (req, res) => {
  try {
    // 디버깅: 받은 데이터 확인
    console.log('=== 회원가입 요청 ===')
    console.log('req.body:', req.body)
    console.log('req.file:', req.file ? req.file.filename : '없음')
    
    const { id, name, password, confirmPassword, gender, fitnessLevel, birthYear } = req.body
    
    console.log('파싱된 필드:', {
      id: id || '없음',
      name: name || '없음',
      password: password ? '***' : '없음',
      confirmPassword: confirmPassword ? '***' : '없음',
      gender: gender || '없음',
      fitnessLevel: fitnessLevel || '없음',
      birthYear: birthYear || '없음'
    })
    
    // birthYear를 숫자로 변환
    const birthYearNum = birthYear ? parseInt(birthYear) : null
    
    // 필수 필드 검증 (빈 문자열도 체크)
    const isEmpty = (value) => !value || (typeof value === 'string' && value.trim() === '')
    
    if (isEmpty(id) || isEmpty(name) || isEmpty(password) || isEmpty(gender) || isEmpty(fitnessLevel) || !birthYearNum || isNaN(birthYearNum)) {
      const missingFields = []
      if (isEmpty(id)) missingFields.push('ID')
      if (isEmpty(name)) missingFields.push('이름/닉네임')
      if (isEmpty(password)) missingFields.push('비밀번호')
      if (isEmpty(gender)) missingFields.push('성별')
      if (isEmpty(fitnessLevel)) missingFields.push('등력')
      if (!birthYearNum || isNaN(birthYearNum)) missingFields.push('출생년도')
      
      console.log('누락된 필드:', missingFields)
      console.log('실제 값:', { id, name, gender, fitnessLevel, birthYear, birthYearNum })
      
      return res.status(400).json({ 
        error: `다음 항목을 입력해주세요: ${missingFields.join(', ')}` 
      })
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
    
    // 사용자 생성
    const user = new User({
      id,
      name,
      password,
      gender,
      fitnessLevel,
      birthYear: birthYearNum,
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
        profileImage: user.profileImage
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
        profileImage: user.profileImage
      }
    })
  } catch (error) {
    console.error('로그인 오류:', error)
    res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' })
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

export default router


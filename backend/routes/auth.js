import express from 'express'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import User from '../models/User.js'
import Post from '../models/Post.js'
import Comment from '../models/Comment.js'
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

// 인증번호 전송 (간단한 구현 - 실제로는 SMS API 연동 필요)
const verificationCodes = new Map() // 메모리에 저장 (실제로는 Redis 등 사용)

router.post('/send-verification-code', async (req, res) => {
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

    // 해당 휴대폰 번호로 가입된 사용자 확인
    const user = await User.findOne({ phone })
    if (!user) {
      return res.status(404).json({ error: '해당 휴대폰 번호로 가입된 회원이 없습니다.' })
    }

    // 인증번호 생성 (6자리)
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    
    // 메모리에 저장 (5분 유효)
    verificationCodes.set(phone, {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000
    })

    // 실제로는 SMS API로 전송해야 함
    console.log(`인증번호 전송: ${phone} -> ${code}`)

    res.json({
      message: '인증번호가 전송되었습니다.',
      // 개발 환경에서는 인증번호 반환 (실제 운영에서는 제거)
      code: process.env.NODE_ENV === 'development' ? code : undefined
    })
  } catch (error) {
    console.error('인증번호 전송 오류:', error)
    res.status(500).json({ error: '인증번호 전송 중 오류가 발생했습니다.' })
  }
})

// 아이디 찾기 (휴대폰 번호 인증)
router.post('/find-id', async (req, res) => {
  try {
    const { phone, verificationCode } = req.body

    if (!phone || !verificationCode) {
      return res.status(400).json({ error: '휴대폰 번호와 인증번호를 입력해주세요.' })
    }

    // 인증번호 확인
    const stored = verificationCodes.get(phone)
    if (!stored) {
      return res.status(400).json({ error: '인증번호를 먼저 요청해주세요.' })
    }

    if (Date.now() > stored.expiresAt) {
      verificationCodes.delete(phone)
      return res.status(400).json({ error: '인증번호가 만료되었습니다. 다시 요청해주세요.' })
    }

    if (stored.code !== verificationCode) {
      return res.status(400).json({ error: '인증번호가 일치하지 않습니다.' })
    }

    // 인증번호 확인 후 삭제
    verificationCodes.delete(phone)

    // 사용자 찾기
    const user = await User.findOne({ phone })
      .select('id name createdAt')

    if (!user) {
      return res.status(404).json({ error: '일치하는 회원정보를 찾을 수 없습니다.' })
    }

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
    
    // 메모리에 저장 (5분 유효) - ID와 phone을 키로 사용
    const key = `${id}:${phone}`
    verificationCodes.set(key, {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000
    })

    // 실제로는 SMS API로 전송해야 함
    console.log(`비밀번호 찾기 인증번호 전송: ${id} / ${phone} -> ${code}`)

    res.json({
      message: '인증번호가 전송되었습니다.',
      // 개발 환경에서는 인증번호 반환 (실제 운영에서는 제거)
      code: process.env.NODE_ENV === 'development' ? code : undefined
    })
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

    // 인증번호 확인
    const key = `${id}:${phone}`
    const stored = verificationCodes.get(key)
    if (!stored) {
      return res.status(400).json({ error: '인증번호를 먼저 요청해주세요.' })
    }

    if (Date.now() > stored.expiresAt) {
      verificationCodes.delete(key)
      return res.status(400).json({ error: '인증번호가 만료되었습니다. 다시 요청해주세요.' })
    }

    if (stored.code !== verificationCode) {
      return res.status(400).json({ error: '인증번호가 일치하지 않습니다.' })
    }

    // 인증번호 확인 후 삭제
    verificationCodes.delete(key)

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
    
    // 등반한 산 수 (현재는 구현되지 않음, 추후 확장 가능)
    const climbedMountains = 0
    
    // 누적고도 (m) - 등반한 산들의 고도 합계 (현재는 구현되지 않음, 추후 확장 가능)
    const totalElevation = 0
    
    // 누적시간 (시간) - 등반한 산들의 소요시간 합계 (현재는 구현되지 않음, 추후 확장 가능)
    const totalTime = 0
    
    // 작성한 글 수
    const postCount = await Post.countDocuments({ author: userId })
    
    // 등산일지 수 (카테고리가 정확히 'diary'인 게시글만 카운트)
    const hikingLogs = await Post.countDocuments({ 
      author: userId, 
      category: { $eq: 'diary' } 
    })
    
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
    
    // 즐겨찾기 수 (찜 목록) - 실제 존재하는 게시글만 카운트
    const user = await User.findById(userId).select('favorites').lean()
    let favoriteCount = 0
    if (user && user.favorites && user.favorites.length > 0) {
      // 실제 존재하는 게시글만 카운트
      const existingPosts = await Post.find({ _id: { $in: user.favorites } }).select('_id').lean()
      favoriteCount = existingPosts.length
      
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
    
    console.log('사용자 ID:', userId, '즐겨찾기 수:', favoriteCount, '원본 배열 길이:', user?.favorites?.length || 0)
    
    res.json({
      totalElevation,
      totalTime,
      climbedMountains,
      postCount,
      totalLikes,
      diaryLikes,
      communityLikes,
      hikingLogs,
      points: 0, // 추후 확장 가능
      schedules: 0, // 추후 확장 가능
      items: favoriteCount // 즐겨찾기 수
    })
  } catch (error) {
    console.error('사용자 통계 조회 오류:', error)
    res.status(500).json({ error: '사용자 통계를 가져오는 중 오류가 발생했습니다.' })
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
  const REDIRECT_URI = process.env.KAKAO_REDIRECT_URI || 'http://192.168.0.242:5000/api/auth/kakao/callback'
  
  // 카카오 OAuth URL 생성
  const kakaoAuthURL = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_API_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code`
  
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
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://192.168.0.242:3000'
    
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
    const REDIRECT_URI = process.env.KAKAO_REDIRECT_URI || 'http://192.168.0.242:5000/api/auth/kakao/callback'

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
    const FRONTEND_URL_ERROR = process.env.FRONTEND_URL || 'http://192.168.0.242:3000'
    res.redirect(`${FRONTEND_URL_ERROR}/login?error=kakao_login_failed`)
  }
})

// 네이버 로그인 시작
router.get('/naver', (req, res) => {
  const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || 'bPUAgB6QZBRBZrL3G1CN'
  // 백엔드로 콜백 받기
  const REDIRECT_URI = process.env.NAVER_REDIRECT_URI || 'http://192.168.0.242:5000/api/auth/naver/callback'
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
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://192.168.0.242:3000'
    
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
    const REDIRECT_URI = process.env.NAVER_REDIRECT_URI || 'http://192.168.0.242:5000/api/auth/naver/callback'

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
    const FRONTEND_URL_ERROR = process.env.FRONTEND_URL || 'http://192.168.0.242:3000'
    res.redirect(`${FRONTEND_URL_ERROR}/login?error=naver_login_failed`)
  }
})

export default router


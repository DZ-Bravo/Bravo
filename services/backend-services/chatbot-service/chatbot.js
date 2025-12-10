import express from 'express'
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime'
import { authenticateToken } from './shared/utils/auth.js'
import ChatConversation from './shared/models/ChatConversation.js'
import User from './shared/models/User.js'

const router = express.Router()

// AWS Bedrock Agent Runtime 클라이언트 초기화
const bedrockClient = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION || 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

const AGENT_ID = process.env.BEDROCK_AGENT_ID
const AGENT_ALIAS_ID = process.env.BEDROCK_AGENT_ALIAS_ID

// 세션 ID 생성 함수
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// 인사말 감지 함수
function isGreeting(message) {
  const normalizedMessage = message.trim().toLowerCase()
  const greetings = [
    '안녕', '안녕하세요', '안녕하셔요', '하이', '하이요', 'hi', 'hello', 
    '헬로', '헬로우', '반가워', '반갑습니다', '좋은 아침', '좋은 저녁',
    '안녕히', '안뇽', '하이하이', '헬로하이', '안녕하세요', '안녕하셔요'
  ]
  
  // 정확히 인사말만 있는지 확인 (단어 단위로 체크)
  const words = normalizedMessage.split(/\s+/)
  return greetings.some(greeting => {
    const normalizedGreeting = greeting.toLowerCase()
    // 정확히 일치하거나, 인사말로 시작하고 추가 텍스트가 거의 없는 경우
    return normalizedMessage === normalizedGreeting || 
           normalizedMessage.startsWith(normalizedGreeting + ' ') ||
           words.length <= 2 && words.some(word => word === normalizedGreeting || word.startsWith(normalizedGreeting))
  })
}

// 인사말에 대한 응답 생성
function getGreetingResponse() {
  const responses = [
    '안녕하세요! HIKER 챗봇입니다. 등산 정보나 코스 추천, 산 관련 질문 등 무엇이든 도와드리겠습니다. 무엇을 도와드릴까요?',
    '안녕하세요! 등산 정보를 찾고 계신가요? 산 추천, 코스 정보, 날씨, 주변 시설 등 무엇이든 물어보세요!',
    '안녕하세요! HIKER 챗봇입니다. 오늘 등산 계획이 있으신가요? 어떤 도움이 필요하신지 알려주세요!'
  ]
  return responses[Math.floor(Math.random() * responses.length)]
}

// 대화 목록 조회
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    
    const conversations = await ChatConversation.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(20)
      .select('title sessionId createdAt updatedAt messages')
    
    res.json({ conversations })
  } catch (error) {
    console.error('대화 목록 조회 오류:', error)
    res.status(500).json({ error: '대화 목록을 불러오는데 실패했습니다.' })
  }
})

// 특정 대화 조회
router.get('/conversations/:sessionId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const { sessionId } = req.params
    
    const conversation = await ChatConversation.findOne({ 
      userId, 
      sessionId 
    })
    
    if (!conversation) {
      return res.status(404).json({ error: '대화를 찾을 수 없습니다.' })
    }
    
    // 메시지를 createdAt 순으로 정렬
    conversation.messages.sort((a, b) => a.createdAt - b.createdAt)
    
    res.json({ conversation })
  } catch (error) {
    console.error('대화 조회 오류:', error)
    res.status(500).json({ error: '대화를 불러오는데 실패했습니다.' })
  }
})

// 새 대화 시작
router.post('/conversations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const sessionId = generateSessionId()
    
    const conversation = new ChatConversation({
      userId,
      sessionId,
      title: '새 대화',
      messages: []
    })
    
    await conversation.save()
    
    res.json({ 
      conversation: {
        sessionId: conversation.sessionId,
        title: conversation.title,
        createdAt: conversation.createdAt
      }
    })
  } catch (error) {
    console.error('대화 생성 오류:', error)
    res.status(500).json({ error: '대화를 생성하는데 실패했습니다.' })
  }
})

// 한국 시간(KST) 변환 함수 (UTC 기준 +9시간)
function getKoreaTime() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
}

// 챗봇 메시지 전송 및 응답 받기
router.post('/message', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const { message, sessionId } = req.body
    
    if (!message || !message.trim()) {
      return res.status(400).json({ error: '메시지를 입력해주세요.' })
    }
    
    // 사용자 정보 조회 (id/이름 가져오기)
    const user = await User.findById(userId).select('id name')
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    }
    const userIdentifier = user.id  // 로그인용 id (예: uuuuuu)
    
    // 세션이 없으면 새로 생성
    let conversation = await ChatConversation.findOne({ 
      userId, 
      sessionId: sessionId || null 
    })
    
    if (!conversation && sessionId) {
      // 세션 ID가 제공되었지만 찾을 수 없는 경우
      return res.status(404).json({ error: '대화를 찾을 수 없습니다.' })
    }
    
    if (!conversation) {
      // 새 대화 생성
      const newSessionId = generateSessionId()
      conversation = new ChatConversation({
        userId,
        sessionId: newSessionId,
        title: message.substring(0, 30) + (message.length > 30 ? '...' : ''),
        messages: []
      })
      await conversation.save()
    }
    
    // 사용자 메시지 저장 (ChatConversation의 messages 배열에 직접 저장)
    const userMessage = {
      userId: userIdentifier,  // 로그인 id 저장
      role: 'user',
      content: message,
      createdAt: getKoreaTime()  // 한국 시간으로 저장
    }
    conversation.messages.push(userMessage)
    
    let assistantResponse = ''
    
    // 인사말인 경우 직접 응답 (Bedrock Agent 호출 전 처리)
    if (isGreeting(message)) {
      assistantResponse = getGreetingResponse()
    } else {
      // 일반 질문인 경우 Bedrock Agent 호출
      // Bedrock Agent는 자체적으로 세션을 관리하므로 우리의 sessionId를 사용
      const command = new InvokeAgentCommand({
        agentId: AGENT_ID,
        agentAliasId: AGENT_ALIAS_ID,
        sessionId: conversation.sessionId, // 우리가 생성한 세션 ID를 Bedrock Agent 세션 ID로 사용
        inputText: message, // 현재 메시지만 전달 (Agent가 세션 히스토리 관리)
        enableTrace: false
      })
      
      const response = await bedrockClient.send(command)
      
      // 스트리밍 응답 처리
      if (response.completion) {
        for await (const chunk of response.completion) {
          if (chunk.chunk?.bytes) {
            const chunkText = new TextDecoder().decode(chunk.chunk.bytes)
            assistantResponse += chunkText
          }
        }
      }
      
      // 응답이 없으면 기본 메시지
      if (!assistantResponse.trim()) {
        assistantResponse = '죄송합니다. 응답을 생성하는데 문제가 발생했습니다.'
      }
      
      // 디버깅: Bedrock 원본 응답 확인 (정리 전)
      const originalResponse = assistantResponse
      console.log('=== Bedrock 원본 응답 (정리 전) ===')
      console.log('원본 길이:', originalResponse.length)
      console.log('원본 앞 100자:', JSON.stringify(originalResponse.substring(0, 100)))
      console.log('앞뒤 개행 개수 - 앞:', (originalResponse.match(/^\n+/) || [''])[0].length, '/ 뒤:', (originalResponse.match(/\n+$/) || [''])[0].length)
      console.log('================================')
      
      // 1. 출처 정보 제거 (예: "(출처: EJGr)", "(출처: R7MW)" 등) - 먼저 제거
      assistantResponse = assistantResponse.replace(/\s*\(출처:\s*[^)]+\)/g, '')
      
      // 2. 불필요한 문구 제거
      assistantResponse = assistantResponse.replace(/^여기 검색 결과가 있습니다:\s*/i, '')
      
      // 3. 문자 그대로 "\n" (백슬래시+n)이 문자열로 들어있는 경우 제거
      assistantResponse = assistantResponse.replace(/\\n/g, ' ')
      
      // 4. 실제 개행 문자 정리: 앞뒤 연속 개행 제거, 중간의 3개 이상 개행은 2개로 축소
      assistantResponse = assistantResponse
        .replace(/^\n+/, '')  // 앞쪽 개행 제거
        .replace(/\n+$/, '')  // 뒤쪽 개행 제거
        .replace(/\n{3,}/g, '\n\n')  // 3개 이상 연속 개행을 2개로 축소
      
      // 5. 연속된 공백 정리 (개행 제거 후 생긴 공백 정리)
      assistantResponse = assistantResponse.replace(/[ \t]{2,}/g, ' ').trim()
      
      // 디버깅: 정리 후 응답 확인
      console.log('=== 정리 후 응답 ===')
      console.log('정리 후 길이:', assistantResponse.length)
      console.log('정리 후 앞 100자:', JSON.stringify(assistantResponse.substring(0, 100)))
      console.log('앞뒤 개행 제거 여부 - 앞:', !assistantResponse.match(/^\n/), '/ 뒤:', !assistantResponse.match(/\n$/))
      console.log('==================')
    }
    
    // 어시스턴트 응답 저장 (ChatConversation의 messages 배열에 직접 저장)
    const assistantMessage = {
      userId: userIdentifier,  // 로그인 id 저장
      role: 'assistant',
      content: assistantResponse,
      createdAt: getKoreaTime()  // 한국 시간으로 저장
    }
    conversation.messages.push(assistantMessage)
    conversation.updatedAt = new Date()
    
    // 첫 메시지면 제목 업데이트
    if (conversation.messages.length === 2) {
      conversation.title = message.substring(0, 30) + (message.length > 30 ? '...' : '')
    }
    
    await conversation.save()
    
    // 저장 후 마지막 메시지의 _id 가져오기 (Mongoose가 subdocument에 자동으로 _id 생성)
    const lastMessage = conversation.messages[conversation.messages.length - 1]
    
    // 디버깅: JSON 전송 전 확인
    console.log('=== JSON 전송 전 디버깅 ===')
    console.log('assistantResponse 타입:', typeof assistantResponse)
    console.log('JSON.stringify 결과:', JSON.stringify({ response: assistantResponse }).substring(0, 300))
    console.log('저장된 메시지 개수:', conversation.messages.length)
    console.log('==========================')
    
    res.json({
      response: assistantResponse,
      sessionId: conversation.sessionId,
      messageId: lastMessage?._id?.toString() || null
    })
    
  } catch (error) {
    console.error('챗봇 메시지 처리 오류:', error)
    
    // AWS 에러 처리
    if (error.name === 'AccessDeniedException') {
      return res.status(403).json({ error: 'AWS 접근 권한이 없습니다.' })
    }
    
    res.status(500).json({ 
      error: '메시지 처리 중 오류가 발생했습니다.',
      details: error.message 
    })
  }
})

export default router


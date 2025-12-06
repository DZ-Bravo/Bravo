import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../utils/api'
import './Chatbot.css'

function Chatbot() {
  const navigate = useNavigate()
  const messagesEndRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([
    {
      type: 'bot',
      text: '안녕하세요! HIKER 챗봇입니다. 무엇을 도와드릴까요?'
    }
  ])

  // 메시지가 추가될 때마다 스크롤을 맨 아래로
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const toggleChat = () => {
    setIsOpen(!isOpen)
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!message.trim() || isLoading) return

    // 로그인 확인
    const token = localStorage.getItem('token')
    if (!token) {
      alert('로그인이 필요한 서비스입니다.')
      navigate('/login')
      return
    }

    const userMessage = message.trim()
    
    // 사용자 메시지 즉시 표시
    setMessages(prev => [...prev, { type: 'user', text: userMessage }])
    setMessage('')
    setIsLoading(true)

    try {
      const response = await fetch(`${API_URL}/api/chatbot/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: userMessage,
          sessionId: sessionId
        })
      })

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('token')
          alert('로그인이 만료되었습니다. 다시 로그인해주세요.')
          navigate('/login')
          return
        }
        const errorData = await response.json()
        throw new Error(errorData.error || '메시지 전송에 실패했습니다.')
      }

      const data = await response.json()
      
      // 디버깅: 프론트엔드에서 받은 데이터 확인
      console.log('=== 프론트엔드 응답 디버깅 ===')
      console.log('받은 데이터:', data)
      console.log('data.response 타입:', typeof data.response)
      console.log('data.response 길이:', data.response?.length)
      console.log('data.response (JSON.stringify):', JSON.stringify(data.response?.substring(0, 200)))
      console.log('앞 50자:', data.response?.substring(0, 50))
      console.log('\\n 포함 여부:', data.response?.includes('\n'))
      console.log('문자 그대로 \\n 포함 여부:', data.response?.includes('\\n'))
      console.log('============================')
      
      // 세션 ID 저장 (첫 메시지인 경우)
      if (!sessionId && data.sessionId) {
        setSessionId(data.sessionId)
      }

      // 챗봇 응답 추가
      setMessages(prev => [...prev, {
        type: 'bot',
        text: data.response
      }])

    } catch (error) {
      console.error('챗봇 메시지 전송 오류:', error)
      setMessages(prev => [...prev, {
        type: 'bot',
        text: '죄송합니다. 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
      }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="chatbot-icon" onClick={toggleChat}>
        <img src="/images/chatbot_icon.png" alt="챗봇" />
      </div>
      
      {isOpen && (
        <div className="chatbot-container">
          <div className="chatbot-window">
            <div className="chatbot-header">
              <div className="chatbot-header-info">
                <div className="chatbot-avatar">
                  <img src="/images/chatbot_icon.png" alt="챗봇" />
                </div>
                <div>
                  <div className="chatbot-name">HIKER 챗봇</div>
                  <div className="chatbot-status">온라인</div>
                </div>
              </div>
              <button className="chatbot-close" onClick={toggleChat}>×</button>
            </div>
            
            <div className="chatbot-messages">
              {messages.map((msg, index) => {
                // 디버깅: 렌더링 전 메시지 확인
                if (msg.type === 'bot' && msg.text) {
                  console.log(`=== 렌더링 메시지 [${index}] ===`)
                  console.log('msg.text 타입:', typeof msg.text)
                  console.log('msg.text (JSON.stringify):', JSON.stringify(msg.text?.substring(0, 200)))
                  console.log('앞 50자:', msg.text?.substring(0, 50))
                  console.log('=============================')
                }
                return (
                  <div key={index} className={`message ${msg.type}`}>
                    <div className="message-bubble">
                      {msg.text}
                    </div>
                  </div>
                )
              })}
              {isLoading && (
                <div className="message bot">
                  <div className="message-bubble">
                    <span className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            
            <form className="chatbot-input-area" onSubmit={handleSend}>
              <input
                type="text"
                placeholder={isLoading ? "응답을 기다리는 중..." : "메시지를 입력하세요..."}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="chatbot-input"
                disabled={isLoading}
              />
              <button 
                type="submit" 
                className="chatbot-send-btn"
                disabled={isLoading || !message.trim()}
              >
                {isLoading ? '전송 중...' : '전송'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export default Chatbot



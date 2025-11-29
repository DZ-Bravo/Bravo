import { useState } from 'react'
import './Chatbot.css'

function Chatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([
    {
      type: 'bot',
      text: '안녕하세요! 오늘의 등산 챗봇입니다. 무엇을 도와드릴까요?'
    }
  ])

  const toggleChat = () => {
    setIsOpen(!isOpen)
  }

  const handleSend = (e) => {
    e.preventDefault()
    if (!message.trim()) return

    // 사용자 메시지 추가
    setMessages([...messages, { type: 'user', text: message }])
    setMessage('')

    // 챗봇 응답 (디자인만이므로 간단한 응답)
    setTimeout(() => {
      setMessages(prev => [...prev, {
        type: 'bot',
        text: '감사합니다. 문의사항을 확인했습니다. 곧 답변드리겠습니다.'
      }])
    }, 500)
  }

  return (
    <>
      <div className="chatbot-icon" onClick={toggleChat}>
        <span>챗봇</span>
      </div>
      
      {isOpen && (
        <div className="chatbot-container">
          <div className="chatbot-window">
            <div className="chatbot-header">
              <div className="chatbot-header-info">
                <div className="chatbot-avatar">🤖</div>
                <div>
                  <div className="chatbot-name">오늘의 등산 챗봇</div>
                  <div className="chatbot-status">온라인</div>
                </div>
              </div>
              <button className="chatbot-close" onClick={toggleChat}>×</button>
            </div>
            
            <div className="chatbot-messages">
              {messages.map((msg, index) => (
                <div key={index} className={`message ${msg.type}`}>
                  <div className="message-bubble">
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            
            <form className="chatbot-input-area" onSubmit={handleSend}>
              <input
                type="text"
                placeholder="메시지를 입력하세요..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="chatbot-input"
              />
              <button type="submit" className="chatbot-send-btn">
                전송
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export default Chatbot




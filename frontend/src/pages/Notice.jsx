import { Link } from 'react-router-dom'
import Header from '../components/Header'
import { notices } from '../utils/notices'
import './Notice.css'

function Notice() {

  return (
    <div className="notice-page">
      <Header />
      <main className="notice-main">
        <div className="notice-container">
          <h1 className="notice-page-title">공지사항</h1>
          
          <div className="notice-list">
            {notices.map((notice) => (
              <Link
                key={notice.id}
                to={`/notice/${notice.id}`}
                className="notice-item"
              >
                <div className="notice-icon">{notice.icon}</div>
                <div className="notice-content-wrapper">
                  <div className="notice-title">{notice.title}</div>
                  <div className="notice-date">{notice.date}</div>
                </div>
                <div className="notice-arrow">→</div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

export default Notice


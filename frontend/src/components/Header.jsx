import { Link } from 'react-router-dom'
import './Header.css'

function Header() {
  return (
    <header>
      <div className="header-top">
        <Link to="/" className="logo">
          <span>내일의 등산</span>
        </Link>
        <div className="header-actions">
          <button className="btn-login">Login</button>
          <button className="btn-signup">회원가입</button>
        </div>
      </div>
      <nav>
        <ul>
          <li><Link to="#">공지사항</Link></li>
          <li><Link to="#">AI 등산 코스 추천</Link></li>
          <li><Link to="#">스토어</Link></li>
          <li><Link to="#">커뮤니티</Link></li>
          <li><Link to="#">마이페이지</Link></li>
        </ul>
      </nav>
    </header>
  )
}

export default Header


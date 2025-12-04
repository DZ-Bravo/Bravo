import './Footer.css'

function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <div className="footer-logo">
          <img src="/images/logo2.png" alt="HIKER" />
        </div>
        <div className="footer-info">
          <div className="footer-info-item">
            <strong>주소</strong>
            <span>서울 종로구 인사동길 12 15층 하이미디어아카데미</span>
          </div>
          <div className="footer-info-item">
            <strong>대표자</strong>
            <span>민선재</span>
          </div>
          <div className="footer-info-item">
            <strong>문의/제안</strong>
            <span>msj67854643@gmail.com</span>
          </div>
          <div className="footer-info-item">
            <strong>연락처</strong>
            <span>010-4634-6785</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer


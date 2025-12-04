import { useEffect, useState } from 'react'
import './TopButton.css'

function TopButton() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.pageYOffset > 300) {
        setIsVisible(true)
      } else {
        setIsVisible(false)
      }
    }

    window.addEventListener('scroll', toggleVisibility)

    return () => {
      window.removeEventListener('scroll', toggleVisibility)
    }
  }, [])

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!isVisible) {
    return null
  }

  return (
    <button onClick={scrollToTop} className="top-btn">
      <img src="/images/top_btn.png" alt="TOP" />
    </button>
  )
}

export default TopButton


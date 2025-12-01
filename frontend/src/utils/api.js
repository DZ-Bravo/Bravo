/**
 * API URL을 자동으로 결정합니다.
 * 현재 호스트를 기반으로 백엔드 URL을 생성합니다.
 * 런타임에 동적으로 결정되므로 다른 사용자도 접속 가능합니다.
 */
function getApiUrl() {
  // 브라우저 환경이 아니면 환경 변수 사용 (SSR 등)
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_API_URL || 'http://localhost:5000'
  }

  // 현재 호스트 정보 가져오기 (런타임에 동적으로 결정)
  const hostname = window.location.hostname
  const protocol = window.location.protocol

  // localhost인 경우
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:5000'
  }

  // 다른 호스트인 경우 (예: 192.168.0.242)
  // 같은 호스트의 5000 포트 사용
  return `${protocol}//${hostname}:5000`
}

// 런타임에 동적으로 결정되도록 상수로 export
export const API_URL = getApiUrl()


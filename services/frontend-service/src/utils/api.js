// API 요청 헬퍼 함수 (Cognito IdToken 사용)
export const API_URL = import.meta.env.VITE_API_URL || 'https://hiker-cloud.site'

// API 요청 헤더 가져오기 (Cognito IdToken 포함)
export const getAuthHeaders = () => {
  const idToken = localStorage.getItem('idToken')
  const headers = {
    'Content-Type': 'application/json'
  }
  
  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`
  }
  
  return headers
}

// 환경 변수 가져오기
export const getEnv = (key) => {
  return import.meta.env[key] || (typeof window !== 'undefined' && window.__RUNTIME_ENV__ && window.__RUNTIME_ENV__[key])
}

// API 요청 함수 (자동으로 IdToken 포함)
export const apiRequest = async (url, options = {}) => {
  const headers = getAuthHeaders()
  
  // options에 headers가 있으면 병합
  if (options.headers) {
    Object.assign(headers, options.headers)
  }
  
  const response = await fetch(url, {
    ...options,
    headers
  })
  
  return response
}

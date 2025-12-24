/**
 * API URL을 자동으로 결정합니다.
 * MSA 구조에서는 HAProxy(포트 80)를 통해 접근합니다.
 * 현재 호스트를 기반으로 백엔드 URL을 생성합니다.
 * 런타임에 동적으로 결정되므로 다른 사용자도 접속 가능합니다.
 */
function getApiUrl() {
  // 브라우저 환경이 아니면 환경 변수 사용 (SSR 등)
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_API_URL || ''
  }

  // 현재 호스트 정보 가져오기 (런타임에 동적으로 결정)
  const hostname = window.location.hostname
  const protocol = window.location.protocol
  const port = window.location.port

  // MSA 구조: 같은 호스트의 같은 포트 사용 (HAProxy를 통해 라우팅)
  // 포트가 있으면 그대로 사용, 없으면 기본 포트 (80 또는 443)
  if (port && port !== '80' && port !== '443') {
    return `${protocol}//${hostname}:${port}`
  }
  
  // 포트가 없거나 80/443인 경우 (HAProxy를 통해 접근)
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`
}

// 런타임에 동적으로 결정되도록 상수로 export
export const API_URL = getApiUrl()

/**
 * 환경 변수를 가져옵니다.
 * 런타임 환경 변수(window.__RUNTIME_ENV__)를 우선 확인하고,
 * 없으면 빌드 시점 환경 변수(import.meta.env)를 사용합니다.
 */
export function getEnv(key) {
  // 런타임 환경 변수 확인 (server.js에서 주입)
  if (typeof window !== 'undefined' && window.__RUNTIME_ENV__) {
    const runtimeValue = window.__RUNTIME_ENV__[key]
    // 값이 존재하면 반환 (빈 문자열도 유효한 값으로 처리)
    if (runtimeValue !== undefined && runtimeValue !== null) {
      return runtimeValue
    }
  }
  
  // 빌드 시점 환경 변수 확인
  return import.meta.env[key] || ''
}


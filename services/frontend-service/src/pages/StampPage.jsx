import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './StampPage.css'

function StampPage() {
  const navigate = useNavigate()
  const [mountains, setMountains] = useState([])
  const [completedMountainCodes, setCompletedMountainCodes] = useState([])
  const [activeTab, setActiveTab] = useState('all') // 전체 탭을 기본값으로
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [imageUrls, setImageUrls] = useState({}) // 변환된 이미지 URL 저장
  const [searchQuery, setSearchQuery] = useState('') // 검색어
  const itemsPerPage = 20

  // 한글 초성 추출 함수
  const getInitialConsonant = (char) => {
    const code = char.charCodeAt(0)
    if (code < 0xAC00 || code > 0xD7A3) return null
    return Math.floor((code - 0xAC00) / 0x24C)
  }

  // 초성에 따른 탭 분류
  const getTabForChar = (char) => {
    const initial = getInitialConsonant(char)
    if (initial === null) return 'tab1'
    
    // ㄱ(0), ㄲ(1), ㄴ(2), ㄷ(3), ㄸ(4) -> tab1 (ㄱ-ㄷ)
    if (initial >= 0 && initial <= 4) return 'tab1'
    // ㄹ(5), ㅁ(6), ㅂ(7), ㅃ(8) -> tab2 (ㄹ-ㅂ)
    if (initial >= 5 && initial <= 8) return 'tab2'
    // ㅅ(9), ㅆ(10), ㅇ(11), ㅈ(12), ㅉ(13), ㅊ(14), ㅋ(15), ㅌ(16), ㅍ(17), ㅎ(18) -> tab3 (ㅅ-ㅎ)
    if (initial >= 9 && initial <= 18) return 'tab3'
    return 'tab1'
  }

  // 산 목록 가져오기
  // stamp-service는 포트 3010에서 직접 실행되므로 기본값을 3010 포트로 설정
  const STAMP_API_URL = import.meta.env.VITE_STAMP_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3010` : API_URL)

  useEffect(() => {
    const fetchMountains = async () => {
      try {
        const response = await fetch(`${API_URL}/api/mountains`)
        if (response.ok) {
          const data = await response.json()
          const mountainsList = data.mountains || []
          
          console.log('가져온 산 개수:', mountainsList.length)
          if (mountainsList.length > 0) {
            console.log('첫 번째 산 샘플:', mountainsList[0])
          }
          
          // 가나다라 순으로 정렬
          const sortedMountains = [...mountainsList].sort((a, b) => {
            const nameA = (a.name || '').trim()
            const nameB = (b.name || '').trim()
            return nameA.localeCompare(nameB, 'ko')
          })
          
          setMountains(sortedMountains)
          
          // 산 목록 로드 후 완료 산 목록도 다시 가져오기 (매칭 확인을 위해)
          const token = localStorage.getItem('token')
          if (token) {
            try {
          const stampResponse = await fetch(`${STAMP_API_URL}/api/stamps/completed`, {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              })
              if (stampResponse.ok) {
                const stampData = await stampResponse.json()
                const codes = stampData.completedMountainCodes || []
                console.log('[스탬프] 산 목록 로드 후 완료 산 코드:', codes)
                setCompletedMountainCodes(codes)
              }
            } catch (error) {
              console.error('완료 산 목록 재조회 오류:', error)
            }
          }
        } else {
          console.error('산 목록 조회 실패:', response.status, response.statusText)
        }
      } catch (error) {
        console.error('산 목록 조회 오류:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchMountains()
  }, [])

  // 사용자의 등산 완료 산 목록 가져오기 (산 목록 로드 후 실행)
  useEffect(() => {
    const fetchCompletedMountains = async () => {
      const token = localStorage.getItem('token')
      if (!token) {
        console.log('[스탬프] 토큰 없음. 완료 산 목록을 가져올 수 없습니다.')
        return
      }

      console.log('[스탬프] 완료 산 목록 조회 시작...')
      try {
        const response = await fetch(`${STAMP_API_URL}/api/stamps/completed`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        if (response.ok) {
          const data = await response.json()
          const codes = data.completedMountainCodes || []
          console.log('[스탬프] 완료한 산 코드 목록:', codes)
          console.log('[스탬프] 완료한 산 코드 개수:', codes.length)
          console.log('[스탬프] 완료한 산 코드 타입:', codes.map(c => ({ code: c, type: typeof c })))
          
          // 전체 산 목록과 비교하여 매칭 확인
          if (mountains.length > 0 && codes.length > 0) {
            console.log('[스탬프] 전체 산 코드 샘플:', mountains.slice(0, 5).map(m => ({ name: m.name, code: m.code, codeType: typeof m.code })))
            const matchedMountains = mountains.filter(m => {
              const codeStr = String(m.code).trim()
              return codes.some(c => {
                const cStr = String(c).trim()
                return cStr === codeStr || String(parseInt(cStr)) === String(parseInt(codeStr))
              })
            })
            console.log('[스탬프] 매칭된 산 개수:', matchedMountains.length)
            if (matchedMountains.length > 0) {
              console.log('[스탬프] 매칭된 산 목록:', matchedMountains.map(m => ({ name: m.name, code: m.code })))
            } else {
              console.warn('[스탬프] 매칭된 산이 없습니다. 코드 형식이 다를 수 있습니다.')
              console.log('[스탬프] 완료 코드:', codes)
              console.log('[스탬프] 산 코드 샘플:', mountains.slice(0, 10).map(m => m.code))
            }
          } else if (mountains.length === 0) {
            console.log('[스탬프] 산 목록이 아직 로드되지 않았습니다.')
          } else if (codes.length === 0) {
            console.warn('[스탬프] 완료한 산 코드가 없습니다. 등산일지를 작성했는지 확인하세요.')
          }
          
          setCompletedMountainCodes(codes)
        } else {
          console.error('[스탬프] 완료 산 목록 조회 실패:', response.status, response.statusText)
          const errorData = await response.json().catch(() => ({}))
          console.error('[스탬프] 오류 상세:', errorData)
        }
      } catch (error) {
        console.error('[스탬프] 등산 완료 산 목록 조회 오류:', error)
      }
    }

    // mountains가 로드된 후에만 fetchCompletedMountains 실행
    if (mountains.length > 0) {
      fetchCompletedMountains()
    }
  }, [mountains]) // mountains가 변경될 때마다 실행

  // 페이지 포커스 시 완료한 산 목록 다시 가져오기 (등산일지 작성 후 돌아왔을 때)
  useEffect(() => {
    const fetchCompletedMountainsOnFocus = async () => {
      if (mountains.length > 0) {
        const token = localStorage.getItem('token')
        if (token) {
          try {
            console.log('[스탬프] 완료 산 목록 갱신 시작...')
            const response = await fetch(`${STAMP_API_URL}/api/stamps/completed`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            })
            if (response.ok) {
              const data = await response.json()
              const codes = data.completedMountainCodes || []
              console.log('[스탬프] 페이지 포커스 시 완료한 산 목록 갱신:', codes)
              console.log('[스탬프] 갱신된 완료 산 개수:', codes.length)
              setCompletedMountainCodes(codes)
            } else {
              console.error('[스탬프] 완료 산 목록 갱신 실패:', response.status, response.statusText)
            }
          } catch (error) {
            console.error('[스탬프] 완료 산 목록 갱신 오류:', error)
          }
        }
      }
    }

    const handleFocus = () => {
      fetchCompletedMountainsOnFocus()
    }

    // 페이지 로드 시에도 실행
    fetchCompletedMountainsOnFocus()

    window.addEventListener('focus', handleFocus)
    // visibilitychange 이벤트도 추가 (탭 전환 시)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchCompletedMountainsOnFocus()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [mountains, API_URL])

  // 스탬프가 찍힌 산인지 확인 - 여러 형식으로 비교 (강화된 매칭)
  const isCompleted = useCallback((mountainCode) => {
    if (!mountainCode) return false
    if (completedMountainCodes.length === 0) return false
    
    // mountainCode를 정규화 (숫자로 변환 가능하면 숫자로, 아니면 문자열로)
    let codeStr = String(mountainCode).trim()
    if (!codeStr || codeStr === 'null' || codeStr === 'undefined') return false
    
    // 숫자로 변환 가능한 경우 숫자로 정규화
    const codeNum = parseInt(codeStr)
    const normalizedCode = !isNaN(codeNum) ? String(codeNum) : codeStr
    
    // completedMountainCodes의 각 항목과 비교
    const matched = completedMountainCodes.some(completedCode => {
      if (!completedCode) return false
      
      // completedCode 정규화
      let completedStr = String(completedCode).trim()
      if (!completedStr || completedStr === 'null' || completedStr === 'undefined') return false
      
      const completedNum = parseInt(completedStr)
      const normalizedCompleted = !isNaN(completedNum) ? String(completedNum) : completedStr
      
      // 정규화된 값으로 정확한 매칭
      if (normalizedCode === normalizedCompleted) {
        return true
      }
      
      // 숫자로 변환해서도 비교 (추가 안전장치)
      if (!isNaN(codeNum) && !isNaN(completedNum) && codeNum === completedNum) {
        return true
      }
      
      return false
    })
    
    return matched
  }, [completedMountainCodes])

  // 페이지네이션 (useMemo로 최적화)
  const filteredMountains = useMemo(() => {
    try {
      let filtered = mountains
      
      // 완등 탭 필터링 (완료한 산만)
      if (activeTab === 'completed') {
        filtered = filtered.filter(mountain => isCompleted(mountain.code))
      } else if (activeTab !== 'all') {
        // 일반 탭 필터링
        filtered = filtered.filter(mountain => {
          const name = (mountain.name || '').trim()
          if (!name) return false
          const firstChar = name[0]
          const tab = getTabForChar(firstChar)
          return tab === activeTab
        })
      }
      
      // 검색어 필터링
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase()
        filtered = filtered.filter(mountain => {
          const name = (mountain.name || '').toLowerCase()
          return name.includes(query)
        })
      }
      
      return filtered
    } catch (error) {
      console.error('[스탬프] 필터링 오류:', error)
      return []
    }
  }, [mountains, activeTab, searchQuery, isCompleted])

  // ibb.co URL을 실제 이미지 URL로 변환 (지연 로딩 및 배치 처리로 최적화)
  useEffect(() => {
    const convertImageUrls = async () => {
      if (mountains.length === 0) return
      
      const urlMap = {}
      const BATCH_SIZE = 10 // 한 번에 처리할 이미지 개수
      const DELAY_BETWEEN_BATCHES = 100 // 배치 간 지연 시간 (ms)
      
      // 현재 페이지에 보이는 산들만 우선 처리 (filteredMountains 기반)
      const startIdx = (currentPage - 1) * itemsPerPage
      const endIdx = startIdx + itemsPerPage
      const currentPageMountains = filteredMountains && filteredMountains.length > 0 
        ? filteredMountains.slice(startIdx, endIdx)
        : []
      
      // 배치로 나누어 처리
      for (let i = 0; i < currentPageMountains.length; i += BATCH_SIZE) {
        const batch = currentPageMountains.slice(i, i + BATCH_SIZE)
        
        await Promise.all(
          batch.map(async (mountain) => {
            if (!mountain.image) {
              return
            }
            
            let imageUrl = mountain.image
            
            // imgbb.co 페이지 URL인 경우 백엔드 API로 실제 이미지 URL 추출
            if (imageUrl.includes('ibb.co/') && !imageUrl.includes('i.ibb.co')) {
              try {
                const response = await fetch(`${API_URL}/api/utils/imgbb-url?url=${encodeURIComponent(imageUrl)}`)
                const data = await response.json()
                if (data.imageUrl && data.imageUrl.includes('i.ibb.co')) {
                  // 실제 이미지 URL로 변환 성공
                  urlMap[mountain.code] = data.imageUrl
                } else {
                  // 변환 실패 또는 여전히 페이지 URL인 경우 원본 URL 사용 (또는 null)
                  urlMap[mountain.code] = null
                }
              } catch (error) {
                console.error('imgbb.co 이미지 URL 추출 실패:', error, mountain.code)
                urlMap[mountain.code] = null
              }
            } else {
              // 이미 http:// 또는 https://로 시작하면 그대로 사용
              if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                urlMap[mountain.code] = imageUrl
              } else if (imageUrl.startsWith('/')) {
                // 상대 경로인 경우 API_URL 추가
                urlMap[mountain.code] = `${API_URL}${imageUrl}`
              } else {
                urlMap[mountain.code] = imageUrl
              }
            }
          })
        )
        
        // 배치 처리 후 상태 업데이트 (점진적 로딩)
        setImageUrls(prev => ({ ...prev, ...urlMap }))
        
        // 마지막 배치가 아니면 지연
        if (i + BATCH_SIZE < currentPageMountains.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES))
        }
      }
      
      // 나머지 이미지들은 백그라운드에서 처리
      const remainingMountains = mountains.filter(m => !currentPageMountains.some(cm => cm.code === m.code))
      if (remainingMountains.length > 0) {
        // 백그라운드 처리 (우선순위 낮음)
        setTimeout(async () => {
          const backgroundUrlMap = {}
          for (let i = 0; i < remainingMountains.length; i += BATCH_SIZE) {
            const batch = remainingMountains.slice(i, i + BATCH_SIZE)
            
            await Promise.all(
              batch.map(async (mountain) => {
                if (!mountain.image) return
                
                let imageUrl = mountain.image
                if (imageUrl.includes('ibb.co/') && !imageUrl.includes('i.ibb.co')) {
                  try {
                    const response = await fetch(`${API_URL}/api/utils/imgbb-url?url=${encodeURIComponent(imageUrl)}`)
                    const data = await response.json()
                    if (data.imageUrl && data.imageUrl.includes('i.ibb.co')) {
                      backgroundUrlMap[mountain.code] = data.imageUrl
                    } else {
                      backgroundUrlMap[mountain.code] = null
                    }
                  } catch (error) {
                    backgroundUrlMap[mountain.code] = null
                  }
                } else {
                  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                    backgroundUrlMap[mountain.code] = imageUrl
                  } else if (imageUrl.startsWith('/')) {
                    backgroundUrlMap[mountain.code] = `${API_URL}${imageUrl}`
                  } else {
                    backgroundUrlMap[mountain.code] = imageUrl
                  }
                }
              })
            )
            
            setImageUrls(prev => ({ ...prev, ...backgroundUrlMap }))
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES * 2))
          }
        }, 1000) // 1초 후 백그라운드 처리 시작
      }
    }
    
    if (mountains.length > 0) {
      convertImageUrls()
    }
  }, [mountains, API_URL, activeTab, currentPage, searchQuery, completedMountainCodes, itemsPerPage, filteredMountains])

  // 각 탭별 산 개수 계산
  const getTabCounts = () => {
    const counts = {
      all: mountains.length,
      completed: mountains.filter(mountain => isCompleted(mountain.code)).length, // 실제 완료한 산 개수
      tab1: 0,
      tab2: 0,
      tab3: 0
    }
    
    mountains.forEach(mountain => {
      const name = (mountain.name || '').trim()
      if (!name) return
      const firstChar = name[0]
      const tab = getTabForChar(firstChar)
      if (tab in counts) {
        counts[tab]++
      }
    })
    
    return counts
  }

  // 각 탭별 완료 산 개수 계산
  const getTabCompletedCounts = () => {
    const counts = {
      all: completedMountainCodes.length,
      completed: completedMountainCodes.length,
      tab1: 0,
      tab2: 0,
      tab3: 0
    }
    
    mountains.forEach(mountain => {
      if (!isCompleted(mountain.code)) return
      const name = (mountain.name || '').trim()
      if (!name) return
      const firstChar = name[0]
      const tab = getTabForChar(firstChar)
      if (tab in counts) {
        counts[tab]++
      }
    })
    
    return counts
  }
  
  const totalPages = Math.ceil(filteredMountains.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentMountains = filteredMountains.slice(startIndex, endIndex)

  // 탭 변경 시 첫 페이지로
  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab])

  // 이미지 URL 가져오기 - 변환된 URL 우선 사용
  const getImageUrl = (mountain) => {
    if (!mountain || !mountain.code) return null
    
    // 변환된 이미지 URL이 있으면 우선 사용
    if (imageUrls[mountain.code]) {
      const convertedUrl = imageUrls[mountain.code]
      if (convertedUrl && convertedUrl !== 'null' && convertedUrl !== 'undefined') {
        return convertedUrl
      }
    }
    
    // 변환된 URL이 없으면 원본 image 필드 사용
    if (mountain.image) {
      let imageUrl = mountain.image
      
      // ibb.co 페이지 URL이지만 아직 변환 중인 경우
      if (imageUrl.includes('ibb.co/') && !imageUrl.includes('i.ibb.co')) {
        return null // 변환 대기 중
      }
      
      // http:// 또는 https://로 시작하면 그대로 사용
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        return imageUrl
      }
      
      // 상대 경로인 경우 API_URL 추가
      if (imageUrl.startsWith('/')) {
        return `${API_URL}${imageUrl}`
      }
      
      return imageUrl
    }
    
    return null
  }


  if (isLoading) {
    return (
      <div className="stamp-page">
        <Header />
        <main className="stamp-main">
          <div className="stamp-container">
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              로딩 중...
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="stamp-page">
      <Header />
      <main className="stamp-main">
        <div className="stamp-container">
          <h1 className="stamp-title">하이킹 트래커</h1>

          {/* 검색 기능 */}
          <div className="stamp-search">
            <input
              type="text"
              placeholder="산 이름으로 검색..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1) // 검색 시 첫 페이지로
              }}
              className="stamp-search-input"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  setCurrentPage(1)
                }}
                className="stamp-search-clear"
              >
                ✕
              </button>
            )}
          </div>

          {/* 탭 네비게이션 */}
          <div className="stamp-tabs">
            {(() => {
              const tabCounts = getTabCounts()
              const completedCounts = getTabCompletedCounts()
              
              return (
                <>
                  <button
                    className={`stamp-tab ${activeTab === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveTab('all')}
                  >
                    전체
                    <span className="tab-count">({tabCounts.all})</span>
                    {completedCounts.all > 0 && (
                      <span className="tab-completed"> 완료: {completedCounts.all}</span>
                    )}
                  </button>
                  <button
                    className={`stamp-tab ${activeTab === 'completed' ? 'active' : ''}`}
                    onClick={() => setActiveTab('completed')}
                  >
                    완등
                    <span className="tab-count">({tabCounts.completed})</span>
                  </button>
                  <button
                    className={`stamp-tab ${activeTab === 'tab1' ? 'active' : ''}`}
                    onClick={() => setActiveTab('tab1')}
                  >
                    ㄱ-ㄷ
                    <span className="tab-count">({tabCounts.tab1})</span>
                    {completedCounts.tab1 > 0 && (
                      <span className="tab-completed"> 완료: {completedCounts.tab1}</span>
                    )}
                  </button>
                  <button
                    className={`stamp-tab ${activeTab === 'tab2' ? 'active' : ''}`}
                    onClick={() => setActiveTab('tab2')}
                  >
                    ㄹ-ㅂ
                    <span className="tab-count">({tabCounts.tab2})</span>
                    {completedCounts.tab2 > 0 && (
                      <span className="tab-completed"> 완료: {completedCounts.tab2}</span>
                    )}
                  </button>
                  <button
                    className={`stamp-tab ${activeTab === 'tab3' ? 'active' : ''}`}
                    onClick={() => setActiveTab('tab3')}
                  >
                    ㅅ-ㅎ
                    <span className="tab-count">({tabCounts.tab3})</span>
                    {completedCounts.tab3 > 0 && (
                      <span className="tab-completed"> 완료: {completedCounts.tab3}</span>
                    )}
                  </button>
                </>
              )
            })()}
          </div>

          {/* 산 그리드 */}
          <div className="stamp-grid">
            {currentMountains.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                {activeTab === 'completed' 
                  ? '완등한 산이 없습니다. 등산일지를 작성하여 스탬프를 모아보세요!' 
                  : searchQuery 
                    ? `"${searchQuery}"에 대한 검색 결과가 없습니다.` 
                    : '해당 탭에 산이 없습니다.'}
              </div>
            ) : (
              currentMountains.map((mountain) => {
                const completed = isCompleted(mountain.code)
                const imageUrl = getImageUrl(mountain)
                
                // 디버깅: 매칭 확인 (인왕산, 광교산)
                if (mountain.name && (mountain.name.includes('인왕산') || mountain.name.includes('광교산'))) {
                  const codeStr = String(mountain.code).trim()
                  const codeNum = parseInt(codeStr)
                  const directMatch = completedMountainCodes.includes(codeStr)
                  const numMatch = !isNaN(codeNum) && completedMountainCodes.includes(String(codeNum))
                  const reverseMatch = completedMountainCodes.some(c => {
                    const cStr = String(c).trim()
                    return cStr === codeStr || (parseInt(cStr) === codeNum && !isNaN(parseInt(cStr)) && !isNaN(codeNum))
                  })
                  
                  console.log(`[스탬프] ${mountain.name} 매칭 확인:`, {
                    name: mountain.name,
                    code: mountain.code,
                    codeType: typeof mountain.code,
                    codeStr: codeStr,
                    codeNum: codeNum,
                    completedMountainCodes: completedMountainCodes,
                    completedMountainCodesTypes: completedMountainCodes.map(c => typeof c),
                    isCompleted: completed,
                    directMatch: directMatch,
                    numMatch: numMatch,
                    reverseMatch: reverseMatch
                  })
                }
                
                return (
                  <div key={mountain.code} className="stamp-item">
                    <div className="stamp-image-wrapper">
                      {imageUrl ? (
                        <>
                          <img
                            src={imageUrl}
                            alt={mountain.name}
                            className={`stamp-image ${completed ? 'completed' : 'grayscale'}`}
                            onError={(e) => {
                              console.error('이미지 로드 실패:', imageUrl, mountain)
                              e.target.style.display = 'none'
                              const wrapper = e.target.parentElement
                              if (wrapper) {
                                const placeholder = wrapper.querySelector('.stamp-placeholder')
                                if (placeholder) {
                                  placeholder.style.display = 'flex'
                                }
                              }
                            }}
                          />
                          <div className="stamp-placeholder" style={{ display: 'none' }}>
                            <span style={{ fontSize: '2rem' }}>⛰️</span>
                          </div>
                        </>
                      ) : (
                        <div className="stamp-placeholder">
                          <span style={{ fontSize: '2rem' }}>⛰️</span>
                        </div>
                      )}
                      {completed && imageUrl && (
                        <img
                          src="/images/stamp_icon.png"
                          alt="스탬프"
                          className="stamp-icon"
                          onError={(e) => {
                            console.error('스탬프 아이콘 로드 실패:', e)
                          }}
                        />
                      )}
                    </div>
                    <div className="stamp-name">{mountain.name}</div>
                  </div>
                )
              })
            )}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="stamp-pagination">
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                이전
              </button>
              <span className="pagination-info">
                {currentPage} / {totalPages}
              </span>
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                다음
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default StampPage


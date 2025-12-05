import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import { MOUNTAIN_ROUTES } from '../utils/mountainRoutes'
import './CommunityWrite.css'

function CommunityWrite() {
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'diary',
    images: [],
    // 등산일지 전용 필드
    hikingTip: '',
    hashtags: [],
    mountainCode: '',
    courseName: '',
    courseDistance: null,
    courseDuration: null
  })
  const [currentHashtag, setCurrentHashtag] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [mountains, setMountains] = useState([])
  const [courses, setCourses] = useState([])
  const [isLoadingCourses, setIsLoadingCourses] = useState(false)
  const [mountainSearchTerm, setMountainSearchTerm] = useState(null)
  const [showMountainDropdown, setShowMountainDropdown] = useState(false)
  const navigate = useNavigate()

  // 산 이름에서 지역명 추출 (예: "서울특별시 강남구" -> "서울특별시")
  const extractRegion = (location) => {
    if (!location) return null
    // 시/도 단위 추출 (예: "서울특별시", "경기도", "강원도", "부산광역시" 등)
    const match = location.match(/([가-힣]+(?:시|도|특별시|광역시))/)
    if (match) {
      return match[1].trim()
    }
    // 시/도가 없으면 첫 번째 단어 반환
    const parts = location.split(/\s+/)
    return parts[0] || null
  }


  // 산 목록 가져오기 및 중복 처리
  useEffect(() => {
    const fetchMountains = async () => {
      try {
        const response = await fetch(`${API_URL}/api/mountains`)
        if (response.ok) {
          const data = await response.json()
          const rawMountains = data.mountains || []
          
          // 산 이름별로 그룹화하여 중복 확인
          const nameCount = {}
          rawMountains.forEach(m => {
            const name = m.name || '이름 없음'
            nameCount[name] = (nameCount[name] || 0) + 1
          })
          
          // 중복된 이름이 있는 경우 지역명 포함하여 표시
          const processedMountains = rawMountains.map(m => {
            const name = m.name || '이름 없음'
            const location = m.location || ''
            const region = extractRegion(location)
            const code = String(m.code || '')
            
            // 북한산 특별 처리: "북한산 백운대"로 표시
            if (code === '287201304' || name === '북한산' || name.includes('북한산')) {
              // 이미 "백운대"가 포함되어 있지 않으면 추가
              const displayName = name.includes('백운대') ? name : '북한산 백운대'
              return {
                ...m,
                displayName: displayName,
                originalName: name
              }
            }
            
            // 같은 이름이 여러 개 있으면 지역명을 괄호로 표시
            if (nameCount[name] > 1 && region) {
              return {
                ...m,
                displayName: `${name} (${region})`,
                originalName: name
              }
            }
            return {
              ...m,
              displayName: name,
              originalName: name
            }
          })
          
          setMountains(processedMountains)
        } else {
          // API가 없으면 MOUNTAIN_ROUTES 사용
          const mountainList = Object.values(MOUNTAIN_ROUTES).map(m => ({
            code: m.code,
            name: m.name,
            displayName: m.name,
            originalName: m.name
          }))
          setMountains(mountainList)
        }
      } catch (error) {
        console.error('산 목록 조회 오류:', error)
        // 에러 시 MOUNTAIN_ROUTES 사용
        const mountainList = Object.values(MOUNTAIN_ROUTES).map(m => ({
          code: m.code,
          name: m.name,
          displayName: m.name,
          originalName: m.name
        }))
        setMountains(mountainList)
      }
    }
    fetchMountains()
  }, [])

  // 산 선택 시 등산 코스 가져오기
  useEffect(() => {
    if (formData.mountainCode && formData.category === 'diary') {
      setIsLoadingCourses(true)
      const fetchCourses = async () => {
        try {
          const response = await fetch(`${API_URL}/api/mountains/${formData.mountainCode}/courses`)
          if (response.ok) {
            const data = await response.json()
            const courseList = (data.courses || []).map((course, index) => {
              const props = course.properties || {}
              // 코스 이름 추출 (여러 필드에서 시도)
              const courseName = props.name || props.PMNTN_NM || props.PMNTN_MAIN || props.courseName || `코스 ${index + 1}`
              // 거리 (km) - 소수점 둘째자리까지만 표시
              const rawDistance = props.PMNTN_LT || props.distance
              let distance = null
              if (rawDistance !== null && rawDistance !== undefined && rawDistance !== '') {
                const numDistance = typeof rawDistance === 'number' ? rawDistance : parseFloat(rawDistance)
                if (!isNaN(numDistance) && numDistance > 0) {
                  distance = parseFloat(numDistance.toFixed(2))
                }
              }
              // 소요시간 계산 (duration이 있으면 사용, 없으면 PMNTN_UPPL + PMNTN_GODN)
              let duration = props.duration || ''
              if (!duration) {
                const upTime = props.PMNTN_UPPL || 0
                const downTime = props.PMNTN_GODN || 0
                const totalMinutes = upTime + downTime
                if (totalMinutes > 0) {
                  const hours = Math.floor(totalMinutes / 60)
                  const minutes = totalMinutes % 60
                  if (hours > 0) {
                    duration = minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`
                  } else {
                    duration = `${totalMinutes}분`
                  }
                }
              }
              return {
                id: index,
                name: courseName,
                distance: distance,
                duration: duration,
                difficulty: props.PMNTN_DFFL || props.difficulty
              }
            })
            setCourses(courseList)
          } else {
            setCourses([])
          }
        } catch (error) {
          console.error('등산 코스 조회 오류:', error)
          setCourses([])
        } finally {
          setIsLoadingCourses(false)
        }
      }
      fetchCourses()
    } else {
      setCourses([])
      if (formData.category !== 'diary') {
      setFormData(prev => ({ 
        ...prev, 
        mountainCode: '', 
        courseName: '',
        images: [],
        hikingTip: '',
        hashtags: []
      }))
        setCurrentHashtag('')
        setMountainSearchTerm(null)
      } else {
        setFormData(prev => ({ ...prev, courseName: '' }))
      }
    }
  }, [formData.mountainCode, formData.category])

  // 산이 선택되지 않았을 때 검색어 초기화
  useEffect(() => {
    if (!formData.mountainCode && formData.category === 'diary') {
      setMountainSearchTerm(null)
    }
  }, [formData.mountainCode, formData.category])

  const categories = [
    { id: 'diary', name: '등산일지' },
    { id: 'qa', name: 'Q&A' },
    { id: 'free', name: '자유게시판' }
  ]

  const handleChange = (e) => {
    const value = e.target.value
    const name = e.target.name
    
    // 카테고리 변경 시 등산일지가 아니면 등산일지 전용 필드 초기화
    if (name === 'category' && value !== 'diary') {
      setFormData({
        ...formData,
        [name]: value,
        mountainCode: '',
        courseName: '',
        courseDistance: null,
        courseDuration: null,
        images: [],
        hikingTip: '',
        hashtags: []
      })
      setCurrentHashtag('')
      setMountainSearchTerm(null)
    } else if (name === 'courseName') {
      // 코스 선택 시 해당 코스의 거리와 시간 정보 저장
      const selectedCourse = courses.find(c => c.name === value)
      setFormData({
        ...formData,
        [name]: value,
        courseDistance: selectedCourse ? selectedCourse.distance : null,
        courseDuration: selectedCourse ? selectedCourse.duration : null
      })
    } else {
      setFormData({
        ...formData,
        [name]: value
      })
    }
  }

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files)
    if (files.length + formData.images.length > 5) {
      alert('이미지는 최대 5개까지 업로드 가능합니다.')
      return
    }
    setFormData({
      ...formData,
      images: [...formData.images, ...files]
    })
  }

  const removeImage = (index) => {
    setFormData({
      ...formData,
      images: formData.images.filter((_, i) => i !== index)
    })
  }

  const handleHashtagKeyPress = (e) => {
    if (e.key === ' ' && currentHashtag.trim()) {
      e.preventDefault()
      const tag = currentHashtag.trim().replace('#', '')
      if (tag.length > 0 && tag.length <= 15 && formData.hashtags.length < 5) {
        setFormData({
          ...formData,
          hashtags: [...formData.hashtags, tag]
        })
        setCurrentHashtag('')
      }
    }
  }

  const removeHashtag = (index) => {
    setFormData({
      ...formData,
      hashtags: formData.hashtags.filter((_, i) => i !== index)
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage('')

    // 유효성 검사
    if (formData.category === 'diary') {
      // 등산일지 유효성 검사
      if (formData.images.length === 0) {
        alert('사진을 최소 1개 이상 업로드해주세요.')
        setIsLoading(false)
        return
      }
      if (!formData.title.trim()) {
        alert('제목을 입력해주세요.')
        setIsLoading(false)
        return
      }
      if (!formData.hikingTip.trim()) {
        alert('하이킹 팁을 입력해주세요.')
        setIsLoading(false)
        return
      }
      if (!formData.mountainCode) {
        alert('산을 선택해주세요.')
        setIsLoading(false)
        return
      }
      if (!formData.courseName) {
        alert('등산 코스를 선택해주세요.')
        setIsLoading(false)
        return
      }
    } else {
      // Q&A/자유게시판 유효성 검사
      if (!formData.title.trim()) {
        alert('제목을 입력해주세요.')
        setIsLoading(false)
        return
      }
      if (!formData.content.trim()) {
        alert('내용을 입력해주세요.')
        setIsLoading(false)
        return
      }
    }

    // 로그인 확인
    const token = localStorage.getItem('token')
    if (!token) {
      alert('로그인이 필요합니다.')
      navigate('/login')
      setIsLoading(false)
      return
    }

    try {
      // FormData 생성
      const submitData = new FormData()
      submitData.append('category', formData.category)
      
      if (formData.category === 'diary') {
        // 등산일지 데이터
        submitData.append('title', formData.title)
        submitData.append('content', formData.hikingTip)
        formData.images.forEach((image) => {
          submitData.append('images', image)
        })
        submitData.append('mountainCode', formData.mountainCode)
        submitData.append('courseName', formData.courseName)
        if (formData.courseDistance) {
          submitData.append('courseDistance', formData.courseDistance.toString())
        }
        if (formData.courseDuration) {
          submitData.append('courseDuration', formData.courseDuration)
        }
        if (formData.hashtags && formData.hashtags.length > 0) {
          // FormData에서 배열을 전송하는 방법: 각 해시태그를 개별 필드로 추가
          formData.hashtags.forEach((tag, index) => {
            submitData.append(`hashtags[${index}]`, tag)
          })
          // 또는 JSON 문자열로도 전송 (백엔드에서 두 가지 모두 처리)
          submitData.append('hashtags', JSON.stringify(formData.hashtags))
        }
      } else {
        // Q&A/자유게시판 데이터
        submitData.append('title', formData.title)
        submitData.append('content', formData.content)
        formData.images.forEach((image) => {
          submitData.append('images', image)
        })
      }

      console.log('게시글 작성 요청 - 카테고리:', formData.category, '전체 formData:', formData)

      console.log('FormData 카테고리 확인:', submitData.get('category'))

      const response = await fetch(`${API_URL}/api/posts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: submitData
      })

      const data = await response.json()

      if (response.ok) {
        alert('게시글이 작성되었습니다.')
        navigate('/community')
      } else {
        const errorMsg = data.error || '게시글 작성 중 오류가 발생했습니다.'
        setErrorMessage(errorMsg)
        alert(errorMsg)
      }
    } catch (error) {
      console.error('게시글 작성 오류:', error)
      setErrorMessage('서버 오류가 발생했습니다.')
      alert('서버 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="community-write-page">
      <Header />
      <main className="community-write-main">
        <div className="community-write-container">
          <h1 className="write-page-title">글 작성하기</h1>

          <form onSubmit={handleSubmit} className="write-form">
            <div className="form-group">
              <label htmlFor="category">카테고리</label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
                className="form-select"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {formData.category === 'diary' ? (
              /* 등산일지 작성 폼 */
              <>
                {/* 사진 첨부 */}
                <div className="form-group">
                  <label htmlFor="diary-images" className="form-label">
                    사진 첨부 <span className="required">*</span>
                  </label>
                  <div className="diary-image-upload">
                    <input
                      type="file"
                      id="diary-images"
                      name="diary-images"
                      accept="image/*"
                      multiple
                      onChange={handleImageChange}
                      className="diary-image-input"
                      disabled={formData.images.length >= 5}
                    />
                    <label htmlFor="diary-images" className="diary-image-label">
                      {formData.images.length > 0 ? (
                        <div className="diary-image-preview-grid">
                          {formData.images.map((image, index) => (
                            <div key={index} className="diary-image-preview-item">
                              <img
                                src={URL.createObjectURL(image)}
                                alt={`미리보기 ${index + 1}`}
                                className="diary-preview-image"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault()
                                  removeImage(index)
                                }}
                                className="diary-remove-image-btn"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                          {formData.images.length < 5 && (
                            <div className="diary-image-placeholder">
                              <div className="diary-thumbnail-icon">🏔️</div>
                              <div className="diary-thumbnail-count">{formData.images.length}/5</div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="diary-image-placeholder">
                          <div className="diary-thumbnail-icon">🏔️</div>
                          <div className="diary-thumbnail-count">0/5</div>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                {/* 산 선택 (검색 가능) */}
                <div className="form-group">
                  <label htmlFor="mountainCode" className="form-label">
                    산 <span className="required">*</span>
                  </label>
                  <div className="mountain-search-container">
                    <input
                      type="text"
                      id="mountainCode"
                      name="mountainCode"
                      value={mountainSearchTerm !== null ? mountainSearchTerm : (mountains.find(m => String(m.code) === String(formData.mountainCode))?.displayName || '')}
                      onChange={(e) => {
                        const value = e.target.value
                        setMountainSearchTerm(value)
                        // 검색어가 변경되면 항상 드롭다운 표시
                        setShowMountainDropdown(true)
                      }}
                      onFocus={() => {
                        setShowMountainDropdown(true)
                      }}
                      onBlur={(e) => {
                        // 드롭다운 내부 클릭인지 확인
                        const relatedTarget = e.relatedTarget || document.activeElement
                        const dropdown = e.currentTarget.parentElement?.querySelector('.mountain-dropdown')
                        if (dropdown && dropdown.contains(relatedTarget)) {
                          return // 드롭다운 내부 클릭이면 닫지 않음
                        }
                        // 드롭다운 클릭을 위해 약간의 지연
                        setTimeout(() => {
                          setShowMountainDropdown(false)
                        }, 200)
                      }}
                      placeholder="산 이름을 검색하세요"
                      required
                      className="form-input mountain-search-input"
                    />
                    {showMountainDropdown && mountains.length > 0 && (() => {
                      // 필터링된 산 목록
                      const searchTerm = mountainSearchTerm !== null ? String(mountainSearchTerm).trim() : ''
                      const filteredMountains = mountains.filter((mountain) => {
                        // 검색어가 없으면 모든 산 표시
                        if (!searchTerm) return true
                        
                        const searchLower = searchTerm.toLowerCase().trim()
                        const displayName = (mountain.displayName || mountain.name || '').toLowerCase().trim()
                        const originalName = (mountain.originalName || mountain.name || '').toLowerCase().trim()
                        
                        // 산 이름만으로 검색 (location 제외)
                        // 정확한 일치 또는 검색어로 시작하는 것만 허용 (부분 일치 제거)
                        const exactMatch = displayName === searchLower || originalName === searchLower
                        const startsWith = displayName.startsWith(searchLower) || originalName.startsWith(searchLower)
                        
                        // 단어 단위로 시작하는지 확인 (예: "북한산" 검색 시 "북한산 백운대"는 매칭, "아미산"은 매칭 안됨)
                        const displayWords = displayName.split(/\s+/)
                        const originalWords = originalName.split(/\s+/)
                        const wordStartsWith = displayWords.some(word => word.startsWith(searchLower)) || 
                                               originalWords.some(word => word.startsWith(searchLower))
                        
                        // 정확한 일치 > 시작 일치 > 단어 시작 일치만 허용
                        return exactMatch || startsWith || wordStartsWith
                      })
                      .sort((a, b) => {
                        // 정확한 일치를 가장 위로, 그 다음 시작 일치, 마지막으로 단어 시작 일치
                        const searchLower = searchTerm.toLowerCase().trim()
                        const aDisplay = (a.displayName || a.name || '').toLowerCase().trim()
                        const bDisplay = (b.displayName || b.name || '').toLowerCase().trim()
                        const aOriginal = (a.originalName || a.name || '').toLowerCase().trim()
                        const bOriginal = (b.originalName || b.name || '').toLowerCase().trim()
                        
                        // 정확한 일치
                        const aExact = aDisplay === searchLower || aOriginal === searchLower
                        const bExact = bDisplay === searchLower || bOriginal === searchLower
                        if (aExact && !bExact) return -1
                        if (!aExact && bExact) return 1
                        
                        // 시작 일치
                        const aStarts = aDisplay.startsWith(searchLower) || aOriginal.startsWith(searchLower)
                        const bStarts = bDisplay.startsWith(searchLower) || bOriginal.startsWith(searchLower)
                        if (aStarts && !bStarts) return -1
                        if (!aStarts && bStarts) return 1
                        
                        // 단어 시작 일치
                        const aWords = aDisplay.split(/\s+/)
                        const bWords = bDisplay.split(/\s+/)
                        const aOriginalWords = aOriginal.split(/\s+/)
                        const bOriginalWords = bOriginal.split(/\s+/)
                        const aWordStarts = aWords.some(word => word.startsWith(searchLower)) || 
                                           aOriginalWords.some(word => word.startsWith(searchLower))
                        const bWordStarts = bWords.some(word => word.startsWith(searchLower)) || 
                                           bOriginalWords.some(word => word.startsWith(searchLower))
                        if (aWordStarts && !bWordStarts) return -1
                        if (!aWordStarts && bWordStarts) return 1
                        
                        return 0
                      })
                      .slice(0, 50) // 최대 50개만 표시
                      
                      return (
                        <div className="mountain-dropdown">
                          {filteredMountains.length > 0 ? (
                            filteredMountains.map((mountain) => (
                              <div
                                key={mountain.code}
                                className="mountain-dropdown-item"
                                onMouseDown={(e) => {
                                  // 마우스 다운 이벤트로 클릭 처리 (onBlur보다 먼저 실행)
                                  e.preventDefault()
                                }}
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    mountainCode: String(mountain.code)
                                  })
                                  setMountainSearchTerm(mountain.displayName || mountain.name)
                                  setShowMountainDropdown(false)
                                }}
                              >
                                {mountain.displayName || mountain.name}
                              </div>
                            ))
                          ) : (
                            <div className="mountain-dropdown-item no-results">
                              검색 결과가 없습니다
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* 등산 코스 선택 */}
                {formData.mountainCode && (
                  <div className="form-group">
                    <label htmlFor="courseName" className="form-label">
                      등산코스 <span className="required">*</span>
                    </label>
                    {isLoadingCourses ? (
                      <div className="loading-courses">등산 코스를 불러오는 중...</div>
                    ) : (
                      <select
                        id="courseName"
                        name="courseName"
                        value={formData.courseName}
                        onChange={handleChange}
                        required
                        className="form-select"
                      >
                        <option value="">등산 코스를 선택해주세요</option>
                        {courses.map((course) => {
                          const distanceStr = course.distance !== null && course.distance !== undefined 
                            ? (typeof course.distance === 'number' 
                                ? course.distance.toFixed(2) 
                                : parseFloat(course.distance).toFixed(2))
                            : null
                          return (
                            <option key={course.id} value={course.name}>
                              {course.name}
                              {distanceStr && ` (${distanceStr}km)`}
                            </option>
                          )
                        })}
                      </select>
                    )}
                  </div>
                )}

                {/* 제목 */}
                <div className="form-group">
                  <label htmlFor="title" className="form-label">
                    제목 <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder="제목을 입력해 주세요."
                    required
                    className="form-input"
                  />
                </div>

                {/* 하이킹 팁 */}
                <div className="form-group">
                  <label htmlFor="hikingTip" className="form-label">
                    하이킹 팁 <span className="required">*</span>
                  </label>
                  <textarea
                    id="hikingTip"
                    name="hikingTip"
                    value={formData.hikingTip}
                    onChange={handleChange}
                    placeholder="산행 팁을 간단하게 작성해주세요. 자세한 후기는 본문에서 작성할 수 있어요!"
                    required
                    className="form-textarea"
                    rows={5}
                  />
                </div>

                {/* 해시태그 */}
                <div className="form-group">
                  <label htmlFor="hashtag" className="form-label">
                    해시태그
                  </label>
                  <input
                    type="text"
                    id="hashtag"
                    value={currentHashtag}
                    onChange={(e) => setCurrentHashtag(e.target.value)}
                    onKeyPress={handleHashtagKeyPress}
                    placeholder="#해시태그 입력(15자), (스페이스바)를 눌러주세요."
                    className="form-input hashtag-input"
                    maxLength={16}
                  />
                  <p className="hashtag-hint">
                    스페이스바를 누르면 해시태그가 완성돼요. 최대 5개
                  </p>
                  {formData.hashtags.length > 0 && (
                    <div className="hashtag-list">
                      {formData.hashtags.map((tag, index) => (
                        <span key={index} className="hashtag-item">
                          #{tag}
                          <button
                            type="button"
                            onClick={() => removeHashtag(index)}
                            className="hashtag-remove"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Q&A/자유게시판 작성 폼 */
              <>
                <div className="form-group">
                  <label htmlFor="title">
                    {formData.category === 'qa' ? '질문 제목' : '제목'}
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder={formData.category === 'qa' ? '질문 제목을 입력해주세요' : '제목을 입력해주세요'}
                    required
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="content">
                    {formData.category === 'qa' ? '질문 내용' : '내용'}
                  </label>
                  <textarea
                    id="content"
                    name="content"
                    value={formData.content}
                    onChange={handleChange}
                    placeholder={formData.category === 'qa' ? '질문 내용을 입력해주세요' : '내용을 입력해주세요'}
                    rows={15}
                    required
                    className="form-textarea"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="images">이미지 첨부 (최대 5개)</label>
                  <div className="image-upload-group">
                    <input
                      type="file"
                      id="images"
                      name="images"
                      accept="image/*"
                      multiple
                      onChange={handleImageChange}
                      className="file-input"
                      disabled={formData.images.length >= 5}
                    />
                    <label htmlFor="images" className="file-upload-btn">
                      파일 선택
                    </label>
                    {formData.images.length > 0 && (
                      <span className="file-count">
                        {formData.images.length}개 선택됨
                      </span>
                    )}
                  </div>
                  {formData.images.length > 0 && (
                    <div className="image-preview-list">
                      {formData.images.map((image, index) => (
                        <div key={index} className="image-preview-item">
                          <img
                            src={URL.createObjectURL(image)}
                            alt={`미리보기 ${index + 1}`}
                            className="preview-image"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="remove-image-btn"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {errorMessage && (
              <div className="error-message">{errorMessage}</div>
            )}

            <div className="form-actions">
              <button
                type="button"
                onClick={() => navigate('/community')}
                className="cancel-btn"
              >
                취소
              </button>
              <button
                type="submit"
                className="submit-btn"
                disabled={isLoading}
              >
                {isLoading ? '작성 중...' : '작성하기'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}

export default CommunityWrite


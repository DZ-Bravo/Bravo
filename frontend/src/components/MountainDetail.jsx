import { useEffect, useRef, useState } from 'react'
import Header from './Header'
import { convertArcGISToGeoJSON, transformArcGISToWGS84 } from '../utils/coordinateTransform'
import { API_URL } from '../utils/api'
import './MountainDetail.css'

function MountainDetail({ name, code, height, location, description, center, zoom, origin }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const [weatherData, setWeatherData] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(true)
  const [courses, setCourses] = useState([])
  const [coursesLoading, setCoursesLoading] = useState(true)
  const [lodgings, setLodgings] = useState([])
  const [lodgingsVisible, setLodgingsVisible] = useState(false)
  const [selectedLodging, setSelectedLodging] = useState(null)
  const [showLodgingModal, setShowLodgingModal] = useState(false)
  const [sortBy, setSortBy] = useState('difficulty-asc') // difficulty-asc/desc, time-asc/desc, distance-asc/desc
  const [selectedCourseIndex, setSelectedCourseIndex] = useState(null)
  const courseLayerRef = useRef([]) // 카카오맵에서는 배열로 관리
  const markersRef = useRef([]) // 카카오맵 마커 배열
  const lodgingMarkersRef = useRef([]) // 주변 숙소 마커
  const spotsRef = useRef([]) // SPOT 데이터 저장 (편의시설)
  const courseItemRefs = useRef({}) // 코스 아이템 DOM 참조 저장
  const eventListenersRef = useRef([]) // 이벤트 리스너 저장 (제거용)
  const [showDifficultyModal, setShowDifficultyModal] = useState(false)
  const [selectedDifficultyLevel, setSelectedDifficultyLevel] = useState('normal') // 기본값: 보통
  const [kakaoLoaded, setKakaoLoaded] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('09:00')
  const [scheduleNotes, setScheduleNotes] = useState('')
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [selectedScheduleCourseIndex, setSelectedScheduleCourseIndex] = useState(null)

  // 등산일정 추가 함수
  const handleAddSchedule = async () => {
    if (!scheduleDate) {
      alert('등산일자를 선택해주세요.')
      return
    }

    const token = localStorage.getItem('token')
    if (!token) {
      alert('로그인이 필요합니다.')
      return
    }

    setScheduleLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          mountainCode: code,
          mountainName: name,
          scheduledDate: scheduleDate,
          scheduledTime: scheduleTime,
          courseName: selectedScheduleCourseIndex !== null && courses[selectedScheduleCourseIndex] ? courses[selectedScheduleCourseIndex]?.properties?.name : null,
          notes: scheduleNotes
        })
      })

      const data = await response.json()

      if (response.ok) {
        alert('등산일정이 추가되었습니다.')
        setShowScheduleModal(false)
        setScheduleDate('')
        setScheduleTime('09:00')
        setScheduleNotes('')
        setSelectedScheduleCourseIndex(null)
      } else {
        alert(data.error || '등산일정 추가에 실패했습니다.')
      }
    } catch (error) {
      console.error('등산일정 추가 오류:', error)
      alert('등산일정 추가 중 오류가 발생했습니다.')
    } finally {
      setScheduleLoading(false)
    }
  }

  // 카카오맵 SDK 로드
  useEffect(() => {
    let isMounted = true

    const loadKakaoMap = () => {
      if (window.kakao && window.kakao.maps) {
        setKakaoLoaded(true)
        return
      }

      const apiKey = import.meta.env.VITE_KAKAO_MAP_API_KEY || ''
      
      if (!apiKey) {
        console.error('카카오 맵 API 키가 설정되지 않았습니다. VITE_KAKAO_MAP_API_KEY 환경 변수를 설정해주세요.')
        return
      }

      if (window.kakao && window.kakao.maps) {
        window.kakao.maps.load(() => {
          if (isMounted) {
            setKakaoLoaded(true)
          }
        })
      } else {
        const script = document.createElement('script')
        script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false`
        script.async = true
        script.onload = () => {
          if (window.kakao && window.kakao.maps) {
            window.kakao.maps.load(() => {
              if (isMounted) {
                setKakaoLoaded(true)
              }
            })
          }
        }
        document.head.appendChild(script)
      }
    }

    loadKakaoMap()

    return () => {
      isMounted = false
    }
  }, [])

    // 지도 초기화
  useEffect(() => {
    if (!kakaoLoaded || !mapRef.current) return

    let isMounted = true

    const initMap = () => {
      if (!mapRef.current || !window.kakao || !window.kakao.maps) {
        return
      }

      // 기존 지도가 있으면 제거
      if (mapInstanceRef.current) {
        mapInstanceRef.current = null
      }

      // 지도 컨테이너 초기화
        mapRef.current.innerHTML = ''

      try {
        const container = mapRef.current
        // 지도 초기화 시 임시 center 설정 (코스 데이터 로드 후 bounds로 덮어쓸 예정)
        const options = {
          center: new window.kakao.maps.LatLng(center[0], center[1]),
          level: zoom || 13
        }

        const map = new window.kakao.maps.Map(container, options)
        mapInstanceRef.current = map

        // GeoJSON 로드 (코스 경로 + 지점 마커)
        if (isMounted) {
          // 지도가 완전히 초기화된 후 코스 데이터 로드
          setTimeout(() => {
            if (isMounted && mapInstanceRef.current && window.kakao && window.kakao.maps) {
          loadCourseData(code, map)
              loadSpotData(code, map) // SPOT 데이터를 먼저 로드하여 spotsRef에 저장
            }
          }, 100)
        }
      } catch (error) {
        console.error('Failed to initialize map:', error)
      }
    }

    initMap()

    return () => {
      isMounted = false
      // 마커 제거
      markersRef.current.forEach(marker => {
        if (marker && marker.setMap) {
          marker.setMap(null)
        }
      })
      markersRef.current = []
      // 폴리라인 제거
      courseLayerRef.current.forEach(polyline => {
        if (polyline && polyline.setMap) {
          polyline.setMap(null)
        }
      })
      courseLayerRef.current = []
      if (mapRef.current) {
        mapRef.current.innerHTML = ''
      }
    }
  }, [kakaoLoaded, code, center, zoom])

  // 전체 코스를 지도에 다시 표시하는 함수
  const showAllCourses = async () => {
    if (!mapInstanceRef.current || !window.kakao || !window.kakao.maps) {
      return
    }
    
    // courses 상태를 직접 참조하지 않고, 최신 값을 가져오기
    const currentCourses = courses
    if (currentCourses.length === 0) {
      return
    }
    
    try {
      // 기존 이벤트 리스너 제거
      eventListenersRef.current.forEach(listener => {
        if (listener && listener.remove) {
          window.kakao.maps.event.removeListener(listener.target, listener.type, listener.handler)
        }
      })
      eventListenersRef.current = []
      
      // 기존 폴리라인 및 마커 제거
      courseLayerRef.current.forEach(polyline => {
        if (polyline && polyline.setMap) {
          polyline.setMap(null)
        }
      })
      courseLayerRef.current = []
      
      markersRef.current.forEach(marker => {
        if (marker && marker.setMap) {
          marker.setMap(null)
        }
      })
      markersRef.current = []
      
      // 선택 해제
      setSelectedCourseIndex(null)
      
      // ArcGIS 형식인지 확인
      const isArcGISFormat = currentCourses.some(course => 
        course.geometry && (course.geometry.paths || (course.attributes && !course.properties))
      )
      
      let geoJsonData
      if (isArcGISFormat) {
        geoJsonData = convertArcGISToGeoJSON({
          features: currentCourses
        })
        
        // 변환 후 원본 코스의 properties 정보 복원
        if (geoJsonData.features && currentCourses) {
          geoJsonData.features.forEach((feature, index) => {
            const originalCourse = currentCourses[index]
            if (originalCourse && originalCourse.properties) {
              feature.properties = {
                ...feature.properties,
                ...originalCourse.properties
              }
            }
          })
        }
        } else {
          geoJsonData = {
            type: 'FeatureCollection',
            features: Array.isArray(currentCourses) ? currentCourses : [currentCourses]
          }
        }
      
      if (geoJsonData.features && geoJsonData.features.length > 0 && mapInstanceRef.current) {
        const bounds = new window.kakao.maps.LatLngBounds()
        
        // 각 코스를 카카오맵 Polyline으로 표시
        geoJsonData.features.forEach((feature) => {
          const props = feature.properties || {}
          const rawDifficulty = props.difficulty || '보통'
          const difficultyColor = getDifficultyColor(rawDifficulty)
          const courseName = props.name || '등산 코스'
          
          // 좌표 추출
          let path = []
          if (feature.geometry.type === 'LineString') {
            path = feature.geometry.coordinates.map(coord => 
              new window.kakao.maps.LatLng(coord[1], coord[0])
            )
          } else if (feature.geometry.type === 'MultiLineString') {
            path = feature.geometry.coordinates.flat().map(coord => 
              new window.kakao.maps.LatLng(coord[1], coord[0])
            )
          }
          
          if (path.length > 0) {
            // Polyline 생성
            const polyline = new window.kakao.maps.Polyline({
              path: path,
              strokeWeight: 4,
              strokeColor: difficultyColor,
              strokeOpacity: 0.8,
              strokeStyle: 'solid',
              zIndex: 1
            })
            
            polyline.setMap(mapInstanceRef.current)
            courseLayerRef.current.push(polyline)
            
            // Polyline 클릭 이벤트 추가 (currentCourses를 클로저로 캡처)
            const clickHandler = () => {
              const courseIndex = currentCourses.findIndex(c => {
                const cProps = c.properties || {}
                return cProps.name === courseName
              })
              if (courseIndex !== -1) {
                setSelectedCourseIndex(courseIndex)
                displayCourseOnMap(currentCourses[courseIndex], courseIndex)
              }
            }
            window.kakao.maps.event.addListener(polyline, 'click', clickHandler)
            // 이벤트 리스너 저장 (나중에 제거하기 위해)
            eventListenersRef.current.push({
              target: polyline,
              type: 'click',
              handler: clickHandler,
              remove: true
            })
            
            // 코스 이름 표시 (경로의 중간 지점에)
            const midIndex = Math.floor(path.length / 2)
            const midPosition = path[midIndex]
            
            const difficulty = getDifficultyText(props.difficulty)
            const distance = props.distance ? `${Number(props.distance).toFixed(2)}km` : '-'
            const duration = props.duration || '-'
            
            // 코스 이름을 표시하는 DOM 요소 생성 (클릭 가능)
            const courseNameDiv = document.createElement('div')
            courseNameDiv.style.cssText = `
              background-color: white;
              padding: 6px 12px;
              border-radius: 4px;
              border: 2px solid ${difficultyColor};
              box-shadow: 0 2px 6px rgba(0,0,0,0.3);
              font-size: 13px;
              font-weight: bold;
              color: ${difficultyColor};
              white-space: nowrap;
              cursor: pointer;
              transition: all 0.2s;
            `
            courseNameDiv.textContent = courseName
            
            // 호버 효과
            courseNameDiv.addEventListener('mouseenter', () => {
              courseNameDiv.style.transform = 'scale(1.1)'
              courseNameDiv.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4)'
            })
            courseNameDiv.addEventListener('mouseleave', () => {
              courseNameDiv.style.transform = 'scale(1)'
              courseNameDiv.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)'
            })
            
            // 클릭 이벤트 (currentCourses를 클로저로 캡처)
            courseNameDiv.addEventListener('click', () => {
              const courseIndex = currentCourses.findIndex(c => {
                const cProps = c.properties || {}
                return cProps.name === courseName
              })
              if (courseIndex !== -1) {
                setSelectedCourseIndex(courseIndex)
                displayCourseOnMap(currentCourses[courseIndex], courseIndex)
              }
            })
            
            // 코스 이름을 표시하는 CustomOverlay
            const courseNameOverlay = new window.kakao.maps.CustomOverlay({
              position: midPosition,
              content: courseNameDiv,
              yAnchor: 0.5
            })
            
            courseNameOverlay.setMap(mapInstanceRef.current)
            markersRef.current.push(courseNameOverlay)
            
            // Polyline에 클릭 이벤트가 추가되었으므로 투명한 마커는 제거
            // (Polyline 자체에 클릭 이벤트를 추가하여 더 정확한 클릭 감지)
            
            // 경로의 각 점을 bounds에 추가
            path.forEach(point => bounds.extend(point))
          }
        })
        
        // 지도 범위 조정
        if (courseLayerRef.current.length > 0) {
          try {
            // bounds에 포인트가 추가되었는지 확인
            const sw = bounds.getSW()
            const ne = bounds.getNE()
            if (sw && ne && sw.getLat && ne.getLat) {
              // bounds에 패딩 추가 (여유 공간)
              const latDiff = ne.getLat() - sw.getLat()
              const lngDiff = ne.getLng() - sw.getLng()
              const padding = Math.max(latDiff * 0.1, lngDiff * 0.1, 0.005) // 10% 또는 최소 0.005도
              
              const paddedBounds = new window.kakao.maps.LatLngBounds(
                new window.kakao.maps.LatLng(sw.getLat() - padding, sw.getLng() - padding),
                new window.kakao.maps.LatLng(ne.getLat() + padding, ne.getLng() + padding)
              )
              
              mapInstanceRef.current.setBounds(paddedBounds)
              console.log('전체 코스 보기: 지도 범위 조정 완료')
            } else {
              console.warn('전체 코스 보기: bounds가 유효하지 않음', { sw, ne })
            }
          } catch (error) {
            console.error('전체 코스 보기: 지도 범위 조정 실패:', error)
          }
        }
      }
    } catch (error) {
      console.error('Failed to show all courses:', error)
    }
  }

  // 특정 코스를 지도에 표시하는 함수
  const displayCourseOnMap = async (course, index) => {
    if (!mapInstanceRef.current || !window.kakao || !window.kakao.maps) {
      console.warn('지도가 초기화되지 않았습니다. 잠시 후 다시 시도합니다.')
      setTimeout(() => {
        if (mapInstanceRef.current && course) {
          displayCourseOnMap(course, index)
        }
      }, 500)
      return
    }

    try {
      // courses 배열에서 실제 코스 데이터 가져오기
      const actualCourse = courses[index] || course
      const courseName = actualCourse?.properties?.name || course?.properties?.name || '이름 없음'
      const courseDifficulty = actualCourse?.properties?.difficulty || course?.properties?.difficulty || '보통'
      
      console.log('코스 지도에 표시 시작:', courseName)
      
      // 기존 이벤트 리스너 제거
      eventListenersRef.current.forEach(listener => {
        if (listener && listener.remove) {
          try {
            window.kakao.maps.event.removeListener(listener.target, listener.type, listener.handler)
          } catch (error) {
            console.warn('이벤트 리스너 제거 실패:', error)
          }
        }
      })
      eventListenersRef.current = []
      
      // 기존 폴리라인 및 마커 제거
      courseLayerRef.current.forEach(polyline => {
        if (polyline && polyline.setMap) {
          polyline.setMap(null)
        }
      })
      courseLayerRef.current = []
      
      markersRef.current.forEach(marker => {
        if (marker && marker.setMap) {
          marker.setMap(null)
        }
      })
      markersRef.current = []

      // 실제 코스 데이터 사용
      const courseToDisplay = actualCourse || course
      
      // ArcGIS 형식인지 확인
      const isArcGISFormat = courseToDisplay.geometry && 
        (courseToDisplay.geometry.paths || (courseToDisplay.attributes && !courseToDisplay.properties))
      
      let geoJsonData
      if (isArcGISFormat) {
        // ArcGIS 형식을 GeoJSON으로 변환
        geoJsonData = convertArcGISToGeoJSON({
          features: [courseToDisplay]
        })
        // 변환 후 properties에 난이도 정보 추가
        if (geoJsonData.features && geoJsonData.features.length > 0) {
          geoJsonData.features[0].properties = {
            ...geoJsonData.features[0].properties,
            difficulty: courseDifficulty,
            name: courseName
          }
        }
      } else {
        // 이미 GeoJSON 형식
        geoJsonData = {
          type: 'FeatureCollection',
          features: [{
            ...courseToDisplay,
            properties: {
              ...courseToDisplay.properties,
              difficulty: courseDifficulty,
              name: courseName
            }
          }]
        }
      }
      
      if (geoJsonData.features && geoJsonData.features.length > 0) {
        const feature = geoJsonData.features[0]
        const props = feature.properties || {}
        const rawDifficulty = props.difficulty || '보통'
        const difficultyColor = getDifficultyColor(rawDifficulty)
        const bounds = new window.kakao.maps.LatLngBounds()
        
        // 좌표 추출
        let path = []
        if (feature.geometry.type === 'LineString') {
          path = feature.geometry.coordinates.map(coord => {
            const latLng = new window.kakao.maps.LatLng(coord[1], coord[0])
            bounds.extend(latLng)
            return latLng
          })
        } else if (feature.geometry.type === 'MultiLineString') {
          path = feature.geometry.coordinates.flat().map(coord => {
            const latLng = new window.kakao.maps.LatLng(coord[1], coord[0])
            bounds.extend(latLng)
            return latLng
          })
        }
        
        if (path.length > 0) {
          // Polyline 생성
          const polyline = new window.kakao.maps.Polyline({
            path: path,
            strokeWeight: 5,
            strokeColor: difficultyColor,
            strokeOpacity: 0.9,
            strokeStyle: 'solid'
          })
          polyline.setMap(mapInstanceRef.current)
          courseLayerRef.current.push(polyline)
          
          // 선택된 코스에도 클릭 이벤트 추가 (전체 코스 보기로 돌아가기)
          const clickHandler = () => {
            showAllCourses()
          }
          window.kakao.maps.event.addListener(polyline, 'click', clickHandler)
          // 이벤트 리스너 저장 (나중에 제거하기 위해)
          eventListenersRef.current.push({
            target: polyline,
            type: 'click',
            handler: clickHandler,
            remove: true
          })
          
          const startPoint = path[0]
          const endPoint = path[path.length - 1]
          
          // 출발 마커
          const startCustomOverlay = new window.kakao.maps.CustomOverlay({
            position: startPoint,
            content: '<div style="background-color: #4CAF50; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 11px;">출발</div>',
            yAnchor: 1
          })
          startCustomOverlay.setMap(mapInstanceRef.current)
          markersRef.current.push(startCustomOverlay)
          
          // 코스 경로와 가까운 SPOT 찾기
          const nearbySpots = []
          const maxDistance = 200
          const samplePoints = []
          let accumulatedDistance = 0
          
          for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i]
            const p2 = path[i + 1]
            const dist = calculateDistance(p1.getLat(), p1.getLng(), p2.getLat(), p2.getLng())
            accumulatedDistance += dist
            
            if (accumulatedDistance >= 100 || i === 0) {
              samplePoints.push({ lat: p1.getLat(), lon: p1.getLng(), index: i })
              accumulatedDistance = 0
            }
          }
          samplePoints.push({ lat: endPoint.getLat(), lon: endPoint.getLng(), index: path.length - 1 })
          
          const usedSpots = new Set()
          for (const samplePoint of samplePoints) {
            let closestSpot = null
            let minDistance = Infinity
            
            for (const spot of spotsRef.current) {
              if (usedSpots.has(spot)) continue
              const dist = calculateDistance(samplePoint.lat, samplePoint.lon, spot.lat, spot.lon)
              if (dist < maxDistance && dist < minDistance) {
                minDistance = dist
                closestSpot = spot
              }
            }
            
            if (closestSpot && !usedSpots.has(closestSpot)) {
              nearbySpots.push(closestSpot)
              usedSpots.add(closestSpot)
            }
          }
          
          // 편의시설 마커 제거 (사용자 요청)
          // 파란색 편의시설 마커는 더 이상 표시하지 않음
          
          // 도착 마커
          const endCustomOverlay = new window.kakao.maps.CustomOverlay({
            position: endPoint,
            content: '<div style="background-color: #F44336; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 11px;">도착</div>',
            yAnchor: 1
          })
          endCustomOverlay.setMap(mapInstanceRef.current)
          markersRef.current.push(endCustomOverlay)
          
          // 지도 범위 조정
          try {
            const sw = bounds.getSW()
            const ne = bounds.getNE()
            if (sw && ne) {
              mapInstanceRef.current.setBounds(bounds)
              console.log('코스 선택: 지도 범위 조정 완료')
            }
          } catch (error) {
            console.error('코스 선택: 지도 범위 조정 실패:', error)
          }
        }
      }
    } catch (error) {
      console.error('Failed to display course on map:', error)
    }
  }

  const loadCourseData = async (mountainCode, map) => {
    if (!mapInstanceRef.current || !window.kakao || !window.kakao.maps) {
      console.warn('지도가 초기화되지 않아 코스 데이터를 로드할 수 없습니다.')
      // 지도가 아직 준비되지 않았다면 잠시 대기 후 재시도
      setTimeout(() => {
        if (mapInstanceRef.current && window.kakao && window.kakao.maps) {
          loadCourseData(mountainCode, map)
        }
      }, 500)
      return
    }

    try {
      setCoursesLoading(true)
      // 백엔드 API에서 데이터 가져오기
      const apiUrl = API_URL
      const response = await fetch(`${apiUrl}/api/mountains/${mountainCode}/courses`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      
      console.log('API 응답 데이터:', data)
      console.log('코스 개수:', data.courses?.length || 0)
      
      // 코스 데이터 저장
      if (data.courses && data.courses.length > 0) {
        const coursesData = data.courses // 클로저 문제 해결을 위해 변수에 저장
        setCourses(coursesData)
        setSelectedCourseIndex(null) // 초기화
        console.log('코스 데이터 로드 완료:', coursesData.length, '개')
        console.log('지도 인스턴스 확인:', mapInstanceRef.current)
        console.log('카카오맵 확인:', window.kakao?.maps)
        
        // 기존 이벤트 리스너 제거
        eventListenersRef.current.forEach(listener => {
          if (listener && listener.remove) {
            try {
              window.kakao.maps.event.removeListener(listener.target, listener.type, listener.handler)
            } catch (error) {
              console.warn('이벤트 리스너 제거 실패:', error)
            }
          }
        })
        eventListenersRef.current = []
        
        // 기존 폴리라인 제거
        courseLayerRef.current.forEach(polyline => {
          if (polyline && polyline.setMap) {
            polyline.setMap(null)
          }
        })
        courseLayerRef.current = []
        
        // 초기에는 모든 코스를 지도에 표시 (마커는 표시하지 않음)
        if (mapInstanceRef.current && window.kakao && window.kakao.maps) {
          
          // 기존 마커 제거
          markersRef.current.forEach(marker => {
            if (marker && marker.setMap) {
              marker.setMap(null)
            }
          })
          markersRef.current = []
        
        // ArcGIS 형식인지 확인 (geometry.paths가 있으면 ArcGIS 형식)
        const isArcGISFormat = data.courses.some(course => 
            course.geometry && (course.geometry.paths || (course.attributes && !course.properties))
        )
        
        let geoJsonData
        if (isArcGISFormat) {
          // ArcGIS 형식을 GeoJSON으로 변환
            console.log('ArcGIS 형식 감지, 좌표 변환 시작...')
          geoJsonData = convertArcGISToGeoJSON({
            features: data.courses
          })
            console.log('좌표 변환 완료, 변환된 코스 개수:', geoJsonData.features?.length || 0)
            
            // 변환 후 원본 코스의 properties 정보 복원 (난이도 등)
            if (geoJsonData.features && data.courses) {
              geoJsonData.features.forEach((feature, index) => {
                const originalCourse = data.courses[index]
                if (originalCourse && originalCourse.properties) {
                  // 원본 properties와 변환된 properties 병합
                  feature.properties = {
                    ...feature.properties,
                    ...originalCourse.properties
                  }
                }
              })
            }
        } else {
          // 이미 GeoJSON 형식
          geoJsonData = {
            type: 'FeatureCollection',
            features: Array.isArray(data.courses) ? data.courses : [data.courses]
          }
        }
        
        if (geoJsonData.features && geoJsonData.features.length > 0 && mapInstanceRef.current) {
            console.log('지도에 코스 표시 시작, 코스 개수:', geoJsonData.features.length)
            console.log('지도 인스턴스:', mapInstanceRef.current)
            const bounds = new window.kakao.maps.LatLngBounds()
            let hasValidBounds = false
            let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
            
            // 각 코스를 카카오맵 Polyline으로 표시
            geoJsonData.features.forEach((feature, idx) => {
              const props = feature.properties || {}
              const rawDifficulty = props.difficulty || '보통'
              const difficultyColor = getDifficultyColor(rawDifficulty)
              
              // 디버깅 로그 (첫 번째 코스만)
              if (idx === 0) {
                console.log('초기 코스 로드 - 난이도 정보:', {
                  코스명: props.name,
                  원본난이도: rawDifficulty,
                  색상: difficultyColor
                })
              }
              
              // 좌표 추출
              let path = []
              if (feature.geometry.type === 'LineString') {
                path = feature.geometry.coordinates.map(coord => {
                  const lat = coord[1]
                  const lng = coord[0]
                  const latLng = new window.kakao.maps.LatLng(lat, lng)
                  bounds.extend(latLng)
                  // 수동으로 bounds 계산
                  if (lat < minLat) minLat = lat
                  if (lat > maxLat) maxLat = lat
                  if (lng < minLng) minLng = lng
                  if (lng > maxLng) maxLng = lng
                  hasValidBounds = true
                  return latLng
                })
              } else if (feature.geometry.type === 'MultiLineString') {
                path = feature.geometry.coordinates.flat().map(coord => {
                  const lat = coord[1]
                  const lng = coord[0]
                  const latLng = new window.kakao.maps.LatLng(lat, lng)
                  bounds.extend(latLng)
                  // 수동으로 bounds 계산
                  if (lat < minLat) minLat = lat
                  if (lat > maxLat) maxLat = lat
                  if (lng < minLng) minLng = lng
                  if (lng > maxLng) maxLng = lng
                  hasValidBounds = true
                  return latLng
                })
              }
              
              if (path.length > 0) {
                const courseName = props.name || '등산 코스'
                console.log(`코스 ${idx + 1} 경로 표시:`, courseName, '경로 포인트 수:', path.length)
                // Polyline 생성
                const polyline = new window.kakao.maps.Polyline({
                  path: path,
                  strokeWeight: 4,
                  strokeColor: difficultyColor,
                  strokeOpacity: 0.8,
                  strokeStyle: 'solid',
                  zIndex: 1
                })
                polyline.setMap(mapInstanceRef.current)
                courseLayerRef.current.push(polyline)
                
                // Polyline 클릭 이벤트 추가 (coursesData를 직접 사용하여 클로저 문제 해결)
                const clickHandler = () => {
                  // coursesData를 사용하여 코스 찾기
                  const courseIndex = coursesData.findIndex(c => {
                    const cProps = c.properties || {}
                    return cProps.name === courseName
                  })
                  if (courseIndex !== -1) {
                    setSelectedCourseIndex(courseIndex)
                    displayCourseOnMap(coursesData[courseIndex], courseIndex)
                  }
                }
                window.kakao.maps.event.addListener(polyline, 'click', clickHandler)
                // 이벤트 리스너 저장 (나중에 제거하기 위해)
                eventListenersRef.current.push({
                  target: polyline,
                  type: 'click',
                  handler: clickHandler,
                  remove: true
                })
                
                console.log(`코스 ${idx + 1} Polyline 추가 완료`)
                
                // 코스 이름 표시 (경로의 중간 지점에)
                const midIndex = Math.floor(path.length / 2)
                const midPosition = path[midIndex]
                
                // 코스 이름을 표시하는 DOM 요소 생성 (클릭 가능)
                const courseNameDiv = document.createElement('div')
                courseNameDiv.style.cssText = `
                  background-color: white;
                  padding: 6px 12px;
                  border-radius: 4px;
                  border: 2px solid ${difficultyColor};
                  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                  font-size: 13px;
                  font-weight: bold;
                  color: ${difficultyColor};
                  white-space: nowrap;
                  cursor: pointer;
                  transition: all 0.2s;
                `
                courseNameDiv.textContent = courseName
                
                // 호버 효과
                courseNameDiv.addEventListener('mouseenter', () => {
                  courseNameDiv.style.transform = 'scale(1.1)'
                  courseNameDiv.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4)'
                })
                courseNameDiv.addEventListener('mouseleave', () => {
                  courseNameDiv.style.transform = 'scale(1)'
                  courseNameDiv.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)'
                })
                
                // 클릭 이벤트 (coursesData를 직접 사용하여 클로저 문제 해결)
                courseNameDiv.addEventListener('click', () => {
                  const courseIndex = coursesData.findIndex(c => {
                    const cProps = c.properties || {}
                    return cProps.name === courseName
                  })
                  if (courseIndex !== -1) {
                    setSelectedCourseIndex(courseIndex)
                    displayCourseOnMap(coursesData[courseIndex], courseIndex)
                  }
                })
                
                // 코스 이름을 표시하는 CustomOverlay
                const courseNameOverlay = new window.kakao.maps.CustomOverlay({
                  position: midPosition,
                  content: courseNameDiv,
                  yAnchor: 0.5
                })
                
                courseNameOverlay.setMap(mapInstanceRef.current)
                markersRef.current.push(courseNameOverlay)
                
                // Polyline에 클릭 이벤트가 추가되었으므로 투명한 마커는 제거
                // (Polyline 자체에 클릭 이벤트를 추가하여 더 정확한 클릭 감지)
              }
            })
            
            // 지도 범위 조정 - bounds에 포인트가 확장되었는지 확인
            if (courseLayerRef.current.length > 0 && hasValidBounds && minLat !== Infinity) {
              // 지도가 완전히 렌더링된 후 bounds 설정
              const adjustBounds = () => {
                try {
                  // 수동으로 계산한 bounds 사용
                  const latDiff = maxLat - minLat
                  const lngDiff = maxLng - minLng
                  const padding = Math.max(latDiff * 0.1, lngDiff * 0.1, 0.005) // 10% 또는 최소 0.005도
                  
                  const sw = new window.kakao.maps.LatLng(minLat - padding, minLng - padding)
                  const ne = new window.kakao.maps.LatLng(maxLat + padding, maxLng + padding)
                  
                  const paddedBounds = new window.kakao.maps.LatLngBounds(sw, ne)
                  
                  console.log('Bounds 계산:', { 
                    minLat, maxLat, minLng, maxLng,
                    sw: { lat: sw.getLat(), lng: sw.getLng() },
                    ne: { lat: ne.getLat(), lng: ne.getLng() },
                    padding,
                    courseCount: courseLayerRef.current.length
                  })
                  
                  if (mapInstanceRef.current) {
                    // setBounds 실행
                    mapInstanceRef.current.setBounds(paddedBounds)
                    console.log('초기 로드: 지도 범위 조정 완료')
                    
                    // bounds가 제대로 적용되었는지 확인 (1초 후)
                    setTimeout(() => {
                      if (mapInstanceRef.current) {
                        const currentCenter = mapInstanceRef.current.getCenter()
                        const currentLevel = mapInstanceRef.current.getLevel()
                        console.log('지도 현재 상태:', {
                          center: { lat: currentCenter.getLat(), lng: currentCenter.getLng() },
                          level: currentLevel
                        })
                      }
                    }, 1000)
                  }
                } catch (error) {
                  console.error('초기 로드: 지도 범위 조정 실패:', error)
                }
              }
              
              // 지도 렌더링 대기 후 bounds 설정
              setTimeout(adjustBounds, 300)
            } else {
              console.warn('초기 로드: 코스가 없거나 bounds가 유효하지 않음', {
                courseCount: courseLayerRef.current.length,
                hasValidBounds,
                minLat, maxLat, minLng, maxLng
              })
          }
        }
        }
      } else {
        setCourses([])
        setSelectedCourseIndex(null)
      }
    } catch (error) {
      console.error('Failed to load course data:', error)
      console.error('에러 상세:', {
        message: error.message,
        stack: error.stack,
        mountainCode,
        mapInstance: !!mapInstanceRef.current,
        kakaoMaps: !!window.kakao?.maps
      })
      if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED')) {
        console.warn('백엔드 서버에 연결할 수 없습니다. 백엔드 서버가 실행 중인지 확인하세요.')
      }
      setCourses([])
      setSelectedCourseIndex(null)
    } finally {
      setCoursesLoading(false)
    }
  }
  
  // 정렬 방향 토글 함수
  const handleSortClick = (sortType) => {
    if (sortBy.startsWith(sortType)) {
      // 같은 정렬 타입이면 방향 토글
      const currentDir = sortBy.endsWith('-asc') ? 'asc' : 'desc'
      setSortBy(currentDir === 'asc' ? `${sortType}-desc` : `${sortType}-asc`)
    } else {
      // 다른 정렬 타입이면 오름차순으로 설정
      setSortBy(`${sortType}-asc`)
    }
  }
  
  // 정렬 타입과 방향 추출
  const getSortType = () => {
    if (sortBy.startsWith('difficulty')) return 'difficulty'
    if (sortBy.startsWith('time')) return 'time'
    if (sortBy.startsWith('distance')) return 'distance'
    return 'difficulty'
  }
  
  const getSortDirection = () => {
    return sortBy.endsWith('-desc') ? 'desc' : 'asc'
  }
  
  // 코스 정렬 함수
  const getSortedCourses = () => {
    if (!courses || courses.length === 0) return []
    
    const sorted = [...courses]
    const sortType = getSortType()
    const sortDir = getSortDirection()
    const multiplier = sortDir === 'asc' ? 1 : -1
    
    switch (sortType) {
      case 'difficulty':
        // 난이도순: 쉬움 < 보통 < 어려움
        const difficultyOrder = { 
          '매우쉬움': 1, '쉬움': 1, '초급': 1,
          '보통': 2, '중급': 2,
          '어려움': 3, '매우어려움': 3, '고급': 3
        }
        sorted.sort((a, b) => {
          const aDiff = difficultyOrder[a.properties?.difficulty] || 2
          const bDiff = difficultyOrder[b.properties?.difficulty] || 2
          return (aDiff - bDiff) * multiplier
        })
        break
      case 'time':
        // 시간순: 소요시간 기준
        sorted.sort((a, b) => {
          const aTime = a.properties?.upTime + a.properties?.downTime || 0
          const bTime = b.properties?.upTime + b.properties?.downTime || 0
          return (aTime - bTime) * multiplier
        })
        break
      case 'distance':
        // 거리순
        sorted.sort((a, b) => {
          const aDist = a.properties?.distance || 0
          const bDist = b.properties?.distance || 0
          return (aDist - bDist) * multiplier
        })
        break
      default:
        // 기본 정렬 (원본 순서)
        break
    }
    
    return sorted
  }
  
  // 난이도 표시 변환 (쉬움, 보통, 어려움만)
  const getDifficultyText = (difficulty) => {
    if (!difficulty) return '보통'
    const diff = String(difficulty).trim()
    // 기존 데이터 변환
    if (diff === '매우쉬움' || diff === '쉬움' || diff === '초급') return '쉬움'
    if (diff === '보통' || diff === '중급') return '보통'
    if (diff === '어려움' || diff === '매우어려움' || diff === '고급') return '어려움'
    // 기본값
    return '보통'
  }
  
  // 난이도 클래스 변환 (색상용)
  const getDifficultyClass = (difficulty) => {
    const diff = getDifficultyText(difficulty)
    if (diff === '쉬움') return 'easy'
    if (diff === '보통') return 'normal'
    if (diff === '어려움') return 'hard'
    return 'normal'
  }
  
  // 난이도 색상 가져오기
  const getDifficultyColor = (difficulty) => {
    const diff = getDifficultyText(difficulty)
    const colors = {
      '쉬움': '#4CAF50', // 초록색
      '보통': '#FF9800', // 주황색
      '어려움': '#F44336' // 빨간색
    }
    return colors[diff] || colors['보통']
  }

  // 두 좌표 간 거리 계산 (미터 단위)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000 // 지구 반지름 (미터)
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const loadSpotData = async (mountainCode, map) => {
    if (!map || !mapInstanceRef.current) return

    try {
      // 백엔드 API에서 지점 데이터 가져오기
      const apiUrl = API_URL
      const response = await fetch(`${apiUrl}/api/mountains/${mountainCode}/spots`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      
      // SPOT 데이터를 spotsRef에 저장 (마커 배치에 사용)
      spotsRef.current = []
        
      if (data.spots && data.spots.length > 0 && mapInstanceRef.current) {
        // ArcGIS 형식인지 확인
        const isArcGISFormat = data.spots.some(spot => 
          spot.geometry && (spot.geometry.x !== undefined || spot.geometry.paths)
        )
        
        // forEach 대신 for...of 루프 사용 (async/await 지원)
        for (const spot of data.spots) {
          let lat, lon
          
          if (isArcGISFormat) {
            // ArcGIS 형식: geometry.x, geometry.y
            if (spot.geometry && spot.geometry.x !== undefined && spot.geometry.y !== undefined) {
              const coords = transformArcGISToWGS84(spot.geometry.x, spot.geometry.y)
              if (coords) {
                lat = coords[0]
                lon = coords[1]
              }
            }
          } else {
            // GeoJSON 형식
            if (spot.geometry && spot.geometry.coordinates) {
              [lon, lat] = spot.geometry.coordinates
            }
          }
          
          if (lat && lon && !isNaN(lat) && !isNaN(lon) && lat >= 33 && lat <= 43 && lon >= 124 && lon <= 132) {
            const attrs = spot.attributes || spot.properties || {}
            const spotManageType = (attrs.MANAGE_SP2 || '').trim()
            
            // 편의시설만 필터링 (분기점, 시종점 등 제외)
            const facilityTypes = ['쉼터', '전망대', '대피소', '화장실', '식수대', '음수대', '탐방지원센터', '안내소', '매점', '주차장', '정자', '야영장', '조망점', '벤치']
            const excludeTypes = ['분기점', '시종점', '기타', '훼손지', '가로등', '안내판또는지도', '시설물(운동기구 등)', '기타건물', '위험지역']
            
            const isFacility = facilityTypes.some(type => spotManageType.includes(type)) && 
                              !excludeTypes.some(type => spotManageType.includes(type))
            
            // 편의시설만 저장 (마커 배치에 사용, 빨간 마커는 표시하지 않음)
            if (isFacility) {
              spotsRef.current.push({
                lat,
                lon,
                name: attrs.DETAIL_SPO || attrs.MANAGE_SP2 || '등산 지점',
                type: spotManageType,
                etc: attrs.ETC_MATTER || ''
              })
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load spot data:', error)
    }
  }

  // 숙소 좌표 추출 헬퍼
  const getLodgingLatLng = (lodging) => {
    if (!lodging || typeof lodging !== 'object') return { lat: null, lon: null }

    const lat =
      lodging.lat ??
      lodging.latitude ??
      lodging.coordinates?.lat ??
      lodging.location?.lat ??
      lodging.geometry?.location?.lat ??
      lodging.mountain?.lat

    const lon =
      lodging.lon ??
      lodging.lng ??
      lodging.longitude ??
      lodging.coordinates?.lon ??
      lodging.coordinates?.lng ??
      lodging.location?.lon ??
      lodging.location?.lng ??
      lodging.geometry?.location?.lng ??
      lodging.geometry?.location?.lon ??
      lodging.mountain?.lng

    return { lat, lon }
  }

  // 주변 숙소 데이터 로드
  const loadLodgingData = async (mountainCode) => {
    if (!mapInstanceRef.current || !window.kakao || !window.kakao.maps) {
      return []
    }

    try {
      const apiUrl = API_URL
      const response = await fetch(`${apiUrl}/api/mountains/${mountainCode}/lodgings`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      const list = data.lodgings || []
      setLodgings(list)
      return list
    } catch (error) {
      console.error('Failed to load lodging data:', error)
      return []
    }
  }

  // 주변 숙소 마커 표시/숨김
  const toggleLodgingMarkers = async () => {
    if (!mapInstanceRef.current || !window.kakao || !window.kakao.maps) {
      return
    }

    // 이미 보이는 경우 -> 제거하고 코스 다시 표시
    if (lodgingsVisible) {
      lodgingMarkersRef.current.forEach(marker => {
        if (marker && marker.setMap) {
          marker.setMap(null)
        }
      })
      lodgingMarkersRef.current = []
      setLodgingsVisible(false)
      
      // 코스 레이어 다시 표시
      courseLayerRef.current.forEach(polyline => {
        if (polyline && polyline.setMap) {
          polyline.setMap(mapInstanceRef.current)
        }
      })
      // 코스 이름 마커도 다시 표시
      markersRef.current.forEach(marker => {
        if (marker && marker.setMap) {
          marker.setMap(mapInstanceRef.current)
        }
      })
      return
    }

    // 코스 레이어 숨기기
    courseLayerRef.current.forEach(polyline => {
      if (polyline && polyline.setMap) {
        polyline.setMap(null)
      }
    })
    // 코스 이름 마커도 숨기기
    markersRef.current.forEach(marker => {
      if (marker && marker.setMap) {
        marker.setMap(null)
      }
    })

    // 아직 숙소 데이터를 안 불러왔다면 먼저 로드
    let currentLodgings = lodgings
    if (!currentLodgings || currentLodgings.length === 0) {
      currentLodgings = await loadLodgingData(code)
      if (!currentLodgings || currentLodgings.length === 0) {
        // 숙소가 없으면 코스 다시 표시
        courseLayerRef.current.forEach(polyline => {
          if (polyline && polyline.setMap) {
            polyline.setMap(mapInstanceRef.current)
          }
        })
        markersRef.current.forEach(marker => {
          if (marker && marker.setMap) {
            marker.setMap(mapInstanceRef.current)
          }
        })
        alert('등록된 주변 숙소 정보가 없습니다.')
        return
      }
    }

    // 기존 숙소 마커 제거
    lodgingMarkersRef.current.forEach(marker => {
      if (marker && marker.setMap) {
        marker.setMap(null)
      }
    })
    lodgingMarkersRef.current = []

    // 숙소 마커 추가
    const bounds = new window.kakao.maps.LatLngBounds()
    let hasValidBounds = false

    currentLodgings.forEach(lodging => {
      const { lat, lon } = getLodgingLatLng(lodging)

      if (!lat || !lon || isNaN(lat) || isNaN(lon)) return

      const position = new window.kakao.maps.LatLng(lat, lon)
      bounds.extend(position)
      hasValidBounds = true

      const lodgingName = lodging.lodging?.name || lodging.name || lodging.lodgingName || lodging.title || '숙소'
      
      const content = document.createElement('div')
      content.style.cssText = `
        background-color: #FF7043;
        border-radius: 16px;
        padding: 4px 10px;
        color: #fff;
        font-size: 12px;
        font-weight: bold;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        white-space: nowrap;
        cursor: pointer;
      `
      content.textContent = lodgingName

      const overlay = new window.kakao.maps.CustomOverlay({
        position,
        content,
        yAnchor: 1
      })

      // 마커 클릭 시 상세 모달 열기
      content.addEventListener('click', () => {
        setSelectedLodging(lodging)
        setShowLodgingModal(true)
      })

      overlay.setMap(mapInstanceRef.current)
      lodgingMarkersRef.current.push(overlay)
    })

    // 지도 범위를 숙소에 맞게 조정
    if (hasValidBounds) {
      try {
        const sw = bounds.getSW()
        const ne = bounds.getNE()
        if (sw && ne) {
          // 약간의 패딩 추가
          const latDiff = ne.getLat() - sw.getLat()
          const lngDiff = ne.getLng() - sw.getLng()
          const padding = 0.1
          
          const paddedBounds = new window.kakao.maps.LatLngBounds(
            new window.kakao.maps.LatLng(sw.getLat() - latDiff * padding, sw.getLng() - lngDiff * padding),
            new window.kakao.maps.LatLng(ne.getLat() + latDiff * padding, ne.getLng() + lngDiff * padding)
          )
          mapInstanceRef.current.setBounds(paddedBounds)
      }
    } catch (error) {
        console.error('숙소 지도 범위 조정 실패:', error)
    }
    }

    setLodgingsVisible(true)
  }

  // 날씨 데이터 가져오기 (1시간마다 자동 업데이트)
  useEffect(() => {
    const fetchWeather = async () => {
      if (!code) {
        console.log('날씨 API - code가 없어서 요청하지 않음')
        return
      }
      
      console.log(`날씨 API - 요청 시작: code=${code}`)
      setWeatherLoading(true)
      try {
        const weatherUrl = `${API_URL}/api/mountains/${code}/weather`
        console.log(`날씨 API - 요청 URL: ${weatherUrl}`)
        
        // 타임아웃 설정 (30초)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)
        
        const response = await fetch(weatherUrl, {
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        
        console.log(`날씨 API - 응답 상태: ${response.status}`)
        if (response.ok) {
          const data = await response.json()
          console.log('날씨 API - 응답 데이터:', { 
            code: data.code, 
            lat: data.lat, 
            lon: data.lon, 
            forecastCount: data.forecast?.length 
          })
          // 받은 날짜 목록 확인
          const receivedDates = data.forecast?.map(f => f.date) || []
          console.log('날씨 API - 받은 날짜 목록:', receivedDates)
          setWeatherData(data)
        } else {
          const errorText = await response.text()
          console.error('날씨 데이터 가져오기 실패:', response.status, errorText)
          setWeatherData(null)
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.error('날씨 데이터 가져오기 타임아웃:', error)
        } else {
          console.error('날씨 데이터 가져오기 오류:', error)
        }
        setWeatherData(null)
      } finally {
        setWeatherLoading(false)
        console.log('날씨 API - 로딩 완료')
      }
    }
    
    // 즉시 한 번 실행
    fetchWeather()
    
    // 1시간(3600000ms)마다 자동 업데이트
    const interval = setInterval(() => {
      console.log('날씨 데이터 자동 업데이트 중...')
      fetchWeather()
    }, 60 * 60 * 1000) // 1시간 = 3600000ms
    
    // 컴포넌트 언마운트 시 인터벌 정리
    return () => clearInterval(interval)
  }, [code, API_URL])

  // 날씨 아이콘 경로 생성
  const getWeatherIconUrl = (icon) => {
    // public 폴더의 Weather_icon 사용
    return `/Weather_icon/${icon}.svg`
  }

  // 날짜 포맷팅 (오전/오후 표시)
  const formatDate = (dateStr, period) => {
    // YYYY-MM-DD 형식의 문자열을 한국 시간으로 파싱
    const date = new Date(dateStr + 'T00:00:00+09:00') // KST 시간대 명시
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    const dayNames = ['일', '월', '화', '수', '목', '금', '토']
    const dayName = dayNames[date.getDay()]
    
    // 오전/오후 정보 추가
    return `${month}.${day} ${dayName} ${period}`
  }

  const originText = origin || `${name}은(는) 한국의 대표적인 명산으로, 등산객들에게 사랑받는 산입니다.`

  return (
    <div className="mountain-detail">
      <Header />
      <main>
        <div className="mountain-header">
          <h1>{name}</h1>
          <div className="mountain-info">
            <span>높이: {height}</span>
            <span>위치: {location}</span>
          </div>
          <p className="mountain-description">{description}</p>
        </div>

        <div className="mountain-sections">
          {/* 실시간 통제정보 */}
          <section className="section">
            <h2>실시간 통제정보</h2>
            <div className="control-info">
              <div className="info-card">
                <div className="info-label">입산 통제</div>
                <div className="info-value">통제 없음</div>
              </div>
              <a 
                href="https://www.knps.or.kr/common/cctv/cctv4.do" 
                target="_blank" 
                rel="noopener noreferrer"
                className="cctv-link"
              >
                🎥 실시간 CCTV
              </a>
            </div>
          </section>

          {/* 날씨 정보 */}
          <section className="section">
            <div className="weather-header">
              <h2>{name} 날씨</h2>
              <span className="weather-help">?</span>
              <div className="weather-source">데이터출처: OpenWeatherMap • 3시간 간격</div>
            </div>
            {weatherLoading ? (
              <div style={{ padding: '20px', textAlign: 'center' }}>날씨 정보를 불러오는 중...</div>
            ) : weatherData && weatherData.forecast ? (
              <div className="weather-forecast">
                {(() => {
                  // 오늘 날짜 기준으로 필터링 (어제 제외) - 한국 시간 기준 (KST, UTC+9)
                  const now = new Date()
                  // 한국 시간대(UTC+9)로 변환
                  const kstOffset = 9 * 60 * 60 * 1000 // 9시간을 밀리초로
                  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000)
                  const koreaTime = new Date(utcTime + kstOffset)
                  
                  const todayYear = koreaTime.getFullYear()
                  const todayMonth = String(koreaTime.getMonth() + 1).padStart(2, '0')
                  const todayDay = String(koreaTime.getDate()).padStart(2, '0')
                  const todayKey = `${todayYear}-${todayMonth}-${todayDay}`
                  const todayKeyNum = parseInt(todayKey.replace(/-/g, ''))
                  
                  console.log(`프론트엔드 - 오늘 날짜 (KST): ${todayKey} (숫자: ${todayKeyNum})`)
                  console.log(`프론트엔드 - 받은 forecast 데이터:`, weatherData.forecast?.map(d => ({date: d.date, period: d.period})))
                  
                  // 날짜별로 그룹화 (어제 날짜 제외)
                  const groupedByDate = {}
                  let excludedCount = 0
                  weatherData.forecast.forEach((day) => {
                    // 어제 날짜는 완전히 제외 (이중 체크)
                    const dateKeyNum = parseInt(day.date.replace(/-/g, ''))
                    if (dateKeyNum < todayKeyNum || day.date < todayKey) {
                      console.log(`프론트엔드 - 어제 날짜 제외: ${day.date} (${dateKeyNum}) < 오늘: ${todayKey} (${todayKeyNum})`)
                      excludedCount++
                      return
                    }
                    
                    if (!groupedByDate[day.date]) {
                      groupedByDate[day.date] = {
                        date: day.date,
                        dayName: day.dayName,
                        month: day.month,
                        day: day.day,
                        morning: null,
                        afternoon: null
                      }
                    }
                    if (day.period === '오전') {
                      groupedByDate[day.date].morning = day
                    } else if (day.period === '오후') {
                      groupedByDate[day.date].afternoon = day
                    }
                  })
                  
                  // 날짜순으로 정렬하고 최대 5일만 (어제 날짜 최종 제외)
                  const sortedGroups = Object.values(groupedByDate)
                    .filter(group => {
                      // 한 번 더 확인: 어제 날짜는 절대 포함하지 않음
                      const dateKeyNum = parseInt(group.date.replace(/-/g, ''))
                      if (dateKeyNum < todayKeyNum || group.date < todayKey) {
                        console.error(`프론트엔드 - 오류: 어제 날짜가 그룹에 포함됨! ${group.date} - 제외`)
                        return false
                      }
                      return true
                    })
                    .sort((a, b) => {
                      const aNum = parseInt(a.date.replace(/-/g, ''))
                      const bNum = parseInt(b.date.replace(/-/g, ''))
                      return aNum - bNum
                    })
                    .slice(0, 5) // 정확히 5일만
                  
                  console.log(`프론트엔드 - 제외된 날짜 개수: ${excludedCount}`)
                  console.log(`프론트엔드 - 그룹화된 날짜: ${Object.keys(groupedByDate).join(', ')}`)
                  console.log(`프론트엔드 - 최종 표시 날짜: ${sortedGroups.map(g => g.date).join(', ')}`)
                  
                  return sortedGroups.map((group, index) => (
                    <div key={index} className="weather-date-group">
                      <div className="weather-date-header">
                        <span className="weather-date-name">{group.month}.{group.day} {group.dayName}</span>
                      </div>
                      <div className="weather-periods">
                        {group.morning && (() => {
                          // current_weather_refine.json 형식 데이터 우선 사용
                          const refined = group.morning.refined
                          const icon = refined?.weather?.[0]?.icon || group.morning.icon
                          const description = refined?.weather?.[0]?.description || group.morning.weather?.description || '날씨'
                          const tempMin = refined ? Math.round(refined.main?.temp_min || refined.main?.temp || 0) : group.morning.tempMin
                          const tempMax = refined ? Math.round(refined.main?.temp_max || refined.main?.temp || 0) : group.morning.tempMax
                          const temp = refined ? Math.round(refined.main?.temp || 0) : null
                          const feelsLike = refined ? Math.round(refined.main?.feels_like || 0) : null
                          const humidity = refined ? refined.main?.humidity : null
                          const windSpeed = refined ? (refined.wind?.speed || 0).toFixed(1) : group.morning.windSpeed
                          const clouds = refined ? refined.clouds?.all : null
                          
                          return (
                            <div className="weather-period weather-morning">
                              <div className="weather-period-label">오전</div>
                              <div className="weather-icon">
                                <img 
                                  src={getWeatherIconUrl(icon)} 
                                  alt={description}
                                  onError={(e) => {
                                    console.error('날씨 아이콘 로드 실패:', getWeatherIconUrl(icon))
                                    e.target.style.display = 'none'
                                    const fallback = icon?.includes('d') ? '☀️' : '🌙'
                                    if (!e.target.nextSibling) {
                                      e.target.parentElement.appendChild(document.createTextNode(fallback))
                                    }
                                  }}
                                  style={{ width: '48px', height: '48px', objectFit: 'contain' }}
                                />
                              </div>
                              <div className="weather-description">{description}</div>
                              <div className="weather-temp">
                                <span className="temp-min">{tempMin}°</span>
                                <span className="temp-separator">/</span>
                                <span className="temp-max">{tempMax}°</span>
                              </div>
                              {temp !== null && (
                                <div className="weather-detail">온도: {temp}°</div>
                              )}
                              {feelsLike !== null && (
                                <div className="weather-detail">체감: {feelsLike}°</div>
                              )}
                              {humidity !== null && (
                                <div className="weather-detail">습도: {humidity}%</div>
                              )}
                              <div className="weather-wind">풍속 {windSpeed}m/s</div>
                              {clouds !== null && (
                                <div className="weather-detail">구름: {clouds}%</div>
                              )}
                            </div>
                          )
                        })()}
                        {group.afternoon && (() => {
                          // current_weather_refine.json 형식 데이터 우선 사용
                          const refined = group.afternoon.refined
                          const icon = refined?.weather?.[0]?.icon || group.afternoon.icon
                          const description = refined?.weather?.[0]?.description || group.afternoon.weather?.description || '날씨'
                          const tempMin = refined ? Math.round(refined.main?.temp_min || refined.main?.temp || 0) : group.afternoon.tempMin
                          const tempMax = refined ? Math.round(refined.main?.temp_max || refined.main?.temp || 0) : group.afternoon.tempMax
                          const temp = refined ? Math.round(refined.main?.temp || 0) : null
                          const feelsLike = refined ? Math.round(refined.main?.feels_like || 0) : null
                          const humidity = refined ? refined.main?.humidity : null
                          const windSpeed = refined ? (refined.wind?.speed || 0).toFixed(1) : group.afternoon.windSpeed
                          const clouds = refined ? refined.clouds?.all : null
                          
                          return (
                            <div className="weather-period weather-afternoon">
                              <div className="weather-period-label">오후</div>
                              <div className="weather-icon">
                                <img 
                                  src={getWeatherIconUrl(icon)} 
                                  alt={description}
                                  onError={(e) => {
                                    console.error('날씨 아이콘 로드 실패:', getWeatherIconUrl(icon))
                                    e.target.style.display = 'none'
                                    const fallback = icon?.includes('d') ? '☀️' : '🌙'
                                    if (!e.target.nextSibling) {
                                      e.target.parentElement.appendChild(document.createTextNode(fallback))
                                    }
                                  }}
                                  style={{ width: '48px', height: '48px', objectFit: 'contain' }}
                                />
                              </div>
                              <div className="weather-description">{description}</div>
                              <div className="weather-temp">
                                <span className="temp-min">{tempMin}°</span>
                                <span className="temp-separator">/</span>
                                <span className="temp-max">{tempMax}°</span>
                              </div>
                              {temp !== null && (
                                <div className="weather-detail">온도: {temp}°</div>
                              )}
                              {feelsLike !== null && (
                                <div className="weather-detail">체감: {feelsLike}°</div>
                              )}
                              {humidity !== null && (
                                <div className="weather-detail">습도: {humidity}%</div>
                              )}
                              <div className="weather-wind">풍속 {windSpeed}m/s</div>
                              {clouds !== null && (
                                <div className="weather-detail">구름: {clouds}%</div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            ) : (
              <div style={{ padding: '20px', textAlign: 'center' }}>날씨 정보를 불러올 수 없습니다.</div>
            )}
            <div className="sun-info">
              {(() => {
                // 첫 번째 날의 refined 데이터에서 일출/일몰 정보 가져오기
                const firstDay = weatherData?.forecast?.[0]
                const refined = firstDay?.refined || firstDay?.morning?.refined || firstDay?.afternoon?.refined
                const sunrise = refined?.sys?.sunrise
                const sunset = refined?.sys?.sunset
                
                const formatTime = (timestamp) => {
                  if (!timestamp) return '--:--'
                  const date = new Date(timestamp * 1000)
                  const hours = String(date.getHours()).padStart(2, '0')
                  const minutes = String(date.getMinutes()).padStart(2, '0')
                  return `${hours}:${minutes}`
                }
                
                return (
                  <>
                    <div className="sun-item">
                      <span>🌅</span>
                      <span>일출 {formatTime(sunrise)}</span>
                    </div>
                    <div className="sun-item">
                      <span>🌇</span>
                      <span>일몰 {formatTime(sunset)}</span>
                    </div>
                  </>
                )
              })()}
            </div>
          </section>

          {/* 산 유래 */}
          <section className="section">
            <h2>산 유래</h2>
            <div className="origin-text">
              {originText.split('\n\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </section>

          {/* 지도 및 코스 - 네이버 스타일 양쪽 패널 */}
          <section className="section course-main-section">
            <h2>등산 코스</h2>
            <div className="course-layout">
              {/* 왼쪽 패널: 코스 리스트 */}
              <div className="course-list-panel">
                {coursesLoading ? (
                  <div style={{ padding: '20px', textAlign: 'center' }}>코스 정보를 불러오는 중...</div>
                ) : courses && courses.length > 0 ? (
                  <>
                    <div className="courses-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3>총 {courses.length}개 코스</h3>
                        <button 
                          className="difficulty-help-btn"
                          onClick={() => setShowDifficultyModal(true)}
                          title="난이도 안내"
                        >
                          ?
                        </button>
                      </div>
                      <div className="sort-options">
                        <button 
                          className={getSortType() === 'difficulty' ? 'active' : ''}
                          onClick={() => handleSortClick('difficulty')}
                        >
                          난이도순 {getSortType() === 'difficulty' && (getSortDirection() === 'asc' ? '↑' : '↓')}
                        </button>
                        <button 
                          className={getSortType() === 'time' ? 'active' : ''}
                          onClick={() => handleSortClick('time')}
                        >
                          시간순 {getSortType() === 'time' && (getSortDirection() === 'asc' ? '↑' : '↓')}
                        </button>
                        <button 
                          className={getSortType() === 'distance' ? 'active' : ''}
                          onClick={() => handleSortClick('distance')}
                        >
                          거리순 {getSortType() === 'distance' && (getSortDirection() === 'asc' ? '↑' : '↓')}
                        </button>
                      </div>
                    </div>
                    
                    <div className="courses-list">
                      {getSortedCourses().map((course, sortedIndex) => {
                        const props = course.properties || {}
                        const courseName = props.name || `코스 ${sortedIndex + 1}`
                        const difficulty = getDifficultyText(props.difficulty)
                        const difficultyClass = getDifficultyClass(props.difficulty)
                        const distance = props.distance ? `${Number(props.distance).toFixed(2)}km` : '-'
                        const duration = props.duration || '-'
                        const description = props.description || ''
                        
                        // 원본 courses 배열에서 실제 인덱스 찾기
                        const originalIndex = courses.findIndex(c => {
                          const cProps = c.properties || {}
                          return cProps.name === courseName && 
                                 cProps.distance === props.distance &&
                                 cProps.duration === props.duration
                        })
                        const actualIndex = originalIndex !== -1 ? originalIndex : sortedIndex
                        
                        const isSelected = selectedCourseIndex === actualIndex
                        
                        return (
                          <div 
                            key={`${courseName}-${actualIndex}`}
                            ref={(el) => {
                              if (el) {
                                courseItemRefs.current[actualIndex] = el
                              }
                            }}
                            className={`course-card ${isSelected ? 'selected' : ''}`}
                            onClick={async () => {
                              setSelectedCourseIndex(actualIndex)
                              // 원본 courses 배열에서 코스 가져오기
                              const courseToDisplay = courses[actualIndex] || course
                              // 지도가 준비될 때까지 대기
                              if (!mapInstanceRef.current) {
                                console.warn('지도가 아직 초기화되지 않았습니다. 잠시 대기합니다...')
                                // 최대 2초 대기
                                let retries = 0
                                const checkMap = setInterval(() => {
                                  if (mapInstanceRef.current || retries >= 20) {
                                    clearInterval(checkMap)
                                    if (mapInstanceRef.current) {
                                      displayCourseOnMap(courseToDisplay, actualIndex)
                                    }
                                  }
                                  retries++
                                }, 100)
                              } else {
                                displayCourseOnMap(courseToDisplay, actualIndex)
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <div className="course-card-header">
                              <h4 className="course-name">{courseName}</h4>
                              <span className={`difficulty-badge difficulty-${difficultyClass}`}>
                                {difficulty}
                              </span>
                            </div>
                            {description && (
                              <p className="course-description">{description}</p>
                            )}
                            <div className="course-info">
                              <div className="course-info-item">
                                <span className="info-label">소요시간</span>
                                <span className="info-value">{duration}</span>
                              </div>
                              <div className="course-info-item">
                                <span className="info-label">거리</span>
                                <span 
                                  className="info-value" 
                                  style={{ color: getDifficultyColor(props.difficulty) }}
                                >
                                  {distance}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center' }}>등산 코스 정보가 없습니다.</div>
                )}
              </div>
              
              {/* 오른쪽 패널: 상세 정보 + 지도 */}
              <div className="course-detail-panel">
                {selectedCourseIndex !== null && courses[selectedCourseIndex] ? (
                  <>
                    {(() => {
                      const selectedCourse = courses[selectedCourseIndex]
                      const props = selectedCourse.properties || {}
                      const courseName = props.name || '등산 코스'
                      const difficulty = getDifficultyText(props.difficulty)
                      const difficultyClass = getDifficultyClass(props.difficulty)
                      const distance = props.distance ? `${Number(props.distance).toFixed(2)}km` : '-'
                      const duration = props.duration || '-'
                      const description = props.description || ''
                      
                      return (
                        <>
                          <div className="course-detail-header">
                            <div className="course-detail-title-row">
                              <h3>{courseName}</h3>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                {courses.length > 0 && (
                                  <button 
                                    onClick={(e) => {
                                      e.currentTarget.blur() // 포커스 제거
                                      showAllCourses()
                                    }}
                                    className="show-all-courses-btn"
                                  >
                                    전체 코스 보기
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.currentTarget.blur()
                                    toggleLodgingMarkers()
                                  }}
                                  className="show-all-courses-btn"
                                  style={{ backgroundColor: lodgingsVisible ? '#FF7043' : '#ffffff', color: lodgingsVisible ? '#ffffff' : '#333' }}
                                >
                                  주변 숙소
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.currentTarget.blur()
                                    setShowScheduleModal(true)
                                  }}
                                  className="show-all-courses-btn"
                                  style={{ backgroundColor: '#00BF93', color: '#ffffff' }}
                                >
                                  등산일정 추가
                                </button>
                              </div>
                            </div>
                            <div className="course-detail-info">
                              <div className="course-detail-item">
                                <span className="detail-label">난이도</span>
                                <span className={`detail-value difficulty-${difficultyClass}`} style={{ color: getDifficultyColor(props.difficulty) }}>
                                  {difficulty}
                                </span>
                              </div>
                              <div className="course-detail-item">
                                <span className="detail-label">소요시간</span>
                                <span className="detail-value">{duration}</span>
                              </div>
                              <div className="course-detail-item">
                                <span className="detail-label">코스길이</span>
                                <span className="detail-value" style={{ color: getDifficultyColor(props.difficulty) }}>
                                  {distance}
                                </span>
                              </div>
                            </div>
                            {description && (
                              <p className="course-detail-description">{description}</p>
                            )}
                          </div>
                        </>
                      )
                    })()}
                  </>
                ) : (
                  <div className="course-detail-header">
                    <div className="course-detail-title-row">
                      <h3>코스를 선택하세요</h3>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {courses.length > 0 && (
                          <button 
                            onClick={(e) => {
                              e.currentTarget.blur() // 포커스 제거
                              showAllCourses()
                            }}
                            className="show-all-courses-btn"
                          >
                            전체 코스 보기
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.currentTarget.blur()
                            toggleLodgingMarkers()
                          }}
                          className="show-all-courses-btn"
                          style={{ backgroundColor: lodgingsVisible ? '#FF7043' : '#ffffff', color: lodgingsVisible ? '#ffffff' : '#333' }}
                        >
                          주변 숙소
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.currentTarget.blur()
                            setShowScheduleModal(true)
                          }}
                          className="show-all-courses-btn"
                          style={{ backgroundColor: '#00BF93', color: '#ffffff' }}
                        >
                          등산일정 추가
                        </button>
                      </div>
                    </div>
                    <p className="course-detail-description">왼쪽 목록에서 코스를 선택하면 상세 정보와 지도가 표시됩니다.</p>
                  </div>
                )}
                {/* 지도는 항상 렌더링 */}
            <div className="map-container">
              <div id="course-map" ref={mapRef}></div>
            </div>
            
            {/* 주변 숙소 목록 */}
            {lodgingsVisible && (
              <div className="lodging-list-section">
                {lodgings && lodgings.length > 0 ? (
                  <>
                    <div className="lodging-list-header">
                      <h3>총 {lodgings.length}개 숙소</h3>
                    </div>
                    <div className="lodging-list">
                      {lodgings.map((lodging, index) => {
                        const lodgingName = lodging.lodging?.name || lodging.name || lodging.lodgingName || lodging.title || '숙소'
                        const lodgingAddress = lodging.lodging?.address || lodging.address || ''
                        const lodgingDescription = lodging.lodging?.description || lodging.description || lodging.review_snippet || ''
                        const lodgingRating = lodging.lodging?.rating || lodging.rating || null
                        const lodgingUserRatingsTotal = lodging.lodging?.user_ratings_total || lodging.user_ratings_total || 0
                        const lodgingMapsUrl = lodging.lodging?.maps_url || lodging.maps_url || ''
                        const lodgingPhoto = lodging.lodging?.photo_reference || lodging.photo_reference || null
                        const lodgingImage = lodging.image || lodging.thumbnail || null
                        
                        return (
                      <div 
                        key={index} 
                        className="lodging-card"
                        onClick={() => {
                          setSelectedLodging(lodging)
                          setShowLodgingModal(true)
                        }}
                      >
                        <div className="lodging-card-content">
                          <div className="lodging-info">
                            <h4 className="lodging-name">{lodgingName}</h4>
                            {lodgingAddress && (
                              <p className="lodging-address">{lodgingAddress}</p>
                            )}
                            {lodgingMapsUrl && (
                              <a 
                                href={lodgingMapsUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="lodging-directions-link"
                              >
                                길찾기 →
                              </a>
                            )}
                            {lodgingDescription && (
                              <p className="lodging-description">{lodgingDescription}</p>
                            )}
                            {lodgingRating && (
                              <div className="lodging-rating">
                                <span className="lodging-rating-stars">
                                  {'⭐'.repeat(Math.floor(lodgingRating))}
                                  {lodgingRating % 1 >= 0.5 && '⭐'}
                                </span>
                                <span className="lodging-rating-text">
                                  {lodgingRating.toFixed(1)} ({lodgingUserRatingsTotal}개 리뷰)
                                </span>
                              </div>
                            )}
                          </div>
                          {(lodgingImage || lodgingPhoto) && (
                            <div className="lodging-image">
                              {lodgingImage ? (
                                <img 
                                  src={lodgingImage.startsWith('http') ? lodgingImage : `${API_URL}${lodgingImage}`}
                                  alt={lodgingName}
                                  onError={(e) => {
                                    e.target.style.display = 'none'
                                  }}
                                />
                              ) : lodgingPhoto ? (
                                <img 
                                  src={`https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${lodgingPhoto}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}`}
                                  alt={lodgingName}
                                  onError={(e) => {
                                    e.target.style.display = 'none'
                                  }}
                                />
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                    </div>
                  </>
                ) : (
                  <div className="lodging-list-header">
                    <h3>등록된 주변 숙소 정보가 없습니다.</h3>
                  </div>
                )}
              </div>
            )}
              </div>
            </div>
          </section>
        </div>
      </main>
      
      {/* 난이도 안내 모달 */}
      {showDifficultyModal && (
        <div className="modal-overlay" onClick={() => setShowDifficultyModal(false)}>
          <div className="difficulty-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <button className="modal-close" onClick={() => setShowDifficultyModal(false)}>×</button>
              <h2>등산 코스 난이도 기준</h2>
            </div>
            
            <div style={{ padding: '20px' }}>
              {/* 거리 기반 점수 */}
              <div style={{ marginBottom: '30px' }}>
                <h3 style={{ marginBottom: '15px', color: '#333', fontSize: '18px', fontWeight: 'bold' }}>거리 기반 점수</h3>
                <div style={{ 
                  background: '#f8f9fa', 
                  padding: '15px', 
                  borderRadius: '8px',
                  border: '1px solid #e0e0e0'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e0e0e0' }}>
                    <span>1km 미만</span>
                    <span style={{ fontWeight: 'bold', color: '#4CAF50' }}>0점</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e0e0e0' }}>
                    <span>2km 미만</span>
                    <span style={{ fontWeight: 'bold', color: '#4CAF50' }}>0점</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e0e0e0' }}>
                    <span>5km 미만</span>
                    <span style={{ fontWeight: 'bold', color: '#FF9800' }}>+1점</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e0e0e0' }}>
                    <span>10km 미만</span>
                    <span style={{ fontWeight: 'bold', color: '#FF9800' }}>+2점</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e0e0e0' }}>
                    <span>15km 미만</span>
                    <span style={{ fontWeight: 'bold', color: '#F44336' }}>+3점</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span>15km 이상</span>
                    <span style={{ fontWeight: 'bold', color: '#F44336' }}>+4점</span>
                  </div>
                </div>
              </div>

              {/* 시간 기반 점수 */}
              <div style={{ marginBottom: '30px' }}>
                <h3 style={{ marginBottom: '15px', color: '#333', fontSize: '18px', fontWeight: 'bold' }}>시간 기반 점수</h3>
                <div style={{ 
                  background: '#f8f9fa', 
                  padding: '15px', 
                  borderRadius: '8px',
                  border: '1px solid #e0e0e0'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e0e0e0' }}>
                    <span>30분 미만</span>
                    <span style={{ fontWeight: 'bold', color: '#4CAF50' }}>0점</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e0e0e0' }}>
                    <span>60분 미만</span>
                    <span style={{ fontWeight: 'bold', color: '#4CAF50' }}>0점</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e0e0e0' }}>
                    <span>120분 미만</span>
                    <span style={{ fontWeight: 'bold', color: '#FF9800' }}>+1점</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e0e0e0' }}>
                    <span>180분 미만</span>
                    <span style={{ fontWeight: 'bold', color: '#FF9800' }}>+2점</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e0e0e0' }}>
                    <span>240분 미만</span>
                    <span style={{ fontWeight: 'bold', color: '#F44336' }}>+3점</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e0e0e0' }}>
                    <span>360분 미만</span>
                    <span style={{ fontWeight: 'bold', color: '#F44336' }}>+4점</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span>360분 이상</span>
                    <span style={{ fontWeight: 'bold', color: '#F44336' }}>+5점</span>
                  </div>
                </div>
              </div>

              {/* 노면 재질 기반 점수 */}
              <div style={{ marginBottom: '30px' }}>
                <h3 style={{ marginBottom: '15px', color: '#333', fontSize: '18px', fontWeight: 'bold' }}>노면 재질 기반 점수</h3>
                <div style={{ 
                  background: '#f8f9fa', 
                  padding: '15px', 
                  borderRadius: '8px',
                  border: '1px solid #e0e0e0'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e0e0e0' }}>
                    <span>어려운 노면 (암석, 바위, 암벽, 절벽)</span>
                    <span style={{ fontWeight: 'bold', color: '#F44336' }}>+3점</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e0e0e0' }}>
                    <span>중간 노면 (토사, 자갈, 돌)</span>
                    <span style={{ fontWeight: 'bold', color: '#FF9800' }}>+1점</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span>쉬운 노면 (포장, 콘크리트, 데크)</span>
                    <span style={{ fontWeight: 'bold', color: '#4CAF50' }}>-1점</span>
                  </div>
                </div>
              </div>

              {/* 최종 난이도 결정 */}
              <div style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: '20px',
                borderRadius: '8px',
                color: 'white',
                marginBottom: '20px'
              }}>
                <h3 style={{ marginBottom: '15px', fontSize: '18px', fontWeight: 'bold' }}>최종 난이도 결정</h3>
                <div style={{ background: 'rgba(255,255,255,0.2)', padding: '15px', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.3)' }}>
                    <span style={{ fontSize: '16px' }}>점수 2점 이하</span>
                    <span style={{ fontWeight: 'bold', fontSize: '16px' }}>쉬움</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.3)' }}>
                    <span style={{ fontSize: '16px' }}>점수 3~5점</span>
                    <span style={{ fontWeight: 'bold', fontSize: '16px' }}>보통</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
                    <span style={{ fontSize: '16px' }}>점수 6점 이상</span>
                    <span style={{ fontWeight: 'bold', fontSize: '16px' }}>어려움</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ padding: '0 20px 20px', textAlign: 'center' }}>
              <button 
                className="modal-close-btn" 
                onClick={() => setShowDifficultyModal(false)}
                style={{
                  padding: '12px 40px',
                  backgroundColor: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#5568d3'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#667eea'}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 숙소 상세 모달 */}
      {showLodgingModal && selectedLodging && (
        <div className="modal-overlay" onClick={() => setShowLodgingModal(false)}>
          <div className="lodging-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-close" onClick={() => setShowLodgingModal(false)}>×</button>
              <h2>상세보기</h2>
            </div>
            {(() => {
              const lodging = selectedLodging
              const lodgingName = lodging.lodging?.name || lodging.name || lodging.lodgingName || lodging.title || '숙소'
              const lodgingAddress = lodging.lodging?.address || lodging.address || ''
              const lodgingDescription = lodging.lodging?.description || lodging.description || lodging.review_snippet || ''
              const lodgingRating = lodging.lodging?.rating || lodging.rating || null
              const lodgingUserRatingsTotal = lodging.lodging?.user_ratings_total || lodging.user_ratings_total || 0
              const lodgingMapsUrl = lodging.lodging?.maps_url || lodging.maps_url || ''
              const lodgingPhoto = lodging.lodging?.photo_reference || lodging.photo_reference || null
              const lodgingImage = lodging.image || lodging.thumbnail || null

              return (
                <div className="lodging-modal-content">
                  <div className="lodging-modal-image-wrapper">
                    {(lodgingImage || lodgingPhoto) && (
                      <>
                        {lodgingImage ? (
                          <img 
                            src={lodgingImage.startsWith('http') ? lodgingImage : `${API_URL}${lodgingImage}`}
                            alt={lodgingName}
                            className="lodging-modal-image"
                            onError={(e) => {
                              e.target.style.display = 'none'
                            }}
                          />
                        ) : lodgingPhoto ? (
                          <img 
                            src={`https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photoreference=${lodgingPhoto}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}`}
                            alt={lodgingName}
                            className="lodging-modal-image"
                            onError={(e) => {
                              e.target.style.display = 'none'
                            }}
                          />
                        ) : null}
                      </>
                    )}
                  </div>
                  <div className="lodging-modal-info">
                    <h3 className="lodging-modal-name">{lodgingName}</h3>
                    {lodgingAddress && (
                      <p className="lodging-modal-address">{lodgingAddress}</p>
                    )}
                    {lodgingMapsUrl && (
                      <a 
                        href={lodgingMapsUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="lodging-directions-link"
                      >
                        길찾기 →
                      </a>
                    )}
                    {lodgingDescription && (
                      <p className="lodging-modal-description">{lodgingDescription}</p>
                    )}
                    {lodgingRating && (
                      <div className="lodging-rating">
                        <span className="lodging-rating-stars">
                          {'⭐'.repeat(Math.floor(lodgingRating))}
                          {lodgingRating % 1 >= 0.5 && '⭐'}
                        </span>
                        <span className="lodging-rating-text">
                          {lodgingRating.toFixed(1)} ({lodgingUserRatingsTotal}개 리뷰)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* 등산일정 추가 모달 */}
      {showScheduleModal && (
        <div className="modal-overlay" onClick={() => setShowScheduleModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>등산일정 추가</h2>
              <button className="modal-close-btn" onClick={() => setShowScheduleModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>산 이름</label>
                <input type="text" value={name} disabled className="form-input" />
              </div>
              <div className="form-group">
                <label>등산일자 <span className="required">*</span></label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="form-input"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="form-group">
                <label>등산시간</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>등산 코스</label>
                <select
                  value={selectedScheduleCourseIndex !== null ? selectedScheduleCourseIndex : ''}
                  onChange={(e) => setSelectedScheduleCourseIndex(e.target.value === '' ? null : parseInt(e.target.value))}
                  className="form-input"
                >
                  <option value="">코스를 선택하세요</option>
                  {courses.map((course, index) => {
                    const courseName = course.properties?.name || course.properties?.PMNTN_NM || course.properties?.PMNTN_MAIN || `코스 ${index + 1}`
                    return (
                      <option key={index} value={index}>
                        {courseName}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="form-group">
                <label>메모</label>
                <textarea
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  className="form-textarea"
                  rows="3"
                  placeholder="등산 일정에 대한 메모를 입력하세요"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="modal-btn cancel"
                onClick={() => setShowScheduleModal(false)}
                disabled={scheduleLoading}
              >
                취소
              </button>
              <button
                className="modal-btn submit"
                onClick={handleAddSchedule}
                disabled={scheduleLoading}
              >
                {scheduleLoading ? '추가 중...' : '추가하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MountainDetail

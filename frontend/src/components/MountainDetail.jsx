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
  const [sortBy, setSortBy] = useState('difficulty-asc') // difficulty-asc/desc, time-asc/desc, distance-asc/desc
  const [selectedCourseIndex, setSelectedCourseIndex] = useState(null)
  const courseLayerRef = useRef(null)
  const spotsRef = useRef([]) // SPOT 데이터 저장
  const [showDifficultyModal, setShowDifficultyModal] = useState(false)
  const [selectedDifficultyLevel, setSelectedDifficultyLevel] = useState('normal') // 기본값: 보통

  useEffect(() => {
    let isMounted = true

    // 지도 초기화
    const initMap = async () => {
      if (!mapRef.current) {
        return
      }

      // 기존 지도가 있으면 제거
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove()
        } catch (error) {
          // 이미 제거된 경우 무시
        }
        mapInstanceRef.current = null
      }

      // 지도 컨테이너 초기화
      if (mapRef.current._leaflet_id) {
        mapRef.current._leaflet_id = null
        mapRef.current.innerHTML = ''
      }

      try {
        const L = await import('leaflet')
        
        if (!isMounted || !mapRef.current) return

        const map = L.default.map(mapRef.current, {
          center: center,
          zoom: zoom
        })
        
        L.default.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          minZoom: 3
        }).addTo(map)

        mapInstanceRef.current = map

        // GeoJSON 로드 (코스 경로 + 지점 마커)
        if (isMounted) {
          loadCourseData(code, map)
          loadSpotData(code, map) // SPOT 데이터를 먼저 로드하여 spotsRef에 저장
        }
      } catch (error) {
        console.error('Failed to initialize map:', error)
      }
    }

    initMap()

    return () => {
      isMounted = false
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove()
        } catch (error) {
          // 이미 제거된 경우 무시
        }
        mapInstanceRef.current = null
      }
      // 지도 컨테이너 초기화
      if (mapRef.current) {
        mapRef.current._leaflet_id = null
        mapRef.current.innerHTML = ''
      }
    }
  }, [code, center, zoom])

  // 특정 코스를 지도에 표시하는 함수
  const displayCourseOnMap = async (course, index) => {
    if (!mapInstanceRef.current) {
      console.warn('지도가 초기화되지 않았습니다. 잠시 후 다시 시도합니다.')
      // 지도가 아직 초기화되지 않았다면 잠시 대기 후 재시도
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
      console.log('코스 난이도 확인:', {
        index,
        courses배열난이도: actualCourse?.properties?.difficulty,
        전달받은코스난이도: course?.properties?.difficulty,
        최종난이도: courseDifficulty
      })
      
      const L = await import('leaflet')
      
      // 기존 레이어 제거
      if (courseLayerRef.current) {
        mapInstanceRef.current.removeLayer(courseLayerRef.current)
        courseLayerRef.current = null
      }

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
        // 기존 마커 제거 (선택한 코스의 마커만 표시)
        if (window.courseMarkers) {
          window.courseMarkers.forEach(marker => {
            if (marker && mapInstanceRef.current) {
              try {
                mapInstanceRef.current.removeLayer(marker)
              } catch (e) {
                // 이미 제거된 경우 무시
              }
            }
          })
        }
        window.courseMarkers = []
        
        // 기존 빨간 SPOT 마커도 제거 (선택한 코스의 편의시설만 표시)
        if (window.spotMarkers) {
          window.spotMarkers.forEach(marker => {
            if (marker && mapInstanceRef.current) {
              try {
                mapInstanceRef.current.removeLayer(marker)
              } catch (e) {
                // 이미 제거된 경우 무시
              }
            }
          })
        }
        window.spotMarkers = []
        
        // GeoJSON 레이어 추가 (선택된 코스는 해당 난이도 색상으로 표시)
        const geoJsonLayer = L.default.geoJSON(geoJsonData, {
          style: (feature) => {
            const props = feature.properties || {}
            const rawDifficulty = props.difficulty || '보통'
            const difficulty = getDifficultyText(rawDifficulty)
            const difficultyColor = getDifficultyColor(rawDifficulty)
            
            // 디버깅 로그
            console.log('코스 지도 표시 - 난이도 정보:', {
              코스명: props.name,
              원본난이도: rawDifficulty,
              변환된난이도: difficulty,
              색상: difficultyColor,
              전체props: props
            })
            console.log('코스 지도 표시 - 난이도 상세:', `원본="${rawDifficulty}", 변환="${difficulty}", 색상="${difficultyColor}"`)
            
            return {
              color: difficultyColor,
              weight: 5,
              opacity: 0.9
            }
          },
          onEachFeature: (feature, layer) => {
            // 각 코스에 팝업 추가
            const props = feature.properties || {}
            const courseName = props.name || '등산 코스'
            const difficulty = props.difficulty || '보통'
            const distance = props.distance ? `${props.distance}km` : '-'
            const duration = props.duration || '-'
            
            layer.bindPopup(`
              <h3>${courseName}</h3>
              <p><strong>난이도:</strong> ${difficulty}</p>
              <p><strong>거리:</strong> ${distance}</p>
              <p><strong>소요시간:</strong> ${duration}</p>
            `)
            
            // 경로 좌표 추출하여 편의 시설 기준으로 마커 추가
            if (feature.geometry && feature.geometry.coordinates) {
              const coords = feature.geometry.coordinates
              let points = []
              
              if (feature.geometry.type === 'LineString') {
                points = coords
              } else if (feature.geometry.type === 'MultiLineString') {
                points = coords.flat()
              }
              
              if (points.length > 0) {
                const startPoint = points[0]
                const endPoint = points[points.length - 1]
                
                // 출발지 - 경로의 첫 번째 좌표
                const startIcon = L.default.divIcon({
                  className: 'course-marker start',
                  html: `
                    <div style="background-color: #4CAF50; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4); margin: 0 auto; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 11px;">출발</div>
                  `,
                  iconSize: [32, 32],
                  iconAnchor: [16, 16],
                  popupAnchor: [0, -16]
                })
                const startMarker = L.default.marker([startPoint[1], startPoint[0]], { icon: startIcon })
                startMarker.addTo(mapInstanceRef.current)
                startMarker.bindPopup('출발지')
                window.courseMarkers.push(startMarker)
                
                // 코스 경로와 가까운 SPOT 찾기 (편의 시설 기준)
                const nearbySpots = []
                const maxDistance = 200 // 최대 200m 이내의 SPOT만 선택
                
                // 경로를 따라 일정 간격으로 샘플링 (100m 간격)
                const samplePoints = []
                let accumulatedDistance = 0
                for (let i = 0; i < points.length - 1; i++) {
                  const p1 = points[i]
                  const p2 = points[i + 1]
                  const dist = calculateDistance(p1[1], p1[0], p2[1], p2[0])
                  accumulatedDistance += dist
                  
                  if (accumulatedDistance >= 100 || i === 0) {
                    samplePoints.push({ lat: p1[1], lon: p1[0], index: i })
                    accumulatedDistance = 0
                  }
                }
                // 마지막 점도 추가
                samplePoints.push({ lat: endPoint[1], lon: endPoint[0], index: points.length - 1 })
                
                // 각 샘플링 포인트에서 가장 가까운 SPOT 찾기
                const usedSpots = new Set()
                let markerNumber = 2
                
                for (const samplePoint of samplePoints) {
                  let closestSpot = null
                  let minDistance = Infinity
                  
                  for (const spot of spotsRef.current) {
                    if (usedSpots.has(spot)) continue // 이미 사용된 SPOT은 제외
                    
                    const dist = calculateDistance(
                      samplePoint.lat, samplePoint.lon,
                      spot.lat, spot.lon
                    )
                    
                    if (dist < maxDistance && dist < minDistance) {
                      minDistance = dist
                      closestSpot = spot
                    }
                  }
                  
                  if (closestSpot && !usedSpots.has(closestSpot)) {
                    nearbySpots.push({ ...closestSpot, number: markerNumber })
                    usedSpots.add(closestSpot)
                    markerNumber++
                  }
                }
                
                // 중간 지점 마커 추가 (편의 시설)
                for (const spot of nearbySpots) {
                  const spotIcon = L.default.divIcon({
                    className: 'course-marker intermediate',
                    html: `<div style="background-color: #2196F3; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>`,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8],
                    popupAnchor: [0, -8]
                  })
                  const spotMarker = L.default.marker([spot.lat, spot.lon], { icon: spotIcon })
                  spotMarker.addTo(mapInstanceRef.current)
                  spotMarker.bindPopup(`<strong>${spot.name}</strong><br/>${spot.type || ''}`)
                  window.courseMarkers.push(spotMarker)
                }
                
                // 도착지 - 경로의 마지막 좌표
                const endIcon = L.default.divIcon({
                  className: 'course-marker end',
                  html: `
                    <div style="background-color: #F44336; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4); margin: 0 auto; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 11px;">도착</div>
                  `,
                  iconSize: [32, 32],
                  iconAnchor: [16, 16],
                  popupAnchor: [0, -16]
                })
                const endMarker = L.default.marker([endPoint[1], endPoint[0]], { icon: endIcon })
                endMarker.addTo(mapInstanceRef.current)
                endMarker.bindPopup('도착지')
                window.courseMarkers.push(endMarker)
              }
            }
          }
        }).addTo(mapInstanceRef.current)
        
        courseLayerRef.current = geoJsonLayer
        
        // 지도 범위 조정
        if (geoJsonLayer.getBounds().isValid()) {
          mapInstanceRef.current.fitBounds(geoJsonLayer.getBounds(), { padding: [50, 50] })
        }
      }
    } catch (error) {
      console.error('Failed to display course on map:', error)
    }
  }

  const loadCourseData = async (mountainCode, map) => {
    if (!map || !mapInstanceRef.current) {
      console.warn('지도가 초기화되지 않아 코스 데이터를 로드할 수 없습니다.')
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
      
      // 코스 데이터 저장
      if (data.courses && data.courses.length > 0) {
        setCourses(data.courses)
        setSelectedCourseIndex(null) // 초기화
        console.log('코스 데이터 로드 완료:', data.courses.length, '개')
        
        // 기존 레이어 제거
        if (courseLayerRef.current) {
          mapInstanceRef.current.removeLayer(courseLayerRef.current)
          courseLayerRef.current = null
        }
        
        // 초기에는 모든 코스를 지도에 표시 (마커는 표시하지 않음)
        if (mapInstanceRef.current) {
          const L = await import('leaflet')
          
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
            // GeoJSON 레이어 추가 (모든 코스, 난이도별 색상으로 표시)
            const geoJsonLayer = L.default.geoJSON(geoJsonData, {
              style: (feature) => {
                const props = feature.properties || {}
                const rawDifficulty = props.difficulty || '보통'
                const difficulty = getDifficultyText(rawDifficulty)
                const difficultyColor = getDifficultyColor(rawDifficulty)
                
                // 디버깅 로그 (첫 번째 코스만)
                if (geoJsonData.features.indexOf(feature) === 0) {
                  console.log('초기 코스 로드 - 난이도 정보:', {
                    코스명: props.name,
                    원본난이도: rawDifficulty,
                    변환된난이도: difficulty,
                    색상: difficultyColor,
                    전체props: props
                  })
                  console.log('초기 코스 로드 - 난이도 상세:', `원본="${rawDifficulty}", 변환="${difficulty}", 색상="${difficultyColor}"`)
                }
                
                return {
                  color: difficultyColor,
                  weight: 4,
                  opacity: 0.8
                }
              },
              onEachFeature: (feature, layer) => {
                // 각 코스에 팝업 추가
                const props = feature.properties || {}
                const courseName = props.name || '등산 코스'
                const difficulty = getDifficultyText(props.difficulty)
                const distance = props.distance ? `${props.distance}km` : '-'
                const duration = props.duration || '-'
                const difficultyColor = getDifficultyColor(props.difficulty)
                
                layer.bindPopup(`
                  <h3>${courseName}</h3>
                  <p><strong>난이도:</strong> <span style="color: ${difficultyColor};">${difficulty}</span></p>
                  <p><strong>거리:</strong> <span style="color: ${difficultyColor};">${distance}</span></p>
                  <p><strong>소요시간:</strong> ${duration}</p>
                  <p style="margin-top: 8px; font-size: 0.9rem; color: #666;">왼쪽 목록에서 코스를 선택하면 상세 정보와 편의시설이 표시됩니다.</p>
                `)
                
                // 코스 경로 클릭 시 해당 코스 선택
                layer.on('click', () => {
                  const courseIndex = data.courses.findIndex(c => {
                    const cProps = c.properties || {}
                    return cProps.name === courseName
                  })
                  if (courseIndex !== -1) {
                    setSelectedCourseIndex(courseIndex)
                    displayCourseOnMap(data.courses[courseIndex], courseIndex)
                  }
                })
              }
            }).addTo(mapInstanceRef.current)
            
            courseLayerRef.current = geoJsonLayer
            
            // 지도 범위 조정
            if (geoJsonLayer.getBounds().isValid()) {
              mapInstanceRef.current.fitBounds(geoJsonLayer.getBounds(), { padding: [50, 50] })
            }
          }
        }
      } else {
        setCourses([])
        setSelectedCourseIndex(null)
      }
    } catch (error) {
      console.error('Failed to load course data:', error)
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
        const L = await import('leaflet')
        
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
            
            // 빨간 마커는 표시하지 않음 (선택한 코스의 경로와 가까운 편의시설만 번호 마커로 표시)
          }
        }
      }
    } catch (error) {
      console.error('Failed to load spot data:', error)
    }
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
                        const distance = props.distance ? `${props.distance}km` : '-'
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
                      const distance = props.distance ? `${props.distance}km` : '-'
                      const duration = props.duration || '-'
                      const description = props.description || ''
                      
                      return (
                        <>
                          <div className="course-detail-header">
                            <h3>{courseName}</h3>
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
                    <h3>코스를 선택하세요</h3>
                    <p className="course-detail-description">왼쪽 목록에서 코스를 선택하면 상세 정보와 지도가 표시됩니다.</p>
                  </div>
                )}
                {/* 지도는 항상 렌더링 */}
                <div className="map-container">
                  <div id="course-map" ref={mapRef}></div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
      
      {/* 난이도 안내 모달 */}
      {showDifficultyModal && (
        <div className="modal-overlay" onClick={() => setShowDifficultyModal(false)}>
          <div className="difficulty-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-close" onClick={() => setShowDifficultyModal(false)}>×</button>
              <h2>코스 난이도 안내</h2>
            </div>
            <p className="modal-subtitle">국립공원 관리공단에서 분류한 기준을 참고하였습니다.</p>
            
            <div className="difficulty-levels">
              <div 
                className={`difficulty-level-item ${selectedDifficultyLevel === 'very-easy' ? 'active' : ''}`}
                onClick={() => setSelectedDifficultyLevel('very-easy')}
              >
                <div className="difficulty-dot" style={{ backgroundColor: '#FFD700' }}></div>
                <span>매우쉬움</span>
              </div>
              <div 
                className={`difficulty-level-item ${selectedDifficultyLevel === 'easy' ? 'active' : ''}`}
                onClick={() => setSelectedDifficultyLevel('easy')}
              >
                <div className="difficulty-dot" style={{ backgroundColor: '#4CAF50' }}></div>
                <span>쉬움</span>
              </div>
              <div 
                className={`difficulty-level-item ${selectedDifficultyLevel === 'normal' ? 'active' : ''}`}
                onClick={() => setSelectedDifficultyLevel('normal')}
              >
                <div className="difficulty-dot" style={{ backgroundColor: '#FF9800' }}></div>
                <span>보통</span>
              </div>
              <div 
                className={`difficulty-level-item ${selectedDifficultyLevel === 'hard' ? 'active' : ''}`}
                onClick={() => setSelectedDifficultyLevel('hard')}
              >
                <div className="difficulty-dot" style={{ backgroundColor: '#F44336' }}></div>
                <span>어려움</span>
              </div>
              <div 
                className={`difficulty-level-item ${selectedDifficultyLevel === 'very-hard' ? 'active' : ''}`}
                onClick={() => setSelectedDifficultyLevel('very-hard')}
              >
                <div className="difficulty-dot" style={{ backgroundColor: '#616161' }}></div>
                <span>매우어려움</span>
              </div>
            </div>
            
            {(() => {
              const difficultyInfo = {
                'very-easy': {
                  target: '장애인, 임산부, 휠체어, 유모차 등',
                  slope: '아주 평탄',
                  surface: '단단하고 매끈한 포장',
                  width: '2m 이상',
                  stairs: '없음',
                  items: '-'
                },
                'easy': {
                  target: '어린이, 노령자 등',
                  slope: '평탄',
                  surface: '비교적 매끈한 노면',
                  width: '1.5m 이상',
                  stairs: '약간의 계단',
                  items: '운동화'
                },
                'normal': {
                  target: '등산 경험자',
                  slope: '약간의 경사',
                  surface: '비교적 거친 노면',
                  width: '1m 이상',
                  stairs: '-',
                  items: '경등산화, 배낭, 물 등 등산장비'
                },
                'hard': {
                  target: '등산 숙련자',
                  slope: '심한 경사',
                  surface: '거친 노면',
                  width: '-',
                  stairs: '-',
                  items: '등산화, 배낭, 물, 스틱 등 등산장비'
                },
                'very-hard': {
                  target: '등산 전문가',
                  slope: '매우 심한 경사',
                  surface: '매우 거친 노면',
                  width: '-',
                  stairs: '-',
                  items: '전문 등산장비 필수'
                }
              }
              
              const info = difficultyInfo[selectedDifficultyLevel] || difficultyInfo['normal']
              
              return (
                <div className="difficulty-details">
                  <div className="detail-item">
                    <span className="detail-label">이용대상</span>
                    <span className="detail-value">{info.target}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">경사도</span>
                    <span className="detail-value">{info.slope}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">노면상태</span>
                    <span className="detail-value">{info.surface}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">노면폭</span>
                    <span className="detail-value">{info.width}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">계단</span>
                    <span className="detail-value">{info.stairs}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">필요물품</span>
                    <span className="detail-value">{info.items}</span>
                  </div>
                </div>
              )
            })()}
            
            <button className="modal-close-btn" onClick={() => setShowDifficultyModal(false)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default MountainDetail

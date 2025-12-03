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
          loadSpotData(code, map)
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

  const loadCourseData = async (mountainCode, map) => {
    if (!map || !mapInstanceRef.current) return

    try {
      // 백엔드 API에서 데이터 가져오기
      const apiUrl = API_URL
      const response = await fetch(`${apiUrl}/api/mountains/${mountainCode}/courses`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.courses && data.courses.length > 0 && mapInstanceRef.current) {
        const L = await import('leaflet')
        
        // ArcGIS 형식인지 확인 (geometry.paths가 있으면 ArcGIS 형식)
        const isArcGISFormat = data.courses.some(course => 
          course.geometry && course.geometry.paths
        )
        
        let geoJsonData
        if (isArcGISFormat) {
          // ArcGIS 형식을 GeoJSON으로 변환
          geoJsonData = convertArcGISToGeoJSON({
            features: data.courses
          })
        } else {
          // 이미 GeoJSON 형식
          geoJsonData = {
            type: 'FeatureCollection',
            features: Array.isArray(data.courses) ? data.courses : [data.courses]
          }
        }
        
        if (geoJsonData.features && geoJsonData.features.length > 0 && mapInstanceRef.current) {
          // GeoJSON 레이어 추가
          const geoJsonLayer = L.default.geoJSON(geoJsonData, {
            style: {
              color: '#2d8659',
              weight: 3,
              opacity: 0.8
            }
          }).addTo(mapInstanceRef.current)
          
          if (geoJsonLayer.getBounds().isValid()) {
            mapInstanceRef.current.fitBounds(geoJsonLayer.getBounds())
          }
        }
      }
    } catch (error) {
      console.error('Failed to load course data:', error)
      if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED')) {
        console.warn('백엔드 서버에 연결할 수 없습니다. 백엔드 서버가 실행 중인지 확인하세요.')
      }
    }
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
      
      if (data.spots && data.spots.length > 0 && mapInstanceRef.current) {
        const L = await import('leaflet')
        
        // ArcGIS 형식인지 확인
        const isArcGISFormat = data.spots.some(spot => 
          spot.geometry && (spot.geometry.x !== undefined || spot.geometry.paths)
        )
        
        data.spots.forEach((spot) => {
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
            // 빨간 마커 생성
            const redIcon = L.default.divIcon({
              className: 'custom-marker',
              html: '<div style="background-color: #ff4444; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); cursor: pointer;"></div>',
              iconSize: [14, 14],
              iconAnchor: [7, 7]
            })
            
            const marker = L.default.marker([lat, lon], { icon: redIcon })
            
            // 팝업 정보 구성 (실제 API 필드명 사용)
            const attrs = spot.attributes || spot.properties || {}
            const spotName = attrs.DETAIL_SPO || attrs.MANAGE_SP2 || '등산 지점'
            const manageType = attrs.MANAGE_SP2 || ''
            const etcMatter = attrs.ETC_MATTER || ''
            const mountainName = attrs.MNTN_NM || ''
            
            let popupContent = `<div style="min-width: 200px;">
              <h3 style="margin: 0 0 8px 0; font-size: 1.1rem; color: #2d8659; font-weight: 600;">${spotName}</h3>`
            
            if (mountainName) {
              popupContent += `<p style="margin: 4px 0; color: #666; font-size: 0.85rem;">산명: ${mountainName}</p>`
            }
            
            if (manageType && manageType.trim() && manageType !== '기타') {
              popupContent += `<p style="margin: 4px 0; color: #666; font-size: 0.85rem;">구분: ${manageType}</p>`
            }
            
            if (etcMatter && etcMatter.trim() && etcMatter !== ' ') {
              popupContent += `<p style="margin: 4px 0; color: #666; font-size: 0.85rem;">${etcMatter}</p>`
            }
            
            popupContent += `</div>`
            
            marker.bindPopup(popupContent)
            marker.addTo(mapInstanceRef.current)
          }
        })
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

          {/* 지도 및 코스 */}
          <section className="section">
            <h2>등산 코스</h2>
            <div className="map-container">
              <div id="course-map" ref={mapRef}></div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

export default MountainDetail

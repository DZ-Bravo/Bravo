import { useEffect, useRef } from 'react'
import Header from './Header'
import { convertArcGISToGeoJSON, transformArcGISToWGS84 } from '../utils/coordinateTransform'
import { API_URL } from '../utils/api'
import './MountainDetail.css'

function MountainDetail({ name, code, height, location, description, center, zoom, origin }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)

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
              <div className="weather-source">데이터출처: Openweather • 실시간</div>
            </div>
            <div className="weather-forecast">
              <div className="weather-day">
                <div className="weather-day-name">11.29 토</div>
                <div className="weather-icon">☀️</div>
                <div className="weather-temp">
                  <span className="temp-min">-1°</span>
                  <span className="temp-separator">/</span>
                  <span className="temp-max">8°</span>
                </div>
                <div className="weather-wind">풍속 2.8m/s</div>
              </div>
              <div className="weather-day">
                <div className="weather-day-name">11.30 일</div>
                <div className="weather-icon">☁️</div>
                <div className="weather-temp">
                  <span className="temp-min">4°</span>
                  <span className="temp-separator">/</span>
                  <span className="temp-max">15°</span>
                </div>
                <div className="weather-wind">풍속 3.6m/s</div>
              </div>
              <div className="weather-day">
                <div className="weather-day-name">12.1 월</div>
                <div className="weather-icon">☀️</div>
                <div className="weather-temp">
                  <span className="temp-min">2°</span>
                  <span className="temp-separator">/</span>
                  <span className="temp-max">10°</span>
                </div>
                <div className="weather-wind">풍속 3.6m/s</div>
              </div>
              <div className="weather-day">
                <div className="weather-day-name">12.2 화</div>
                <div className="weather-icon">☁️</div>
                <div className="weather-temp">
                  <span className="temp-min">-4°</span>
                  <span className="temp-separator">/</span>
                  <span className="temp-max">4°</span>
                </div>
                <div className="weather-wind">풍속 5.0m/s</div>
              </div>
              <div className="weather-day">
                <div className="weather-day-name">12.3 수</div>
                <div className="weather-icon">☀️</div>
                <div className="weather-temp">
                  <span className="temp-min">-8°</span>
                  <span className="temp-separator">/</span>
                  <span className="temp-max">2°</span>
                </div>
                <div className="weather-wind">풍속 7.2m/s</div>
              </div>
            </div>
            <div className="sun-info">
              <div className="sun-item">
                <span>🌅</span>
                <span>일출 07:17</span>
              </div>
              <div className="sun-item">
                <span>🌇</span>
                <span>일몰 17:10</span>
              </div>
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

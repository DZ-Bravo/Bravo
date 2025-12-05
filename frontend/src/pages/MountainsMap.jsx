import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import { getMountainInfo } from '../utils/mountainRoutes'
import './MountainsMap.css'

function MountainsMap() {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])
  const navigate = useNavigate()
  const [kakaoLoaded, setKakaoLoaded] = useState(false)
  const [viewMode, setViewMode] = useState('province') // 'province' 또는 'detail'
  const [selectedProvince, setSelectedProvince] = useState(null)
  const [allMountains, setAllMountains] = useState([])

  useEffect(() => {
    let isMounted = true

    // 카카오 맵 SDK 로드
    const loadKakaoMap = () => {
      if (window.kakao && window.kakao.maps) {
        setKakaoLoaded(true)
        return
      }

      // 카카오 맵 API 키 가져오기
      const apiKey = import.meta.env.VITE_KAKAO_MAP_API_KEY || ''
      
      if (!apiKey) {
        console.error('카카오 맵 API 키가 설정되지 않았습니다. VITE_KAKAO_MAP_API_KEY 환경 변수를 설정해주세요.')
        return
      }

      // 카카오 맵 SDK가 이미 로드되어 있는지 확인
      if (window.kakao && window.kakao.maps) {
        window.kakao.maps.load(() => {
          if (isMounted) {
            setKakaoLoaded(true)
          }
        })
      } else {
        // SDK 스크립트 동적 로드
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

  useEffect(() => {
    if (!kakaoLoaded || !mapRef.current) return

    let isMounted = true

    // 지도 초기화
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
        // 한국 중심으로 지도 초기화
        const container = mapRef.current
        const options = {
          center: new window.kakao.maps.LatLng(36.5, 127.5), // 한국 중심 좌표
          level: 7 // 지도의 확대 레벨
        }

        const map = new window.kakao.maps.Map(container, options)
        mapInstanceRef.current = map

        // 산 목록 가져오기 및 마커 추가
        if (isMounted) {
          loadMountains(map, 'province')
        }
        
        // 지도 줌 레벨 변경 감지
        window.kakao.maps.event.addListener(map, 'zoom_changed', () => {
          const level = map.getLevel()
          // 줌 레벨이 5 이상이면 상세 보기로 전환
          if (level <= 5 && viewMode === 'province') {
            // 상세 보기는 마커 클릭으로만 전환
          }
        })
      } catch (error) {
        console.error('Failed to initialize map:', error)
      }
    }

    initMap()

    return () => {
      isMounted = false
      // 마커 제거
      markersRef.current.forEach(marker => {
        marker.setMap(null)
      })
      markersRef.current = []
      if (mapRef.current) {
        mapRef.current.innerHTML = ''
      }
    }
  }, [kakaoLoaded])

  // 위치 문자열에서 시/도 추출
  const parseProvince = (locationStr) => {
    if (!locationStr || typeof locationStr !== 'string') {
      return null
    }
    const parts = locationStr.replace(/\s+/g, ' ').trim().split(' ')
    if (parts.length < 1) {
      return null
    }
    // 첫 번째 단어는 도/특별시/광역시
    return parts[0] || null
  }

  const loadMountains = async (map, mode = 'province', provinceName = null) => {
    if (!map || !mapInstanceRef.current) return

    try {
      const apiUrl = API_URL
      const response = await fetch(`${apiUrl}/api/mountains`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      
      console.log('산 데이터 받음:', {
        total: data.mountains?.length || 0,
        sample: data.mountains?.[0]
      })
      
      // 모든 산 데이터 저장
      setAllMountains(data.mountains || [])
      
      if (data.mountains && data.mountains.length > 0 && mapInstanceRef.current && window.kakao && window.kakao.maps) {
        // 기존 마커 제거
        markersRef.current.forEach(marker => {
          marker.setMap(null)
        })
        markersRef.current = []
        
        const bounds = new window.kakao.maps.LatLngBounds()
        let displayedCount = 0
        let skippedCount = 0
        
        if (mode === 'province') {
          // 시/도별로 산 그룹화
          const provinceClusters = new Map()
          
          // 먼저 모든 산의 좌표를 수집하고 시/도로 그룹화
          data.mountains.forEach((mountain) => {
            let center = null
            
            if (mountain.center) {
              if (mountain.center.lat !== undefined && mountain.center.lat !== null && 
                  mountain.center.lon !== undefined && mountain.center.lon !== null) {
                const lat = Number(mountain.center.lat)
                const lon = Number(mountain.center.lon)
                if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                  center = [lat, lon]
                }
              } else if (Array.isArray(mountain.center) && mountain.center.length >= 2) {
                const lat = Number(mountain.center[0])
                const lon = Number(mountain.center[1])
                if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                  center = [lat, lon]
                }
              }
            }
            
            if (!center) {
              const mountainInfo = getMountainInfo(mountain.code)
              if (mountainInfo && mountainInfo.center && Array.isArray(mountainInfo.center) && mountainInfo.center.length >= 2) {
                center = mountainInfo.center
              }
            }
            
            if (center && Array.isArray(center) && center.length >= 2) {
              const [lat, lon] = center
              if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                // 시/도 추출
                const province = parseProvince(mountain.location) || '기타'
                
                if (!provinceClusters.has(province)) {
                  provinceClusters.set(province, {
                    mountains: [],
                    totalLat: 0,
                    totalLon: 0,
                    count: 0,
                    province: province
                  })
                }
                
                const cluster = provinceClusters.get(province)
                cluster.mountains.push(mountain)
                cluster.totalLat += lat
                cluster.totalLon += lon
                cluster.count++
              } else {
                skippedCount++
              }
            } else {
              skippedCount++
            }
          })
          
          // 시/도별 마커 생성
          provinceClusters.forEach((cluster, province) => {
            const centerLat = cluster.totalLat / cluster.count
            const centerLon = cluster.totalLon / cluster.count
            const position = new window.kakao.maps.LatLng(centerLat, centerLon)
            
            const count = cluster.count
            
            // 숫자에 따라 마커 크기 조정 (최소 40px, 최대 100px)
            const baseSize = 40
            const maxSize = 100
            const size = Math.min(baseSize + Math.sqrt(count) * 6, maxSize)
            const fontSize = count > 99 ? 16 : count > 9 ? 14 : 12
            
            // 숫자가 포함된 커스텀 마커 이미지 생성
            const imageSrc = 'data:image/svg+xml;base64,' + btoa(`
              <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="#ff8800" stroke="white" stroke-width="2"/>
                <text x="${size/2}" y="${size/2 + fontSize/3}" text-anchor="middle" fill="white" font-size="${fontSize}" font-weight="bold" font-family="Arial, sans-serif">${count}</text>
              </svg>
            `)
            
            const imageSize = new window.kakao.maps.Size(size, size)
            const imageOption = { offset: new window.kakao.maps.Point(size/2, size/2) }
            const markerImage = new window.kakao.maps.MarkerImage(imageSrc, imageSize, imageOption)
            
            // 마커 생성
            const marker = new window.kakao.maps.Marker({
              position: position,
              image: markerImage,
              map: mapInstanceRef.current
            })
            
            // CustomOverlay로 인포윈도우 생성 (깜빡임 방지)
            const content = document.createElement('div')
            content.style.cssText = `
              padding: 8px 12px;
              background: white;
              border: 1px solid #ddd;
              border-radius: 4px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.15);
              font-size: 0.9rem;
              white-space: nowrap;
              pointer-events: none;
            `
            content.innerHTML = `
              <div style="font-weight: 600; color: #000; margin-bottom: 4px;">${province}</div>
              <div style="font-size: 0.85rem; color: #666;">${count}개의 산</div>
            `
            
            const overlay = new window.kakao.maps.CustomOverlay({
              position: position,
              content: content,
              yAnchor: 2,
              xAnchor: 0.5,
              zIndex: 1000
            })
            
            // 마커 상태 관리
            marker.overlay = overlay
            marker.isOverlayVisible = false
            
            // 마커 클릭 이벤트 - 해당 시/도로 확대하고 개별 산 표시
            window.kakao.maps.event.addListener(marker, 'click', () => {
              // 다른 오버레이 숨기기
              markersRef.current.forEach(m => {
                if (m !== marker && m.overlay && m.isOverlayVisible) {
                  m.overlay.setMap(null)
                  m.isOverlayVisible = false
                }
              })
              
              setSelectedProvince(province)
              setViewMode('detail')
              
              // 해당 시/도로 확대
              const bounds = new window.kakao.maps.LatLngBounds()
              cluster.mountains.forEach(m => {
                let mCenter = null
                if (m.center) {
                  if (m.center.lat !== undefined && m.center.lat !== null) {
                    mCenter = [Number(m.center.lat), Number(m.center.lon)]
                  } else if (Array.isArray(m.center) && m.center.length >= 2) {
                    mCenter = [Number(m.center[0]), Number(m.center[1])]
                  }
                }
                if (!mCenter) {
                  const mInfo = getMountainInfo(m.code)
                  if (mInfo && mInfo.center) {
                    mCenter = mInfo.center
                  }
                }
                if (mCenter && mCenter.length >= 2) {
                  bounds.extend(new window.kakao.maps.LatLng(mCenter[0], mCenter[1]))
                }
              })
              
              mapInstanceRef.current.setBounds(bounds)
              mapInstanceRef.current.setLevel(6)
              
              // 개별 산 마커 표시
              setTimeout(() => {
                loadMountains(map, 'detail', province)
              }, 300)
            })
            
            // 마커에 마우스 오버 시 오버레이 표시
            let hoverTimeout = null
            let closeTimeout = null
            
            const showOverlay = () => {
              if (closeTimeout) {
                clearTimeout(closeTimeout)
                closeTimeout = null
              }
              
              if (hoverTimeout) {
                clearTimeout(hoverTimeout)
              }
              
              hoverTimeout = setTimeout(() => {
                // 다른 오버레이 숨기기
                markersRef.current.forEach(m => {
                  if (m !== marker && m.overlay && m.isOverlayVisible) {
                    m.overlay.setMap(null)
                    m.isOverlayVisible = false
                  }
                })
                
                if (!marker.isOverlayVisible) {
                  overlay.setMap(mapInstanceRef.current)
                  marker.isOverlayVisible = true
                }
              }, 150)
            }
            
            const hideOverlay = () => {
              if (hoverTimeout) {
                clearTimeout(hoverTimeout)
                hoverTimeout = null
              }
              
              if (closeTimeout) {
                clearTimeout(closeTimeout)
              }
              
              closeTimeout = setTimeout(() => {
                if (marker.isOverlayVisible) {
                  overlay.setMap(null)
                  marker.isOverlayVisible = false
                }
              }, 200)
            }
            
            window.kakao.maps.event.addListener(marker, 'mouseover', showOverlay)
            window.kakao.maps.event.addListener(marker, 'mouseout', hideOverlay)
            
            // 오버레이에도 마우스 이벤트 추가
            content.addEventListener('mouseenter', showOverlay)
            content.addEventListener('mouseleave', hideOverlay)
            
            
            markersRef.current.push(marker)
            bounds.extend(position)
            displayedCount += cluster.count
          })
        } else if (mode === 'detail' && (selectedProvince || provinceName)) {
          // 상세 보기: 선택된 시/도의 개별 산 마커 표시
          const targetProvince = provinceName || selectedProvince
          const provinceMountains = data.mountains.filter(m => parseProvince(m.location) === targetProvince)
          
          provinceMountains.forEach((mountain) => {
            let center = null
            
            if (mountain.center) {
              if (mountain.center.lat !== undefined && mountain.center.lat !== null && 
                  mountain.center.lon !== undefined && mountain.center.lon !== null) {
                const lat = Number(mountain.center.lat)
                const lon = Number(mountain.center.lon)
                if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                  center = [lat, lon]
                }
              } else if (Array.isArray(mountain.center) && mountain.center.length >= 2) {
                const lat = Number(mountain.center[0])
                const lon = Number(mountain.center[1])
                if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                  center = [lat, lon]
                }
              }
            }
            
            if (!center) {
              const mountainInfo = getMountainInfo(mountain.code)
              if (mountainInfo && mountainInfo.center && Array.isArray(mountainInfo.center) && mountainInfo.center.length >= 2) {
                center = mountainInfo.center
              }
            }
            
            if (center && Array.isArray(center) && center.length >= 2) {
              const [lat, lon] = center
              if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                const position = new window.kakao.maps.LatLng(lat, lon)
                
                // 개별 산 마커 (작은 주황색 원)
                const imageSrc = 'data:image/svg+xml;base64,' + btoa(`
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
                    <circle cx="10" cy="10" r="8" fill="#ff8800" stroke="white" stroke-width="3"/>
                  </svg>
                `)
                const imageSize = new window.kakao.maps.Size(20, 20)
                const imageOption = { offset: new window.kakao.maps.Point(10, 10) }
                const markerImage = new window.kakao.maps.MarkerImage(imageSrc, imageSize, imageOption)
                
                const marker = new window.kakao.maps.Marker({
                  position: position,
                  image: markerImage,
                  map: mapInstanceRef.current
                })
                
                // CustomOverlay로 인포윈도우 생성 (깜빡임 방지, 텍스트 한 줄 제한)
                const mountainNameDisplay = mountain.name.length > 15 ? mountain.name.substring(0, 15) + '...' : mountain.name
                const content = document.createElement('div')
                content.style.cssText = `
                  padding: 8px 12px;
                  background: white;
                  border: 1px solid #ddd;
                  border-radius: 4px;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                  font-size: 0.9rem;
                  white-space: nowrap;
                  pointer-events: auto;
                  cursor: pointer;
                `
                content.innerHTML = `
                  <div style="font-weight: 600; color: #000; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${mountainNameDisplay}</div>
                  <button 
                    style="background: #ffa04a; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 500; width: 100%;"
                    onclick="window.location.href='/mountain/${mountain.code}'"
                  >
                    상세보기
                  </button>
                `
                
                const overlay = new window.kakao.maps.CustomOverlay({
                  position: position,
                  content: content,
                  yAnchor: 1.5,
                  xAnchor: 0.5,
                  zIndex: 1000
                })
                
                // 마커 상태 관리
                marker.overlay = overlay
                marker.isOverlayVisible = false
                let hoverTimeout = null
                
                // 마커 클릭 이벤트
                window.kakao.maps.event.addListener(marker, 'click', () => {
                  if (hoverTimeout) {
                    clearTimeout(hoverTimeout)
                    hoverTimeout = null
                  }
                  navigate(`/mountain/${mountain.code}`)
                })
                
                // 마커에 마우스 오버 시 오버레이 표시
                let closeTimeout = null
                
                const showOverlay = () => {
                  if (closeTimeout) {
                    clearTimeout(closeTimeout)
                    closeTimeout = null
                  }
                  
                  if (hoverTimeout) {
                    clearTimeout(hoverTimeout)
                  }
                  
                  hoverTimeout = setTimeout(() => {
                    // 다른 오버레이 숨기기
                    markersRef.current.forEach(m => {
                      if (m !== marker && m.overlay && m.isOverlayVisible) {
                        m.overlay.setMap(null)
                        m.isOverlayVisible = false
                      }
                    })
                    
                    if (!marker.isOverlayVisible) {
                      overlay.setMap(mapInstanceRef.current)
                      marker.isOverlayVisible = true
                    }
                  }, 150)
                }
                
                const hideOverlay = () => {
                  if (hoverTimeout) {
                    clearTimeout(hoverTimeout)
                    hoverTimeout = null
                  }
                  
                  if (closeTimeout) {
                    clearTimeout(closeTimeout)
                  }
                  
                  closeTimeout = setTimeout(() => {
                    if (marker.isOverlayVisible) {
                      overlay.setMap(null)
                      marker.isOverlayVisible = false
                    }
                  }, 200)
                }
                
                window.kakao.maps.event.addListener(marker, 'mouseover', showOverlay)
                window.kakao.maps.event.addListener(marker, 'mouseout', hideOverlay)
                
                // 오버레이에도 마우스 이벤트 추가
                content.addEventListener('mouseenter', showOverlay)
                content.addEventListener('mouseleave', hideOverlay)
                
                
                markersRef.current.push(marker)
                bounds.extend(position)
                displayedCount++
              } else {
                skippedCount++
              }
            } else {
              skippedCount++
            }
          })
          
          // 해당 지역의 산들이 보이도록 지도 범위 조정
          if (markersRef.current.length > 0) {
            mapInstanceRef.current.setBounds(bounds)
          }
        }
        
        console.log(`산 지도 표시 완료: 총 ${data.mountains.length}개 중 ${displayedCount}개 표시, ${skippedCount}개 건너뜀`)
        
        if (displayedCount === 0) {
          console.error('표시된 산이 없습니다. center 정보를 확인하세요.')
          console.log('샘플 데이터:', data.mountains.slice(0, 3).map(m => ({
            name: m.name,
            code: m.code,
            center: m.center
          })))
        }
        
        // 모든 마커가 보이도록 지도 범위 조정
        if (markersRef.current.length > 0) {
          mapInstanceRef.current.setBounds(bounds)
        }
      }
    } catch (error) {
      console.error('Failed to load mountains:', error)
      if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED')) {
        console.warn('백엔드 서버에 연결할 수 없습니다. 백엔드 서버가 실행 중인지 확인하세요.')
      }
    }
  }

  const handleBackToProvinceView = () => {
    setViewMode('province')
    setSelectedProvince(null)
    if (mapInstanceRef.current) {
      // 기존 마커 제거
      markersRef.current.forEach(marker => {
        marker.setMap(null)
      })
      markersRef.current = []
      // 시/도 보기로 다시 로드
      loadMountains(mapInstanceRef.current, 'province')
      // 지도 초기 위치로 이동
      mapInstanceRef.current.setCenter(new window.kakao.maps.LatLng(36.5, 127.5))
      mapInstanceRef.current.setLevel(7)
    }
  }

  return (
    <div className="mountains-map-page">
      <Header />
      <main>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1>전체 산 지도</h1>
          {viewMode === 'detail' && selectedProvince && (
            <button
              onClick={handleBackToProvinceView}
              style={{
                padding: '10px 20px',
                background: '#ffa04a',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}
            >
              ← 전체 보기
            </button>
          )}
        </div>
        {viewMode === 'detail' && selectedProvince && (
          <div style={{ marginBottom: '10px', fontSize: '1.1rem', fontWeight: '600', color: '#333' }}>
            {selectedProvince} 지역의 산
          </div>
        )}
        <div id="mountains-map" ref={mapRef} style={{ width: '100%', height: '600px' }}></div>
      </main>
    </div>
  )
}

export default MountainsMap




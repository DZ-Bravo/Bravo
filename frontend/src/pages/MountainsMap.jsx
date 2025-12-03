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
          loadMountains(map)
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
        marker.setMap(null)
      })
      markersRef.current = []
      if (mapRef.current) {
        mapRef.current.innerHTML = ''
      }
    }
  }, [kakaoLoaded])

  const loadMountains = async (map) => {
    if (!map || !mapInstanceRef.current) return

    try {
      const apiUrl = API_URL
      const response = await fetch(`${apiUrl}/api/mountains`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.mountains && data.mountains.length > 0 && mapInstanceRef.current && window.kakao && window.kakao.maps) {
        const bounds = new window.kakao.maps.LatLngBounds()
        
        data.mountains.forEach((mountain) => {
          const mountainInfo = getMountainInfo(mountain.code)
          
          if (mountainInfo && mountainInfo.center) {
            const [lat, lon] = mountainInfo.center
            const position = new window.kakao.maps.LatLng(lat, lon)
            
            // 커스텀 마커 이미지 생성
            const imageSrc = 'data:image/svg+xml;base64,' + btoa(`
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="8" fill="#2d8659" stroke="white" stroke-width="3"/>
              </svg>
            `)
            const imageSize = new window.kakao.maps.Size(20, 20)
            const imageOption = { offset: new window.kakao.maps.Point(10, 10) }
            const markerImage = new window.kakao.maps.MarkerImage(imageSrc, imageSize, imageOption)
            
            // 마커 생성
            const marker = new window.kakao.maps.Marker({
              position: position,
              image: markerImage,
              map: mapInstanceRef.current
            })
            
            // 인포윈도우 생성
            const infowindow = new window.kakao.maps.InfoWindow({
              content: `
                <div style="padding: 10px; min-width: 150px; text-align: center;">
                  <h3 style="margin: 0 0 8px 0; font-size: 1.1rem; color: #2d8659; font-weight: 600;">${mountain.name}</h3>
                  <button 
                    style="background: #2d8659; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9rem;"
                    onclick="window.location.href='/mountain/${mountain.code}'"
                  >
                    상세보기
                  </button>
                </div>
              `
            })
            
            // 마커 클릭 이벤트
            window.kakao.maps.event.addListener(marker, 'click', () => {
              navigate(`/mountain/${mountain.code}`)
            })
            
            // 마커에 마우스 오버 시 인포윈도우 표시
            window.kakao.maps.event.addListener(marker, 'mouseover', () => {
              infowindow.open(mapInstanceRef.current, marker)
            })
            
            // 마커에 마우스 아웃 시 인포윈도우 닫기
            window.kakao.maps.event.addListener(marker, 'mouseout', () => {
              infowindow.close()
            })
            
            markersRef.current.push(marker)
            bounds.extend(position)
          }
        })
        
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

  return (
    <div className="mountains-map-page">
      <Header />
      <main>
        <h1>전체 산 지도</h1>
        <div id="mountains-map" ref={mapRef} style={{ width: '100%', height: '600px' }}></div>
        <button className="list-view-btn">목록 보기</button>
      </main>
    </div>
  )
}

export default MountainsMap



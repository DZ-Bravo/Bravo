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
      console.log('[카카오 지도] SDK 로드 시작')
      
      if (window.kakao && window.kakao.maps) {
        console.log('[카카오 지도] SDK가 이미 로드되어 있음')
        setKakaoLoaded(true)
        return
      }

      // 카카오 맵 API 키 가져오기
      const apiKey = import.meta.env.VITE_KAKAO_MAP_API_KEY || ''
      console.log('[카카오 지도] API 키 확인:', apiKey ? `${apiKey.substring(0, 10)}...` : '없음')
      console.log('[카카오 지도] import.meta.env:', import.meta.env)
      
      if (!apiKey) {
        console.error('[카카오 지도] ❌ API 키가 설정되지 않았습니다.')
        console.error('[카카오 지도] VITE_KAKAO_MAP_API_KEY 환경 변수를 설정해주세요.')
        console.error('[카카오 지도] 현재 접속 도메인:', window.location.origin)
        return
      }

      // 카카오 맵 SDK가 이미 로드되어 있는지 확인
      if (window.kakao && window.kakao.maps) {
        console.log('[카카오 지도] 기존 SDK 로드 중...')
        window.kakao.maps.load(() => {
          console.log('[카카오 지도] ✅ SDK 로드 완료')
          if (isMounted) {
            setKakaoLoaded(true)
          }
        })
      } else {
        // SDK 스크립트 동적 로드
        console.log('[카카오 지도] SDK 스크립트 동적 로드 시작')
        console.log('[카카오 지도] 현재 접속 정보:', {
          origin: window.location.origin,
          href: window.location.href,
          protocol: window.location.protocol,
          host: window.location.host,
          hostname: window.location.hostname,
          port: window.location.port || '(기본 포트)'
        })
        const script = document.createElement('script')
        // 카카오 SDK를 https로 강제 로드 (일부 adblock/http 필터 회피용)
        // 캐시/차단 우회용 타임스탬프 쿼리 추가
        const cacheBust = Date.now()
        const scriptUrl = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false&_=${cacheBust}`
        script.src = scriptUrl
        script.async = true
        
        script.onload = () => {
          console.log('[카카오 지도] 스크립트 로드 완료')
          if (window.kakao && window.kakao.maps) {
            console.log('[카카오 지도] window.kakao.maps 확인됨')
            window.kakao.maps.load(() => {
              console.log('[카카오 지도] ✅ SDK 초기화 완료')
              if (isMounted) {
                setKakaoLoaded(true)
              }
            })
          } else {
            console.error('[카카오 지도] ❌ window.kakao.maps가 없습니다.')
          }
        }
        
        script.onerror = (error) => {
          console.error('[카카오 지도] ❌ 스크립트 로드 실패:', error)
          console.error('[카카오 지도] 스크립트 URL:', scriptUrl)
          console.error('[카카오 지도] 현재 접속 도메인:', window.location.origin)
          console.error('[카카오 지도] 현재 접속 전체 URL:', window.location.href)
          console.error('[카카오 지도] 프로토콜:', window.location.protocol)
          console.error('[카카오 지도] 호스트:', window.location.host)
          console.error('[카카오 지도] 호스트명:', window.location.hostname)
          console.error('[카카오 지도] 포트:', window.location.port || '(기본 포트)')
          console.error('[카카오 지도] 카카오 개발자 콘솔에 다음 도메인들을 모두 추가하세요:')
          console.error('[카카오 지도] 1. ' + window.location.origin)
          if (window.location.port) {
            console.error('[카카오 지도] 2. ' + window.location.protocol + '//' + window.location.hostname)
          }
          console.error('[카카오 지도] 3. ' + window.location.protocol + '//' + window.location.hostname + ':80')
          console.error('[카카오 지도] 4. ' + window.location.protocol + '//' + window.location.hostname + ':443')
        }
        
        document.head.appendChild(script)
        console.log('[카카오 지도] 스크립트 태그 추가됨')
      }
    }

    loadKakaoMap()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    console.log('[카카오 지도] 지도 초기화 useEffect 실행:', { kakaoLoaded, hasMapRef: !!mapRef.current })
    
    if (!kakaoLoaded) {
      console.log('[카카오 지도] ⏳ SDK 로드 대기 중...')
      return
    }
    
    if (!mapRef.current) {
      console.error('[카카오 지도] ❌ mapRef.current가 없습니다.')
      return
    }

    let isMounted = true

    // 지도 초기화
    const initMap = () => {
      console.log('[카카오 지도] 지도 초기화 시작')
      
      if (!mapRef.current) {
        console.error('[카카오 지도] ❌ mapRef.current가 없습니다.')
        return
      }
      
      if (!window.kakao) {
        console.error('[카카오 지도] ❌ window.kakao가 없습니다.')
        return
      }
      
      if (!window.kakao.maps) {
        console.error('[카카오 지도] ❌ window.kakao.maps가 없습니다.')
        return
      }

      // 기존 지도가 있으면 제거
      if (mapInstanceRef.current) {
        console.log('[카카오 지도] 기존 지도 제거')
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

        console.log('[카카오 지도] 지도 인스턴스 생성 중...')
        const map = new window.kakao.maps.Map(container, options)
        mapInstanceRef.current = map
        console.log('[카카오 지도] ✅ 지도 인스턴스 생성 완료')

        // 산 목록 가져오기 및 마커 추가
        if (isMounted) {
          console.log('[카카오 지도] 산 목록 로드 시작')
          loadMountains(map, 'province')
        }
      } catch (error) {
        console.error('[카카오 지도] ❌ 지도 초기화 실패:', error)
        console.error('[카카오 지도] 에러 상세:', error.message, error.stack)
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

  // 줌 레벨 변경 감지 - 동적으로 마커 업데이트 (안정화 후 업데이트)
  const zoomLevelRef = useRef(7) // 현재 줌 레벨 추적
  
  useEffect(() => {
    if (!mapInstanceRef.current || !window.kakao || !window.kakao.maps || allMountains.length === 0) return

    let updateTimeout = null
    let isUpdating = false // 업데이트 중 플래그
    
    const updateMarkersForCurrentView = () => {
      if (isUpdating) return // 이미 업데이트 중이면 무시
      
      if (updateTimeout) {
        clearTimeout(updateTimeout)
      }
      
      updateTimeout = setTimeout(() => {
        if (!mapInstanceRef.current || isUpdating) return
        
        const level = mapInstanceRef.current.getLevel()
        
        // 줌 레벨이 실제로 변경되었는지 확인
        if (level === zoomLevelRef.current) {
          return // 같은 레벨이면 업데이트하지 않음
        }
        
        zoomLevelRef.current = level
        isUpdating = true
        
        const bounds = mapInstanceRef.current.getBounds()
        
        // 현재 보이는 영역의 산만 필터링
        const visibleMountains = allMountains.filter(mountain => {
          const center = parseCenter(mountain)
          if (!center || center.length < 2) return false
          
          const [lat, lon] = center
          const position = new window.kakao.maps.LatLng(lat, lon)
          return bounds.contain(position)
        })
        
        console.log('줌 변경:', { level, visibleCount: visibleMountains.length, total: allMountains.length })
        
        // 줌 레벨에 따라 다른 표시 방식
        if (level <= 5) {
          // 매우 확대됨: 모든 보이는 산을 개별 마커로 표시
          if (visibleMountains.length > 0) {
            console.log('개별 산 마커 표시:', visibleMountains.length)
            setViewMode('detail')
            setSelectedProvince(null)
            loadMountains(mapInstanceRef.current, 'detail', null, visibleMountains)
          }
        } else if (level === 6) {
          // 확대됨: 시/도별로 그룹화하되, 보이는 영역만
          if (visibleMountains.length > 0) {
            // 가장 많은 산이 있는 시/도 찾기
            const provinceCounts = new Map()
            visibleMountains.forEach(m => {
              const province = parseProvince(m.location) || '기타'
              provinceCounts.set(province, (provinceCounts.get(province) || 0) + 1)
            })
            
            const topProvince = Array.from(provinceCounts.entries())
              .sort((a, b) => b[1] - a[1])[0]?.[0]
            
            if (topProvince) {
              console.log('상세 모드로 전환:', topProvince, '산 개수:', provinceCounts.get(topProvince))
              setSelectedProvince(topProvince)
              setViewMode('detail')
              
              // 해당 지역의 산만 필터링
              const provinceMountains = visibleMountains.filter(m => {
                const province = parseProvince(m.location) || '기타'
                return province === topProvince
              })
              
              // 개별 산 마커 표시
              loadMountains(mapInstanceRef.current, 'detail', topProvince, provinceMountains)
            }
          }
        } else {
          // 축소됨 (level >= 7): 시/도별 그룹 마커 표시
          console.log('province 모드로 표시')
          setViewMode('province')
          setSelectedProvince(null)
          // 현재 보이는 영역의 산만 사용하여 province 마커 표시
          if (visibleMountains.length > 0) {
            loadMountains(mapInstanceRef.current, 'province', null, visibleMountains)
          } else {
            loadMountains(mapInstanceRef.current, 'province')
          }
        }
        
        // 업데이트 완료 후 플래그 해제
        setTimeout(() => {
          isUpdating = false
        }, 500)
      }, 400) // 400ms 디바운싱 (더 안정적)
    }
    
    // 줌 변경 완료 시에만 업데이트 (zoom_changed만 사용)
    window.kakao.maps.event.addListener(mapInstanceRef.current, 'zoom_changed', updateMarkersForCurrentView)
    
    return () => {
      if (updateTimeout) {
        clearTimeout(updateTimeout)
      }
      if (mapInstanceRef.current) {
        window.kakao.maps.event.removeListener(mapInstanceRef.current, 'zoom_changed', updateMarkersForCurrentView)
      }
    }
  }, [allMountains]) // allMountains만 의존성으로 (항상 최신 상태 참조)

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

  // center 정보를 안전하게 파싱하는 함수
  const parseCenter = (mountain) => {
    if (!mountain) return null
    
    // 1. mountain.center가 객체인 경우 (lat, lon)
    if (mountain.center && typeof mountain.center === 'object' && !Array.isArray(mountain.center)) {
      if (mountain.center.lat !== undefined && mountain.center.lat !== null && 
          mountain.center.lon !== undefined && mountain.center.lon !== null) {
        const lat = Number(mountain.center.lat)
        const lon = Number(mountain.center.lon)
        if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
          return [lat, lon]
        }
      }
    }
    
    // 2. mountain.center가 배열인 경우 [lat, lon]
    if (Array.isArray(mountain.center) && mountain.center.length >= 2) {
      const lat = Number(mountain.center[0])
      const lon = Number(mountain.center[1])
      if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        return [lat, lon]
      }
    }
    
    // 3. getMountainInfo에서 가져오기
    if (mountain.code) {
      const mountainInfo = getMountainInfo(mountain.code)
      if (mountainInfo) {
        // mountainInfo.center가 객체인 경우
        if (mountainInfo.center && typeof mountainInfo.center === 'object' && !Array.isArray(mountainInfo.center)) {
          if (mountainInfo.center.lat !== undefined && mountainInfo.center.lon !== undefined) {
            const lat = Number(mountainInfo.center.lat)
            const lon = Number(mountainInfo.center.lon)
            if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
              return [lat, lon]
            }
          }
        }
        // mountainInfo.center가 배열인 경우
        if (Array.isArray(mountainInfo.center) && mountainInfo.center.length >= 2) {
          const lat = Number(mountainInfo.center[0])
          const lon = Number(mountainInfo.center[1])
          if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
            return [lat, lon]
          }
        }
      }
    }
    
    return null
  }

  const loadMountains = async (map, mode = 'province', provinceName = null, mountainsList = null) => {
    if (!map || !mapInstanceRef.current) return

    try {
      let data = null
      
      // mountainsList가 있으면 API 호출 건너뛰기
      if (mountainsList && Array.isArray(mountainsList) && mountainsList.length > 0) {
        console.log('mountainsList 사용, API 호출 건너뜀:', { count: mountainsList.length })
        data = { mountains: mountainsList }
        // 모든 산 데이터 저장 (기존 데이터와 병합)
        setAllMountains(prev => {
          const merged = [...prev]
          mountainsList.forEach(m => {
            if (!merged.find(existing => existing.code === m.code)) {
              merged.push(m)
            }
          })
          return merged
        })
      } else {
        // API 호출
        const apiUrl = API_URL
        const response = await fetch(`${apiUrl}/api/mountains`)
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        data = await response.json()
        
        console.log('산 데이터 받음:', {
          total: data.mountains?.length || 0,
          sample: data.mountains?.[0]
        })
        
        // 모든 산 데이터 저장
        setAllMountains(data.mountains || [])
      }
      
      if (data.mountains && data.mountains.length > 0 && mapInstanceRef.current && window.kakao && window.kakao.maps) {
        // 기존 마커 제거
        markersRef.current.forEach(marker => {
          marker.setMap(null)
        })
        markersRef.current = []
        
        const bounds = new window.kakao.maps.LatLngBounds()
        let displayedCount = 0
        let skippedCount = 0
        let provinceClusters = null // 전역 변수로 선언
        
        console.log('loadMountains 호출:', { mode, selectedProvince, provinceName, totalMountains: data.mountains.length })
        
        if (mode === 'province') {
          // 시/도별로 산 그룹화
          provinceClusters = new Map()
          
          // 먼저 모든 산의 좌표를 수집하고 시/도로 그룹화
          data.mountains.forEach((mountain) => {
            const center = parseCenter(mountain)
            
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
                console.warn('유효하지 않은 좌표 범위:', { lat, lon, name: mountain.name })
              }
            } else {
              skippedCount++
              console.warn('center 파싱 실패:', { name: mountain.name, code: mountain.code, center: mountain.center })
            }
          })
          
          console.log('provinceClusters 통계:', {
            totalClusters: provinceClusters.size,
            clusters: Array.from(provinceClusters.entries()).map(([province, cluster]) => ({
              province,
              count: cluster.count
            })),
            totalMountainsInClusters: Array.from(provinceClusters.values()).reduce((sum, c) => sum + c.count, 0)
          })
          
          if (provinceClusters.size === 0) {
            console.error('provinceClusters가 비어있습니다!', {
              totalMountains: data.mountains.length,
              sampleMountains: data.mountains.slice(0, 3).map(m => ({
                name: m.name,
                location: m.location,
                parsedProvince: parseProvince(m.location),
                center: parseCenter(m)
              }))
            })
          }
          
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
              
              // 개별 산 마커 표시 - cluster.mountains를 직접 전달
              setTimeout(() => {
                loadMountains(map, 'detail', province, cluster.mountains)
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
        } else if (mode === 'detail') {
          // 상세 보기: 선택된 시/도의 개별 산 마커 표시
          // mountainsList가 있으면 직접 사용, 없으면 필터링
          let provinceMountains = null
          
          if (mountainsList && Array.isArray(mountainsList) && mountainsList.length > 0) {
            // 마커 클릭 시 전달된 산 목록 직접 사용
            provinceMountains = mountainsList
            console.log('detail 모드: 마커에서 전달된 산 목록 사용', { count: provinceMountains.length })
          } else {
            // 필터링 방식 (fallback)
            const targetProvince = provinceName || selectedProvince
            console.log('detail 모드 진입 (필터링):', { targetProvince, selectedProvince, provinceName, mode })
            
            if (!targetProvince) {
              console.error('detail 모드인데 targetProvince가 없고 mountainsList도 없습니다!', { provinceName, selectedProvince })
              return
            }
            
            provinceMountains = data.mountains.filter(m => {
              const parsed = parseProvince(m.location)
              // 정규화: 공백 제거 및 비교
              const normalizedParsed = parsed ? parsed.trim() : null
              const normalizedTarget = targetProvince ? targetProvince.trim() : null
              const matches = normalizedParsed === normalizedTarget
              return matches
            })
            
            console.log('provinceMountains 필터링 결과:', {
              targetProvince,
              totalMountains: data.mountains.length,
              filteredCount: provinceMountains.length
            })
          }
          
          if (!provinceMountains || provinceMountains.length === 0) {
            console.error('표시할 산이 없습니다!', { 
              mountainsListProvided: !!mountainsList, 
              mountainsListLength: mountainsList?.length,
              provinceName,
              selectedProvince
            })
            return
          }
          
          // detail 모드 처리
          console.log('detail 모드 - 표시할 산 목록:', provinceMountains.map(m => ({
            name: m.name,
            code: m.code,
            center: m.center,
            parsedCenter: parseCenter(m)
          })))
          
          provinceMountains.forEach((mountain) => {
            const center = parseCenter(mountain)
            
            // 무등산 좌표 디버깅
            if (mountain.code === '431502001' || mountain.name?.includes('무등')) {
              console.log('[MountainsMap.jsx] 무등산 좌표 파싱:', {
                name: mountain.name,
                code: mountain.code,
                center: mountain.center,
                parsedCenter: center,
                lat: mountain.lat,
                lng: mountain.lng
              })
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
                console.log(`✅ 마커 표시: ${mountain.name} (${lat}, ${lon})`)
              } else {
                skippedCount++
                console.warn(`⚠️  좌표 범위 오류: ${mountain.name}`, { lat, lon, center })
              }
            } else {
              skippedCount++
              console.warn(`⚠️  center 파싱 실패: ${mountain.name}`, { 
                code: mountain.code, 
                center: mountain.center,
                parsedCenter: center 
              })
            }
          })
          
          console.log(`detail 모드 완료: ${displayedCount}개 표시, ${skippedCount}개 건너뜀`)
          
          // 해당 지역의 산들이 보이도록 지도 범위 조정
          if (markersRef.current.length > 0) {
            mapInstanceRef.current.setBounds(bounds)
          }
        }
        
        console.log(`산 지도 표시 완료: 총 ${data.mountains.length}개 중 ${displayedCount}개 표시, ${skippedCount}개 건너뜀`)
        
        if (displayedCount === 0) {
          console.error('표시된 산이 없습니다. center 정보를 확인하세요.')
          console.log('샘플 데이터:', data.mountains.slice(0, 5).map(m => {
            const center = parseCenter(m)
            const province = parseProvince(m.location)
            return {
              name: m.name,
              code: m.code,
              center: m.center,
              parsedCenter: center,
              location: m.location,
              parsedProvince: province,
              isValid: center && Array.isArray(center) && center.length >= 2
            }
          }))
          console.log('전체 데이터 통계:', {
            total: data.mountains.length,
            withCenter: data.mountains.filter(m => m.center).length,
            withValidCenter: data.mountains.filter(m => parseCenter(m)).length,
            withoutLocation: data.mountains.filter(m => !m.location).length,
            withValidProvince: data.mountains.filter(m => {
              const center = parseCenter(m)
              const province = parseProvince(m.location) || '기타'
              return center && Array.isArray(center) && center.length >= 2
            }).length
          })
          if (provinceClusters) {
            console.log('provinceClusters 상태:', {
              size: provinceClusters.size,
              entries: Array.from(provinceClusters.entries()).map(([p, c]) => ({ province: p, count: c.count }))
            })
          } else {
            console.log('provinceClusters가 null입니다. mode:', mode)
          }
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





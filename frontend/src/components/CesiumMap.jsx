import { useEffect, useRef } from 'react'
import { API_URL } from '../utils/api'
import { convertArcGISToGeoJSON } from '../utils/coordinateTransform'

// Cesium은 CDN에서 로드
// Cesium CSS는 index.html에서 로드

function CesiumMap({ 
  courses = [], 
  center = [36.5, 127.8], 
  code = null,
  name = '',
  onCourseClick = null 
}) {
  const cesiumContainerRef = useRef(null)
  const viewerRef = useRef(null)
  const entitiesRef = useRef([])

  useEffect(() => {
    // Cesium이 로드될 때까지 대기
    const loadCesium = () => {
      if (!window.Cesium) {
        console.log('Cesium 로드 중...')
        setTimeout(loadCesium, 100)
        return
      }

      const Cesium = window.Cesium

      // Cesium Ion 토큰 설정
      const accessToken = import.meta.env.VITE_CESIUM_ACCESS_TOKEN
      if (accessToken) {
        Cesium.Ion.defaultAccessToken = accessToken
      } else {
        console.error('Cesium Ion 토큰이 설정되지 않았습니다.')
        return
      }

      if (!cesiumContainerRef.current) return

      // Cesium Viewer 초기화
      const viewer = new Cesium.Viewer(cesiumContainerRef.current, {
        terrain: Cesium.Terrain.fromWorldTerrain(),
      timeline: false,
      animation: false,
      vrButton: false,
      geocoder: false,
      homeButton: true,
      infoBox: false,
      sceneModePicker: true,
      baseLayerPicker: false,
      navigationHelpButton: false,
      fullscreenButton: true,
      selectionIndicator: false,
      shouldAnimate: false
    })

      viewerRef.current = viewer

      // 카메라를 중심 좌표로 이동
      const [lat, lon] = center
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, 2500),
        orientation: {
          pitch: -0.7
        }
      })

      // GPX 파일 로드 및 표시
      const loadGPXFiles = async () => {
        if (!code) {
          console.log('[CesiumMap] code가 없어서 GPX 로드하지 않음')
          return
        }

        console.log('[CesiumMap] GPX 파일 로드 시작', { code, name, coursesCount: courses.length })

        try {
          // 먼저 산 코드로 GPX 파일 목록을 시도
          // 경로: /mountain/{code}_gpx/PMNTN_{산이름}_{code}.gpx
          const gpxBasePath = `${API_URL}/mountain/${code}_gpx`
          
          // 산 이름 가져오기
          const mountainName = name || ''
          console.log('[CesiumMap] GPX Base Path:', gpxBasePath, 'Mountain Name:', mountainName)
          
          // 먼저 전체 산 GPX 파일 하나만 로드 시도 (모든 코스에 공통 사용)
          // GPX 파일명 패턴: PMNTN_{산이름}_{봉우리}_${code}.gpx 또는 PMNTN_{산이름}_${code}.gpx
          let mountainGpxLoaded = false
          
          // 산 이름으로 시도 (여러 패턴)
          const mountainNameVariations = [
            mountainName,
            mountainName.replace(/산$/, ''), // "소백산" -> "소백"
            mountainName.split(' ')[0], // 공백으로 분리하여 첫 단어만
          ].filter(Boolean)
          
          for (const nameVar of mountainNameVariations) {
            if (mountainGpxLoaded) break
            
            // 패턴 1: PMNTN_{산이름}_{봉우리}_${code}.gpx
            // 패턴 2: PMNTN_{산이름}_${code}.gpx
            const patterns = [
              `PMNTN_${encodeURIComponent(nameVar)}_*_${code}.gpx`, // 와일드카드는 직접 검색 불가
              `PMNTN_${encodeURIComponent(nameVar)}_${code}.gpx`
            ]
            
            // 실제로는 디렉토리에서 파일 목록을 확인해야 하지만, 일단 일반적인 패턴으로 시도
            const mountainGpxUrl = `${gpxBasePath}/PMNTN_${encodeURIComponent(nameVar)}_${code}.gpx`
            console.log('[CesiumMap] 전체 산 GPX 파일 시도:', mountainGpxUrl)
            try {
              const response = await fetch(mountainGpxUrl)
              if (response.ok) {
                const gpxText = await response.text()
                console.log('[CesiumMap] 전체 산 GPX 파일 로드 성공, 크기:', gpxText.length)
                // 전체 산 GPX를 한 번만 파싱하여 모든 코스에 표시
                await parseAndAddGPX(gpxText, mountainName || '전체 코스', 0, viewer)
                mountainGpxLoaded = true
                break
              } else {
                console.log('[CesiumMap] 전체 산 GPX 파일 404:', response.status, mountainGpxUrl)
              }
            } catch (error) {
              console.log('[CesiumMap] 전체 산 GPX 파일 로드 실패:', mountainGpxUrl, error.message)
            }
            
            // 봉우리 이름이 있는 경우도 시도 (예: 소백산_비로봉)
            // 하지만 봉우리 이름을 모르므로 일단 건너뜀
          }
          
          // 전체 산 GPX가 없으면 GeoJSON 사용
          if (!mountainGpxLoaded) {
            console.log('[CesiumMap] 전체 산 GPX 없음, GeoJSON 사용 시작')
            for (let i = 0; i < courses.length; i++) {
              const course = courses[i]
              const courseName = course.properties?.name || course.properties?.PMNTN_NM || `코스 ${i + 1}`
              console.log('[CesiumMap] GeoJSON 처리:', courseName, 'index:', i)
              console.log('[CesiumMap] Course data:', {
                hasGeometry: !!course.geometry,
                geometryType: course.geometry?.type,
                properties: course.properties
              })
              await loadGeoJSONCourse(course, i, viewer)
            }
          }

          console.log('[CesiumMap] 엔티티 개수:', entitiesRef.current.length)
          // 모든 코스를 포함하도록 카메라 이동
          if (entitiesRef.current.length > 0) {
            viewer.flyTo(viewer.entities)
          } else {
            console.warn('[CesiumMap] 표시된 코스가 없습니다!')
          }
        } catch (error) {
          console.error('[CesiumMap] GPX 파일 로드 오류:', error)
          // 모든 GPX 로드 실패 시 GeoJSON 사용
          console.log('[CesiumMap] 모든 코스를 GeoJSON으로 표시 시도')
          for (let i = 0; i < courses.length; i++) {
            await loadGeoJSONCourse(courses[i], i, viewer)
          }
        }
      }
      
      // GPX 파싱 및 엔티티 추가 함수
      const parseAndAddGPX = async (gpxText, courseName, index, viewer) => {
        try {
          const parser = new DOMParser()
          const xml = parser.parseFromString(gpxText, 'text/xml')
          
          // trkseg 안의 trkpt도 찾기
          const trackPoints = xml.getElementsByTagName('trkpt')
          const trackSegments = xml.getElementsByTagName('trkseg')

          if (trackPoints.length === 0 && trackSegments.length === 0) {
            console.warn('[CesiumMap] GPX에 트랙포인트가 없음:', courseName)
            return false
          }

          console.log('[CesiumMap] GPX 파싱:', courseName, '트랙포인트:', trackPoints.length, '세그먼트:', trackSegments.length)

          // GPX 좌표 배열 생성 (ele가 0이어도 clampToGround가 지형에 맞춤)
          const positions = []
          
          // trkseg가 있으면 세그먼트별로 처리
          if (trackSegments.length > 0) {
            for (let seg = 0; seg < trackSegments.length; seg++) {
              const segPoints = trackSegments[seg].getElementsByTagName('trkpt')
              for (let j = 0; j < segPoints.length; j++) {
                const pt = segPoints[j]
                const lat = parseFloat(pt.getAttribute('lat'))
                const lon = parseFloat(pt.getAttribute('lon'))
                const ele = pt.getElementsByTagName('ele')[0]
                const h = ele ? parseFloat(ele.textContent) : 0
                
                if (!isNaN(lat) && !isNaN(lon)) {
                  positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, h))
                }
              }
            }
          } else {
            // 직접 trkpt 처리
            for (let j = 0; j < trackPoints.length; j++) {
              const pt = trackPoints[j]
              const lat = parseFloat(pt.getAttribute('lat'))
              const lon = parseFloat(pt.getAttribute('lon'))
              const ele = pt.getElementsByTagName('ele')[0]
              const h = ele ? parseFloat(ele.textContent) : 0
              
              if (!isNaN(lat) && !isNaN(lon)) {
                positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, h))
              }
            }
          }

          if (positions.length === 0) {
            console.warn('[CesiumMap] 유효한 좌표가 없음:', courseName)
            return false
          }

          console.log('[CesiumMap] 엔티티 추가:', courseName, '포인트 수:', positions.length)

          // 3D 폴리라인 추가 - clampToGround로 지형에 맞춤
          const entity = viewer.entities.add({
            name: courseName,
            polyline: {
              positions: positions,
              width: 6,
              clampToGround: true, // 지형에 맞춤 (ele가 0이어도 지형 고도 사용)
              material: Cesium.Color.RED.withAlpha(0.95),
              zIndex: 1
            }
          })

          entitiesRef.current.push(entity)
          console.log('[CesiumMap] 엔티티 추가 완료:', courseName)

          // 클릭 이벤트
          if (onCourseClick && courses[index]) {
            entity.onClick = () => {
              onCourseClick(courses[index], index)
            }
          }
          
          return true
        } catch (error) {
          console.error(`[CesiumMap] GPX 파싱 오류 (${courseName}):`, error)
          return false
        }
      }

      // GeoJSON 데이터를 사용하여 코스 표시
      const loadGeoJSONCourse = async (course, index, viewer) => {
        if (!course) {
          console.warn('[CesiumMap] GeoJSON: course 객체 없음', index)
          return
        }
        
        try {
          let geometry = course.geometry
          
          // ArcGIS 형식인지 확인 (geometry.paths가 있으면 ArcGIS 형식)
          if (geometry && geometry.paths) {
            console.log('[CesiumMap] ArcGIS 형식 감지, 변환 시작:', index)
            // ArcGIS 형식을 GeoJSON으로 변환
            const geoJsonData = convertArcGISToGeoJSON({
              features: [course]
            })
            
            if (geoJsonData.features && geoJsonData.features.length > 0) {
              geometry = geoJsonData.features[0].geometry
              // properties 복원
              if (course.properties) {
                geoJsonData.features[0].properties = {
                  ...geoJsonData.features[0].properties,
                  ...course.properties
                }
              }
              console.log('[CesiumMap] ArcGIS 변환 완료:', geometry.type)
            } else {
              console.warn('[CesiumMap] ArcGIS 변환 실패:', index)
              return
            }
          }
          
          if (!geometry) {
            console.warn('[CesiumMap] GeoJSON: geometry 없음', index, 'course:', course)
            return
          }
          
          console.log('[CesiumMap] GeoJSON geometry:', {
            type: geometry.type,
            hasCoordinates: !!geometry.coordinates,
            coordinatesLength: geometry.coordinates?.length,
            coordinatesType: typeof geometry.coordinates
          })
          
          let coordinates = []

          if (geometry.type === 'LineString') {
            coordinates = geometry.coordinates || []
          } else if (geometry.type === 'MultiLineString') {
            coordinates = geometry.coordinates?.flat() || []
          } else if (geometry.type === 'Polygon') {
            // Polygon의 경우 외곽 경계선만 사용
            coordinates = geometry.coordinates?.[0] || []
          } else {
            console.warn('[CesiumMap] GeoJSON: 지원하지 않는 geometry 타입', geometry.type)
            // 좌표가 직접 있는 경우도 시도
            if (Array.isArray(geometry.coordinates)) {
              coordinates = geometry.coordinates
            }
          }

          console.log('[CesiumMap] GeoJSON 추출된 coordinates:', coordinates.length)

          if (coordinates.length === 0) {
            console.warn('[CesiumMap] GeoJSON: 좌표 없음', index, 'geometry:', geometry)
            return
          }

          // GeoJSON 좌표를 Cesium Cartesian3로 변환
          const positions = coordinates
            .filter(coord => {
              if (!Array.isArray(coord)) return false
              if (coord.length < 2) return false
              const lon = coord[0]
              const lat = coord[1]
              return !isNaN(lon) && !isNaN(lat) && 
                     lon >= -180 && lon <= 180 && 
                     lat >= -90 && lat <= 90
            })
            .map(coord => {
              // coord는 [lon, lat] 또는 [lon, lat, height] 형식
              const lon = parseFloat(coord[0])
              const lat = parseFloat(coord[1])
              const height = coord[2] ? parseFloat(coord[2]) : 0
              return Cesium.Cartesian3.fromDegrees(lon, lat, height)
            })

          if (positions.length === 0) {
            console.warn('[CesiumMap] GeoJSON: 유효한 좌표 없음', index, '처리된 좌표:', coordinates.slice(0, 3))
            return
          }

          const courseName = course.properties?.name || course.properties?.PMNTN_NM || `코스 ${index + 1}`
          console.log('[CesiumMap] GeoJSON 엔티티 추가:', courseName, '포인트 수:', positions.length)

          const entity = viewer.entities.add({
            name: courseName,
            polyline: {
              positions: positions,
              width: 6,
              clampToGround: true, // 지형에 맞춤
              material: Cesium.Color.ORANGE.withAlpha(0.95),
              zIndex: 1
            }
          })

          entitiesRef.current.push(entity)
          console.log('[CesiumMap] GeoJSON 엔티티 추가 완료:', courseName)

          // 클릭 이벤트
          if (onCourseClick) {
            entity.onClick = () => {
              onCourseClick(course, index)
            }
          }
        } catch (error) {
          console.error('[CesiumMap] GeoJSON 코스 로드 오류:', error, 'course:', course)
        }
      }

      // GPX 또는 GeoJSON 로드
      if (courses.length > 0) {
        loadGPXFiles()
      }
    }

    // Cesium 스크립트 로드
    if (!window.Cesium) {
      const script = document.createElement('script')
      script.src = 'https://cesium.com/downloads/cesiumjs/releases/1.113/Build/Cesium/Cesium.js'
      script.onload = loadCesium
      document.head.appendChild(script)

      return () => {
        // Cleanup
        if (viewerRef.current) {
          entitiesRef.current.forEach(entity => {
            viewerRef.current.entities.remove(entity)
          })
          entitiesRef.current = []
          viewerRef.current.destroy()
          viewerRef.current = null
        }
      }
    } else {
      loadCesium()
    }

    return () => {
      // Cleanup
      if (viewerRef.current) {
        entitiesRef.current.forEach(entity => {
          viewerRef.current.entities.remove(entity)
        })
        entitiesRef.current = []
        viewerRef.current.destroy()
        viewerRef.current = null
      }
    }
  }, [code, center, courses, name, onCourseClick])

  return (
    <div 
      ref={cesiumContainerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative'
      }}
    />
  )
}

export default CesiumMap


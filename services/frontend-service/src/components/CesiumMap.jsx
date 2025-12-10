import { useEffect, useRef, useState } from 'react'
import { API_URL } from '../utils/api'
import { convertArcGISToGeoJSON } from '../utils/coordinateTransform'

function CesiumMap({ 
  courses = [], 
  center = [36.5, 127.8], 
  code = null,
  name = '',
}) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)

  // flyTo 제어용
  const lastCodeRef = useRef(null)
  const hasInitialFlyRef = useRef(false)

  // Cesium 로드 상태를 useState로 관리
  const [cesiumLoaded, setCesiumLoaded] = useState(!!window.Cesium)
  
  // Viewer 준비 상태
  const [viewerReady, setViewerReady] = useState(false)

  // ------------ 1) Cesium 스크립트 로딩 (딱 1번) ----------------
  useEffect(() => {
    if (window.Cesium) {
      setCesiumLoaded(true)
      return
    }

    const script = document.createElement("script")
    script.src = "https://cesium.com/downloads/cesiumjs/releases/1.113/Build/Cesium/Cesium.js"
    script.onload = () => {
      setCesiumLoaded(true)
    }
    document.head.appendChild(script)
  }, [])

  // ------------ 2) Viewer 생성 (딱 1번만 실행) -----------------
  useEffect(() => {
    if (!cesiumLoaded) return
    if (!containerRef.current) return
    if (viewerRef.current) {
      setViewerReady(true)
      return
    }

    const Cesium = window.Cesium

    if (!import.meta.env.VITE_CESIUM_ACCESS_TOKEN) {
      console.error("[Cesium] 토큰이 없습니다")
      return
    }

    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ACCESS_TOKEN

    console.log("[Cesium] Viewer 생성")

    try {
      viewerRef.current = new Cesium.Viewer(containerRef.current, {
        terrain: Cesium.Terrain.fromWorldTerrain(),
        timeline: false,
        animation: false,
        vrButton: false,
        geocoder: false,
        homeButton: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        selectionIndicator: false,
        infoBox: false,
        shouldAnimate: false
      })
      
      setViewerReady(true)
    } catch (error) {
      console.error("[Cesium] Viewer 생성 실패:", error)
    }
  }, [cesiumLoaded])

  // ------------ 3) 데이터 로드 + flyTo 제어 -----------------
  useEffect(() => {
    // Viewer가 준비되지 않았으면 대기
    if (!viewerReady) return
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return

    const viewer = viewerRef.current
    const Cesium = window.Cesium

    console.log("[Cesium] 데이터 업데이트 실행:", { code, name })

    let cancelled = false

    // === 3-A) GPX 로드 시도 ===
    const loadGPX = async () => {
      if (!code || cancelled) return false
      
      const base = `${API_URL}/mountain/${code}_gpx`
      const nameCandidates = [
        name,
        name.replace(/산$/, ''),
        name.split(" ")[0]
      ].filter(Boolean)

      for (const nm of nameCandidates) {
        if (cancelled) return false
        
        const url = `${base}/PMNTN_${encodeURIComponent(nm)}_${code}.gpx`
        try {
          const res = await fetch(url)
          if (!res.ok) continue

          const text = await res.text()
          if (cancelled) return false

          const xml = new DOMParser().parseFromString(text, "text/xml")
          const trkpts = xml.getElementsByTagName("trkpt")
          const trksegs = xml.getElementsByTagName("trkseg")

          if (trkpts.length === 0 && trksegs.length === 0) continue

          const positions = []
          
          if (trksegs.length > 0) {
            for (let seg = 0; seg < trksegs.length; seg++) {
              const segPoints = trksegs[seg].getElementsByTagName("trkpt")
              for (let i = 0; i < segPoints.length; i++) {
                const pt = segPoints[i]
                const lat = parseFloat(pt.getAttribute("lat"))
                const lon = parseFloat(pt.getAttribute("lon"))
                const eleNode = pt.getElementsByTagName("ele")[0]
                const h = eleNode ? parseFloat(eleNode.textContent) : 0
                if (!isNaN(lat) && !isNaN(lon)) {
                  positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, h))
                }
              }
            }
          } else {
            for (let i = 0; i < trkpts.length; i++) {
              const pt = trkpts[i]
              const lat = parseFloat(pt.getAttribute("lat"))
              const lon = parseFloat(pt.getAttribute("lon"))
              const eleNode = pt.getElementsByTagName("ele")[0]
              const h = eleNode ? parseFloat(eleNode.textContent) : 0
              if (!isNaN(lat) && !isNaN(lon)) {
                positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, h))
              }
            }
          }

          if (positions.length > 0 && !cancelled) {
            viewer.entities.add({
              name: nm,
              polyline: {
                positions,
                width: 6,
                clampToGround: true,
                material: Cesium.Color.RED.withAlpha(0.95)
              }
            })
            console.log("[Cesium] GPX 로드 성공:", url)
            return true
          }
        } catch {
          continue
        }
      }
      return false
    }

    // === 3-B) GeoJSON 로드 ===
    const loadGeoJSON = () => {
      if (!courses.length || cancelled) return false

      console.log("[Cesium] GeoJSON 로드")
      let added = false
      courses.forEach((course, idx) => {
        if (cancelled) return
        
        let geometry = course.geometry
        if (geometry?.paths) {
          const gj = convertArcGISToGeoJSON({ features: [course] })
          geometry = gj.features[0]?.geometry
        }

        if (!geometry) return

        let coords = []
        if (geometry.type === "LineString") coords = geometry.coordinates
        else if (geometry.type === "MultiLineString") coords = geometry.coordinates.flat()
        else if (geometry.type === "Polygon") coords = geometry.coordinates[0]

        const positions = []
        coords.forEach((c) => {
          if (Array.isArray(c) && c.length >= 2) {
            positions.push(
              Cesium.Cartesian3.fromDegrees(
                parseFloat(c[0]),
                parseFloat(c[1]),
                c[2] ? parseFloat(c[2]) : 0
              )
            )
          }
        })

        if (positions.length > 0 && !cancelled) {
          viewer.entities.add({
            name: course.properties?.name || `코스 ${idx + 1}`,
            polyline: {
              positions,
              width: 6,
              clampToGround: true,
              material: Cesium.Color.ORANGE.withAlpha(0.95)
            }
          })
          added = true
        }
      })
      return added
    }

    // async wrapper
    const run = async () => {
      if (cancelled) return
      
      // 기존 엔티티 제거
      viewer.entities.removeAll()

      let ok = await loadGPX()
      if (!ok && !cancelled) {
        ok = loadGeoJSON()
      }

      if (ok && !cancelled) {
        // flyTo 규칙: 최초 1번 또는 code 변경 시에만
        const shouldFly = !hasInitialFlyRef.current || lastCodeRef.current !== code
        
        if (shouldFly) {
          console.log("[Cesium] flyTo 실행")
          hasInitialFlyRef.current = true
          lastCodeRef.current = code

          // 다음 프레임에 실행하여 렌더링 완료 후 flyTo
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!cancelled && viewerRef.current && !viewerRef.current.isDestroyed()) {
                viewerRef.current.flyTo(viewerRef.current.entities, {
                  duration: 2.0
                }).catch(() => {
                  // 취소는 무시
                })
              }
            })
          })
        }
      }
    }

    run()

    // cleanup
    return () => {
      cancelled = true
    }
  }, [code, viewerReady, courses.length]) // code와 viewerReady만 dependency

  // ------------ 4) 언마운트 시 Viewer 제거 -----------------
  useEffect(() => {
    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        console.log("[Cesium] Viewer 파괴")
        viewerRef.current.destroy()
        viewerRef.current = null
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: "500px",
        background: "#000"
      }}
    />
  )
}

export default CesiumMap

// 좌표 변환 유틸리티
// ArcGIS ITRF2000 TM → WGS84 변환

export function transformArcGISToWGS84(x, y) {
  // Proj4js는 동적으로 로드되어야 함
  const proj4 = window.proj4
  
  if (!proj4) {
    console.error('proj4js library not loaded')
    return null
  }

  if (x === null || x === undefined || y === null || y === undefined || 
      isNaN(x) || isNaN(y) || Math.abs(x) > 1000000 || Math.abs(y) > 1000000) {
    console.warn('Invalid input coordinates:', x, y)
    return null
  }

  let actualX = x
  if (x < 0) {
    actualX = 200000 + x
  } else if (x < 200000) {
    actualX = x
  }

  const sourceDef = '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +datum=WGS84 +units=m +no_defs'
  const targetDef = '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs'

  try {
    const result = proj4(sourceDef, targetDef, [actualX, y])
    const lon = result[0]
    const lat = result[1]

    // 좌표 유효성 검사 (한국 영역: 위도 33-43, 경도 124-132)
    if (lat >= 33 && lat <= 43 && lon >= 124 && lon <= 132) {
      return [lat, lon]
    } else {
      console.warn('Coordinates out of Korea range:', lat, lon, 'Input:', x, y)
      return null
    }
  } catch (e) {
    console.error('Coordinate transformation error:', e, 'Input:', x, y)
    return null
  }
}

export function convertArcGISToGeoJSON(arcgisData) {
  const features = arcgisData.features || []
  let validFeaturesCount = 0

  const geoJSONFeatures = features.map((feature) => {
    const attrs = feature.attributes || {}
    let geometry = null
    let validCoords = []

    if (feature.geometry) {
      if (feature.geometry.paths) {
        // Polyline (등산로)
        const paths = feature.geometry.paths

        paths.forEach((path) => {
          const convertedPath = []
          let validPointCount = 0

          path.forEach((point) => {
            if (Array.isArray(point) && point.length >= 2) {
              const x = Number(point[0])
              const y = Number(point[1])
              
              // 입력 좌표 검증 강화
              if (!Number.isFinite(x) || !Number.isFinite(y)) {
                return
              }
              
              const coords = transformArcGISToWGS84(x, y)

              // 변환 결과 검증 강화
              if (coords && Array.isArray(coords) && coords.length >= 2) {
                const lat = Number(coords[0])
                const lon = Number(coords[1])
                
                if (Number.isFinite(lat) && Number.isFinite(lon) &&
                    lat >= 15 && lat <= 55 && lon >= 110 && lon <= 150) {
                  // GeoJSON 형식: [lon, lat]
                  convertedPath.push([lon, lat])
                  validPointCount++
                }
              }
            }
          })

          if (convertedPath.length > 0) {
            validCoords.push(convertedPath)
          }
        })

        if (validCoords.length > 0) {
          geometry = {
            type: validCoords.length > 1 ? 'MultiLineString' : 'LineString',
            coordinates: validCoords.length > 1 ? validCoords : validCoords[0]
          }
        }
      } else if (feature.geometry.x !== undefined && feature.geometry.y !== undefined) {
        // Point
        const coords = transformArcGISToWGS84(feature.geometry.x, feature.geometry.y)
        if (coords) {
          geometry = {
            type: 'Point',
            coordinates: [coords[1], coords[0]]
          }
        }
      }
    }

    if (geometry) {
      validFeaturesCount++
      return {
        type: 'Feature',
        properties: attrs,
        geometry: geometry
      }
    }
    return null
  }).filter(f => f !== null)

  return {
    type: 'FeatureCollection',
    features: geoJSONFeatures
  }
}



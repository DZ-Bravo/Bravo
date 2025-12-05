import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import MountainDetail from '../components/MountainDetail'
import Header from '../components/Header'
import { MOUNTAIN_ROUTES } from '../utils/mountainRoutes'
import { API_URL } from '../utils/api'

// 산별 유래 정보 (필요시 확장 가능)
const MOUNTAIN_ORIGINS = {
  '287201304': `북한산은 한양(현재의 서울)의 북쪽에 위치한 산이라서 북한산(北漢山)이라고 불리게 되었습니다.

백제 시대에는 한산(漢山) 또는 부아악(負兒岳)이라고 불렸고, 고려 시대에는 삼각산(三角山)이라고 불렸습니다.

조선 시대에 한양을 수도로 정한 후, 한양의 북쪽에 위치한 이 산을 북한산이라고 부르기 시작했습니다. 북한산은 한양의 진산(鎭山)으로 여겨졌으며, 백운대, 인수봉, 만경대 등 세 개의 봉우리가 있어 삼각산이라는 이름도 유래되었습니다.

1983년 국립공원으로 지정되었으며, 현재는 수도권 지역에서 가장 많은 등산객들이 찾는 명산으로 자리잡았습니다.`,
  '428302602': `설악산은 눈처럼 하얀 바위가 많아서 설악산(雪嶽山)이라고 불리게 되었습니다.

고려 시대에는 설악산 또는 설봉산(雪峰山)이라고 불렸고, 조선 시대에는 설악산이라는 이름이 널리 사용되었습니다.

설악산은 대청봉(1,708m)을 주봉으로 하며, 한반도에서 가장 아름다운 산으로 유명합니다. 봄의 진달래, 여름의 푸른 숲, 가을의 단풍, 겨울의 설경으로 사계절 내내 아름다운 풍경을 자랑합니다.

1970년 국립공원으로 지정되었으며, 현재는 세계적으로도 유명한 관광지이자 등산 명소로 자리잡았습니다.`,
  '483100401': `계룡산은 충청남도에 위치한 산으로, 계룡산국립공원으로 지정되어 있습니다.

계룡산은 높이 845m로 충청남도의 대표적인 명산 중 하나입니다.`,
  '457300301': `덕유산은 전라북도에 위치한 산으로, 덕유산국립공원으로 지정되어 있습니다.

덕유산은 높이 1,614m로 전라북도의 대표적인 명산 중 하나입니다.`,
  '438001301': `소백산은 충청북도와 경상북도에 걸쳐 있는 산으로, 소백산국립공원으로 지정되어 있습니다.

소백산은 높이 1,439m로 충청북도의 대표적인 명산 중 하나입니다. 1987년 국립공원으로 지정되었으며, 아름다운 자연 경관으로 유명합니다.`,
  '111100101': `북악산은 서울특별시 종로구에 위치한 산으로, 서울의 대표적인 등산지입니다.

북악산은 높이 342m로 서울 시내에서 쉽게 접근할 수 있는 등산로가 잘 갖춰져 있습니다.`,
  '282601001': `금정산은 부산광역시에 위치한 산으로, 금정산성으로 유명합니다.

금정산은 높이 801m로 부산의 대표적인 명산 중 하나입니다.`,
  '287100601': `마니산은 인천광역시 강화군에 위치한 산으로, 마니산제단으로 유명합니다.

마니산은 높이 469m로 인천의 대표적인 명산 중 하나입니다.`
}

// 산별 상세 정보 (필요시 확장 가능)
const MOUNTAIN_INFO = {
  '287201304': {
    height: '836.5m',
    location: '서울',
    description: '서울특별시와 경기도에 걸쳐 있는 산으로, 서울의 대표적인 등산지입니다.'
  },
  '428302602': {
    height: '1,708m',
    location: '강원',
    description: '강원도에 위치한 한국의 대표적인 명산으로, 대청봉이 주봉입니다.'
  },
  '483100401': {
    height: '845m',
    location: '충남',
    description: '충청남도에 위치한 산으로, 계룡산국립공원으로 지정되어 있습니다.'
  },
  '457300301': {
    height: '1,614m',
    location: '전북',
    description: '전라북도에 위치한 산으로, 덕유산국립공원으로 지정되어 있습니다.'
  },
  '488605302': {
    height: '1,915m',
    location: '경남/전남',
    description: '지리산국립공원으로 지정된 한국의 대표적인 명산입니다.'
  },
  '421902904': {
    height: '1,566m',
    location: '강원',
    description: '강원도에 위치한 산으로, 태백산악훈련장이 있습니다.'
  },
  '438001301': {
    height: '1,439m',
    location: '충북',
    description: '충청북도에 위치한 산으로, 소백산국립공원으로 지정되어 있습니다.'
  },
  '111100101': {
    height: '342m',
    location: '서울',
    description: '서울특별시 종로구에 위치한 산으로, 서울의 대표적인 등산지입니다.'
  },
  '282601001': {
    height: '801m',
    location: '부산',
    description: '부산광역시에 위치한 산으로, 금정산성으로 유명합니다.'
  },
  '287100601': {
    height: '469m',
    location: '인천',
    description: '인천광역시 강화군에 위치한 산으로, 마니산제단으로 유명합니다.'
  }
}

function Mountain() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [mountainData, setMountainData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // 기존 URL 호환성: 산 이름으로 접근한 경우 코드로 변환
  const nameToCode = {
    'bukhansan': '287201304',
    'seoraksan': '428302602'
  }
  
  const actualCode = nameToCode[code] || code

  useEffect(() => {
    const fetchMountainData = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        // 먼저 API에서 Mountain_list 데이터 가져오기 시도
        console.log('산 상세 정보 요청 - code:', actualCode)
        const response = await fetch(`${API_URL}/api/mountains/${actualCode}`)
        console.log('API 응답 상태:', response.status)
        
        if (response.ok) {
          const data = await response.json()
          console.log('API 응답 데이터:', data)
          
          // 에러 응답인지 확인
          if (data.error) {
            console.error('API 에러:', data.error)
            throw new Error(data.error)
          }
          
          // 데이터가 있는지 확인
          if (!data.name) {
            console.warn('API 응답에 name이 없음:', data)
            throw new Error('산 정보를 찾을 수 없습니다')
          }
          
          // API에서 가져온 데이터로 설정
          setMountainData({
            name: data.name,
            code: data.code,
            height: data.height || '정보 없음',
            location: data.location || '정보 없음',
            description: data.description || '',
            center: data.center ? [data.center.lat, data.center.lon] : [36.5, 127.8],
            zoom: data.zoom || 13,
            origin: data.origin || ''
          })
        } else if (response.status === 404) {
          console.log('API 404 - 폴백 데이터 사용')
          // API에 없으면 기존 하드코딩된 데이터로 폴백
          const fallbackData = MOUNTAIN_ROUTES[actualCode]
          if (fallbackData) {
            const mountainInfo = MOUNTAIN_INFO[actualCode] || {
              height: '정보 없음',
              location: '정보 없음',
              description: ''
            }
            const origin = MOUNTAIN_ORIGINS[actualCode] || ''
            
            setMountainData({
              name: fallbackData.name,
              code: fallbackData.code,
              height: mountainInfo.height,
              location: mountainInfo.location,
              description: mountainInfo.description,
              center: fallbackData.center,
              zoom: fallbackData.zoom,
              origin: origin
            })
          } else {
            setError('산을 찾을 수 없습니다')
          }
        } else {
          throw new Error('산 정보를 불러오는데 실패했습니다')
        }
      } catch (err) {
        console.error('Error fetching mountain data:', err)
        // 에러 발생 시 기존 하드코딩된 데이터로 폴백
        const fallbackData = MOUNTAIN_ROUTES[actualCode]
        if (fallbackData) {
          const mountainInfo = MOUNTAIN_INFO[actualCode] || {
            height: '정보 없음',
            location: '정보 없음',
            description: ''
          }
          const origin = MOUNTAIN_ORIGINS[actualCode] || ''
          
          setMountainData({
            name: fallbackData.name,
            code: fallbackData.code,
            height: mountainInfo.height,
            location: mountainInfo.location,
            description: mountainInfo.description,
            center: fallbackData.center,
            zoom: fallbackData.zoom,
            origin: origin
          })
        } else {
          setError('산을 찾을 수 없습니다')
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchMountainData()
  }, [actualCode, API_URL])

  if (isLoading) {
    return (
      <div className="mountain-detail">
        <Header />
        <main>
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <h1>산 정보를 불러오는 중...</h1>
          </div>
        </main>
      </div>
    )
  }

  if (error || !mountainData) {
    return (
      <div className="mountain-detail">
        <Header />
        <main>
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <h1>{error || '산을 찾을 수 없습니다'}</h1>
          </div>
        </main>
      </div>
    )
  }

  return (
    <MountainDetail
      name={mountainData.name}
      code={mountainData.code}
      height={mountainData.height}
      location={mountainData.location}
      description={mountainData.description}
      center={mountainData.center}
      zoom={mountainData.zoom}
      origin={mountainData.origin}
    />
  )
}

export default Mountain


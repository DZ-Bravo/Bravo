import MountainDetail from '../components/MountainDetail'
import './MountainDetail.css'

const seoraksanOrigin = `설악산은 눈처럼 하얀 바위가 많아서 설악산(雪嶽山)이라고 불리게 되었습니다.

고려 시대에는 설악산 또는 설봉산(雪峰山)이라고 불렸고, 조선 시대에는 설악산이라는 이름이 널리 사용되었습니다.

설악산은 대청봉(1,708m)을 주봉으로 하며, 한반도에서 가장 아름다운 산으로 유명합니다. 봄의 진달래, 여름의 푸른 숲, 가을의 단풍, 겨울의 설경으로 사계절 내내 아름다운 풍경을 자랑합니다.

1970년 국립공원으로 지정되었으며, 현재는 세계적으로도 유명한 관광지이자 등산 명소로 자리잡았습니다.`

function Seoraksan() {
  return (
    <MountainDetail
      name="설악산"
      code="428302602"
      height="1,708m"
      location="강원"
      description="강원도에 위치한 한국의 대표적인 명산으로, 대청봉이 주봉입니다."
      center={[38.1214, 128.4656]}
      zoom={12}
      origin={seoraksanOrigin}
    />
  )
}

export default Seoraksan


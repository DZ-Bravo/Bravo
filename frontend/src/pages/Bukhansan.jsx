import MountainDetail from '../components/MountainDetail'
import './MountainDetail.css'

const bukhansanOrigin = `북한산은 한양(현재의 서울)의 북쪽에 위치한 산이라서 북한산(北漢山)이라고 불리게 되었습니다.

백제 시대에는 한산(漢山) 또는 부아악(負兒岳)이라고 불렸고, 고려 시대에는 삼각산(三角山)이라고 불렸습니다.

조선 시대에 한양을 수도로 정한 후, 한양의 북쪽에 위치한 이 산을 북한산이라고 부르기 시작했습니다. 북한산은 한양의 진산(鎭山)으로 여겨졌으며, 백운대, 인수봉, 만경대 등 세 개의 봉우리가 있어 삼각산이라는 이름도 유래되었습니다.

1983년 국립공원으로 지정되었으며, 현재는 수도권 지역에서 가장 많은 등산객들이 찾는 명산으로 자리잡았습니다.`

function Bukhansan() {
  return (
    <MountainDetail
      name="북한산"
      code="287201304"
      height="836.5m"
      location="서울"
      description="서울특별시와 경기도에 걸쳐 있는 산으로, 서울의 대표적인 등산지입니다."
      center={[37.6584, 126.9994]}
      zoom={13}
      origin={bukhansanOrigin}
    />
  )
}

export default Bukhansan


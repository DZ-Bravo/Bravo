import Header from '../components/Header'
import './MountainsMap.css'

function MountainsMap() {
  return (
    <div className="mountains-map-page">
      <Header />
      <main>
        <h1>전체 산 지도</h1>
        <div id="mountains-map" style={{ width: '100%', height: '600px' }}></div>
        <button className="list-view-btn">목록 보기</button>
      </main>
    </div>
  )
}

export default MountainsMap




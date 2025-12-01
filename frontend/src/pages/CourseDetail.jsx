import { useParams, Link } from 'react-router-dom'
import Header from '../components/Header'
import './CourseDetail.css'

function CourseDetail() {
  const { theme } = useParams()

  const courseData = {
    spring: {
      title: '봄 산행지',
      description: '따뜻한 봄날씨와 함께 만개한 꽃들을 감상하며 즐기는 산행 코스입니다.',
      courses: [
        {
          id: 1,
          name: '북한산 백운대 코스',
          location: '서울',
          difficulty: '중급',
          duration: '3-4시간',
          distance: '5.2km',
          description: '봄철 진달래와 철쭉이 아름다운 코스입니다.'
        },
        {
          id: 2,
          name: '설악산 대청봉 코스',
          location: '강원',
          difficulty: '고급',
          duration: '5-6시간',
          distance: '8.5km',
          description: '봄 단풍과 함께하는 설악산의 대표 코스입니다.'
        },
        {
          id: 3,
          name: '지리산 천왕봉 코스',
          location: '전남/경남',
          difficulty: '고급',
          duration: '6-7시간',
          distance: '10.2km',
          description: '봄의 신록이 아름다운 지리산 정상 코스입니다.'
        }
      ]
    },
    summer: {
      title: '여름 산행지',
      description: '시원한 계곡과 그늘진 숲길을 따라 즐기는 여름 산행 코스입니다.',
      courses: [
        {
          id: 1,
          name: '계룡산 동학사 코스',
          location: '충남',
          difficulty: '초급',
          duration: '2-3시간',
          distance: '4.1km',
          description: '시원한 계곡을 따라 걷는 여름 산행 코스입니다.'
        },
        {
          id: 2,
          name: '내장산 백양사 코스',
          location: '전북',
          difficulty: '중급',
          duration: '3-4시간',
          distance: '5.8km',
          description: '그늘진 숲길이 많은 여름 산행지입니다.'
        },
        {
          id: 3,
          name: '월악산 선암사 코스',
          location: '충북',
          difficulty: '중급',
          duration: '4-5시간',
          distance: '6.5km',
          description: '계곡과 폭포가 있는 시원한 여름 코스입니다.'
        }
      ]
    },
    autumn: {
      title: '가을 산행지',
      description: '단풍이 물든 가을 산을 감상하며 즐기는 산행 코스입니다.',
      courses: [
        {
          id: 1,
          name: '설악산 울산바위 코스',
          location: '강원',
          difficulty: '중급',
          duration: '4-5시간',
          distance: '7.2km',
          description: '가을 단풍이 유명한 설악산의 대표 코스입니다.'
        },
        {
          id: 2,
          name: '내장산 단풍 코스',
          location: '전북',
          difficulty: '초급',
          duration: '2-3시간',
          distance: '3.5km',
          description: '한국 3대 단풍 명소 중 하나인 내장산 코스입니다.'
        },
        {
          id: 3,
          name: '지리산 단풍길 코스',
          location: '전남/경남',
          difficulty: '중급',
          duration: '5-6시간',
          distance: '8.0km',
          description: '가을 단풍이 장관인 지리산 코스입니다.'
        }
      ]
    },
    winter: {
      title: '겨울 산행지',
      description: '설경과 함께하는 겨울 산행 코스입니다.',
      courses: [
        {
          id: 1,
          name: '설악산 대청봉 설경 코스',
          location: '강원',
          difficulty: '고급',
          duration: '6-7시간',
          distance: '9.5km',
          description: '겨울 설경이 아름다운 설악산 정상 코스입니다.'
        },
        {
          id: 2,
          name: '한라산 설국 코스',
          location: '제주',
          difficulty: '중급',
          duration: '5-6시간',
          distance: '7.8km',
          description: '제주도 한라산의 겨울 설경을 감상하는 코스입니다.'
        },
        {
          id: 3,
          name: '지리산 설경 코스',
          location: '전남/경남',
          difficulty: '고급',
          duration: '7-8시간',
          distance: '11.2km',
          description: '겨울 설경이 장관인 지리산 코스입니다.'
        }
      ]
    },
    sunrise: {
      title: '일출 명소 베스트 코스',
      description: '일출을 감상하기 좋은 명소들을 모은 코스입니다.',
      courses: [
        {
          id: 1,
          name: '한라산 일출 코스',
          location: '제주',
          difficulty: '중급',
          duration: '5-6시간',
          distance: '7.8km',
          description: '한국에서 가장 유명한 일출 명소 중 하나입니다.'
        },
        {
          id: 2,
          name: '설악산 대청봉 일출 코스',
          location: '강원',
          difficulty: '고급',
          duration: '6-7시간',
          distance: '9.5km',
          description: '동해 바다 위로 떠오르는 일출이 장관입니다.'
        },
        {
          id: 3,
          name: '지리산 천왕봉 일출 코스',
          location: '전남/경남',
          difficulty: '고급',
          duration: '7-8시간',
          distance: '11.2km',
          description: '남한 최고봉에서 보는 일출은 잊을 수 없습니다.'
        }
      ]
    },
    beginner: {
      title: '초보자 추천 코스',
      description: '등산 초보자도 안전하게 즐길 수 있는 코스입니다.',
      courses: [
        {
          id: 1,
          name: '북한산 우이동 코스',
          location: '서울',
          difficulty: '초급',
          duration: '2-3시간',
          distance: '3.5km',
          description: '초보자에게 가장 추천하는 서울 근교 코스입니다.'
        },
        {
          id: 2,
          name: '관악산 코스',
          location: '서울',
          difficulty: '초급',
          duration: '2-3시간',
          distance: '4.2km',
          description: '서울 시내에서 접근하기 쉬운 초보자 코스입니다.'
        },
        {
          id: 3,
          name: '계룡산 동학사 코스',
          location: '충남',
          difficulty: '초급',
          duration: '2-3시간',
          distance: '4.1km',
          description: '완만한 경사로 초보자에게 적합한 코스입니다.'
        }
      ]
    }
  }

  const course = courseData[theme] || courseData.spring

  return (
    <div className="course-detail-page">
      <Header />
      <main className="course-detail-main">
        <div className="course-detail-container">
          <Link to="/" className="back-link">← 홈으로</Link>
          
          <div className="course-header">
            <h1 className="course-title">{course.title}</h1>
            <p className="course-description">{course.description}</p>
          </div>

          <div className="courses-list">
            {course.courses.map((item) => (
              <div key={item.id} className="course-item">
                <div className="course-item-header">
                  <h3 className="course-item-name">{item.name}</h3>
                  <span className="course-item-location">{item.location}</span>
                </div>
                <div className="course-item-info">
                  <div className="info-item">
                    <span className="info-label">난이도</span>
                    <span className={`info-value difficulty-${item.difficulty === '초급' ? 'easy' : item.difficulty === '중급' ? 'medium' : 'hard'}`}>
                      {item.difficulty}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">소요시간</span>
                    <span className="info-value">{item.duration}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">거리</span>
                    <span className="info-value">{item.distance}</span>
                  </div>
                </div>
                <p className="course-item-description">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

export default CourseDetail


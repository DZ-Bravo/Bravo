# 오늘의 등산 웹사이트 프로젝트(Good morning)-test1

React 프론트엔드와 Node.js 백엔드로 구성된 등산 정보 웹사이트 프로젝트입니다.test

## 프로젝트 구조

```
LABs/hiking/
├── frontend/          # React 프론트엔드
│   ├── src/
│   │   ├── components/    # React 컴포넌트
│   │   ├── pages/         # 페이지 컴포넌트
│   │   ├── utils/         # 유틸리티 함수
│   │   └── assets/        # 정적 자산
│   ├── Dockerfile
│   └── package.json
├── backend/           # Node.js 백엔드
│   ├── utils/        # 유틸리티 함수
│   ├── server.js     # Express 서버
│   ├── Dockerfile
│   └── package.json
├── mountain/         # GeoJSON 데이터 폴더
├── docker-compose.yml
└── README.md
```

## 기술 스택

### Frontend
- **React 18** - UI 라이브러리
- **React Router** - 라우팅
- **Vite** - 빌드 도구
- **Leaflet.js** - 지도 라이브러리
- **Proj4js** - 좌표 변환

### Backend
- **Node.js** - 런타임 환경
- **Express** - 웹 프레임워크
- **MongoDB** - 데이터베이스
- **Mongoose** - MongoDB ODM
- **CORS** - Cross-Origin Resource Sharing

## Docker Compose로 실행하기 (권장)

### 1. Docker와 Docker Compose 설치 확인

```bash
docker --version
docker-compose --version
```

설치되어 있지 않다면:
```bash
sudo apt update
sudo apt install -y docker.io docker-compose
sudo usermod -aG docker $USER
# 로그아웃 후 다시 로그인 필요
```

### 2. 프로젝트 실행

```bash
cd /home/kevin/LABs/hiking
docker-compose up --build
```

또는 백그라운드로 실행:
```bash
docker-compose up -d --build
```

### 3. 접속

- **프론트엔드**: `http://localhost:3000`
- **백엔드 API**: `http://localhost:5000/api/mountains`
- **MongoDB**: `mongodb://admin:admin123@localhost:27017/hiking?authSource=admin`

### 4. 중지

```bash
docker-compose down
```

### 5. 데이터베이스 초기화 (필요시)

```bash
docker-compose down -v  # 볼륨까지 삭제
docker-compose up -d --build
```

## 로컬 개발 환경 설정

### 1. Frontend 설정

```bash
cd LABs/hiking/frontend
npm install
npm run dev
```

프론트엔드는 `http://localhost:3000`에서 실행됩니다.

### 2. Backend 설정

```bash
cd LABs/hiking/backend
npm install
npm start
```

백엔드는 `http://localhost:5000`에서 실행됩니다.

### 개발 모드

백엔드를 개발 모드로 실행하려면:

```bash
cd LABs/hiking/backend
npm run dev
```

## API 엔드포인트

### GET /api/mountains
모든 산 목록을 가져옵니다.

**응답:**
```json
{
  "mountains": [
    { "code": "287201304", "name": "북한산" },
    { "code": "428302602", "name": "설악산" }
  ]
}
```

### GET /api/mountains/:code/courses
특정 산의 등산 코스 정보를 가져옵니다.

**파라미터:**
- `code`: 산 코드 (예: "287201304")

**응답:**
```json
{
  "code": "287201304",
  "name": "북한산",
  "courses": [...]
}
```

### GET /api/mountains/:code/spots
특정 산의 등산 지점 정보를 가져옵니다.

**파라미터:**
- `code`: 산 코드 (예: "287201304")

**응답:**
```json
{
  "code": "287201304",
  "name": "북한산",
  "spots": [...]
}
```

## 주요 기능

### 1. 메인 페이지
- 등산 정보 및 코스 추천
- 테마별 코스 큐레이션
- 인기 산 목록

### 2. 산 상세 페이지
- 산 정보 및 유래
  - 실시간 통제정보 및 CCTV 링크
  - 날씨 정보
- 등산 코스 지도
  - 등산 코스 목록

### 3. 지도 기능
- Leaflet.js를 사용한 인터랙티브 지도
- 등산 코스 경로 표시 (GeoJSON)
- 등산 지점 마커 표시
- 좌표 변환 (ArcGIS → WGS84)

## 환경 변수

### Frontend
- `VITE_API_URL`: 백엔드 API URL (기본값: `http://localhost:5000`)

### Backend
- `PORT`: 서버 포트 (기본값: 5000)
- `NODE_ENV`: 환경 설정 (development/production)
- `MONGODB_URI`: MongoDB 연결 URI (기본값: `mongodb://admin:admin123@mongodb:27017/hiking?authSource=admin`)

`.env` 파일을 생성하여 설정할 수 있습니다. `backend/.env.example` 파일을 참고하세요.

## 데이터 파일

- `mountain/`: 각 산의 GeoJSON 데이터 (등산 코스 경로)
- `backend/utils/mountainRoutes.js`: 산별 라우트 정보

## 개발 가이드

### 컴포넌트 구조

```
src/
├── components/        # 재사용 가능한 컴포넌트
│   ├── Header.jsx
│   └── MountainDetail.jsx
├── pages/            # 페이지 컴포넌트
│   ├── Home.jsx
│   ├── Bukhansan.jsx
│   ├── Seoraksan.jsx
│   └── MountainsMap.jsx
└── utils/            # 유틸리티 함수
```

### 스타일링

각 컴포넌트는 자체 CSS 파일을 가지고 있습니다:
- `ComponentName.jsx` → `ComponentName.css`

CSS 변수는 `src/index.css`에 정의되어 있습니다.

## 배포

### Docker Compose로 프로덕션 빌드

```bash
docker-compose -f docker-compose.prod.yml up --build
```

### Frontend 빌드

```bash
cd LABs/hiking/frontend
npm run build
```

빌드된 파일은 `dist/` 폴더에 생성됩니다.

## 문제 해결

### 포트가 이미 사용 중인 경우

`docker-compose.yml`에서 포트를 변경하세요:
```yaml
ports:
  - "3001:3000"  # 프론트엔드
  - "5001:5000"  # 백엔드
```

### 컨테이너 로그 확인

```bash
docker-compose logs -f
```

### 컨테이너 재시작

```bash
docker-compose restart
```

## 참고 사항

- 공공데이터 API는 CORS 제한으로 인해 백엔드를 통해 호출해야 합니다.
- GeoJSON 데이터는 로컬 파일로 관리됩니다.
- 좌표 변환은 Proj4js를 사용하여 ArcGIS ITRF2000 TM → WGS84로 변환합니다.
- Docker Compose를 사용하면 개발 환경이 일관되게 유지됩니다.

## 라이선스

이 프로젝트는 개인 프로젝트입니다.

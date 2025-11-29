# 오늘의 등산 웹사이트

등산 정보 및 코스 추천 웹사이트 프로젝트

## 프로젝트 구조

```
hiking-website/
├── index.html              # 메인 페이지 (홈페이지)
├── bukhansan.html          # 북한산 상세 페이지
├── seoraksan.html          # 설악산 상세 페이지
├── mountains-map.html      # 전체 산 지도 페이지
├── mountain-routes.js      # 산별 라우트 정보 (JavaScript)
├── mountain-codes.json    # 산 코드 정보 (JSON)
├── bukhansan-course.json   # 북한산 코스 데이터 (백업)
├── bukhansan-spot.json     # 북한산 지점 데이터 (백업)
├── mountain/               # 산별 GeoJSON 데이터 폴더
│   ├── 287201304_geojson/  # 북한산 GeoJSON 파일
│   ├── 428302602_geojson/  # 설악산 GeoJSON 파일
│   └── ...                 # 기타 산들의 GeoJSON 데이터
└── README.md               # 프로젝트 설명서 (이 파일)
```

## 주요 기능

### 1. 메인 페이지 (index.html)
- 등산 정보 및 코스 추천
- 테마별 코스 큐레이션 (봄/여름/가을/겨울 산행지)
- 인기 산 목록
- AI 등산 코스 추천 메뉴

### 2. 산 상세 페이지
- **bukhansan.html**: 북한산 상세 정보
  - 산 유래 정보
  - 실시간 통제정보 및 CCTV 링크
  - 날씨 정보
  - 등산 코스 지도 (Leaflet.js 사용)
  - 등산 코스 목록

- **seoraksan.html**: 설악산 상세 정보
  - 북한산과 동일한 구조

### 3. 지도 기능
- Leaflet.js를 사용한 인터랙티브 지도
- 등산 코스 경로 표시 (GeoJSON)
- 등산 지점 마커 표시
- 좌표 변환 (ArcGIS → WGS84)

### 4. 데이터 파일
- **mountain-routes.js**: 산별 라우트 정보 (코드, 이름, GeoJSON 경로, 지도 중심 좌표)
- **mountain-codes.json**: 산 코드 정보
- **mountain/**: 각 산의 GeoJSON 데이터 (등산 코스 경로)

## 실행 방법

### 로컬 서버 실행

```bash
cd /home/kevin/hiking-website
python3 -m http.server 8000 --bind 0.0.0.0
```

또는 다른 포트 사용:

```bash
python3 -m http.server 8001 --bind 0.0.0.0
```

### 접속

- 로컬: `http://localhost:8000`
- 네트워크: `http://[서버IP]:8000`

## 사용된 기술

- **HTML5/CSS3**: 웹 페이지 구조 및 스타일링
- **JavaScript**: 동적 기능 구현
- **Leaflet.js**: 지도 라이브러리
- **Proj4js**: 좌표 변환 라이브러리
- **GeoJSON**: 지리 데이터 형식
- **공공데이터 API**: 등산 코스 정보 (한국 산림청)

## 주요 기능 상세

### 지도 기능
- OpenStreetMap 타일 사용
- 등산 코스 경로 표시 (Polyline)
- 등산 지점 마커 표시
- 지도 줌 및 팬 기능

### 좌표 변환
- ArcGIS ITRF2000 TM 좌표계 → WGS84 변환
- Proj4js 라이브러리 사용
- 한국 중부원점 (EPSG:5186) 지원

## 파일 설명

### HTML 파일
- `index.html`: 메인 랜딩 페이지
- `bukhansan.html`: 북한산 상세 페이지
- `seoraksan.html`: 설악산 상세 페이지
- `mountains-map.html`: 전체 산 지도 페이지

### JavaScript 파일
- `mountain-routes.js`: 산별 라우트 정보 객체

### JSON 파일
- `mountain-codes.json`: 산 코드 매핑
- `bukhansan-course.json`: 북한산 코스 데이터 (백업)
- `bukhansan-spot.json`: 북한산 지점 데이터 (백업)

### 데이터 폴더
- `mountain/`: 각 산의 GeoJSON 데이터
  - `[산코드]_geojson/`: 각 산의 등산 코스 및 지점 GeoJSON 파일

## 참고 사항

- 공공데이터 API는 CORS 제한으로 인해 브라우저에서 직접 호출이 어려울 수 있습니다.
- 로컬 GeoJSON 파일을 백업으로 사용합니다.
- HTTP 환경에서는 일부 브라우저 기능(예: GPS)이 제한될 수 있습니다.

## 업데이트 내역

- GPS 기능 제거 (2024)
- 북한산, 설악산 상세 페이지 추가
- 지도 기능 및 등산 코스 표시 구현
- 좌표 변환 기능 구현


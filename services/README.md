# MSA 서비스 구조

## ✅ 완료된 작업 (5가지)

1. ✅ **프론트/백 서비스별 폴더 분리**
2. ✅ **각 서비스 Dockerfile 생성(경량화)**
3. ✅ **docker-compose로 각 서비스 따로 기동**
4. ✅ **HAProxy로 로드밸런서**
5. ✅ **Traefik API Gateway Docker 라벨 기반 자동 라우팅**

## 서비스 목록

### Frontend
- **frontend-service**: React 프론트엔드 (Nginx로 서빙)

### Backend Services (9개)
1. **auth-service** (포트: 3001) - 회원가입, 인증
2. **community-service** (포트: 3002) - 커뮤니티 게시글
3. **notice-service** (포트: 3003) - 공지사항
4. **schedule-service** (포트: 3004) - 등산 일정
5. **notification-service** (포트: 3005) - 알림
6. **store-service** (포트: 3006) - 스토어
7. **chatbot-service** (포트: 3007) - 챗봇
8. **mountain-service** (포트: 3008) - 산 정보, 코스, 날씨
9. **ai-service** (포트: 3009) - AI 등산코스 추천

## 공유 리소스

- **shared/models/**: 공유 모델 (User, Post, Schedule 등)
- **shared/config/**: 공유 설정 (database.js 등)
- **shared/utils/**: 공유 유틸리티 (auth.js, mountainRoutes.js 등)

## 🚀 실행 방법

### 전체 서비스 한번에 실행

```bash
cd /home/bravo/LABs/services
docker-compose up -d --build
```

**이제 `docker-compose up -d`만 하면 모든 서비스가 연결됩니다!**

## 📍 접속 주소

### 로컬 환경
- **메인 진입점**: http://localhost 또는 http://127.0.0.1
- **HAProxy Stats**: http://localhost:8404/stats
- **Traefik Dashboard**: http://localhost:8080

### VM 환경 (192.168.0.242)
- **메인 진입점**: http://192.168.0.242 또는 http://192.168.0.242:80
- **HAProxy Stats**: http://192.168.0.242:8404/stats
- **Traefik Dashboard**: http://192.168.0.242:8080

### 서비스 접속 경로

모든 요청은 **HAProxy (포트 80)**를 통해 들어옵니다:

- **Frontend**: http://192.168.0.242/ (HAProxy → Frontend)
- **Auth API**: http://192.168.0.242/api/auth (HAProxy → Traefik → Auth Service)
- **Community API**: http://192.168.0.242/api/posts (HAProxy → Traefik → Community Service)
- **Notice API**: http://192.168.0.242/api/notices (HAProxy → Traefik → Notice Service)
- **Schedule API**: http://192.168.0.242/api/schedules (HAProxy → Traefik → Schedule Service)
- **Notification API**: http://192.168.0.242/api/notifications (HAProxy → Traefik → Notification Service)
- **Store API**: http://192.168.0.242/api/store (HAProxy → Traefik → Store Service)
- **Chatbot API**: http://192.168.0.242/api/chatbot (HAProxy → Traefik → Chatbot Service)
- **Mountain API**: http://192.168.0.242/api/mountains (HAProxy → Traefik → Mountain Service)
- **AI API**: http://192.168.0.242/api/ai (HAProxy → Traefik → AI Service)

## 아키텍처 흐름

```
클라이언트
  ↓
HAProxy (포트 80) - 최상단 로드밸런서
  ↓
  ├─ Frontend (/) → Frontend Service
  └─ API (/api/*) → Traefik (API Gateway)
                    ↓
                    ├─ /api/auth → Auth Service (3001)
                    ├─ /api/posts → Community Service (3002)
                    ├─ /api/notices → Notice Service (3003)
                    ├─ /api/schedules → Schedule Service (3004)
                    ├─ /api/notifications → Notification Service (3005)
                    ├─ /api/store → Store Service (3006)
                    ├─ /api/chatbot → Chatbot Service (3007)
                    ├─ /api/mountains → Mountain Service (3008)
                    └─ /api/ai → AI Service (3009)
```

## 유용한 명령어

```bash
# 서비스 상태 확인
docker-compose ps

# 특정 서비스 로그 확인
docker-compose logs -f auth-service

# 특정 서비스만 재시작
docker-compose restart auth-service

# 전체 서비스 중지
docker-compose down

# 볼륨까지 삭제
docker-compose down -v
```

## Dockerfile 특징

### Frontend Service
- 멀티 스테이지 빌드 사용
- 빌드 스테이지: Node.js로 빌드
- 프로덕션 스테이지: Nginx Alpine로 정적 파일 서빙
- 이미지 크기 최적화

### Backend Services
- Node.js 18 Alpine 기반
- 프로덕션 의존성만 설치
- 공유 리소스(shared) 포함
- 불필요한 파일 제거
- 경량화된 이미지

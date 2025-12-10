# 빌드 스테이지
FROM node:18-alpine AS builder

WORKDIR /app

# timezone 설정
RUN apk add --no-cache tzdata && \
    ln -snf /usr/share/zoneinfo/Asia/Seoul /etc/localtime && \
    echo "Asia/Seoul" > /etc/timezone

# 빌드 인자 받기
ARG VITE_KAKAO_MAP_API_KEY
ENV VITE_KAKAO_MAP_API_KEY=${VITE_KAKAO_MAP_API_KEY}
ARG VITE_CESIUM_ACCESS_TOKEN
ENV VITE_CESIUM_ACCESS_TOKEN=${VITE_CESIUM_ACCESS_TOKEN}

# 빌드 시 환경 변수 확인 (디버깅용)
RUN if [ -z "$VITE_CESIUM_ACCESS_TOKEN" ]; then echo "WARNING: VITE_CESIUM_ACCESS_TOKEN is empty"; else echo "VITE_CESIUM_ACCESS_TOKEN is set (length: ${#VITE_CESIUM_ACCESS_TOKEN})"; fi

# package.json 복사 및 의존성 설치
COPY package*.json ./
RUN npm install

# 소스 코드 복사 및 빌드
COPY . .
RUN npm run build

# 프로덕션 스테이지
FROM node:18-alpine

WORKDIR /app

# timezone 설정
RUN apk add --no-cache tzdata && \
    ln -snf /usr/share/zoneinfo/Asia/Seoul /etc/localtime && \
    echo "Asia/Seoul" > /etc/timezone

# 프로덕션 의존성만 설치
COPY package*.json ./
RUN npm install --omit=dev

# 빌드된 파일 및 서버 파일 복사
COPY --from=builder /app/dist ./dist
COPY server.js ./

# 포트 노출
EXPOSE 80

# Express 서버 실행
CMD ["node", "server.js"]

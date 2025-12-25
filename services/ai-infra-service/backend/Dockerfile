FROM node:18-alpine

WORKDIR /app

# timezone 설정
RUN apk add --no-cache tzdata && \
    ln -snf /usr/share/zoneinfo/Asia/Seoul /etc/localtime && \
    echo "Asia/Seoul" > /etc/timezone

# Puppeteer를 위한 의존성 설치
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Puppeteer가 Chromium을 사용하도록 환경 변수 설정
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# package.json 복사 및 의존성 설치
COPY package*.json ./
RUN npm install --omit=dev && \
    npm cache clean --force

# 애플리케이션 코드 복사
COPY . .

# 리포트 및 임시 파일용 디렉토리 생성
RUN mkdir -p /tmp/reports

# 포트 노출
EXPOSE 3011

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3011/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 프로덕션 모드로 실행
CMD ["node", "server.js"]



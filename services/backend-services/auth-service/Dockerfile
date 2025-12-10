FROM node:18-alpine

WORKDIR /app

# timezone 설정
RUN apk add --no-cache tzdata && \
    ln -snf /usr/share/zoneinfo/Asia/Seoul /etc/localtime && \
    echo "Asia/Seoul" > /etc/timezone

# 공유 리소스 복사
COPY shared ./shared

# package.json 복사 및 의존성 설치 (프로덕션만)
COPY backend-services/auth-service/package*.json ./
RUN npm install --omit=dev && \
    npm cache clean --force

# 애플리케이션 코드 복사
COPY backend-services/auth-service/ .

# uploads 디렉토리 생성
RUN mkdir -p uploads/profiles uploads/posts

# 불필요한 파일 제거
RUN rm -rf node_modules/.cache && \
    find . -name "*.md" -type f -delete && \
    find . -name ".git*" -type f -delete 2>/dev/null || true

# 포트 노출
EXPOSE 3001

# 프로덕션 모드로 실행
CMD ["node", "server.js"]

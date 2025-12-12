FROM node:18-alpine

WORKDIR /app

# timezone data 설치 후 KST로 고정
RUN apk add --no-cache tzdata && \
    ln -snf /usr/share/zoneinfo/Asia/Seoul /etc/localtime && \
    echo "Asia/Seoul" > /etc/timezone

# package.json과 package-lock.json 복사
COPY package*.json ./

# 의존성 설치
RUN npm install

# 애플리케이션 코드 복사
COPY . .

# 포트 노출
EXPOSE 3000

# 개발 모드로 실행
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# OpenWeather 아이콘 정리

이 폴더는 **OpenWeather 날씨 아이콘 코드(18개)** 에 대응하는  
SVG 아이콘 파일을 모아둔 곳입니다.

- 프로젝트 루트: `/home/bravo/LABs/hiking`
- 아이콘 폴더: `/home/bravo/LABs/hiking/Weather_icon`
- 이 폴더 안에는 다음과 같은 파일들이 있음:

\`\`\`bash
01d.svg  01n.svg  02d.svg  02n.svg  03d.svg  03n.svg
04d.svg  04n.svg  09d.svg  09n.svg  10d.svg  10n.svg
11d.svg  11n.svg  13d.svg  13n.svg  50d.svg  50n.svg
\`\`\`

- **파일 이름 = OpenWeather \`icon\` 코드와 1:1로 동일**  
  - 예: OpenWeather 응답 \`icon: "03d"\` → 이 폴더의 \`03d.svg\` 사용

---

## 아이콘 목록

### 01 – 완전 맑음 (Clear sky)

| 코드 | 파일명  | 설명                         |
|------|---------|------------------------------|
| 01d  | 01d.svg | 맑음 (한낮, 구름 없음)       |
| 01n  | 01n.svg | 맑음 (밤, 구름 없음)         |

---

### 02 – 구름 조금 (Few clouds)

| 코드 | 파일명  | 설명                         |
|------|---------|------------------------------|
| 02d  | 02d.svg | 구름 조금 (해 + 구름)        |
| 02n  | 02n.svg | 구름 조금 (달 + 구름)        |

---

### 03 – 산발적 구름 (Scattered clouds)

| 코드 | 파일명  | 설명                            |
|------|---------|---------------------------------|
| 03d  | 03d.svg | 드문드문 구름, 하늘 반쯤 구름   |
| 03n  | 03n.svg | 밤, 드문드문 구름               |

---

### 04 – 흐림 (Broken / Overcast clouds)

| 코드 | 파일명  | 설명                     |
|------|---------|--------------------------|
| 04d  | 04d.svg | 대체로 흐림, 구름 두껍게 |
| 04n  | 04n.svg | 밤, 거의 흐림            |

---

### 09 – 소나기 (Shower rain)

| 코드 | 파일명  | 설명                          |
|------|---------|-------------------------------|
| 09d  | 09d.svg | 소나기 (짧고 세게 오는 비)    |
| 09n  | 09n.svg | 밤 소나기                     |

---

### 10 – 비 (Rain)

| 코드 | 파일명  | 설명                                   |
|------|---------|----------------------------------------|
| 10d  | 10d.svg | 일반적인 비 (보통 비, 가랑비~중간)     |
| 10n  | 10n.svg | 밤에 내리는 비                         |

---

### 11 – 천둥번개 (Thunderstorm)

| 코드 | 파일명  | 설명                  |
|------|---------|-----------------------|
| 11d  | 11d.svg | 천둥/번개 동반한 비   |
| 11n  | 11n.svg | 밤 천둥/번개          |

---

### 13 – 눈 (Snow)

| 코드 | 파일명  | 설명                                        |
|------|---------|---------------------------------------------|
| 13d  | 13d.svg | 눈 (약한 눈, 강한 눈, 소나기 눈 모두 포함) |
| 13n  | 13n.svg | 밤 눈                                       |

---

### 50 – 안개 / 연무 / 먼지 (Mist etc.)

| 코드 | 파일명  | 설명                                      |
|------|---------|-------------------------------------------|
| 50d  | 50d.svg | 안개, 연무, 박무, 먼지, 스모그 등 (7xx 계열) |
| 50n  | 50n.svg | 밤 안개/연무                               |

---

## Express 정적 경로 설정 예시

프로젝트 루트: \`/home/bravo/LABs/hiking\`  
서버 파일(예: \`server.js\`)도 루트에 있다고 가정.

### ES Module (\`import\` 사용하는 경우)

\`\`\`js
// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

// __dirname 계산
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// /icons → Weather_icon 폴더 매핑
// 실제 경로: /home/bravo/LABs/hiking/Weather_icon
app.use("/icons", express.static(path.join(__dirname, "Weather_icon")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server listening on http://localhost:\${PORT}\`);
});
\`\`\`

### CommonJS (\`require\` 사용하는 경우)

\`\`\`js
// server.js
const express = require("express");
const path = require("path");

const app = express();

// /icons → Weather_icon 폴더 매핑
// 실제 경로: /home/bravo/LABs/hiking/Weather_icon
app.use("/icons", express.static(path.join(__dirname, "Weather_icon")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server listening on http://localhost:\${PORT}\`);
});
\`\`\`

서버가 실행 중일 때, 브라우저에서:

- \`http://localhost:3000/icons/01d.svg\`
- \`http://localhost:3000/icons/03n.svg\`

와 같이 접속했을 때 SVG 아이콘이 보이면 정상 동작.

---

## 사용 예시 (ICON_MAP)

OpenWeather \`icon\` 코드와 이 폴더의 파일명을 1:1로 쓰는 매핑 예시:

\`\`\`js
const ICON_MAP = {
  "01d": "/icons/01d.svg",
  "01n": "/icons/01n.svg",
  "02d": "/icons/02d.svg",
  "02n": "/icons/02n.svg",
  "03d": "/icons/03d.svg",
  "03n": "/icons/03n.svg",
  "04d": "/icons/04d.svg",
  "04n": "/icons/04n.svg",
  "09d": "/icons/09d.svg",
  "09n": "/icons/09n.svg",
  "10d": "/icons/10d.svg",
  "10n": "/icons/10n.svg",
  "11d": "/icons/11d.svg",
  "11n": "/icons/11n.svg",
  "13d": "/icons/13d.svg",
  "13n": "/icons/13n.svg",
  "50d": "/icons/50d.svg",
  "50n": "/icons/50n.svg"
};
\`\`\`

OpenWeather 응답 예시:

\`\`\`json
"weather": [
  {
    "icon": "03d",
    "description": "구름조금"
  }
]
\`\`\`

사용 예:

\`\`\`js
const iconCode = weather[0].icon;   // "03d"
const iconUrl  = ICON_MAP[iconCode]; // "/icons/03d.svg"

// 템플릿/프론트에서 사용
// <img src={iconUrl} alt={weather[0].description} />
\`\`\`

> 요약:  
> - 이 폴더에는 \`01d.svg\` ~ \`50n.svg\` 파일이 들어 있고  
> - Express에서 \`/icons\` 로 매핑해서  
> - 코드에서는 \`ICON_MAP[icon]\` 또는 \`/icons/\${icon}.svg\` 로 직접 사용한다.


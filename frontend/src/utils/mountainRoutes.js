// 산별 라우트 정보 (프론트엔드용)
export const MOUNTAIN_ROUTES = {
  '287201304': {
    name: '북한산',
    code: '287201304',
    courseFile: '/mountain/287201304_geojson/PMNTN_100고지_287201304.json',
    spotFile: '/mountain/287201304_geojson/PMNTN_SPOT_100고지_287201304.json',
    center: [37.6584, 126.9994],
    zoom: 13
  },
  '428302602': {
    name: '설악산',
    code: '428302602',
    courseFile: '/mountain/428302602_geojson/PMNTN_설악산_대청봉_428302602.json',
    spotFile: '/mountain/428302602_geojson/PMNTN_SPOT_설악산_대청봉_428302602.json',
    center: [38.1214, 128.4656],
    zoom: 12
  },
  '483100401': {
    name: '계룡산',
    code: '483100401',
    courseFile: '/mountain/483100401_geojson/PMNTN_계룡산_483100401.json',
    spotFile: '/mountain/483100401_geojson/PMNTN_SPOT_계룡산_483100401.json',
    center: [36.3617, 127.2067],
    zoom: 13
  },
  '457300301': {
    name: '덕유산',
    code: '457300301',
    courseFile: '/mountain/457300301_geojson/PMNTN_남덕유산_457300301.json',
    spotFile: '/mountain/457300301_geojson/PMNTN_SPOT_남덕유산_457300301.json',
    center: [35.8667, 127.7333],
    zoom: 13
  },
  '488605302': {
    name: '지리산',
    code: '488605302',
    courseFile: '/mountain/488605302_geojson/PMNTN_지리산_천왕봉_488605302.json',
    spotFile: '/mountain/488605302_geojson/PMNTN_SPOT_지리산_천왕봉_488605302.json',
    center: [35.3333, 127.7333],
    zoom: 12
  },
  '421902904': {
    name: '태백산',
    code: '421902904',
    courseFile: '/mountain/421902904_geojson/PMNTN_태백산악훈련장_421902904.json',
    spotFile: '/mountain/421902904_geojson/PMNTN_SPOT_태백산악훈련장_421902904.json',
    center: [37.1000, 128.9167],
    zoom: 13
  },
  '438001301': {
    name: '소백산',
    code: '438001301',
    courseFile: '/mountain/438001301_geojson/PMNTN_소백산_비로봉_438001301.json',
    spotFile: '/mountain/438001301_geojson/PMNTN_SPOT_소백산_비로봉_438001301.json',
    center: [36.9167, 128.4667],
    zoom: 13
  },
  '111100101': {
    name: '북악산',
    code: '111100101',
    courseFile: '/mountain/111100101_geojson/PMNTN_북악산_111100101.json',
    spotFile: '/mountain/111100101_geojson/PMNTN_SPOT_북악산_111100101.json',
    center: [37.6000, 126.9667],
    zoom: 13
  },
  '282601001': {
    name: '금정산',
    code: '282601001',
    courseFile: '/mountain/282601001_geojson/PMNTN_금정산_282601001.json',
    spotFile: '/mountain/282601001_geojson/PMNTN_SPOT_금정산_282601001.json',
    center: [35.2833, 129.0333],
    zoom: 13
  },
  '287100601': {
    name: '마니산',
    code: '287100601',
    courseFile: '/mountain/287100601_geojson/PMNTN_마니산_287100601.json',
    spotFile: '/mountain/287100601_geojson/PMNTN_SPOT_마니산_287100601.json',
    center: [37.6167, 126.4167],
    zoom: 13
  },
  '287101001': {
    name: '정족산',
    code: '287101001',
    courseFile: '/mountain/287101001_geojson/PMNTN_정족산_287101001.json',
    spotFile: '/mountain/287101001_geojson/PMNTN_SPOT_정족산_287101001.json',
    center: [37.4500, 126.6167],
    zoom: 13
  },
  '287100101': {
    name: '고려산',
    code: '287100101',
    courseFile: '/mountain/287100101_geojson/PMNTN_고려산_287100101.json',
    spotFile: '/mountain/287100101_geojson/PMNTN_SPOT_고려산_287100101.json',
    center: [37.6833, 126.7500],
    zoom: 13
  }
}

export function getMountainInfo(code) {
  return MOUNTAIN_ROUTES[code] || null
}

export function getAllMountains() {
  return Object.values(MOUNTAIN_ROUTES).map(info => ({
    code: info.code,
    name: info.name
  }))
}



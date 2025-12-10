const fs = require('fs');
const path = require('path');
const dumpPath = '/workspace/tmp_mountain_list.json';
const mountainRoot = '/workspace/mountain';
const outPath = '/workspace/tmp_kb_courses.json';

const data = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
const results = [];
const missingFiles = [];

const surfaceScore = (s) => {
  if (!s) return 0;
  const text = String(s);
  if (/(암석|바위|암벽|절벽)/.test(text)) return 3;
  if (/(토사|자갈|돌)/.test(text)) return 1;
  if (/(포장|콘크리트|데크)/.test(text)) return -1;
  return 0;
};

const distanceScore = (d) => {
  if (!Number.isFinite(d)) return 0;
  if (d >= 15) return 4;
  if (d >= 10) return 3;
  if (d >= 5) return 2;
  if (d >= 2) return 1;
  return 0;
};

const timeScore = (m) => {
  if (!Number.isFinite(m)) return 0;
  if (m >= 360) return 5;
  if (m >= 240) return 4;
  if (m >= 180) return 3;
  if (m >= 120) return 2;
  if (m >= 60) return 1;  // 60분 이상 120분 미만: +1점
  if (m >= 30) return 0;
  return 0;
};

const difficultyLabel = (score) => {
  if (score <= 2) return '쉬움';
  if (score <= 5) return '보통';
  return '어려움';
};

for (const m of data) {
  const code = m.code || m.mntilistno || m.trail_match?.mountain_info?.mntilistno;
  const name = m.name || m.trail_match?.mountain_info?.mntiname || '미상';
  const tfiles = (m.trail_files || []).filter(Boolean);
  const mountainEntry = { mountain_code: String(code || ''), mountain_name: name, courses: [] };

  for (const t of tfiles) {
    const fCode = t.code || code;
    const fname = t.filename;
    if (!fCode || !fname) continue;
    const geoDir = path.join(mountainRoot, `${fCode}_geojson`);
    const filePath = path.join(geoDir, fname);
    if (!fs.existsSync(filePath)) {
      missingFiles.push({ mountain: name, code: fCode, filename: fname });
      continue;
    }
    let geo;
    try {
      geo = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      missingFiles.push({ mountain: name, code: fCode, filename: fname, error: 'parse' });
      continue;
    }
    const features = geo.features || (geo.type === 'FeatureCollection' ? geo.features || [] : [geo]);

    for (const f of features) {
      // ArcGIS 형식 변환 (mountain-service와 동일 로직)
      if (f && f.attributes && f.geometry && f.geometry.paths) {
        const attrs = f.attributes;
        const courseName = (attrs.PMNTN_NM || attrs.PMNTN_MAIN || '').trim();
        if (!courseName) continue;
        const upTime = Number(attrs.PMNTN_UPPL || 0);
        const downTime = Number(attrs.PMNTN_GODN || 0);
        const totalMinutes = upTime + downTime;
        const distance = Number(attrs.PMNTN_LT || 0);
        const surfaceMaterial = (attrs.PMNTN_MTRQ || '').trim();

        let difficulty = '보통';
        if (distance <= 1.5 && totalMinutes <= 60) {
          difficulty = '쉬움';
        } else if (distance >= 10 || totalMinutes >= 240) {
          difficulty = '어려움';
        } else if (surfaceMaterial && (surfaceMaterial.includes('암석') || surfaceMaterial.includes('바위'))) {
          difficulty = '어려움';
        }

        const courseObj = {
          course_name: courseName,
          distance_km: Number.isFinite(distance) ? distance : null,
          duration_min: Number.isFinite(totalMinutes) ? totalMinutes : null,
          surface: surfaceMaterial || null,
          difficulty: difficulty,
          difficulty_score: null,
          filename: fname
        };

        mountainEntry.courses.push(courseObj);
      } else if (f && f.properties) {
        // 이미 GeoJSON
        const props = f.properties;
        const courseName = (props.name || props.PMNTN_NM || props.PMNTN_MAIN || '').trim();
        if (!courseName) continue;
        const distVal = props.distance ?? props.PMNTN_LT ?? props.length;
        const upVal = props.upTime ?? props.PMNTN_UPPL;
        const downVal = props.downTime ?? props.PMNTN_GODN;
        const durVal = props.duration;
        const distKm = distVal !== undefined ? parseFloat(distVal) : NaN;
        let totalMinutes = NaN;
        if (durVal !== undefined && durVal !== null) {
          const num = parseFloat(durVal);
          totalMinutes = Number.isFinite(num) ? num : NaN;
        }
        if (!Number.isFinite(totalMinutes)) {
          const up = upVal !== undefined ? parseFloat(upVal) : NaN;
          const down = downVal !== undefined ? parseFloat(downVal) : NaN;
          if (Number.isFinite(up) || Number.isFinite(down)) {
            totalMinutes = (Number.isFinite(up) ? up : 0) + (Number.isFinite(down) ? down : 0);
          }
        }
        const surfaceMaterial = (props.surface || props.PMNTN_MTRQ || '').trim();
        const courseObj = {
          course_name: courseName,
          distance_km: Number.isFinite(distKm) ? distKm : null,
          duration_min: Number.isFinite(totalMinutes) ? totalMinutes : null,
          surface: surfaceMaterial || null,
          difficulty: props.difficulty || null,
          difficulty_score: null,
          filename: fname
        };
        mountainEntry.courses.push(courseObj);
      }
    }
  }

  // 프론트 필터 동일 적용
  let filtered = mountainEntry.courses.filter(c => {
    const distOk = c.distance_km === null || c.distance_km >= 0.5;
    const durOk = c.duration_min === null || c.duration_min >= 10;
    return distOk && durOk;
  });
  if (filtered.length === 0 && mountainEntry.courses.length > 0) {
    filtered = [...mountainEntry.courses].sort((a, b) => {
      const da = Number.isFinite(a.duration_min) ? a.duration_min : 0;
      const db = Number.isFinite(b.duration_min) ? b.duration_min : 0;
      if (db !== da) return db - da;
      const la = Number.isFinite(a.distance_km) ? a.distance_km : 0;
      const lb = Number.isFinite(b.distance_km) ? b.distance_km : 0;
      return lb - la;
    }).slice(0, 1);
  }

  // 난이도 점수 재계산 후 덮어쓰기
  mountainEntry.courses = filtered.map(c => {
    const dScore = distanceScore(c.distance_km);
    const tScore = timeScore(c.duration_min);
    const sScore = surfaceScore(c.surface);
    const total = dScore + tScore + sScore;
    const label = difficultyLabel(total);
    return { ...c, difficulty_score: total, difficulty: label };
  });

  results.push(mountainEntry);
}

fs.writeFileSync(outPath, JSON.stringify({ mountains: results, missingFiles }, null, 2));
console.log(`done. mountains=${results.length}, missingFiles=${missingFiles.length}`);

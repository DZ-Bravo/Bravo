const fs = require('fs');
const inputPath = '/workspace/tmp_kb_courses.jsonl';
const outputPath = '/workspace/tmp_kb_courses.jsonl';

const lines = fs.readFileSync(inputPath, 'utf8').split('\n').filter(Boolean);
const filtered = [];
let removed = 0;

for (const line of lines) {
  try {
    const doc = JSON.parse(line);
    // distance_km가 null이거나 0.5 미만이면 제외
    if (doc.distance_km !== null && doc.distance_km >= 0.5) {
      filtered.push(line);
    } else {
      removed++;
    }
  } catch (e) {
    console.error('파싱 오류:', e);
  }
}

fs.writeFileSync(outputPath, filtered.join('\n'));
console.log(`필터링 완료: ${filtered.length}개 문서 유지, ${removed}개 제거`);

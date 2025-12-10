const fs = require('fs');
const inputPath = '/workspace/tmp_kb_courses.json';
const outputPath = '/workspace/tmp_kb_courses.jsonl';

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const output = [];

for (const mountain of data.mountains) {
  for (const course of mountain.courses) {
    // 검색 가능한 자연어 텍스트 생성
    const textParts = [];
    textParts.push(`${mountain.mountain_name} ${course.course_name}`);
    textParts.push(`거리 ${course.distance_km}km`);
    textParts.push(`소요시간 ${course.duration_min}분`);
    textParts.push(`난이도 ${course.difficulty}`);
    if (course.surface) {
      textParts.push(`노면 ${course.surface}`);
    }
    const text = textParts.join(', ') + '입니다.';
    
    // JSONL 문서 생성
    const doc = {
      mountain_code: mountain.mountain_code,
      mountain_name: mountain.mountain_name,
      course_name: course.course_name,
      distance_km: course.distance_km,
      duration_min: course.duration_min,
      surface: course.surface,
      difficulty: course.difficulty,
      difficulty_score: course.difficulty_score,
      filename: course.filename,
      text: text
    };
    
    output.push(JSON.stringify(doc));
  }
}

fs.writeFileSync(outputPath, output.join('\n'));
console.log(`변환 완료: ${output.length}개 코스 문서 생성`);

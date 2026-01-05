import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const inputFile = path.join(__dirname, 'mountain', 'tmp_kb_courses_by_course.jsonl')
const outputFile = path.join(__dirname, 'mountain', 'courses_kb.jsonl')

console.log('🚀 Knowledge Base 형식으로 JSONL 변환 시작...')
console.log(`입력 파일: ${inputFile}`)
console.log(`출력 파일: ${outputFile}`)

const jsonlContent = fs.readFileSync(inputFile, 'utf-8')
const lines = jsonlContent.trim().split('\n').filter(line => line.trim())

console.log(`\n총 ${lines.length}개 코스 처리 중...`)

const outputLines = []
let processedCount = 0
let errorCount = 0

for (let i = 0; i < lines.length; i++) {
  try {
    const course = JSON.parse(lines[i])
    
    // content 필드 생성 (CSV 변환 스크립트와 동일한 로직)
    const contentParts = []
    if (course.mountain_name) contentParts.push(`산: ${course.mountain_name}`)
    if (course.course_name) contentParts.push(`코스: ${course.course_name}`)
    if (course.distance_km) contentParts.push(`거리: ${course.distance_km}km`)
    if (course.duration_min) contentParts.push(`소요시간: ${course.duration_min}분`)
    if (course.difficulty) contentParts.push(`난이도: ${course.difficulty}`)
    if (course.surface) contentParts.push(`지형: ${course.surface}`)
    const content = contentParts.join(', ')
    
    // metadata 필드 생성 (content를 제외한 모든 필드)
    const metadata = {
      mountain_code: course.mountain_code,
      mountain_name: course.mountain_name,
      latitude: course.latitude,
      longitude: course.longitude,
      course_name: course.course_name,
      distance_km: course.distance_km,
      duration_min: course.duration_min,
      surface: course.surface,
      difficulty: course.difficulty,
      difficulty_score: course.difficulty_score,
      filename: course.filename
    }
    
    // Knowledge Base 형식: {content: "...", metadata: {...}}
    const kbEntry = {
      content: content,
      metadata: metadata
    }
    
    outputLines.push(JSON.stringify(kbEntry))
    processedCount++
    
    if ((i + 1) % 100 === 0) {
      console.log(`  ${i + 1}/${lines.length} 처리 완료...`)
    }
  } catch (error) {
    console.error(`라인 ${i + 1} 파싱 오류:`, error.message)
    errorCount++
  }
}

// JSONL 파일 작성 (각 줄에 하나의 JSON 객체)
fs.writeFileSync(outputFile, outputLines.join('\n') + '\n', 'utf-8')

console.log(`\n✅ 변환 완료!`)
console.log(`   성공: ${processedCount}개`)
if (errorCount > 0) {
  console.log(`   실패: ${errorCount}개`)
}
console.log(`   출력 파일: ${outputFile}`)

// 파일 크기 확인
const fileStats = fs.statSync(outputFile)
console.log(`\n📊 파일 정보:`)
console.log(`   파일 크기: ${(fileStats.size / 1024).toFixed(2)} KB`)

if (fileStats.size > 50 * 1024 * 1024) {
  console.warn(`\n⚠️  경고: 파일이 50MB를 초과합니다.`)
} else {
  console.log(`   ✅ 파일 크기 제한 내에 있습니다.`)
}

// 샘플 출력 확인
console.log(`\n📋 샘플 데이터 (첫 번째 항목):`)
try {
  const firstEntry = JSON.parse(outputLines[0])
  console.log(`   Content: ${firstEntry.content.substring(0, 100)}...`)
  console.log(`   Metadata 키: ${Object.keys(firstEntry.metadata).length}개`)
} catch (e) {
  console.log(`   샘플 확인 실패: ${e.message}`)
}

console.log(`\n✨ Knowledge Base에 업로드할 준비가 완료되었습니다!`)

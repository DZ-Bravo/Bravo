import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const inputFile = path.join(__dirname, 'mountain', 'tmp_kb_courses_by_course.jsonl')
const outputCsvFile = path.join(__dirname, 'mountain', 'courses.csv')
const metadataFile = path.join(__dirname, 'mountain', 'courses.metadata.json')

const headers = [
  'mountain_code',
  'mountain_name',
  'latitude',
  'longitude',
  'course_name',
  'distance_km',
  'duration_min',
  'surface',
  'difficulty',
  'difficulty_score',
  'filename'
]

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return ''
  }
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

const jsonlContent = fs.readFileSync(inputFile, 'utf-8')
const lines = jsonlContent.trim().split('\n').filter(line => line.trim())

console.log(`총 ${lines.length}개 코스 처리 중...`)

const csvRows = [headers.join(',')]

for (let i = 0; i < lines.length; i++) {
  try {
    const course = JSON.parse(lines[i])
    
    // content 필드 생성 (검색용 텍스트)
    const contentParts = []
    if (course.mountain_name) contentParts.push(`산: ${course.mountain_name}`)
    if (course.course_name) contentParts.push(`코스: ${course.course_name}`)
    if (course.distance_km) contentParts.push(`거리: ${course.distance_km}km`)
    if (course.duration_min) contentParts.push(`소요시간: ${course.duration_min}분`)
    if (course.difficulty) contentParts.push(`난이도: ${course.difficulty}`)
    if (course.surface) contentParts.push(`지형: ${course.surface}`)
    course.content = contentParts.join(', ')
    
    const row = headers.map(header => {
      const value = course[header] || ''
      return escapeCsvValue(value)
    })
    // content 필드 추가
    row.push(escapeCsvValue(course.content))
    csvRows.push(row.join(','))
    
    if ((i + 1) % 100 === 0) {
      console.log(`${i + 1}/${lines.length} 처리 완료...`)
    }
  } catch (error) {
    console.error(`라인 ${i + 1} 파싱 오류:`, error.message)
  }
}

// content 필드를 헤더에 추가
const finalHeaders = [...headers, 'content']
csvRows[0] = finalHeaders.join(',')

fs.writeFileSync(outputCsvFile, csvRows.join('\n'), 'utf-8')
console.log(`✅ CSV 파일 생성 완료: ${outputCsvFile}`)
console.log(`   총 ${csvRows.length - 1}개 코스 (헤더 제외)`)

const metadata = {
  contentFields: ['content'],
  metadataFields: ['mountain_code', 'mountain_name', 'latitude', 'longitude', 'course_name', 'distance_km', 'duration_min', 'surface', 'difficulty', 'difficulty_score', 'filename']
}

fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2), 'utf-8')
console.log(`✅ 메타데이터 파일 생성 완료: ${metadataFile}`)

const csvStats = fs.statSync(outputCsvFile)
console.log(`\n📊 파일 정보:`)
console.log(`   CSV 파일 크기: ${(csvStats.size / 1024).toFixed(2)} KB`)

if (csvStats.size > 50 * 1024 * 1024) {
  console.warn(`\n⚠️  경고: CSV 파일이 50MB를 초과합니다.`)
} else {
  console.log(`   ✅ 파일 크기 제한 내에 있습니다.`)
}

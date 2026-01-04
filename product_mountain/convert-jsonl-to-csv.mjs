import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const inputFile = path.join(__dirname, 'product', 'tmp_products.jsonl')
const outputCsvFile = path.join(__dirname, 'product', 'products.csv')
const metadataFile = path.join(__dirname, 'product', 'products.metadata.json')

const headers = [
  'category',
  'brand',
  'title',
  'price',
  'original_price',
  'discount_rate',
  'url',
  'embedding_description',
  'description'
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

console.log(`총 ${lines.length}개 제품 처리 중...`)

const csvRows = [headers.join(',')]

for (let i = 0; i < lines.length; i++) {
  try {
    const product = JSON.parse(lines[i])
    const row = headers.map(header => {
      const value = product[header] || ''
      return escapeCsvValue(value)
    })
    csvRows.push(row.join(','))
    
    if ((i + 1) % 100 === 0) {
      console.log(`${i + 1}/${lines.length} 처리 완료...`)
    }
  } catch (error) {
    console.error(`라인 ${i + 1} 파싱 오류:`, error.message)
  }
}

fs.writeFileSync(outputCsvFile, csvRows.join('\n'), 'utf-8')
console.log(`✅ CSV 파일 생성 완료: ${outputCsvFile}`)
console.log(`   총 ${csvRows.length - 1}개 제품 (헤더 제외)`)

const metadata = {
  contentFields: ['embedding_description', 'description'],
  metadataFields: ['category', 'brand', 'title', 'price', 'original_price', 'discount_rate', 'url']
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

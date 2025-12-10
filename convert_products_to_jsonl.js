const fs = require('fs');
const path = require('path');

const inputDir = '/workspace/tmp_products';
const outputPath = '/workspace/tmp_products.jsonl';

const categories = ['bottom', 'top', 'goods', 'shoes'];
const output = [];

for (const category of categories) {
  const filePath = path.join(inputDir, `${category}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`파일 없음: ${filePath}`);
    continue;
  }
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  for (const product of data) {
    // 필드 정리: _id, images, options, specifications 제거
    const cleaned = {
      category: category,
      brand: product.brand || null,
      title: product.title || null,
      price: product.price || null,
      original_price: product.original_price || null,
      discount_rate: product.discount_rate || null,
      url: product.url || null,
      embedding_description: product.embedding_description || null,
      description: product.description || null
    };
    
    output.push(JSON.stringify(cleaned));
  }
}

fs.writeFileSync(outputPath, output.join('\n'));
console.log(`변환 완료: ${output.length}개 상품 문서 생성`);

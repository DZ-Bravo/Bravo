// shoes 컬렉션에서 title에 '팬츠'가 포함된 문서들을 수정하는 스크립트
// 1. embedding_description에서 '카테고리:등산화'를 '카테고리:하의'로 변경
// 2. shoes_thumbnails에서 해당하는 문서들을 bottom_thumbnails로 이동

// 데이터베이스 선택
use('hiking');

print("=".repeat(50));
print("shoes 컬렉션에서 '팬츠'가 포함된 문서 수정 시작");
print("=".repeat(50));

// 1. shoes 컬렉션에서 title에 '팬츠'가 포함된 문서 찾기
print("\n1. shoes 컬렉션에서 '팬츠'가 포함된 문서 검색 중...");
const pantsInShoes = db.shoes.find({ title: { $regex: "팬츠", $options: "i" } }).toArray();

if (pantsInShoes.length === 0) {
    print("   '팬츠'가 포함된 문서를 찾을 수 없습니다.");
    quit();
}

print(`   ${pantsInShoes.length}개의 문서를 찾았습니다.`);

// 찾은 문서들의 ID와 title 출력
const pantsTitles = [];
pantsInShoes.forEach(doc => {
    const docId = doc._id;
    const title = doc.title || "N/A";
    pantsTitles.push(title);
    print(`   - ID: ${docId}, Title: ${title}`);
});

// 2. embedding_description 수정
print("\n2. embedding_description 수정 중...");
let updatedCount = 0;

pantsInShoes.forEach(doc => {
    const docId = doc._id;
    const embeddingDesc = doc.embedding_description || "";
    
    // "카테고리:등산화" 또는 "카테고리: 등산화" (공백 포함) 모두 처리
    if (embeddingDesc.includes("카테고리:등산화") || embeddingDesc.includes("카테고리: 등산화")) {
        const newEmbeddingDesc = embeddingDesc.replace(/카테고리:\s*등산화/g, "카테고리:하의");
        const result = db.shoes.updateOne(
            { _id: docId },
            { $set: { embedding_description: newEmbeddingDesc } }
        );
        
        if (result.modifiedCount > 0) {
            updatedCount++;
            print(`   ✓ ID ${docId}: '카테고리:등산화' → '카테고리:하의'로 변경`);
        } else {
            print(`   ✗ ID ${docId}: 업데이트 실패`);
        }
    } else {
        const preview = embeddingDesc.length > 50 ? embeddingDesc.substring(0, 50) + "..." : embeddingDesc;
        print(`   - ID ${docId}: '카테고리:등산화'를 찾을 수 없음 (현재: ${preview})`);
    }
});

print(`\n   총 ${updatedCount}개의 문서가 업데이트되었습니다.`);

// 3. shoes_thumbnails에서 해당하는 문서들을 bottom_thumbnails로 이동
print("\n3. shoes_thumbnails에서 bottom_thumbnails로 문서 이동 중...");

let movedCount = 0;

pantsTitles.forEach(pantsTitle => {
    if (!pantsTitle) return;
    
    // shoes_thumbnails에서 같은 title을 가진 문서 찾기
    // 정확한 매칭과 부분 매칭 모두 시도
    const escapedTitle = pantsTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const thumbnailDocs = db.shoes_thumbnails.find({
        $or: [
            { title: pantsTitle },
            { name: pantsTitle },
            { title: { $regex: escapedTitle, $options: "i" } },
            { name: { $regex: escapedTitle, $options: "i" } }
        ]
    }).toArray();
    
    if (thumbnailDocs.length > 0) {
        thumbnailDocs.forEach(thumbDoc => {
            const thumbDocId = thumbDoc._id;
            const thumbTitle = thumbDoc.title || thumbDoc.name || "";
            
            // _id를 제거한 복사본 생성
            delete thumbDoc._id;
            
            // bottom_thumbnails로 복사
            db.bottom_thumbnails.insertOne(thumbDoc);
            
            // shoes_thumbnails에서 삭제
            db.shoes_thumbnails.deleteOne({ _id: thumbDocId });
            
            movedCount++;
            print(`   ✓ '${thumbTitle}' 썸네일 이동 완료`);
        });
    } else {
        print(`   - '${pantsTitle}'에 해당하는 썸네일을 찾을 수 없음`);
    }
});

print(`\n   총 ${movedCount}개의 썸네일 문서가 이동되었습니다.`);

// 4. 결과 요약
print("\n" + "=".repeat(50));
print("작업 완료!");
print("=".repeat(50));
print(`- shoes 컬렉션: ${updatedCount}개 문서의 embedding_description 수정`);
print(`- 썸네일 이동: ${movedCount}개 문서를 shoes_thumbnails → bottom_thumbnails로 이동`);


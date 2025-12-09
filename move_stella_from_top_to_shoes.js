// top 컬렉션에서 title에 '여성 스텔라'가 포함된 문서들을 shoes 컬렉션으로 이동
// 1. embedding_description에서 '카테고리: [상의/하의/등산화/용품]'을 '카테고리: 등산화'로 변경
// 2. top_thumbnails에서 해당하는 문서들을 shoes_thumbnails로 이동

use('hiking');

print("=".repeat(50));
print("top 컬렉션에서 '여성 스텔라' 문서를 shoes 컬렉션으로 이동");
print("=".repeat(50));

// 1. top 컬렉션에서 title에 '여성 스텔라'가 포함된 문서 찾기
print("\n1. top 컬렉션에서 '여성 스텔라'가 포함된 문서 검색 중...");
const targetTitle = "여성 스텔라";
const stellaInTop = db.top.find({ title: { $regex: targetTitle, $options: "i" } }).toArray();

if (stellaInTop.length === 0) {
    print("   해당 제품을 찾을 수 없습니다.");
    quit();
}

print(`   ${stellaInTop.length}개의 문서를 찾았습니다.`);

// 찾은 문서들의 ID와 title 출력
const stellaTitles = [];
stellaInTop.forEach(doc => {
    const docId = doc._id;
    const title = doc.title || "N/A";
    stellaTitles.push(title);
    print(`   - ID: ${docId}, Title: ${title}`);
});

// 2. embedding_description 수정 및 shoes 컬렉션으로 이동
print("\n2. embedding_description 수정 및 shoes 컬렉션으로 문서 이동 중...");
let movedCount = 0;
let updatedCount = 0;

stellaInTop.forEach(doc => {
    const docId = doc._id;
    const title = doc.title || "N/A";
    const embeddingDesc = doc.embedding_description || "";
    
    // embedding_description 수정: '카테고리: [상의/하의/등산화/용품]'을 '카테고리:등산화'로 변경
    let newEmbeddingDesc = embeddingDesc;
    if (embeddingDesc.match(/카테고리:\s*(상의|하의|등산화|용품)/)) {
        newEmbeddingDesc = embeddingDesc.replace(/카테고리:\s*(상의|하의|등산화|용품)/g, "카테고리:등산화");
        updatedCount++;
        print(`   ✓ '${title}': embedding_description 수정`);
    }
    
    // _id를 제거한 복사본 생성
    const docCopy = Object.assign({}, doc);
    delete docCopy._id;
    docCopy.embedding_description = newEmbeddingDesc;
    
    // shoes 컬렉션으로 복사
    db.shoes.insertOne(docCopy);
    
    // top 컬렉션에서 삭제
    db.top.deleteOne({ _id: docId });
    
    movedCount++;
    print(`   ✓ '${title}' 이동 완료`);
});

print(`\n   총 ${movedCount}개의 문서가 이동되었습니다.`);
print(`   총 ${updatedCount}개의 문서의 embedding_description이 수정되었습니다.`);

// 3. top_thumbnails에서 해당하는 문서들을 shoes_thumbnails로 이동
print("\n3. top_thumbnails에서 shoes_thumbnails로 문서 이동 중...");

let thumbnailsMovedCount = 0;

stellaTitles.forEach(stellaTitle => {
    if (!stellaTitle) return;
    
    // top_thumbnails에서 같은 title을 가진 문서 찾기
    const escapedTitle = stellaTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const thumbnailDocs = db.top_thumbnails.find({
        $or: [
            { title: stellaTitle },
            { name: stellaTitle },
            { title: { $regex: escapedTitle, $options: "i" } },
            { name: { $regex: escapedTitle, $options: "i" } }
        ]
    }).toArray();
    
    if (thumbnailDocs.length > 0) {
        thumbnailDocs.forEach(thumbDoc => {
            const thumbDocId = thumbDoc._id;
            const thumbTitle = thumbDoc.title || thumbDoc.name || "";
            
            // _id를 제거한 복사본 생성
            const thumbDocCopy = Object.assign({}, thumbDoc);
            delete thumbDocCopy._id;
            
            // shoes_thumbnails로 복사
            db.shoes_thumbnails.insertOne(thumbDocCopy);
            
            // top_thumbnails에서 삭제
            db.top_thumbnails.deleteOne({ _id: thumbDocId });
            
            thumbnailsMovedCount++;
            print(`   ✓ '${thumbTitle}' 썸네일 이동 완료`);
        });
    } else {
        print(`   - '${stellaTitle}'에 해당하는 썸네일을 찾을 수 없음`);
    }
});

print(`\n   총 ${thumbnailsMovedCount}개의 썸네일 문서가 이동되었습니다.`);

// 4. 결과 확인
print("\n4. 이동 결과 확인...");
const remainingInTop = db.top.countDocuments({ title: { $regex: targetTitle, $options: "i" } });
const nowInShoes = db.shoes.countDocuments({ title: { $regex: targetTitle, $options: "i" } });
const remainingInTopThumbnails = db.top_thumbnails.countDocuments({
    $or: [
        { title: { $regex: targetTitle, $options: "i" } },
        { name: { $regex: targetTitle, $options: "i" } }
    ]
});
const nowInShoesThumbnails = db.shoes_thumbnails.countDocuments({
    $or: [
        { title: { $regex: targetTitle, $options: "i" } },
        { name: { $regex: targetTitle, $options: "i" } }
    ]
});

print(`   - top 컬렉션에 남은 해당 문서: ${remainingInTop}개`);
print(`   - shoes 컬렉션에 있는 해당 문서: ${nowInShoes}개`);
print(`   - top_thumbnails에 남은 해당 썸네일: ${remainingInTopThumbnails}개`);
print(`   - shoes_thumbnails에 있는 해당 썸네일: ${nowInShoesThumbnails}개`);

// 5. 결과 요약
print("\n" + "=".repeat(50));
print("작업 완료!");
print("=".repeat(50));
print(`- ${movedCount}개 문서를 top → shoes으로 이동`);
print(`- ${updatedCount}개 문서의 embedding_description 수정`);
print(`- ${thumbnailsMovedCount}개 썸네일을 top_thumbnails → shoes_thumbnails로 이동`);





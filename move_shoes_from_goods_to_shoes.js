// goods 컬렉션에서 title에 '343 라이트 스텝 GTX BE', '요크셔', '매그넘'이 포함된 문서들을 shoes 컬렉션으로 이동
// 1. embedding_description에서 '카테고리: 용품'을 '카테고리: 등산화'로 변경
// 2. goods_thumbnails에서 해당하는 문서들을 shoes_thumbnails로 이동

use('hiking');

print("=".repeat(50));
print("goods 컬렉션에서 등산화 관련 문서를 shoes 컬렉션으로 이동");
print("=".repeat(50));

// 1. goods 컬렉션에서 title에 해당 키워드가 포함된 문서 찾기
print("\n1. goods 컬렉션에서 '343 라이트 스텝 GTX BE', '요크셔', '매그넘'이 포함된 문서 검색 중...");
const keywords = ["343 라이트 스텝 GTX BE", "요크셔", "매그넘"];
const shoesInGoods = db.goods.find({
    $or: keywords.map(keyword => ({
        title: { $regex: keyword, $options: "i" }
    }))
}).toArray();

if (shoesInGoods.length === 0) {
    print("   해당 제품을 찾을 수 없습니다.");
    quit();
}

print(`   ${shoesInGoods.length}개의 문서를 찾았습니다.`);

// 찾은 문서들의 ID와 title 출력
const shoeTitles = [];
shoesInGoods.forEach(doc => {
    const docId = doc._id;
    const title = doc.title || "N/A";
    shoeTitles.push(title);
    print(`   - ID: ${docId}, Title: ${title}`);
});

// 2. embedding_description 수정 및 shoes 컬렉션으로 이동
print("\n2. embedding_description 수정 및 shoes 컬렉션으로 문서 이동 중...");
let movedCount = 0;
let updatedCount = 0;

shoesInGoods.forEach(doc => {
    const docId = doc._id;
    const title = doc.title || "N/A";
    const embeddingDesc = doc.embedding_description || "";
    
    // embedding_description 수정: '카테고리: 용품' 또는 '카테고리:용품'을 '카테고리:등산화'로 변경
    let newEmbeddingDesc = embeddingDesc;
    if (embeddingDesc.includes("카테고리: 용품") || embeddingDesc.includes("카테고리:용품")) {
        newEmbeddingDesc = embeddingDesc.replace(/카테고리:\s*용품/g, "카테고리:등산화");
        updatedCount++;
        print(`   ✓ '${title}': embedding_description 수정`);
    }
    
    // _id를 제거한 복사본 생성
    const docCopy = Object.assign({}, doc);
    delete docCopy._id;
    docCopy.embedding_description = newEmbeddingDesc;
    
    // shoes 컬렉션으로 복사
    db.shoes.insertOne(docCopy);
    
    // goods 컬렉션에서 삭제
    db.goods.deleteOne({ _id: docId });
    
    movedCount++;
    print(`   ✓ '${title}' 이동 완료`);
});

print(`\n   총 ${movedCount}개의 문서가 이동되었습니다.`);
print(`   총 ${updatedCount}개의 문서의 embedding_description이 수정되었습니다.`);

// 3. goods_thumbnails에서 해당하는 문서들을 shoes_thumbnails로 이동
print("\n3. goods_thumbnails에서 shoes_thumbnails로 문서 이동 중...");

let thumbnailsMovedCount = 0;

shoeTitles.forEach(shoeTitle => {
    if (!shoeTitle) return;
    
    // goods_thumbnails에서 같은 title을 가진 문서 찾기
    const escapedTitle = shoeTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const thumbnailDocs = db.goods_thumbnails.find({
        $or: [
            { title: shoeTitle },
            { name: shoeTitle },
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
            
            // goods_thumbnails에서 삭제
            db.goods_thumbnails.deleteOne({ _id: thumbDocId });
            
            thumbnailsMovedCount++;
            print(`   ✓ '${thumbTitle}' 썸네일 이동 완료`);
        });
    } else {
        print(`   - '${shoeTitle}'에 해당하는 썸네일을 찾을 수 없음`);
    }
});

print(`\n   총 ${thumbnailsMovedCount}개의 썸네일 문서가 이동되었습니다.`);

// 4. 결과 확인
print("\n4. 이동 결과 확인...");
const query = {
    $or: keywords.map(keyword => ({
        title: { $regex: keyword, $options: "i" }
    }))
};

const remainingInGoods = db.goods.countDocuments(query);
const nowInShoes = db.shoes.countDocuments(query);
const remainingInGoodsThumbnails = db.goods_thumbnails.countDocuments({
    $or: [
        ...keywords.map(keyword => ({ title: { $regex: keyword, $options: "i" } })),
        ...keywords.map(keyword => ({ name: { $regex: keyword, $options: "i" } }))
    ]
});
const nowInShoesThumbnails = db.shoes_thumbnails.countDocuments({
    $or: [
        ...keywords.map(keyword => ({ title: { $regex: keyword, $options: "i" } })),
        ...keywords.map(keyword => ({ name: { $regex: keyword, $options: "i" } }))
    ]
});

print(`   - goods 컬렉션에 남은 해당 문서: ${remainingInGoods}개`);
print(`   - shoes 컬렉션에 있는 해당 문서: ${nowInShoes}개`);
print(`   - goods_thumbnails에 남은 해당 썸네일: ${remainingInGoodsThumbnails}개`);
print(`   - shoes_thumbnails에 있는 해당 썸네일: ${nowInShoesThumbnails}개`);

// 5. 결과 요약
print("\n" + "=".repeat(50));
print("작업 완료!");
print("=".repeat(50));
print(`- ${movedCount}개 문서를 goods → shoes으로 이동`);
print(`- ${updatedCount}개 문서의 embedding_description 수정`);
print(`- ${thumbnailsMovedCount}개 썸네일을 goods_thumbnails → shoes_thumbnails로 이동`);





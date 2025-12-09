// top 컬렉션에서 방금 이동한 문서들을 bottom 컬렉션으로 되돌리기
// 1. embedding_description에서 '카테고리: 상의'를 '카테고리: 하의'로 변경
// 2. top_thumbnails에서 해당하는 문서들을 bottom_thumbnails로 이동

use('hiking');

print("=".repeat(50));
print("top 컬렉션에서 상의 관련 문서를 bottom 컬렉션으로 되돌리기");
print("=".repeat(50));

// 1. top 컬렉션에서 title에 해당 키워드가 포함된 문서 찾기 (디스커버리 익스페디션 제외)
print("\n1. top 컬렉션에서 '긴팔티', '맨투맨', '후드티', '아르테', '벤투스'가 포함된 문서 검색 중...");
print("   (단, brand가 '디스커버리 익스페디션'인 것은 제외)");

const keywords = ["긴팔티", "맨투맨", "후드티", "아르테", "벤투스"];
const topsInTop = db.top.find({
    $and: [
        {
            $or: keywords.map(keyword => ({
                title: { $regex: keyword, $options: "i" }
            }))
        },
        {
            $or: [
                { brand: { $ne: "디스커버리 익스페디션" } },
                { brand: { $exists: false } },
                { brand: null }
            ]
        }
    ]
}).toArray();

if (topsInTop.length === 0) {
    print("   해당 제품을 찾을 수 없습니다.");
    quit();
}

print(`   ${topsInTop.length}개의 문서를 찾았습니다.`);

// 찾은 문서들의 ID, title, brand 출력
const topTitles = [];
topsInTop.forEach(doc => {
    const docId = doc._id;
    const title = doc.title || "N/A";
    const brand = doc.brand || "N/A";
    topTitles.push(title);
    print(`   - ID: ${docId}, Title: ${title}, Brand: ${brand}`);
});

// 2. embedding_description 수정 및 bottom 컬렉션으로 되돌리기
print("\n2. embedding_description 수정 및 bottom 컬렉션으로 문서 되돌리기 중...");
let movedCount = 0;
let updatedCount = 0;

topsInTop.forEach(doc => {
    const docId = doc._id;
    const title = doc.title || "N/A";
    const embeddingDesc = doc.embedding_description || "";
    
    // embedding_description 수정: '카테고리: 상의' 또는 '카테고리:상의'를 '카테고리:하의'로 변경
    let newEmbeddingDesc = embeddingDesc;
    if (embeddingDesc.includes("카테고리: 상의") || embeddingDesc.includes("카테고리:상의")) {
        newEmbeddingDesc = embeddingDesc.replace(/카테고리:\s*상의/g, "카테고리:하의");
        updatedCount++;
        print(`   ✓ '${title}': embedding_description 수정`);
    }
    
    // _id를 제거한 복사본 생성
    const docCopy = Object.assign({}, doc);
    delete docCopy._id;
    docCopy.embedding_description = newEmbeddingDesc;
    
    // bottom 컬렉션으로 복사
    db.bottom.insertOne(docCopy);
    
    // top 컬렉션에서 삭제
    db.top.deleteOne({ _id: docId });
    
    movedCount++;
    print(`   ✓ '${title}' 되돌리기 완료`);
});

print(`\n   총 ${movedCount}개의 문서가 되돌려졌습니다.`);
print(`   총 ${updatedCount}개의 문서의 embedding_description이 수정되었습니다.`);

// 3. top_thumbnails에서 해당하는 문서들을 bottom_thumbnails로 되돌리기
print("\n3. top_thumbnails에서 bottom_thumbnails로 문서 되돌리기 중...");

let thumbnailsMovedCount = 0;

topTitles.forEach(topTitle => {
    if (!topTitle) return;
    
    // top_thumbnails에서 같은 title을 가진 문서 찾기
    const escapedTitle = topTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const thumbnailDocs = db.top_thumbnails.find({
        $or: [
            { title: topTitle },
            { name: topTitle },
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
            
            // bottom_thumbnails로 복사
            db.bottom_thumbnails.insertOne(thumbDocCopy);
            
            // top_thumbnails에서 삭제
            db.top_thumbnails.deleteOne({ _id: thumbDocId });
            
            thumbnailsMovedCount++;
            print(`   ✓ '${thumbTitle}' 썸네일 되돌리기 완료`);
        });
    } else {
        print(`   - '${topTitle}'에 해당하는 썸네일을 찾을 수 없음`);
    }
});

print(`\n   총 ${thumbnailsMovedCount}개의 썸네일 문서가 되돌려졌습니다.`);

// 4. 결과 확인
print("\n4. 되돌리기 결과 확인...");
const titleQuery = {
    $or: keywords.map(keyword => ({
        title: { $regex: keyword, $options: "i" }
    }))
};

const remainingInTop = db.top.countDocuments({
    $and: [
        titleQuery,
        {
            $or: [
                { brand: { $ne: "디스커버리 익스페디션" } },
                { brand: { $exists: false } },
                { brand: null }
            ]
        }
    ]
});
const nowInBottom = db.bottom.countDocuments({
    $and: [
        titleQuery,
        {
            $or: [
                { brand: { $ne: "디스커버리 익스페디션" } },
                { brand: { $exists: false } },
                { brand: null }
            ]
        }
    ]
});
const remainingInTopThumbnails = db.top_thumbnails.countDocuments({
    $or: [
        ...keywords.map(keyword => ({ title: { $regex: keyword, $options: "i" } })),
        ...keywords.map(keyword => ({ name: { $regex: keyword, $options: "i" } }))
    ]
});
const nowInBottomThumbnails = db.bottom_thumbnails.countDocuments({
    $or: [
        ...keywords.map(keyword => ({ title: { $regex: keyword, $options: "i" } })),
        ...keywords.map(keyword => ({ name: { $regex: keyword, $options: "i" } }))
    ]
});

print(`   - top 컬렉션에 남은 해당 문서: ${remainingInTop}개`);
print(`   - bottom 컬렉션에 있는 해당 문서: ${nowInBottom}개`);
print(`   - top_thumbnails에 남은 해당 썸네일: ${remainingInTopThumbnails}개`);
print(`   - bottom_thumbnails에 있는 해당 썸네일: ${nowInBottomThumbnails}개`);

// 5. 결과 요약
print("\n" + "=".repeat(50));
print("작업 완료!");
print("=".repeat(50));
print(`- ${movedCount}개 문서를 top → bottom으로 되돌림`);
print(`- ${updatedCount}개 문서의 embedding_description 수정`);
print(`- ${thumbnailsMovedCount}개 썸네일을 top_thumbnails → bottom_thumbnails로 되돌림`);





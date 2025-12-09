// shoes 컬렉션에서 title에 '팬츠'가 포함된 문서들을 bottom 컬렉션으로 이동

use('hiking');

print("=".repeat(50));
print("shoes 컬렉션에서 '팬츠' 문서를 bottom 컬렉션으로 이동");
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
pantsInShoes.forEach(doc => {
    const docId = doc._id;
    const title = doc.title || "N/A";
    print(`   - ID: ${docId}, Title: ${title}`);
});

// 2. bottom 컬렉션으로 이동
print("\n2. bottom 컬렉션으로 문서 이동 중...");
let movedCount = 0;

pantsInShoes.forEach(doc => {
    const docId = doc._id;
    const title = doc.title || "N/A";
    
    // _id를 제거한 복사본 생성
    const docCopy = Object.assign({}, doc);
    delete docCopy._id;
    
    // bottom 컬렉션으로 복사
    db.bottom.insertOne(docCopy);
    
    // shoes 컬렉션에서 삭제
    db.shoes.deleteOne({ _id: docId });
    
    movedCount++;
    print(`   ✓ '${title}' 이동 완료`);
});

print(`\n   총 ${movedCount}개의 문서가 이동되었습니다.`);

// 3. 결과 확인
print("\n3. 이동 결과 확인...");
const remainingInShoes = db.shoes.countDocuments({ title: { $regex: "팬츠", $options: "i" } });
const nowInBottom = db.bottom.countDocuments({ title: { $regex: "팬츠", $options: "i" } });

print(`   - shoes 컬렉션에 남은 팬츠 문서: ${remainingInShoes}개`);
print(`   - bottom 컬렉션에 있는 팬츠 문서: ${nowInBottom}개`);

// 4. 결과 요약
print("\n" + "=".repeat(50));
print("작업 완료!");
print("=".repeat(50));
print(`- ${movedCount}개 문서를 shoes → bottom으로 이동`);





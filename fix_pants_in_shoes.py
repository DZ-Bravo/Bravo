#!/usr/bin/env python3
"""
shoes 컬렉션에서 title에 '팬츠'가 포함된 문서들을 수정하는 스크립트
1. embedding_description에서 '카테고리:등산화'를 '카테고리:하의'로 변경
2. shoes_thumbnails에서 해당하는 문서들을 bottom_thumbnails로 이동
"""

from pymongo import MongoClient
import sys

# MongoDB connection info
MONGO_URI = "mongodb://admin:admin123@localhost:27017/hiking?authSource=admin"
DB_NAME = "hiking"

def main():
    try:
        # MongoDB 연결
        print("MongoDB에 연결 중...")
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        
        shoes_collection = db["shoes"]
        shoes_thumbnails_collection = db["shoes_thumbnails"]
        bottom_thumbnails_collection = db["bottom_thumbnails"]
        
        # 1. shoes 컬렉션에서 title에 '팬츠'가 포함된 문서 찾기
        print("\n1. shoes 컬렉션에서 '팬츠'가 포함된 문서 검색 중...")
        pants_in_shoes = list(shoes_collection.find({"title": {"$regex": "팬츠", "$options": "i"}}))
        
        if not pants_in_shoes:
            print("   '팬츠'가 포함된 문서를 찾을 수 없습니다.")
            return
        
        print(f"   {len(pants_in_shoes)}개의 문서를 찾았습니다.")
        
        # 찾은 문서들의 ID와 title 출력
        pants_ids = []
        for doc in pants_in_shoes:
            doc_id = doc.get("_id")
            title = doc.get("title", "N/A")
            pants_ids.append(str(doc_id))
            print(f"   - ID: {doc_id}, Title: {title}")
        
        # 2. embedding_description 수정
        print("\n2. embedding_description 수정 중...")
        updated_count = 0
        for doc in pants_in_shoes:
            doc_id = doc.get("_id")
            embedding_desc = doc.get("embedding_description", "")
            
            if "카테고리:등산화" in embedding_desc:
                new_embedding_desc = embedding_desc.replace("카테고리:등산화", "카테고리:하의")
                result = shoes_collection.update_one(
                    {"_id": doc_id},
                    {"$set": {"embedding_description": new_embedding_desc}}
                )
                if result.modified_count > 0:
                    updated_count += 1
                    print(f"   ✓ ID {doc_id}: '카테고리:등산화' → '카테고리:하의'로 변경")
                else:
                    print(f"   ✗ ID {doc_id}: 업데이트 실패")
            else:
                print(f"   - ID {doc_id}: '카테고리:등산화'를 찾을 수 없음 (현재: {embedding_desc[:50]}...)")
        
        print(f"\n   총 {updated_count}개의 문서가 업데이트되었습니다.")
        
        # 3. shoes_thumbnails에서 해당하는 문서들을 bottom_thumbnails로 이동
        print("\n3. shoes_thumbnails에서 bottom_thumbnails로 문서 이동 중...")
        
        # 썸네일은 title 필드로 매칭됨 (store.js 참고)
        moved_count = 0
        for doc in pants_in_shoes:
            pants_title = doc.get("title", "")
            if not pants_title:
                continue
            
            # shoes_thumbnails에서 같은 title을 가진 문서 찾기
            # 정확한 매칭과 부분 매칭 모두 시도
            thumbnail_docs = list(shoes_thumbnails_collection.find({
                "$or": [
                    {"title": pants_title},
                    {"name": pants_title},
                    {"title": {"$regex": pants_title.replace("(", "\\(").replace(")", "\\)"), "$options": "i"}},
                    {"name": {"$regex": pants_title.replace("(", "\\(").replace(")", "\\)"), "$options": "i"}}
                ]
            }))
            
            if thumbnail_docs:
                for thumb_doc in thumbnail_docs:
                    thumb_doc_id = thumb_doc.get("_id")
                    thumb_title = thumb_doc.get("title") or thumb_doc.get("name", "")
                    
                    # bottom_thumbnails로 복사
                    thumb_doc_copy = thumb_doc.copy()
                    thumb_doc_copy.pop("_id", None)  # _id 제거하여 새로 생성되도록
                    bottom_thumbnails_collection.insert_one(thumb_doc_copy)
                    
                    # shoes_thumbnails에서 삭제
                    shoes_thumbnails_collection.delete_one({"_id": thumb_doc_id})
                    
                    moved_count += 1
                    print(f"   ✓ '{thumb_title}' 썸네일 이동 완료")
            else:
                print(f"   - '{pants_title}'에 해당하는 썸네일을 찾을 수 없음")
        
        print(f"\n   총 {moved_count}개의 썸네일 문서가 이동되었습니다.")
        
        # 4. 결과 요약
        print("\n" + "=" * 50)
        print("작업 완료!")
        print("=" * 50)
        print(f"- shoes 컬렉션: {updated_count}개 문서의 embedding_description 수정")
        print(f"- 썸네일 이동: {moved_count}개 문서를 shoes_thumbnails → bottom_thumbnails로 이동")
        
        client.close()
        
    except Exception as e:
        print(f"\n오류 발생: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()


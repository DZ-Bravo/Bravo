#!/usr/bin/env python3
"""
tmp_kb_courses_by_course.jsonl 파일의 mountain_name에 주소 추가

1. MongoDB의 Mountain_List 컬렉션에서 주소 정보 가져오기
2. mountain_code로 매칭하여 주소 정보 찾기
3. mountain_name에 주소가 없으면 "(주소)" 형식으로 추가
4. 이미 주소가 있는 것은 그대로 유지
"""

import json
import os
import re
from collections import defaultdict

# MongoDB 연결 시도
try:
    from pymongo import MongoClient
    MONGO_AVAILABLE = True
except ImportError:
    print("경고: pymongo가 설치되지 않았습니다. 'pip install pymongo' 실행 필요")
    MONGO_AVAILABLE = False

# MongoDB 연결 설정
MONGO_URI = os.getenv("MONGO_URI", "mongodb://admin:admin123@localhost:27017/hiking?authSource=admin")
DB_NAME = os.getenv("MONGO_DB", "hiking")
COLLECTION_NAME = os.getenv("MONGO_COLLECTION", "Mountain_List")

def get_mountain_addresses_from_mongodb():
    """MongoDB에서 산 주소 정보 가져오기"""
    if not MONGO_AVAILABLE:
        return {}
    
    try:
        print(f"MongoDB 연결 시도: {MONGO_URI}")
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client[DB_NAME]
        
        # 컬렉션명 자동 찾기
        collection_names = [name for name in db.list_collection_names()]
        actual_collection_name = None
        for name in collection_names:
            if name.lower() in ['mountain_list', 'mountain_lists', 'mountain_list']:
                actual_collection_name = name
                break
        
        if not actual_collection_name:
            print(f"경고: 컬렉션을 찾을 수 없습니다. 사용 가능한 컬렉션: {collection_names}")
            return {}
        
        print(f"컬렉션 발견: {actual_collection_name}")
        collection = db[actual_collection_name]
        
        # 연결 테스트
        client.admin.command('ping')
        print("MongoDB 연결 성공")
        
        # 모든 산 데이터 가져오기 (code로 인덱싱)
        mountains = {}
        count = 0
        
        # 먼저 샘플 하나 가져와서 필드 구조 확인
        sample = collection.find_one({})
        if sample:
            print(f"샘플 문서 필드: {list(sample.keys())}")
        
        # name으로 매칭 (MongoDB의 code 필드가 None인 경우가 많음)
        for doc in collection.find({}):
            name = doc.get("name", "")
            location = doc.get("location")
            
            if name and location:
                # name으로 인덱싱
                mountains[name] = location
                count += 1
                if count <= 3:
                    print(f"  주소 정보: {name} -> {location}")
            
            # code가 있으면 code로도 인덱싱
            code = doc.get("code")
            if code and location:
                mountains[str(code)] = location
        
        print(f"MongoDB에서 {count}개 산의 주소 정보 가져옴")
        client.close()
        return mountains
        
    except Exception as e:
        print(f"MongoDB 연결 실패: {e}")
        import traceback
        traceback.print_exc()
        return {}

def has_address_in_name(mountain_name):
    """mountain_name에 이미 주소가 포함되어 있는지 확인"""
    if not mountain_name:
        return False
    # 괄호가 있으면 주소가 포함된 것으로 간주
    return "(" in mountain_name and ")" in mountain_name

def update_mountain_names(input_file, output_file):
    """mountain_name에 주소 추가"""
    # 1. MongoDB에서 주소 정보 가져오기
    addresses = get_mountain_addresses_from_mongodb()
    
    if not addresses:
        print("경고: MongoDB에서 주소 정보를 가져올 수 없습니다.")
        print("계속 진행하지만 주소 정보가 없어 업데이트되지 않습니다.")
    
    # 2. JSONL 파일 읽기 및 업데이트
    updated_count = 0
    skipped_count = 0
    not_found_count = 0
    total_count = 0
    
    results = []
    
    with open(input_file, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            if not line.strip():
                continue
            
            try:
                data = json.loads(line.strip())
                total_count += 1
                
                mountain_name = data.get('mountain_name', '')
                mountain_code = str(data.get('mountain_code', ''))
                
                # 이미 주소가 있으면 건너뛰기
                if has_address_in_name(mountain_name):
                    results.append(data)
                    skipped_count += 1
                    continue
                
                # 주소 찾기 (code로 먼저 시도, 없으면 name으로)
                address = addresses.get(mountain_code)
                if not address:
                    # name에서 괄호 제거한 순수 이름으로 매칭
                    pure_name = mountain_name.split('(')[0].strip()
                    address = addresses.get(pure_name)
                
                if address:
                    # 주소 추가: "대봉" -> "대봉(경상남도 거창군 북상면 소정리)"
                    new_name = f"{mountain_name}({address})"
                    data['mountain_name'] = new_name
                    results.append(data)
                    updated_count += 1
                    if updated_count <= 5:
                        print(f"  업데이트: {mountain_name} -> {new_name}")
                else:
                    results.append(data)
                    not_found_count += 1
                    if not_found_count <= 5:
                        print(f"  주소 정보 없음: {mountain_name} (code: {mountain_code})")
            
            except json.JSONDecodeError as e:
                print(f"JSON 파싱 오류 (라인 {line_num}): {e}")
                continue
            except Exception as e:
                print(f"오류 (라인 {line_num}): {e}")
                continue
    
    # 3. 업데이트된 파일 저장
    with open(output_file, 'w', encoding='utf-8') as f:
        for data in results:
            f.write(json.dumps(data, ensure_ascii=False) + '\n')
    
    print(f"\n처리 완료:")
    print(f"  - 총 라인 수: {total_count}")
    print(f"  - 업데이트: {updated_count}개")
    print(f"  - 이미 주소 있음 (건너뜀): {skipped_count}개")
    print(f"  - 주소 정보 없음: {not_found_count}개")
    print(f"  - 저장 완료: {output_file}")

if __name__ == "__main__":
    input_file = "tmp_kb_courses_by_course.jsonl"
    output_file = "tmp_kb_courses_by_course.jsonl"
    
    # 백업 생성
    if os.path.exists(input_file):
        import shutil
        backup_file = input_file + ".backup"
        shutil.copy(input_file, backup_file)
        print(f"백업 생성: {backup_file}\n")
    
    update_mountain_names(input_file, output_file)


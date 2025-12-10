#!/usr/bin/env python3
"""
tmp_kb_courses.json에 위도/경도 추가 및 필터링 스크립트

1. MongoDB에서 Mountain_List 데이터 가져오기 (lat, lng 포함)
2. tmp_kb_courses.json과 매칭하여 위도/경도 추가
3. duration_min <= 10 AND distance_km <= 0.5인 코스 제거
"""

import json
import os
import sys

# MongoDB 연결 시도
try:
    from pymongo import MongoClient
    MONGO_AVAILABLE = True
except ImportError:
    print("경고: pymongo가 설치되지 않았습니다. 'pip install pymongo' 실행 필요")
    MONGO_AVAILABLE = False

# MongoDB 연결 설정 (환경 변수 또는 기본값)
# Docker 컨테이너 외부에서 접근: localhost 사용
# Docker 컨테이너 내부에서 접근: mongodb 사용
MONGO_URI = os.getenv("MONGO_URI", "mongodb://admin:admin123@localhost:27017/hiking?authSource=admin")
DB_NAME = os.getenv("MONGO_DB", "hiking")
COLLECTION_NAME = os.getenv("MONGO_COLLECTION", "Mountain_list")  # 실제 컬렉션명 확인 필요

def get_mountain_coords_from_mongodb():
    """MongoDB에서 산 정보 가져오기"""
    if not MONGO_AVAILABLE:
        return None
    
    try:
        print(f"MongoDB 연결 시도: {MONGO_URI}")
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client[DB_NAME]
        collection = db[COLLECTION_NAME]
        
        # 연결 테스트
        client.admin.command('ping')
        print("MongoDB 연결 성공")
        
        # 모든 산 데이터 가져오기 (name, lat, lng로 매칭)
        # MongoDB에는 code가 없고 name만 있음
        mountains_by_code = {}  # code로 매칭 (tmp_kb_courses.json의 mountain_code)
        mountains_by_name = {}   # name으로 매칭 (MongoDB의 name)
        count = 0
        
        # 컬렉션명 자동 찾기 (대소문자 구분)
        collection_names = [name for name in db.list_collection_names()]
        actual_collection_name = None
        for name in collection_names:
            if name.lower() in ['mountain_list', 'mountain_lists']:
                actual_collection_name = name
                break
        
        if not actual_collection_name:
            actual_collection_name = COLLECTION_NAME
            print(f"경고: 컬렉션 '{COLLECTION_NAME}'를 사용합니다. 실제 컬렉션: {collection_names}")
        else:
            print(f"컬렉션 발견: {actual_collection_name}")
            collection = db[actual_collection_name]
        
        # MongoDB에서 모든 산 데이터 가져오기 (name, lat, lng)
        for doc in collection.find({}, {"name": 1, "lat": 1, "lng": 1}):
            name = doc.get("name")
            code = doc.get("code")  # 있으면 사용
            
            if name:
                # name으로 인덱싱
                mountains_by_name[name] = {
                    "lat": doc.get("lat"),
                    "lng": doc.get("lng"),
                    "name": name
                }
                
                # code가 있으면 code로도 인덱싱
                if code:
                    mountains_by_code[str(code)] = mountains_by_name[name]
                
                count += 1
        
        print(f"MongoDB에서 {count}개 산 정보 가져옴")
        return {"by_code": mountains_by_code, "by_name": mountains_by_name}
        
        client.close()
        print(f"MongoDB에서 {count}개 산 정보 가져옴 (위도/경도 포함: {sum(1 for m in mountains.values() if m.get('lat') and m.get('lng'))}개)")
        return mountains
    except Exception as e:
        print(f"MongoDB 연결 실패: {e}")
        print("파일에서 위도/경도 정보를 찾아봅니다...")
        return None

def load_mountain_list_from_file():
    """파일에서 산 정보 로드 (lat/lng가 있다면)"""
    try:
        with open('tmp_mountain_list.json', 'r', encoding='utf-8') as f:
            mountain_list = json.load(f)
        
        mountains = {}
        for m in mountain_list:
            code = m.get('code')
            if code:
                mountains[str(code)] = {
                    "lat": m.get("lat"),
                    "lng": m.get("lng"),
                    "name": m.get("name")
                }
        
        return mountains
    except Exception as e:
        print(f"파일 로드 실패: {e}")
        return None

def update_kb_courses():
    """KB 코스 데이터 업데이트"""
    # 1. 파일 로드 (필터링된 파일이 있으면 사용)
    input_file = 'tmp_kb_courses_filtered.json' if os.path.exists('tmp_kb_courses_filtered.json') else 'tmp_kb_courses.json'
    print(f"파일 로딩 중: {input_file}")
    
    with open(input_file, 'r', encoding='utf-8') as f:
        kb_data = json.load(f)
    
    print(f"KB 코스 데이터: {len(kb_data['mountains'])}개 산")
    
    # 2. 위도/경도 정보 가져오기 (MongoDB 우선, 없으면 파일)
    coords_data = get_mountain_coords_from_mongodb()
    if not coords_data:
        file_coords = load_mountain_list_from_file()
        if file_coords:
            coords_data = {"by_code": file_coords, "by_name": {}}
        else:
            coords_data = {"by_code": {}, "by_name": {}}
    
    if not coords_data:
        print("경고: 위도/경도 정보를 가져올 수 없습니다.")
        coords_data = {"by_code": {}, "by_name": {}}
    
    # 3. 위도/경도 추가
    updated_mountains = []
    added_coords_count = 0
    coords_with_both = 0
    
    for mountain in kb_data['mountains']:
        mountain_code = str(mountain.get('mountain_code', ''))
        mountain_name = mountain.get('mountain_name', '')
        
        # 위도/경도 추가 (code로 먼저 시도, 없으면 name으로)
        coords = None
        if mountain_code in coords_data.get('by_code', {}):
            coords = coords_data['by_code'][mountain_code]
        elif mountain_name in coords_data.get('by_name', {}):
            coords = coords_data['by_name'][mountain_name]
        
        if coords:
            if coords.get('lat') is not None:
                mountain['latitude'] = coords['lat']
                added_coords_count += 1
            if coords.get('lng') is not None:
                mountain['longitude'] = coords['lng']
            
            if coords.get('lat') is not None and coords.get('lng') is not None:
                coords_with_both += 1
        
        # 코스 필터링: duration_min <= 10 AND distance_km <= 0.5 제거
        filtered_courses = []
        for course in mountain.get('courses', []):
            duration = course.get('duration_min', 0)
            distance = course.get('distance_km', 0)
            
            if duration <= 10 and distance <= 0.5:
                continue
            
            filtered_courses.append(course)
        
        # 코스가 남아있으면 산 추가
        if filtered_courses:
            mountain['courses'] = filtered_courses
            updated_mountains.append(mountain)
    
    print(f"\n처리 결과:")
    print(f"- 위도/경도 추가된 산: {added_coords_count}개")
    print(f"- 위도와 경도 모두 있는 산: {coords_with_both}개")
    print(f"- 최종 산 개수: {len(updated_mountains)}개")
    
    # 4. 백업 후 업데이트
    if os.path.exists('tmp_kb_courses.json'):
        import shutil
        shutil.copy('tmp_kb_courses.json', 'tmp_kb_courses.json.backup')
        print("\n백업 생성: tmp_kb_courses.json.backup")
    
    # 5. 업데이트된 데이터 저장 (권한 문제 방지를 위해 새 파일로 저장)
    kb_data['mountains'] = updated_mountains
    output_file = 'tmp_kb_courses_final.json'
    
    try:
        with open('tmp_kb_courses.json', 'w', encoding='utf-8') as f:
            json.dump(kb_data, f, ensure_ascii=False, indent=2)
        print(f"업데이트 완료: tmp_kb_courses.json")
    except PermissionError:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(kb_data, f, ensure_ascii=False, indent=2)
        print(f"권한 문제로 새 파일로 저장: {output_file}")
        print(f"수동으로 복사: cp {output_file} tmp_kb_courses.json")

if __name__ == "__main__":
    update_kb_courses()


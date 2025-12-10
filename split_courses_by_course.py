#!/usr/bin/env python3
"""
tmp_kb_courses_final.json을 코스별로 분리하여 JSONL 형식으로 변환
각 코스를 독립적인 문서로 만들어 KB 검색 정확도 향상
"""

import json

def split_courses_by_course():
    """코스별로 분리하여 JSONL 파일 생성"""
    
    # 1. 원본 파일 로드
    print("파일 로딩 중: tmp_kb_courses_final.json")
    with open('tmp_kb_courses_final.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    mountains = data.get('mountains', [])
    print(f"총 {len(mountains)}개 산 발견")
    
    # 2. 코스별로 분리
    course_documents = []
    total_courses = 0
    
    for mountain in mountains:
        mountain_code = mountain.get('mountain_code', '')
        mountain_name = mountain.get('mountain_name', '')
        latitude = mountain.get('latitude')
        longitude = mountain.get('longitude')
        
        courses = mountain.get('courses', [])
        
        for course in courses:
            # 각 코스를 독립적인 문서로 생성
            course_doc = {
                "mountain_code": mountain_code,
                "mountain_name": mountain_name,
                "latitude": latitude,
                "longitude": longitude,
                "course_name": course.get('course_name', ''),
                "distance_km": course.get('distance_km'),
                "duration_min": course.get('duration_min'),
                "surface": course.get('surface'),
                "difficulty": course.get('difficulty'),
                "difficulty_score": course.get('difficulty_score'),
                "filename": course.get('filename')
            }
            
            course_documents.append(course_doc)
            total_courses += 1
    
    print(f"총 {total_courses}개 코스 문서 생성")
    
    # 3. JSONL 형식으로 저장
    output_filename = 'tmp_kb_courses_by_course.jsonl'
    print(f"\nJSONL 파일 생성 중: {output_filename}")
    
    with open(output_filename, 'w', encoding='utf-8') as f:
        for doc in course_documents:
            json_line = json.dumps(doc, ensure_ascii=False)
            f.write(json_line + '\n')
    
    print(f"완료: {output_filename}")
    print(f"총 {len(course_documents)}개 코스 문서 저장")
    
    # 4. 샘플 출력 (처음 3개)
    print("\n샘플 문서 (처음 3개):")
    for i, doc in enumerate(course_documents[:3], 1):
        print(f"\n[{i}] {doc['mountain_name']} - {doc['course_name']}")
        print(f"    거리: {doc['distance_km']}km, 시간: {doc['duration_min']}분, 난이도: {doc['difficulty']}")
        print(f"    위도: {doc['latitude']}, 경도: {doc['longitude']}")

if __name__ == "__main__":
    split_courses_by_course()


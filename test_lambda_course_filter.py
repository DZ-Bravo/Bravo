"""
람다 함수 테스트용 코드
실제 람다에 배포하기 전에 로컬에서 테스트 가능
"""

import json
from lambda_course_filter import lambda_handler

# 테스트 케이스 1: 부산 초보 코스
test_event_1 = {
    "kb_results": [
        '{"mountain_code": "267100401", "mountain_name": "달음산(부산광역시 기장군 일광면 원리)", "latitude": 35.3077778, "longitude": 129.2108333, "course_name": "원리구간", "distance_km": 0.88, "duration_min": 27, "surface": null, "difficulty": "쉬움", "difficulty_score": 0, "filename": "PMNTN_달음산_267100401.json"} {"mountain_code": "263800601", "mountain_name": "아미산(부산광역시 사하구 장림동)", "latitude": 35.0744106, "longitude": 128.9670333, "course_name": "장림동구간", "distance_km": 0.62, "duration_min": 19, "surface": null, "difficulty": "쉬움", "difficulty_score": 0, "filename": "PMNTN_아미산_263800601.json"} {"mountain_code": "414300701", "mountain_name": "오봉산(경기도 의왕시 이동)", "latitude": 37.3426346, "longitude": 126.9642332, "course_name": "이동구간", "distance_km": 2.36, "duration_min": 71, "surface": null, "difficulty": "쉬움", "difficulty_score": 2, "filename": "PMNTN_오봉산_414300701.json"}'
    ],
    "region": "부산",
    "difficulty": "쉬움",
    "limit": 5
}

# 테스트 케이스 2: 서울 (난이도 지정 없음)
test_event_2 = {
    "kb_results": [
        '{"mountain_code": "112600501", "mountain_name": "용마산(서울특별시 중랑구 면목동)", "latitude": 37.5907951, "longitude": 127.0947948, "course_name": "사가정공원 입구-깔딱고개 입구구간", "distance_km": 0.57, "duration_min": 17, "surface": "토사", "difficulty": "쉬움", "difficulty_score": 1, "filename": "PMNTN_용마산_112600501.json"} {"mountain_code": "113801501", "mountain_name": "봉산(서울특별시 은평구 구산동)", "latitude": 37.6122103, "longitude": 126.901268, "course_name": "신사동구간", "distance_km": 0.57, "duration_min": 17, "surface": "흙길", "difficulty": "쉬움", "difficulty_score": 0, "filename": "PMNTN_봉산_113801501.json"}'
    ],
    "region": "서울",
    "limit": 3
}

if __name__ == "__main__":
    print("=== 테스트 1: 부산 초보 코스 ===")
    result1 = lambda_handler(test_event_1, None)
    print(json.dumps(json.loads(result1['body']), indent=2, ensure_ascii=False))
    
    print("\n=== 테스트 2: 서울 (난이도 지정 없음) ===")
    result2 = lambda_handler(test_event_2, None)
    print(json.dumps(json.loads(result2['body']), indent=2, ensure_ascii=False))


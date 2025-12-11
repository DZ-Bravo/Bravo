import json
import re

def lambda_handler(event, context):
    """
    KB 검색 결과를 필터링하고 정렬하는 람다 함수
    
    Input:
    {
        "kb_results": ["chunk1_text", "chunk2_text", ...],  # KB 검색 결과 chunk들
        "region": "서울" or "부산" or null,  # 지역 필터 (선택)
        "difficulty": "쉬움" or "보통" or "어려움" or null,  # 난이도 필터 (선택)
        "limit": 10  # 반환할 최대 코스 수 (기본 10)
    }
    
    Output:
    {
        "courses": [
            {
                "mountain_code": "...",
                "mountain_name": "...",
                "latitude": 37.xxx,
                "longitude": 127.xxx,
                "course_name": "...",
                "distance_km": 0.5,
                "duration_min": 20,
                "difficulty": "쉬움",
                "difficulty_score": 0
            },
            ...
        ]
    }
    """
    
    try:
        # 입력 파라미터 추출
        kb_results = event.get('kb_results', [])
        region = event.get('region')  # "서울", "부산" 등
        difficulty = event.get('difficulty')  # "쉬움", "보통", "어려움" 등
        limit = event.get('limit', 10)
        
        # 1. 모든 chunk를 합쳐서 JSON Lines 파싱
        all_courses = []
        
        for chunk_text in kb_results:
            if not chunk_text:
                continue
            
            # chunk 텍스트를 줄 단위로 분리
            lines = chunk_text.split('\n')
            
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                
                # JSON Lines 형식: 각 줄이 완전한 JSON 객체
                # 하지만 chunk에 여러 JSON이 붙어있을 수 있음
                # {"mountain_code": ...} {"mountain_code": ...} 형태
                
                # 중괄호로 시작하는 모든 JSON 객체 찾기
                brace_count = 0
                start_idx = -1
                
                for i, char in enumerate(line):
                    if char == '{':
                        if brace_count == 0:
                            start_idx = i
                        brace_count += 1
                    elif char == '}':
                        brace_count -= 1
                        if brace_count == 0 and start_idx >= 0:
                            # 완전한 JSON 객체 추출
                            json_str = line[start_idx:i+1]
                            try:
                                course = json.loads(json_str)
                                if 'mountain_code' in course:  # 유효한 코스 데이터인지 확인
                                    all_courses.append(course)
                            except json.JSONDecodeError:
                                pass
                            start_idx = -1
        
        # 2. 지역 필터링
        if region:
            filtered_courses = []
            region_keywords = {
                '서울': ['서울특별시', '서울'],
                '부산': ['부산광역시', '부산'],
                '경기': ['경기도', '경기'],
                '인천': ['인천광역시', '인천'],
                '대구': ['대구광역시', '대구'],
                '대전': ['대전광역시', '대전'],
                '광주': ['광주광역시', '광주'],
                '울산': ['울산광역시', '울산'],
                '강원': ['강원특별자치도', '강원도', '강원'],
                '충북': ['충청북도', '충북'],
                '충남': ['충청남도', '충남'],
                '전북': ['전라북도', '전북'],
                '전남': ['전라남도', '전남'],
                '경북': ['경상북도', '경북'],
                '경남': ['경상남도', '경남'],
                '제주': ['제주특별자치도', '제주도', '제주']
            }
            
            keywords = region_keywords.get(region, [region])
            
            for course in all_courses:
                mountain_name = course.get('mountain_name', '')
                # 괄호 안 주소 확인
                if '(' in mountain_name and ')' in mountain_name:
                    address = mountain_name.split('(')[1].split(')')[0]
                    if any(keyword in address for keyword in keywords):
                        filtered_courses.append(course)
            
            all_courses = filtered_courses
        
        # 3. difficulty_score 기반 난이도 분류 및 필터링
        def get_difficulty_from_score(score):
            """difficulty_score를 난이도로 변환"""
            if score is None:
                return '보통'  # 기본값
            if score <= 2:
                return '쉬움'
            elif score <= 5:
                return '보통'
            else:  # 6점 이상
                return '어려움'
        
        # 각 코스에 difficulty_score 기반 난이도 추가/업데이트
        for course in all_courses:
            score = course.get('difficulty_score')
            course['difficulty'] = get_difficulty_from_score(score)
        
        # 난이도 필터링
        if difficulty:
            # 특정 난이도만 필터
            all_courses = [c for c in all_courses if c.get('difficulty') == difficulty]
        else:
            # 난이도 우선순위: 쉬움 > 보통 > 어려움
            difficulty_order = {'쉬움': 0, '보통': 1, '어려움': 2}
            all_courses.sort(key=lambda x: difficulty_order.get(x.get('difficulty', '어려움'), 99))
        
        # 4. 거리 → 시간 순으로 정렬
        all_courses.sort(key=lambda x: (
            x.get('distance_km', 999),
            x.get('duration_min', 999)
        ))
        
        # 5. 상위 N개만 반환
        result_courses = all_courses[:limit]
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'courses': result_courses,
                'count': len(result_courses)
            }, ensure_ascii=False)
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e)
            }, ensure_ascii=False)
        }


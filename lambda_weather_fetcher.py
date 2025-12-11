import json
import os
import urllib.request
import urllib.parse
import urllib.error
import logging
from typing import List, Dict, Optional

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """
    코스 리스트를 받아서 각 코스의 날씨 데이터를 가져오는 람다 함수
    
    Input:
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
                "difficulty_score": 0,
                ...
            },
            ...
        ]
    }
    
    Output:
    {
        "statusCode": 200,
        "body": {
            "courses_with_weather": [
                {
                    "mountain_code": "...",
                    "mountain_name": "...",
                    "latitude": 37.xxx,
                    "longitude": 127.xxx,
                    "course_name": "...",
                    "distance_km": 0.5,
                    "duration_min": 20,
                    "difficulty": "쉬움",
                    "difficulty_score": 0,
                    "weather": {
                        "temp": 20.5,
                        "feels_like": 19.2,
                        "humidity": 65,
                        "wind_speed": 2.5,
                        "description": "맑음",
                        "clouds": 10,
                        "main": "Clear",
                        "icon": "01d"
                    }
                },
                ...
            ],
            "count": 5
        }
    }
    """
    
    try:
        # 입력 파라미터 추출
        courses = event.get('courses', [])
        
        if not courses:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': '코스 리스트가 필요합니다.'
                }, ensure_ascii=False)
            }
        
        logger.info(f"날씨 조회 대상 코스 수: {len(courses)}")
        
        # 환경 변수에서 API 키 가져오기
        api_key = os.environ.get('OPENWEATHER_API_KEY')
        if not api_key:
            logger.error("OPENWEATHER_API_KEY 환경 변수가 설정되지 않음")
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': '날씨 API 키가 설정되지 않았습니다.'
                }, ensure_ascii=False)
            }
        
        # 각 코스의 날씨 데이터 가져오기
        courses_with_weather = []
        
        for course in courses:
            latitude = course.get('latitude')
            longitude = course.get('longitude')
            mountain_name = course.get('mountain_name', '미지정')
            
            # 좌표 검증
            if latitude is None or longitude is None:
                logger.warning(f"좌표가 없는 코스 스킵: {mountain_name}")
                continue
            
            if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
                logger.warning(f"좌표 범위 오류 스킵: {mountain_name} (lat={latitude}, lon={longitude})")
                continue
            
            # 날씨 데이터 가져오기
            weather_data = fetch_weather(latitude, longitude, api_key)
            
            if weather_data:
                # 코스 정보 + 날씨 정보 결합
                course_with_weather = course.copy()
                course_with_weather['weather'] = weather_data
                courses_with_weather.append(course_with_weather)
                logger.info(f"날씨 조회 성공: {mountain_name} - {weather_data.get('description', '')}")
            else:
                logger.warning(f"날씨 조회 실패: {mountain_name}")
                # 날씨 조회 실패해도 코스 정보는 포함 (날씨 없이)
                course_with_weather = course.copy()
                course_with_weather['weather'] = None
                courses_with_weather.append(course_with_weather)
        
        logger.info(f"날씨 조회 완료: {len(courses_with_weather)}개 코스")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'courses_with_weather': courses_with_weather,
                'count': len(courses_with_weather)
            }, ensure_ascii=False)
        }
        
    except Exception as e:
        logger.error(f"예상치 못한 오류: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': f'날씨 조회 중 오류 발생: {str(e)}'
            }, ensure_ascii=False)
        }


def fetch_weather(latitude: float, longitude: float, api_key: str) -> Optional[Dict]:
    """
    OpenWeather API를 호출하여 날씨 데이터를 가져옴
    
    Returns:
        날씨 데이터 딕셔너리 또는 None (실패 시)
    """
    try:
        url = "https://api.openweathermap.org/data/2.5/weather"
        params = {
            'lat': latitude,
            'lon': longitude,
            'appid': api_key,
            'units': 'metric',
            'lang': 'kr'
        }
        
        query_string = urllib.parse.urlencode(params)
        full_url = f"{url}?{query_string}"
        
        with urllib.request.urlopen(full_url, timeout=10) as response:
            if response.status != 200:
                logger.error(f"날씨 API HTTP 오류: {response.status}")
                return None
            
            data = json.loads(response.read().decode())
            
            # API 응답 검증
            if 'main' not in data or 'weather' not in data:
                logger.error(f"날씨 API 응답 형식 오류: {data}")
                return None
            
            if not data.get('weather') or len(data['weather']) == 0:
                logger.error("날씨 정보가 없음")
                return None
            
            # 필요한 날씨 데이터만 추출
            weather_info = {
                'temp': data['main'].get('temp', 0),
                'feels_like': data['main'].get('feels_like', 0),
                'humidity': data['main'].get('humidity', 0),
                'wind_speed': data.get('wind', {}).get('speed', 0),
                'description': data['weather'][0].get('description', ''),
                'clouds': data.get('clouds', {}).get('all', 0),
                'main': data['weather'][0].get('main', ''),  # Rain, Clear, Clouds 등
                'icon': data['weather'][0].get('icon', '')
            }
            
            return weather_info
            
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if hasattr(e, 'read') else ''
        logger.error(f"날씨 API HTTP 오류: {e.code} - {e.reason}, {error_body}")
        return None
    except urllib.error.URLError as e:
        logger.error(f"날씨 API URL 오류: {e.reason}")
        return None
    except json.JSONDecodeError as e:
        logger.error(f"날씨 API JSON 파싱 오류: {e}")
        return None
    except Exception as e:
        logger.error(f"날씨 조회 중 오류: {str(e)}", exc_info=True)
        return None




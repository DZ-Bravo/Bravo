import os
import json
import requests

API_KEY = "5845f67e1cb9eac922b39d43844a8fc1"
URL = "https://api.openweathermap.org/data/2.5/forecast"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 산 목록 파일 (전체 500개짜리)
MOUNTAIN_LIST_PATH = os.path.join(
    BASE_DIR,
    "..",
    "site_mountains_500_final_matched_with_address_cleaned.json",
)

# 한 산에 대한 5일치 예보를 current_weather_refine 형식으로 여러 개 저장
OUTPUT_PATH = os.path.join(BASE_DIR, "one_mountain_forecast_5days_refine.json")


def load_mountains(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def fetch_forecast(lat, lon):
    params = {
        "lat": lat,
        "lon": lon,
        "appid": API_KEY,
        "units": "metric",
        "lang": "kr",
    }
    resp = requests.get(URL, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


def one_step_to_current_like(city: dict, step: dict, cod: str) -> dict:
    """
    forecast_example.json 의 city + list[i] 를
    current_weather_refine.json 과 같은 키 구조로 맞춘다.
    """
    return {
        "coord": city["coord"],
        "weather": step["weather"],
        "main": {
            "temp": step["main"]["temp"],
            "feels_like": step["main"].get("feels_like"),
            "temp_min": step["main"].get("temp_min"),
            "temp_max": step["main"].get("temp_max"),
            "humidity": step["main"]["humidity"],
        },
        "wind": step["wind"],
        "clouds": step["clouds"],
        "dt": step["dt"],
        "sys": {
            "country": city["country"],
            "sunrise": city["sunrise"],
            "sunset": city["sunset"],
        },
        "timezone": city["timezone"],
        "id": city["id"],
        "name": city["name"],
        "cod": cod,
    }


def main():
    mountains = load_mountains(MOUNTAIN_LIST_PATH)

    # 리스트 첫 번째 산 하나만 대상으로 예보 5일치
    m0 = mountains[0]
    name = m0.get("name")
    lat = m0.get("lat")
    lon = m0.get("lng")

    print(f"예시 산 1개 5일치 예보 요청: {name} ({lat}, {lon})")

    data = fetch_forecast(lat, lon)

    city = data["city"]
    cod = data["cod"]
    steps = data.get("list", [])

    # 3시간 간격 예보 전체(보통 40개)를 current_weather_refine 형식으로 변환
    results = [one_step_to_current_like(city, step, cod) for step in steps]

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=4)

    print(
        f"{len(results)}개(최대 5일치)의 예보를 current_weather_refine 형식 리스트로 저장했습니다 → {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()



import requests
import json

API_KEY = "5845f67e1cb9eac922b39d43844a8fc1"

lat = 37.445044
lon = 126.964223

url = "https://api.openweathermap.org/data/2.5/weather"

params = {
    "lat": lat,
    "lon": lon,
    "appid": API_KEY,
    "units": "metric",
    "lang": "kr"
}

response = requests.get(url, params=params)
data = response.json()

def refine_weather(raw):
    """
    OpenWeather API 원본 응답을 current_weather_refine.json 형식으로 변환.
    불필요한 필드(base, main.pressure, main.sea_level, main.grnd_level, visibility, sys.type, sys.id) 제거.
    """
    # coord는 그대로
    refined = {
        "coord": raw["coord"],
        "weather": raw["weather"],
    }
    
    # main에서 필요한 필드만 추출
    refined["main"] = {
        "temp": raw["main"]["temp"],
        "feels_like": raw["main"]["feels_like"],
        "temp_min": raw["main"]["temp_min"],
        "temp_max": raw["main"]["temp_max"],
        "humidity": raw["main"]["humidity"],
    }
    
    # wind, clouds는 그대로
    refined["wind"] = raw["wind"]
    refined["clouds"] = raw["clouds"]
    refined["dt"] = raw["dt"]
    
    # sys에서 필요한 필드만 추출
    refined["sys"] = {
        "country": raw["sys"]["country"],
        "sunrise": raw["sys"]["sunrise"],
        "sunset": raw["sys"]["sunset"],
    }
    
    # timezone, id, name, cod는 그대로
    refined["timezone"] = raw["timezone"]
    refined["id"] = raw["id"]
    refined["name"] = raw["name"]
    refined["cod"] = raw["cod"]
    
    return refined

refined = refine_weather(data)

with open("current_weather_refine/current_weather_refine.json", "w", encoding="utf-8") as f:
    json.dump(refined, f, ensure_ascii=False, indent=4)

print(refined)

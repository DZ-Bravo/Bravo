import json
import re

def lambda_handler(event, context):
    """
    Bedrock Agent의 Nova 모델 응답을 파싱하는 Lambda 함수
    
    입력: Agent의 원본 응답 (실제 형식은 Bedrock Agent에 따라 다를 수 있음)
    출력: 파싱된 응답 형식
    """
    try:
        # 디버깅: 입력 로그
        print(f"[Parser Lambda] Received event: {json.dumps(event, ensure_ascii=False)[:500]}")
        
        # 입력 형식 1: message 형태
        if 'message' in event:
            message = event.get('message', {})
            content = message.get('content', [{}])[0]
            original_text = content.get('text', '')
        # 입력 형식 2: 직접 text 형태
        elif 'text' in event:
            original_text = event.get('text', '')
        # 입력 형식 3: 전체를 문자열로
        else:
            original_text = json.dumps(event) if isinstance(event, dict) else str(event)
        
        if not original_text:
            print("[Parser Lambda] Empty input")
            return {
                'orchestrationParsedResponse': {
                    'responseDetails': {
                        'completion': {
                            'text': ''
                        }
                    }
                }
            }
        
        print(f"[Parser Lambda] Processing text length: {len(original_text)}")
        
        # Nova 모델 응답 파싱
        # <thinking> 태그 내용 추출 (선택사항)
        thought = ''
        thought_match = re.search(r'<thinking>(.*?)</thinking>', original_text, re.DOTALL)
        if thought_match:
            thought = thought_match.group(1).strip()
        
        # <answer> 태그 내용 추출 (최종 응답)
        parsed_text = original_text
        answer_match = re.search(r'<answer>(.*?)</answer>', original_text, re.DOTALL)
        if answer_match:
            parsed_text = answer_match.group(1).strip()
        else:
            # <answer> 태그가 없으면 <thinking> 태그만 제거
            parsed_text = re.sub(r'<thinking>.*?</thinking>', '', original_text, flags=re.DOTALL).strip()
        
        # 결과 반환 - orchestrationParsedResponse 형식
        result = {
            'orchestrationParsedResponse': {
                'responseDetails': {
                    'completion': {
                        'text': parsed_text
                    }
                }
            }
        }
        
        print(f"[Parser Lambda] Returning parsed text length: {len(parsed_text)}")
        return result
        
    except Exception as e:
        print(f"[Parser Lambda] Error: {str(e)}")
        import traceback
        print(f"[Parser Lambda] Traceback: {traceback.format_exc()}")
        
        # 에러 발생 시 원본 텍스트 반환 (최소한의 처리)
        try:
            original = event.get('message', {}).get('content', [{}])[0].get('text', '') if isinstance(event, dict) else str(event)
        except:
            original = str(event)
            
        return {
            'orchestrationParsedResponse': {
                'responseDetails': {
                    'completion': {
                        'text': original
                    }
                }
            }
        }

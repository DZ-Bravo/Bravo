#!/usr/bin/env python3
"""
QR 코드 생성 스크립트
https://hiker-cloud.site/ URL을 QR 코드로 변환합니다.
"""

import qrcode
from PIL import Image

def generate_qr_code(url, output_file='qr_code.png'):
    """URL을 QR 코드로 변환하여 이미지 파일로 저장"""
    # QR 코드 생성
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    
    qr.add_data(url)
    qr.make(fit=True)
    
    # QR 코드 이미지 생성
    img = qr.make_image(fill_color="black", back_color="white")
    
    # 파일로 저장
    img.save(output_file)
    print(f"QR 코드가 '{output_file}' 파일로 저장되었습니다!")
    return output_file

if __name__ == "__main__":
    url = "https://hiker-cloud.site/"
    output = generate_qr_code(url)
    print(f"\n생성된 QR 코드 파일: {output}")


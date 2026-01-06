#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
기존 QR 코드 이미지 중앙에 로고 이미지 삽입
QR 코드를 새로 만들지 않고, 기존 QR 코드에 이미지만 추가
"""
from PIL import Image
import sys
import os

def add_logo_to_qr(qr_image_path, logo_path='qrcode.png', output_path=None):
    """
    기존 QR 코드 이미지 중앙에 로고 이미지를 삽입합니다.
    
    Args:
        qr_image_path: 기존 QR 코드 이미지 경로
        logo_path: 중앙에 삽입할 로고 이미지 경로 (기본값: qrcode.png)
        output_path: 출력 파일 경로 (None이면 qr_image_path에 덮어쓰기)
    """
    # 기존 QR 코드 이미지 로드
    if not os.path.exists(qr_image_path):
        print(f"오류: QR 코드 이미지를 찾을 수 없습니다: {qr_image_path}", file=sys.stderr)
        sys.exit(1)
    
    qr_img = Image.open(qr_image_path)
    
    # RGB 모드로 변환
    if qr_img.mode != 'RGB':
        qr_img = qr_img.convert('RGB')
    
    # 로고 이미지 로드
    if not os.path.exists(logo_path):
        print(f"오류: 로고 이미지를 찾을 수 없습니다: {logo_path}", file=sys.stderr)
        sys.exit(1)
    
    logo = Image.open(logo_path)
    
    # 팔레트 모드나 다른 모드를 RGB/RGBA로 변환
    if logo.mode == 'P':
        logo = logo.convert('RGBA')
    elif logo.mode == 'L':  # Grayscale 모드
        logo = logo.convert('RGB')  # RGB로 변환하여 회색 이미지 삽입
    elif logo.mode not in ('RGB', 'RGBA'):
        logo = logo.convert('RGB')
    
    # QR 코드 크기
    qr_width, qr_height = qr_img.size
    
    # 로고 크기 조정 (QR 코드 크기의 약 25-30%로 설정하여 QR 코드 스캔 가능하도록)
    # QR 코드의 중요한 패턴(모서리, 정렬 마커)이 가려지지 않도록 적절한 크기 유지
    logo_size = max(int(min(qr_width, qr_height) * 0.28), 50)
    
    # 비율 유지하며 리사이즈
    logo.thumbnail((logo_size, logo_size), Image.Resampling.LANCZOS)
    
    # 중앙에 배치하기 위한 위치 계산
    logo_pos = (
        (qr_width - logo.size[0]) // 2,
        (qr_height - logo.size[1]) // 2
    )
    
    # 로고를 QR 코드 중앙에 붙여넣기
    if logo.mode == 'RGBA':
        # 알파 채널이 있는 경우 - 투명 배경 처리
        qr_img.paste(logo, logo_pos, logo)
    else:
        # RGB 모드인 경우 직접 붙여넣기
        qr_img.paste(logo, logo_pos)
    
    # 결과 저장
    if output_path is None:
        output_path = qr_image_path
    
    qr_img.save(output_path)
    print(f"로고가 QR 코드 중앙에 삽입되었습니다: {output_path}", file=sys.stderr)
    
    return qr_img

def main():
    """메인 함수"""
    import argparse
    
    parser = argparse.ArgumentParser(description='기존 QR 코드 중앙에 로고 이미지 삽입')
    parser.add_argument('qr_image', help='기존 QR 코드 이미지 경로')
    parser.add_argument('-l', '--logo', default='qrcode.png', help='로고 이미지 경로 (기본값: qrcode.png)')
    parser.add_argument('-o', '--output', help='출력 파일 경로 (기본값: 기존 QR 코드 파일에 덮어쓰기)')
    
    args = parser.parse_args()
    
    try:
        add_logo_to_qr(
            qr_image_path=args.qr_image,
            logo_path=args.logo,
            output_path=args.output
        )
    except Exception as e:
        print(f"오류: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()


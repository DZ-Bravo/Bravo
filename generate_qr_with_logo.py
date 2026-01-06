#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QR 코드 생성 스크립트 (중앙 로고 포함)
기존 QR 코드 동작을 유지하면서 중앙에 로고 이미지를 삽입합니다.
"""
import qrcode
from qrcode.image.pil import PilImage
from PIL import Image
import sys
import os

def create_qr_with_logo(data, logo_path='qrcode.png', output_path=None, box_size=10, border=4):
    """
    QR 코드를 생성하고 중앙에 로고를 삽입합니다.
    
    Args:
        data: QR 코드에 인코딩할 데이터
        logo_path: 중앙에 삽입할 로고 이미지 경로
        output_path: 출력 파일 경로 (None이면 stdout으로 출력)
        box_size: QR 코드 박스 크기
        border: QR 코드 테두리 크기
    """
    # QR 코드 생성 (에러 수정 레벨을 H로 설정하여 로고 삽입 후에도 읽기 가능하도록)
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,  # 높은 에러 수정 레벨
        box_size=box_size,
        border=border,
    )
    qr.add_data(data)
    qr.make(fit=True)
    
    # QR 코드 이미지 생성
    qr_img = qr.make_image(fill_color="black", back_color="white").convert('RGB')
    
    # 로고 이미지가 있으면 중앙에 삽입
    if os.path.exists(logo_path):
        logo = Image.open(logo_path)
        
        # 팔레트 모드나 다른 모드를 RGB/RGBA로 변환
        if logo.mode == 'P':
            # 팔레트 모드를 RGBA로 변환 (투명도 지원)
            logo = logo.convert('RGBA')
        elif logo.mode not in ('RGB', 'RGBA'):
            logo = logo.convert('RGB')
        
        # QR 코드 크기 계산
        qr_width, qr_height = qr_img.size
        
        # 로고 크기 조정 (QR 코드 크기의 약 20-25%로 설정)
        # 에러 수정 레벨이 H이므로 로고가 어느 정도 커도 스캔 가능
        logo_size = max(int(min(qr_width, qr_height) * 0.20), 40)
        
        # 로고를 정사각형으로 리사이즈 (비율 유지)
        logo.thumbnail((logo_size, logo_size), Image.Resampling.LANCZOS)
        
        # 로고를 중앙에 배치하기 위한 위치 계산
        logo_pos = (
            (qr_width - logo.size[0]) // 2,
            (qr_height - logo.size[1]) // 2
        )
        
        # 로고를 QR 코드 중앙에 붙여넣기
        # RGBA 모드인 경우 알파 채널을 사용하여 투명 배경 처리
        if logo.mode == 'RGBA':
            # 알파 채널이 있는 경우 - 투명 배경은 그대로 두고 불투명한 부분만 붙여넣기
            qr_img.paste(logo, logo_pos, logo)
        else:
            # RGB 모드인 경우 직접 붙여넣기
            qr_img.paste(logo, logo_pos)
    else:
        print(f"경고: 로고 파일을 찾을 수 없습니다: {logo_path}", file=sys.stderr)
    
    # 결과 저장 또는 출력
    if output_path:
        qr_img.save(output_path)
        print(f"QR 코드가 생성되었습니다: {output_path}", file=sys.stderr)
    else:
        # stdout으로 출력
        qr_img.save(sys.stdout.buffer, format='PNG')
    
    return qr_img

def main():
    """메인 함수"""
    import argparse
    
    parser = argparse.ArgumentParser(description='QR 코드 생성 (중앙 로고 포함)')
    parser.add_argument('data', nargs='?', help='QR 코드에 인코딩할 데이터')
    parser.add_argument('-o', '--output', help='출력 파일 경로')
    parser.add_argument('-l', '--logo', default='qrcode.png', help='로고 이미지 경로 (기본값: qrcode.png)')
    parser.add_argument('--box-size', type=int, default=10, help='QR 코드 박스 크기 (기본값: 10)')
    parser.add_argument('--border', type=int, default=4, help='QR 코드 테두리 크기 (기본값: 4)')
    
    args = parser.parse_args()
    
    # 데이터가 없으면 stdin에서 읽기
    if args.data:
        data = args.data
    else:
        data = sys.stdin.read()
    
    if not data:
        print("오류: QR 코드에 인코딩할 데이터가 필요합니다.", file=sys.stderr)
        sys.exit(1)
    
    try:
        create_qr_with_logo(
            data,
            logo_path=args.logo,
            output_path=args.output,
            box_size=args.box_size,
            border=args.border
        )
    except Exception as e:
        print(f"오류: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()


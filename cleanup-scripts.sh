#!/bin/bash
echo "=== 스크립트 파일 정리 ==="
echo ""
echo "삭제할 파일:"
echo "  - upload-mountain-to-mongodb.sh (사용 안 함)"
echo "  - upload-mountain-to-mongodb.js (사용 안 함)"
echo "  - copy-mountain-files.sh (사용 완료)"
echo "  - quick-fix-pvc.sh (사용 완료)"
echo "  - optimize-elasticsearch.sh (미사용)"
echo ""
read -p "삭제하시겠습니까? (y/n): " confirm
if [ "$confirm" = "y" ]; then
  rm -f /home/bravo/LABs/upload-mountain-to-mongodb.sh
  rm -f /home/bravo/LABs/upload-mountain-to-mongodb.js
  rm -f /home/bravo/LABs/copy-mountain-files.sh
  rm -f /home/bravo/LABs/quick-fix-pvc.sh
  rm -f /home/bravo/LABs/optimize-elasticsearch.sh
  echo "✅ 삭제 완료!"
else
  echo "취소되었습니다."
fi

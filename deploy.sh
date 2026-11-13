#!/usr/bin/env bash
# 사이트 업데이트: 파일 버전 표시를 갱신(브라우저 캐시 무효화) → 커밋 → GitHub에 푸시
# 사용법: bash deploy.sh "바뀐 내용 한 줄 설명"
set -euo pipefail
cd "$(dirname "$0")"
v=$(date +%Y%m%d%H%M%S)
sed -i -E "s/(style\.css|config\.js|app\.js)\?v=[0-9]+/\1?v=$v/g" index.html
git add -A
git commit -q -m "${1:-사이트 업데이트}" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -q origin main
echo "배포 완료 (v=$v). 1~2분 뒤 사이트에 반영됩니다."

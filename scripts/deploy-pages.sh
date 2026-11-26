#!/usr/bin/env bash
# GitHub Pages(gh-pages 브랜치)로 배포한다: bash scripts/deploy-pages.sh
# - 빌드 결과(dist)만 gh-pages 브랜치에 올린다(기출 PDF·verify-cache는 dist에 없음).
# - vite base가 './'(상대 경로)라 https://<사용자>.github.io/<저장소>/ 에서 그대로 동작한다.
set -euo pipefail
cd "$(dirname "$0")/.."
remote=$(git remote get-url origin)
rev=$(git rev-parse --short HEAD)
name=$(git config user.name)
email=$(git config user.email)
npm run build
cd dist
touch .nojekyll
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="$name" -c user.email="$email" commit -q -m "Deploy $rev"
git push -f "$remote" gh-pages
rm -rf .git
echo "gh-pages 배포 완료 ($rev)"

# 이미지 파일을 public/images 폴더로 복사하는 스크립트
$sourceDir = Join-Path $PSScriptRoot "images"
$destDir = Join-Path $PSScriptRoot "public\images"

if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force
}

if (Test-Path $sourceDir) {
    Copy-Item -Path "$sourceDir\*" -Destination $destDir -Recurse -Force
    Write-Host "이미지 파일이 public/images 폴더로 복사되었습니다."
} else {
    Write-Host "images 폴더를 찾을 수 없습니다."
}


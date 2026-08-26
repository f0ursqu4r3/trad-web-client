#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: $0 BASE_VERSION RELEASE_VERSION SUBTITLE" >&2
  exit 2
fi

base_version=$1
release_version=$2
subtitle=$3

version_pattern='^[0-9]+\.[0-9]+\.[0-9]+$'
if [[ ! $base_version =~ $version_pattern || ! $release_version =~ $version_pattern ]]; then
  echo "base and release versions must use MAJOR.MINOR.PATCH" >&2
  exit 2
fi
if [[ -z $subtitle || ${#subtitle} -gt 32 ]]; then
  echo "subtitle must contain 1 through 32 characters" >&2
  exit 2
fi
if ! command -v convert >/dev/null 2>&1; then
  echo "ImageMagick 'convert' is required" >&2
  exit 1
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
font_regular=/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf
font_bold=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf

# ImageMagick otherwise writes the current time into a PNG text chunk.
export SOURCE_DATE_EPOCH=0

render() {
  local channel=$1
  local source=$repo_root/public/$channel/$base_version.png
  local destination=$repo_root/public/$channel/$release_version.png

  if [[ ! -f $source ]]; then
    echo "missing base preview: $source" >&2
    exit 1
  fi

  convert "$source" \
    -fill '#07131d' -draw 'rectangle 23,500 475,779' \
    -font "$font_bold" -pointsize 64 -fill '#0a2135' \
    -draw "text 46,613 'PROD TEST'" \
    -font "$font_bold" -pointsize 30 -fill '#58b6ff' \
    -draw "text 47,552 'TRAD UPDATE'" \
    -font "$font_bold" -pointsize 72 -fill '#f4f7fb' \
    -draw "text 45,640 '$release_version'" \
    -font "$font_regular" -pointsize 27 -fill '#9fc9e9' \
    -draw "text 47,700 '$subtitle'" \
    -fill '#58b6ff' -draw 'rectangle 47,719 432,727' \
    -strip -define png:exclude-chunk=time,date \
    "$destination"

  echo "generated $destination"
}

render prod-update-previews
render update-previews

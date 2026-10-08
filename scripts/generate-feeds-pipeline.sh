#!/usr/bin/env bash
# THU-6 single-generation pipeline: build safe release -> manifest -> rss/sitemap.
# Usage: ./scripts/generate-feeds-pipeline.sh <work-dir>
# Produces <work-dir>/rss.xml and <work-dir>/sitemap.xml generated from a fresh
# safe release. Never deploys; review and copy outputs manually.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
work_dir="${1:-}"
if [[ -z "$work_dir" ]]; then
  echo "usage: $0 <work-dir>" >&2
  exit 64
fi
mkdir -p "$work_dir"
work_dir="$(cd "$work_dir" && pwd)"

release_dir="$work_dir/release"
out_dir="$work_dir/out"
mkdir -p "$release_dir" "$out_dir"

# 1. Build the fail-closed safe release from public-deploy/ only.
"$repo_root/scripts/build-safe-pages-release.sh" "$release_dir"

# 2. Manifest (canonical candidates + per-surface URL lists).
#    Requires public-path-policy.cjs next to generate_manifest.py (THU-3 contract).
if [[ ! -f "$work_dir/public-path-policy.cjs" ]]; then
  echo "public-path-policy.cjs missing in $work_dir; copy it from the THU-3 contract first" >&2
  exit 65
fi
python3 "$work_dir/generate_manifest.py" "$release_dir" "$out_dir" \
  --checked-at "$(date +%Y-%m-%dT%H:%M:%S%z)"

# 3. RSS + sitemap from the manifest and the per-surface URL lists.
cp "$out_dir/public-manifest.json" "$out_dir/rss-urls.json" "$out_dir/sitemap-urls.json" "$work_dir/"
python3 "$work_dir/generate_rss.py"
python3 "$work_dir/generate_sitemap.py"

echo "pipeline outputs:"
echo "  $work_dir/rss.xml"
echo "  $work_dir/sitemap.xml"

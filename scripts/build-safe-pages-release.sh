#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
source_dir="$repo_root/public-deploy"
exclude_file="$repo_root/scripts/pages-release-excludes.txt"
target_dir="${1:-}"

if [[ -z "$target_dir" ]]; then
  echo "usage: $0 <new-empty-output-directory>" >&2
  exit 64
fi

mkdir -p "$target_dir"
target_dir="$(cd "$target_dir" && pwd)"

case "$target_dir" in
  /|"$repo_root"|"$repo_root"/*|"$source_dir"|"$source_dir"/*)
    echo "refusing unsafe output directory: $target_dir" >&2
    exit 64
    ;;
esac

if find "$target_dir" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
  echo "output directory must be empty: $target_dir" >&2
  exit 64
fi

rsync -a \
  --include='/worldmonitor/openapi.yaml' \
  --include='/worldmonitor/pricing.md' \
  --include='/worldmonitor/.well-known/agent-skills/fetch-country-brief/SKILL.md' \
  --include='/worldmonitor/.well-known/agent-skills/fetch-resilience-score/SKILL.md' \
  --exclude-from="$exclude_file" \
  "$source_dir/" "$target_dir/"

# Cloudflare asset uploads do not preserve symlinks. Validate that every link is
# an in-tree file, then materialize it so routes such as /hardtech/ stay intact.
python3 - "$target_dir" <<'PY'
import os
import shutil
import sys

root = os.path.realpath(sys.argv[1])
for directory, directory_names, file_names in os.walk(root, followlinks=False):
    names = list(directory_names) + list(file_names)
    for name in names:
        link_path = os.path.join(directory, name)
        if not os.path.islink(link_path):
            continue
        resolved = os.path.realpath(link_path)
        try:
            in_tree = os.path.commonpath([root, resolved]) == root
        except ValueError:
            in_tree = False
        if not in_tree or not os.path.isfile(resolved):
            raise SystemExit(f"unsafe symbolic link in release: {os.path.relpath(link_path, root)}")
        os.unlink(link_path)
        shutil.copy2(resolved, link_path)
PY

# Redact workstation usernames from retained public prose without touching sources.
while IFS= read -r -d '' file; do
  perl -0pi -e 's#/Users/[A-Za-z0-9._-]+/#/Users/you/#g; s#/home/[A-Za-z0-9._-]+/#/home/user/#g; s#[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\#C:\\Users\\user\\#g' "$file"
done < <(find "$target_dir" -type f \( -name '*.html' -o -name '*.htm' -o -name '*.css' -o -name '*.js' -o -name '*.json' -o -name '*.xml' -o -name '*.txt' \) -print0)

required=(
  "_worker.js"
  "ai-frontier-live.js"
  "index.html"
  "daily-reports.html"
  "hardtech/index.html"
  "daily-reports/ai-frontier-radar-live.html"
  "enterprise-local-ai-blueprint/index.html"
  "xreal-eye-field-guide/index.html"
  "worldmonitor/index.html"
  "worldmonitor/openapi.yaml"
  "worldmonitor/pricing.md"
  "worldmonitor/.well-known/agent-skills/fetch-country-brief/SKILL.md"
  "worldmonitor/.well-known/agent-skills/fetch-resilience-score/SKILL.md"
  "daily-reports/shanhe-grand-loop-china-roadtrip-2026.html"
  "daily-reports/global-cruise-compass-2026-27.html"
  "daily-reports/ai-fund-builder-50-expert-deep-briefs-2026.html"
  "daily-reports/private-equity-alpha-operating-system.html"
  "daily-reports/ai-guardrails-learning-bastani-pnas-2025.html"
  "daily-reports/math-olympiad-playbook-9yo.html"
)

for relative_path in "${required[@]}"; do
  if [[ ! -f "$target_dir/$relative_path" ]]; then
    echo "required public asset missing: $relative_path" >&2
    exit 65
  fi
done

secret_pattern='(-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])|(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{35}(?![A-Za-z0-9_-])|(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{20,}(?![A-Za-z0-9])|(?<![A-Za-z0-9])github_pat_[A-Za-z0-9_]{20,}(?![A-Za-z0-9_])|(?<![A-Za-z0-9])sk-(?:proj-[A-Za-z0-9_-]{30,}|ant-api03-[A-Za-z0-9_-]{30,}|[A-Za-z0-9]{32,})(?![A-Za-z0-9_-])|(?<![A-Za-z0-9])hf_[A-Za-z0-9]{20,}(?![A-Za-z0-9])|(?<![A-Za-z0-9])(?:sk|rk)_live_[A-Za-z0-9]{16,}(?![A-Za-z0-9])|(?<![A-Za-z0-9])whsec_[A-Za-z0-9]{16,}(?![A-Za-z0-9])|(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{20,}(?![A-Za-z0-9-])|(?<![A-Za-z0-9_-])eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?![A-Za-z0-9_-]))'

secret_hits="$(rg -IlP --hidden "$secret_pattern" "$target_dir" || true)"
if [[ -n "$secret_hits" ]]; then
  echo "high-confidence credential patterns found; refusing release:" >&2
  printf '%s\n' "$secret_hits" >&2
  exit 66
fi

private_path_hits="$(rg -IlP --hidden '(/Users/(?!you/)[A-Za-z0-9._-]+/|/home/(?!user/)[A-Za-z0-9._-]+/|[A-Za-z]:\\Users\\(?!user\\))' "$target_dir" || true)"
if [[ -n "$private_path_hits" ]]; then
  echo "unredacted workstation paths found; refusing release:" >&2
  printf '%s\n' "$private_path_hits" >&2
  exit 67
fi

node "$repo_root/scripts/scan-pages-release.mjs" "$target_dir"

manifest_path="${target_dir%/}.sha256"
(
  cd "$target_dir"
  find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256
) > "$manifest_path"

echo "safe release ready: $target_dir"
echo "files: $(find "$target_dir" -type f | wc -l | tr -d ' ')"
echo "manifest: $manifest_path"

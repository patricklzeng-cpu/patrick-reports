#!/usr/bin/env bash
# Translate both daily digests, validate their language toggles, then deploy.
# Hermes cron: 15 9 * * * (after ai-trending-daily and hardtech-daily).

set -euo pipefail

REPORT_DATE="${REPORT_DATE:-$(date +%Y-%m-%d)}"
REPORTS_DIR="${REPORTS_DIR:-$HOME/patricks-reports}"
DESKTOP_DIR="${DESKTOP_DIR:-$HOME/Desktop}"
BILINGUAL_INJECTOR="${BILINGUAL_INJECTOR:-$HOME/.hermes/scripts/bilingual_inject.py}"
PYTHON_BIN="${PYTHON_BIN:-$HOME/.hermes/hermes-agent/venv/bin/python}"
SKIP_DEPLOY="${SKIP_DEPLOY:-0}"
SKIP_GIT="${SKIP_GIT:-0}"

log() { printf '[bilingual-daily-publish %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

die() {
    log "ERROR: $*"
    exit 1
}

[ -d "$REPORTS_DIR" ] || die "reports directory not found: $REPORTS_DIR"
[ -x "$PYTHON_BIN" ] || die "Python runtime not executable: $PYTHON_BIN"
[ -f "$BILINGUAL_INJECTOR" ] || die "bilingual injector not found: $BILINGUAL_INJECTOR"

STAGE_DIR=$(mktemp -d "/tmp/bilingual-dailies-${REPORT_DATE}.XXXXXX")
cleanup() {
    rm -f "$STAGE_DIR/ai-trending.html" "$STAGE_DIR/hardtech.html"
    rmdir "$STAGE_DIR" 2>/dev/null || true
}
trap cleanup EXIT

is_bilingual_file() {
    file="$1"
    [ -s "$file" ] || return 1
    grep -q 'id="langBtn"' "$file" || return 1
    grep -q 'toggleLang' "$file" || return 1
    grep -q 'class="zh"' "$file" || return 1
    grep -q 'class="en"' "$file" || return 1
}

resolve_source() {
    section="$1"
    root_source="$REPORTS_DIR/$section/${REPORT_DATE}.html"
    public_source="$REPORTS_DIR/public-deploy/$section/${REPORT_DATE}.html"
    desktop_source="$DESKTOP_DIR/${section}-${REPORT_DATE}.html"

    for candidate in "$root_source" "$public_source" "$desktop_source"; do
        [ -s "$candidate" ] || continue
        printf '%s\n' "$candidate"
        return 0
    done

    return 1
}

validate_bilingual() {
    file="$1"
    section="$2"

    [ -s "$file" ] || die "$section output is empty"
    size=$(wc -c < "$file" | tr -d ' ')
    [ "$size" -ge 5000 ] || die "$section output is too small: ${size} bytes"

    grep -q 'id="langBtn"' "$file" || die "$section is missing the language button"
    grep -q 'toggleLang' "$file" || die "$section is missing toggle behavior"
    grep -q 'localStorage' "$file" || die "$section is missing language persistence"

    zh_count=$(grep -o 'class="zh"' "$file" | wc -l | tr -d ' ')
    en_count=$(grep -o 'class="en"' "$file" | wc -l | tr -d ' ')
    [ "$zh_count" -gt 0 ] || die "$section has no Chinese content pairs"
    [ "$en_count" -gt 0 ] || die "$section has no English content pairs"

    pair_delta=$((zh_count - en_count))
    [ "$pair_delta" -lt 0 ] && pair_delta=$((-pair_delta))
    [ "$pair_delta" -le 1 ] || die "$section language-pair mismatch: zh=$zh_count en=$en_count"

    log "validated $section: ${size} bytes, zh=$zh_count, en=$en_count"
}

translate_section() {
    section="$1"
    title_zh="$2"
    title_en="$3"
    source="$(resolve_source "$section")" || die "source missing for $section (${REPORT_DATE}) in repo/public-deploy/Desktop"
    staged="$STAGE_DIR/${section}.html"
    # Runtime diagnostics must never enter the public asset directory.
    section_log="/tmp/bilingual-${section}-${REPORT_DATE}.log"

    source_size=$(wc -c < "$source" | tr -d ' ')
    [ "$source_size" -ge 5000 ] || die "$section source is too small: ${source_size} bytes"

    if is_bilingual_file "$source"; then
        cp -f "$source" "$staged"
        log "reusing bilingual $section source: $source"
        validate_bilingual "$staged" "$section"
        return 0
    fi

    log "translating $section from legacy source: $source"
    if ! "$PYTHON_BIN" "$BILINGUAL_INJECTOR" \
        --input "$source" \
        --output "$staged" \
        --section "$section" \
        --date "$REPORT_DATE" \
        --page-title-zh "$title_zh" \
        --page-title-en "$title_en" \
        > "$section_log" 2>&1; then
        tail -8 "$section_log" 2>/dev/null | sed 's/^/    /' || true
        die "$section translation failed; deployment blocked"
    fi

    validate_bilingual "$staged" "$section"
}

translate_section "ai-trending" "AI 热门日报" "AI Trending"
translate_section "hardtech" "硬科技日报" "Hard Tech Daily"

# Promote both pages only after both translations have passed validation.
for section in ai-trending hardtech; do
    root_dir="$REPORTS_DIR/$section"
    public_dir="$REPORTS_DIR/public-deploy/$section"
    mkdir -p "$root_dir" "$public_dir"

    cp -f "$STAGE_DIR/${section}.html" "$root_dir/${REPORT_DATE}.html"
    cp -f "$STAGE_DIR/${section}.html" "$public_dir/${REPORT_DATE}.html"
    ln -sfn "${REPORT_DATE}.html" "$root_dir/index.html"
    ln -sfn "${REPORT_DATE}.html" "$public_dir/index.html"

    cmp -s "$root_dir/${REPORT_DATE}.html" "$public_dir/${REPORT_DATE}.html" \
        || die "$section public mirror mismatch"
done
log "promoted both bilingual pages to root and public-deploy"

cd "$REPORTS_DIR"

if [ "$SKIP_DEPLOY" != "1" ]; then
    log "deploying Cloudflare Pages project patrick-reports"
    release_dir="$(mktemp -d /private/tmp/patrick-pages-safe.XXXXXX)"
    "$REPORTS_DIR/scripts/build-safe-pages-release.sh" "$release_dir"
    env -u CLOUDFLARE_API_TOKEN npx --yes wrangler@latest pages deploy "$release_dir" \
        --project-name patrick-reports \
        --branch main \
        --commit-dirty=true

    for section in ai-trending hardtech; do
        verify_file="/tmp/${section}-${REPORT_DATE}-bilingual-verify.html"
        live_ok=0
        attempt=1
        while [ "$attempt" -le 12 ]; do
            verify_url="https://2017zyl.xyz/${section}/${REPORT_DATE}?cb=$(date +%s)-${attempt}"
            http_code=$(curl -sS -L -o "$verify_file" -w '%{http_code}' --max-time 20 "$verify_url" || printf '000')
            http_code="${http_code:0:3}"
            if [ "$http_code" = "200" ] \
                && grep -q 'id="langBtn"' "$verify_file" \
                && grep -q 'toggleLang' "$verify_file" \
                && grep -q 'class="zh"' "$verify_file" \
                && grep -q 'class="en"' "$verify_file"; then
                validate_bilingual "$verify_file" "$section live"
                live_ok=1
                break
            fi
            log "waiting for Pages propagation: $section attempt $attempt/12 (HTTP $http_code)"
            sleep 5
            attempt=$((attempt + 1))
        done
        [ "$live_ok" = "1" ] || die "$section live page did not become bilingual after 60s"
        log "live verified: https://2017zyl.xyz/${section}/${REPORT_DATE}"
    done
else
    log "SKIP_DEPLOY=1; deploy and live verification skipped"
fi

if [ "$SKIP_GIT" != "1" ]; then
    paths=(
        "ai-trending/${REPORT_DATE}.html"
        "ai-trending/index.html"
        "hardtech/${REPORT_DATE}.html"
        "hardtech/index.html"
        "public-deploy/ai-trending/${REPORT_DATE}.html"
        "public-deploy/ai-trending/index.html"
        "public-deploy/hardtech/${REPORT_DATE}.html"
        "public-deploy/hardtech/index.html"
    )
    git add -- "${paths[@]}"
    if ! git diff --cached --quiet -- "${paths[@]}"; then
        git commit --only --no-verify \
            -m "feat(daily): ${REPORT_DATE} bilingual AI and hardtech reports" \
            -- "${paths[@]}"
    else
        log "no page changes to commit"
    fi

    if [ -f "$HOME/.hermes/scripts/lib-github-push.sh" ]; then
        # GitHub is the audit trail; public availability is already guaranteed by deploy.
        . "$HOME/.hermes/scripts/lib-github-push.sh"
        if gh_net_ok && gh_push_retry 3; then
            log "GitHub audit trail pushed"
        else
            log "GitHub unavailable; github-push-retry will recover the local commit"
        fi
    fi
else
    log "SKIP_GIT=1; commit and push skipped"
fi

log "SUCCESS: both daily pages are bilingual and deployed"

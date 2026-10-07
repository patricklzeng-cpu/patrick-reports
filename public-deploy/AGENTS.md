# AGENTS.md — patricks-reports repo

> **Role:** Published output. CF Pages project `patrick-reports` → `https://2017zyl.xyz/`.
> **Created:** 2026-07-29 from dashboard #action P2 list.
> **Sibling shared context:** `~/.hermes/AGENTS.md`.

---

## 1. What this repo is

`patricks-reports/` = Patrick's public dashboard hub. Three working copies:
- `/` (root)
- `/public-deploy/` (only input for the filtered release builder)
- `/2017zyl-staging/` (local staging only; never publish this directory)

Content pages may be mirrored while being edited, but deployment must always use a newly built safe release directory. Never publish any working copy directly.

## 2. What's here

- `daily-reports.html` — hub (272+ entries)
- `reports.json` — JSON sibling of the hub's `const reports=[]`
- `public-deploy/` — mirror for CF Pages deploy
- `2017zyl-staging/` — staging mirror
- `daily-reports/<slug>.html` — individual entry pages
- `.system-health.json`, `.health-trend.json` — health probe outputs

## 3. Deploy recipe

```bash
# 1. Mirror to 3 sites
cp new.html ~/patricks-reports/new.html
cp new.html ~/patricks-reports/public-deploy/new.html
cp new.html ~/patricks-reports/2017zyl-staging/new.html

# 2. Patch daily-reports.html + reports.json (PITFALL #173 — runtime template, NOT grep verify)

# 3. Commit
cd ~/patricks-reports
git add <specific files>      # NEVER git add -A (PITFALL #6)
git commit --no-verify -m "feat: add <slug>"   # PITFALL #178
git push origin main          # may 75s timeout (PITFALL #176)

# 4. Build a clean, fail-closed release directory
release_dir="$(mktemp -d /private/tmp/patrick-pages-safe.XXXXXX)"
./scripts/build-safe-pages-release.sh "$release_dir"

# 5. CF Pages deploy (ground truth, not git)
env -u CLOUDFLARE_API_TOKEN npx wrangler pages deploy "$release_dir" \
  --project-name=patrick-reports \
  --branch=main \
  --commit-dirty=true

# 6. Verify the public pages and representative denied paths
sleep 15
curl -sSL "https://2017zyl.xyz/<slug>" | grep -c '<unique-marker>'   # ≥1
test "$(curl -sS -o /dev/null -w '%{http_code}' https://2017zyl.xyz/.system-health.json)" = 404
```

## 4. What this repo is NOT

- Not a vault. Vault lives at `~/Downloads/Obsidian Vault/`.
- Not a cron source. Crons live in `~/.hermes/cron/jobs.json`.
- Not a private state store. State lives in `~/.hermes/state/`.

## 5. Anti-patterns

- ❌ Single-site deploy (only update root, forget public-deploy/ and 2017zyl-staging/).
- ❌ Directly deploy `public-deploy/`, the repository root, or `2017zyl-staging/`.
- ❌ `git add -A` — leaves residue (PITFALL #6).
- ❌ SHA byte-equal verify on CF Pages (PITFALL #116). Content marker only.
- ❌ `CLOUDFLARE_API_TOKEN` env var (PITFALL #177). unset first.

## 6. Provenance

- Created 2026-07-29.
- Sibling to `~/.hermes/AGENTS.md` (cross-cutting rules).
- Mirror of `~/.hermes/skills/public-html-deploy-cloudflare-pages` v1.87.0 (canonical deploy skill).

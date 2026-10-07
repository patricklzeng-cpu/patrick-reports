# Guard a manual retry of the legacy Hermes generator. Prevent direct uploads
# and outbound failure notifications; neither is part of this local retry.
bash() {
  case "${1:-}" in
    */notify_digest_failure.sh) printf '%s\n' '[ai-owner] Notification suppressed for local retry'; return 0 ;;
    *) command bash "$@" ;;
  esac
}
trap 'if [[ "$BASH_COMMAND" == DEPLOY_LOG=* ]]; then printf "%s\n" "[ai-owner] Generation complete; legacy unfiltered deployment blocked. Safe release and authenticated Pages access required."; exit 78; fi' DEBUG

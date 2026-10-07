# Security and Approvals

## Default posture

Deny by default. Grant the smallest capability for the shortest useful duration.

## Risk classes

### Low

- read an explicitly authorized project file
- run a read-only inspection
- create a temporary artifact inside the task workspace

May run automatically when covered by the mission policy.

### Medium

- modify workspace files
- install project dependencies
- run builds or tests
- access approved network destinations
- create a task branch

May be pre-authorized by a mission-scoped policy. Must remain visible in the trace.

### High

- send external messages
- publish publicly
- push a repository
- modify access or permissions
- read credentials
- write outside approved workspace roots
- delete meaningful data
- operate production systems
- create paid resources

Requires a fresh explicit approval.

## Approval payload

Every approval includes:

- requested action
- requesting adapter/run
- reason
- exact command or tool
- destination
- data shared
- affected paths/resources
- risk level
- rollback statement
- expiry
- allowed scopes: once or current mission

## Isolation

- Per-task workspace and preferably per-task git worktree.
- No default home-directory access.
- Path, command, network, time, concurrency, and cost limits.
- Task-scoped secret references.
- No direct main-branch or production writes.
- Bounded output and log retention.

## Audit requirements

Record the request, policy evaluation, user decision, final action, exit status, and resulting artifacts. Redact secret values and sensitive content. Approval history is append-only.


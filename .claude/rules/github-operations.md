# GitHub Operations

## Branch workflow

`main` is the only long-lived branch. Pushes to `main` run CI (`ci-gates.yml`), the content snapshot in `backup-snapshots.yml`, and a Cloudflare Workers Build. Workers Builds also runs on every pushed branch. The `main` build deploys to production; builds of other branches upload a version without deploying it (`AGENTS.md` → Deployment).

- Branch from and target PRs to `main` unless the user specifies otherwise.
- **Branch names:** `chore/short-description`, or ask the user for the preferred name. The repo has no issue tracker, so there are no ticket-key branches. Dependabot opens its own `dependabot/...` branches.
- When starting work, update the local `main`, then create the branch:
  ```bash
  git fetch origin main
  git checkout main
  git merge --ff-only origin/main
  git checkout -b chore/<short-description>
  ```
- Keep commits and PRs focused; write descriptive commit messages; no WIP commits in final PRs.
- Do not commit, push, open PRs, or post to GitHub unless the user explicitly asked for that action in the current message.

## Folding changes into an earlier commit

When the user asks to squash/fixup a change (or set of changes) into a previous commit:

```bash
git add <paths>
git commit --fixup=<target-sha>
git rebase --autosquash main
```

## Git plan circuit breaker

If a git plan needs more than ~3 easy-to-explain steps, stop, ask, and explain what you are trying to accomplish.

## Hosted GitHub state

- Use `gh` by default for pull requests, issues, comments, reviews, workflow runs, status checks, and other GitHub-hosted repository metadata.
- Do not rely only on local git branch names, remotes, or `origin/*` refs when the user is asking about GitHub-hosted state.
- Use GitHub MCP when the user explicitly asks for MCP, when it is already configured and gives a better structured workflow, or when `gh` cannot answer the request cleanly.
- Before calling a GitHub MCP tool, inspect its schema/descriptor and follow any server-specific auth instructions.
- Fall back to local git inspection or web lookups only when GitHub-hosted tools cannot answer the question.

# Agent Model Strategy

Guidance for choosing models for agent CLI runs and subagents, kept here so it does not inflate `AGENTS.md`. Use it when a parent agent is coordinating multiple agent passes and wants stronger independence, faster throughput, or a better second opinion.

## Terms

- **Subagent**: a delegated agent run spawned from a parent session (a Cursor subagent, a Claude Code subagent, or equivalent).
- **Multi-pass review**: two or more independent review passes. This can use subagents, separate CLI runs, or both.

## Core Principles

- **Role separation before model separation.** An independent read-only reviewer usually improves objectivity more than switching models alone.
- **Respect cost discipline** (below): cheap models for volume work, expensive models for one decisive pass.
- **Default to `model: inherit`.** Do not hardcode model IDs in agent frontmatter or docs; they go stale. Choose a model from the current list when launching a run.
- **Prefer a different model family for high-risk validation** when one is available, especially for security, infrastructure/permissions, migrations, destructive operations, or weakly tested refactors.
- **Keep review agents read-only** unless the task explicitly asks them to propose or apply fixes.
- **Do not make subagents debate each other directly.** Have the parent agent orchestrate separate runs and reconcile the outputs.

## Cost Discipline

Token budgets are finite, and subagent fan-out multiplies model spend fast. Rules of thumb:

- Never fan out multiple parallel subagents on a frontier/high-reasoning model tier. A single inherited pass is fine; parallel volume work gets pinned to a cheaper model explicitly.
- Exploration, drift sweeps, summarization, and doc audits go to fast/cheap models. They are search problems, not reasoning problems.
- Reserve expensive models for at most **one** high-value pass per milestone (typically a final read-only adversarial review), and run it as a single pinned pass, not a fan-out.
- When two review passes are wanted, pair one strong model with one cheap model from a different family rather than two strong models. Agreement between them is the signal, not the price tag.

## When Model Diversity Helps

- Authentication, authorization, secrets, and other security-sensitive code
- Infrastructure, permissions, deployment, or environment changes
- Data migrations and other destructive or hard-to-undo operations
- Large refactors with limited automated coverage
- Final review before merge for high-risk changes

## When `inherit` Is Usually Enough

- Implementation helpers working on the same change set
- Focused exploration after the technical surface is already clear
- Docs updates, changelog drafting, and PR summary generation done inline by a helper continuing the parent's change
- Follow-up fixes after a reviewer has already identified the issue

## Recommended Patterns

| Goal                   | Suggested model strategy            | Notes                                                                           |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------- |
| Broad exploration      | Cheap/fast model                    | Optimize for speed and keep prompts narrow                                      |
| Implementation helper  | `inherit`                           | Preserve parent context and assumptions                                         |
| Adversarial review     | Different model family if available | Keep read-only, independent, and findings-first                                 |
| Final readiness review | Different family or stronger model  | Include acceptance criteria and test evidence (e.g. the `final-reviewer` agent) |
| Docs drift / cleanup   | Cheap/fast model                    | Keep it cheap and focused                                                       |

## Orchestration Pattern

1. Prepare a neutral task pack with the objective, constraints, relevant files or diff, and test evidence.
2. Spawn separate passes rather than asking agents to argue with each other.
3. Require structured output: severity, evidence, confidence, and recommended next action.
4. If reviewers disagree, run one final adjudication pass or escalate to a human.
5. Preserve independence by keeping the parent agent's tentative conclusions out of the reviewer brief.
6. Do not kill a long-running CLI review just because it is quiet. High-reasoning models can take several minutes before printing in non-interactive mode; interrupt only when the process has clearly errored, is hung well beyond a reasonable window for the task, or the user asks.

## Tool-Specific Notes

These flags and fields change between releases. Treat the tool's own `--help` and model listing as the source of truth.

**Cursor**

- Custom subagents support `model: inherit` or a specific model ID, and `readonly: true` to block edits.
- The CLI entry point varies by install (`cursor agent`, `agent`, or `cursor-agent`); confirm with `--help`, then treat it as `<agent-cli>`.
- Check auth with `<agent-cli> status`; sign in with `<agent-cli> login`.
- List available model IDs with `<agent-cli> models`. Availability varies by plan, admin policy, and time.
- Pinned one-off run: `<agent-cli> -p --trust --model <id> "prompt"`. For read-only review or Q&A, add `--mode ask`.

**Claude Code**

- Subagents support `model: inherit` or a model alias/ID. Restrict `tools:` to read-only tools (e.g. `Read, Grep, Glob, Bash`) to keep a reviewer from editing.
- Pinned one-off run: `claude -p --model <id> "prompt"`.

## Example Subagent Config

One file can serve both tools; each ignores the other's keys. Use `inherit` for helpers that should stay aligned with the parent agent:

```markdown
---
name: implementation-helper
description: Focused helper that continues the parent change.
model: inherit
readonly: false
---
```

Pin a model only for an independent high-risk review pass when a different family is available:

```markdown
---
name: adversarial-reviewer
description: Independent read-only reviewer for high-risk changes.
model: <pinned-model-id>
readonly: true
tools: Read, Grep, Glob, Bash
---
```

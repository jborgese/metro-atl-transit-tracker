# Specs

Use `docs/specs/` for durable planning documents that define the why, scope, rollout, and validation for large or risky work before implementation begins. For work owned in this repository, keep the governing spec here.

These specs are for larger project planning, not day-to-day task notes. The `epic-planning` skill (provided by the agent-guardrails plugin) is the source of truth for new spec structure.

## When To Write A Spec

Write a spec when the work:

- spans multiple packages or teams
- changes repo structure, CI/CD, deployments, or developer workflows
- needs phased rollout, cutover, or rollback planning
- has meaningful tradeoffs that should be recorded before coding starts
- is large enough that a checklist alone would miss important decisions

## What Lives Here

- `YYYY-MM-<slug>.md`: active specs, plus historical specs that still need to stay close to active planning
- `<topic>/YYYY-MM-<slug>.md`: a topic with several related specs gets its own subdirectory
- `archived/YYYY-MM-<slug>.md`: historical specs for completed or otherwise inactive work

Multiple specs can share the same month prefix. Use a short, stable slug that describes the topic.

Keep active planning docs at the root of `docs/specs/` so the current queue stays easy to scan. Move a spec to `archived/` when the project is clearly shipped or inactive: either its status is already `Done`/`Superseded`/`Rejected`/`Abandoned`, or a later code/PR audit shows the work shipped. Preserve its status table and add a short historical note when the status was stale or the original plan no longer matches the final implementation.

## Status Values

| Status | Meaning |
| --- | --- |
| `Draft` | Being researched or written |
| `In Review` | Ready for stakeholder or agent review |
| `Approved` | Accepted as the current plan |
| `In Progress` | Implementation has started against this spec |
| `Done` | Implementation completed and validated; keep active for follow-on planning or move to `archived/` |
| `Superseded` | Replaced by a newer spec |
| `Rejected` | Reviewed and explicitly declined; keep as historical context |
| `Abandoned` | Intentionally not moving forward without a formal rejection; keep as historical context |

## Status Transitions

| Transition | When |
| --- | --- |
| `Draft` -> `In Review` | Major sections are complete and the author wants feedback |
| `In Review` -> `Approved` | Relevant engineering owners agree on the plan |
| `Approved` -> `In Progress` | Implementation begins against the spec |
| `In Progress` -> `Done` | Validation passes and the definition of done is satisfied; move the file to `archived/` during docs cleanup |
| Any active spec -> `Superseded` | A newer spec replaces it; add a pointer to the replacement near the top |
| Any active spec -> `Rejected` | Stakeholders review the plan and explicitly decide not to proceed; add a brief rationale near the top |
| `Draft` or `In Review` -> `Abandoned` | The work is intentionally dropped without a formal rejection |

Never mark a spec `Approved` without explicit human sign-off from the relevant owners.

Do not assume implementation teams will keep these statuses perfectly current. Treat status as useful planning metadata, not the only source of truth for whether a project shipped.

## Revising Active Specs

- If a spec is `In Progress` and the implementation materially changes scope, decisions, or rollout, update the same spec and record the new `Last Updated` date.
- If the change is large enough that the original plan is no longer the right source of truth, create a new spec and mark the old one `Superseded`.
- Prefer updating the existing active spec over creating a duplicate follow-up file.

## Stalled Drafts

- If a spec sits in `Draft` or `In Review` long enough that assumptions may have changed, refresh the context before resuming work.
- If a draft is abandoned after it has become shared context, mark it `Abandoned` rather than silently deleting it.

## Ownership

`Owner` names the person or team responsible for keeping the spec current while the work is active. Use the most specific stable owner available, such as a tech lead, platform team, or feature team.

## Authoring Rules

New specs follow the design-doc shape from the `epic-planning` skill. At a high level, every spec should:

1. Start with business context, problem statement, outcome, dependencies, assumptions, and constraints.
2. Separate goals from out-of-scope items.
3. Describe the proposed solution, including diagrams and component designs when they clarify the work.
4. Break implementation into independently mergeable tickets or PR-sized units.
5. Include rollout, operational readiness, rollback triggers, and references.

For multi-package, migration, CI/CD, deployment, or cutover specs, the following are mandatory rather than optional:

- component designs for each major surface
- ticket/PR sequencing and blockers
- validation and legacy/migration handling for each ticket
- rollout plan and rollback triggers
- operational readiness notes

For smaller multi-package specs, phases can be collapsed or renamed as long as sequencing remains clear.

## Linking To Execution

- Implementation PRs reference the governing spec path in the PR description when one exists.
- If the work is tracked in an issue tracker, include that identifier in the spec when it adds useful coordination context.
- If multiple active specs overlap, each spec links to the others and states which one is the current source of truth for the shared area.
- If the work merges duplicate docs, agents, or instructions from multiple packages or directories, include a merge matrix or equivalent reconciliation plan instead of leaving deduplication implicit.

## Review Rules

Before a spec is considered ready, review it for:

- hidden coupling across packages, systems, or workflows
- CI, deployment, and environment variable impact
- local development and onboarding impact
- rollback and failure handling
- an explicit definition of done, via acceptance criteria or equivalent phase-exit checkpoints
- documentation or agent drift that the change will create

## Reference Examples

<!-- TEMPLATE: once the repo has specs worth imitating, list 2-3 here by path with a one-line note on what each models. Example: "`docs/specs/archived/2026-03-auth-migration.md`: archived migration spec with phased cutover". -->

## Recommended Workflow

1. Use the `epic-planning` skill to draft a new `YYYY-MM-<slug>.md` file.
2. Gather internal context from affected code, configs, docs, and workflows.
3. Gather external context when platform or tool behavior matters.
4. Draft the spec.
5. Review it for accuracy against the affected code and configs.
6. Move the status forward as decisions are made, when practical.
7. During docs cleanup, move clearly inactive specs to `archived/` and add a historical note if the status or plan had drifted.

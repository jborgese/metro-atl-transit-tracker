<script lang="ts">
  import { isCalendarDate } from '#lib/content/formModel/dates.ts';
  import type { ContentKind, ContentRecord } from '#lib/content/formModel/types.ts';
  import type {
    Goal,
    OrganizationRef,
    Project,
    RelatedOrg,
    TimedAction,
    TimedActionLink,
    TimedActionLocation,
  } from '#types/content.ts';
  import { countyOrder, shortCountyName } from '#utils/countyLookup.ts';
  import { atlantaDate } from '#utils/timedActions.ts';
  import GoalsTable from '../GoalsTable.svelte';

  interface Props {
    kind: ContentKind;
    record: ContentRecord;
    archived: boolean;
    isNew: boolean;
    goals: Goal[];
    projects: Project[];
    actions: TimedAction[];
  }

  type Plain = Record<string, unknown>;
  type Shown = { goal: Goal } | { project: Project } | { action: TimedAction };

  let { kind, record, archived, isNew, goals, projects, actions }: Props = $props();

  const HELP: Record<ContentKind, string> = {
    project: 'How the project card will look on the site. It updates as you edit.',
    goal: 'How this goal will look on the site. It updates as you edit.',
    timed_action: 'How the action banner will look on the site. It updates as you edit.',
  };
  const PHONE: Record<ContentKind, string> = {
    project:
      'Shown as it looks on a phone. On wider screens the card is the same, with slightly larger text.',
    goal: 'Shown as it looks on a phone. On wider screens a goal is a table row with the same content.',
    timed_action:
      'Shown as it looks on a phone. On wider screens the banner is the same, with slightly larger text.',
  };
  const NOUN: Record<ContentKind, string> = {
    project: 'project',
    goal: 'goal',
    timed_action: 'action',
  };
  const PASSED = 'Its last day has passed, so it is not shown on the site.';
  const NEEDS_LAST_DAY = 'It needs a valid last day before it can be shown.';
  const NEEDS_GOAL = 'It needs an active goal before it can be shown.';
  const NOT_LINKED =
    'No active goal links to this project yet. Project cards appear under the goals that link to them.';
  const NOT_LISTED = 'Not listed: its counties are not ones the site shows.';

  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  const filled = (value: unknown): value is string =>
    typeof value === 'string' && value.trim() !== '';
  const webUrl = (value: unknown): string | undefined =>
    typeof value === 'string' && /^https?:\/\//i.test(value.trim()) ? value.trim() : undefined;
  const isPlain = (value: unknown): value is Plain =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  const plains = (value: unknown): Plain[] => (Array.isArray(value) ? value.filter(isPlain) : []);
  const isActive = (item: { is_archived?: boolean }) => item.is_archived !== true;

  function relatedOrgs(value: unknown): RelatedOrg[] {
    return plains(value).flatMap((org) => {
      const url = webUrl(org.url);
      return filled(org.name)
        ? [
            {
              name: org.name,
              ...(url ? { url } : {}),
              ...(filled(org.contact_info) ? { contact_info: org.contact_info } : {}),
            },
          ]
        : [];
    });
  }

  function leadOrg(value: unknown): OrganizationRef | undefined {
    if (!isPlain(value) || !filled(value.name)) {
      return undefined;
    }
    const url = webUrl(value.url);
    return url ? { name: value.name, url } : { name: value.name };
  }

  function link(value: unknown): TimedActionLink | null {
    if (!isPlain(value)) {
      return null;
    }
    const url = webUrl(value.url);
    return filled(value.label) && url ? { label: value.label, url } : null;
  }

  function location(value: unknown): TimedActionLocation | null {
    return isPlain(value) && filled(value.label) && filled(value.address)
      ? { label: value.label, address: value.address }
      : null;
  }

  function goalCopy(source: ContentRecord): Goal {
    return {
      ...source,
      id: text(source.id),
      goal: text(source.goal),
      status_related_projects: text(source.status_related_projects),
      actions: text(source.actions),
      related_orgs: relatedOrgs(source.related_orgs),
      related_project_ids: strings(source.related_project_ids),
      related_counties: strings(source.related_counties),
    };
  }

  function projectCopy(source: ContentRecord): Project {
    return {
      ...source,
      id: text(source.id),
      title: text(source.title),
      summary: text(source.summary),
      status: text(source.status),
      lead_org: leadOrg(source.lead_org),
      sources: plains(source.sources)
        .filter((item) => filled(item.label) || filled(item.url))
        .map((item) => ({ label: text(item.label), url: webUrl(item.url) ?? '' })),
    };
  }

  function actionCopy(source: ContentRecord): TimedAction {
    const lastDay = text(source.expires_on);
    return {
      id: filled(source.id) ? source.id : 'preview',
      goal_id: text(source.goal_id),
      description: text(source.description),
      expires_on: isCalendarDate(lastDay) ? lastDay : '',
      link: link(source.link),
      location: location(source.location),
      is_archived: false,
    };
  }

  function actionNotes(source: ContentRecord, today: string): string[] {
    const lastDay = text(source.expires_on);
    const goalId = text(source.goal_id);
    const hasGoal = filled(goalId) && goals.some((goal) => goal.id === goalId && isActive(goal));
    return [
      ...(isCalendarDate(lastDay) && lastDay < today ? [PASSED] : []),
      ...(isCalendarDate(lastDay) ? [] : [NEEDS_LAST_DAY]),
      ...(hasGoal ? [] : [NEEDS_GOAL]),
    ];
  }

  function projectNotes(source: ContentRecord): string[] {
    const id = text(source.id);
    const linked =
      filled(id) &&
      goals.some((goal) => isActive(goal) && (goal.related_project_ids ?? []).includes(id));
    return linked ? [] : [NOT_LINKED];
  }

  function listedNames(source: ContentRecord): string[] {
    const counties = strings(source.related_counties);
    return counties.length === 0
      ? ['Regional']
      : countyOrder
          .filter((county) => counties.includes(county))
          .map((county) => shortCountyName(county));
  }

  const now = $derived.by(() => {
    void record;
    return new Date();
  });
  const today = $derived(atlantaDate(now));
  const shown: Shown = $derived(
    kind === 'goal'
      ? { goal: goalCopy(record) }
      : kind === 'project'
        ? { project: projectCopy(record) }
        : { action: actionCopy(record) },
  );
  const listed = $derived(kind === 'goal' ? listedNames(record) : []);
  const notes = $derived([
    ...(archived ? [`This ${NOUN[kind]} is archived, so it is not shown on the site.`] : []),
    ...(kind === 'timed_action' ? actionNotes(record, today) : []),
    ...(kind === 'project' ? projectNotes(record) : []),
    ...(kind === 'goal' && listed.length === 0 ? [NOT_LISTED] : []),
  ]);
  const activeProjects = $derived(projects.filter(isActive));
  const goalActions = $derived(isNew ? [] : actions);
</script>

<section class="record-preview">
  <h3>Preview</h3>
  <p class="help">{HELP[kind]}</p>
  <p class="help">{PHONE[kind]}</p>
  {#each notes as note (note)}
    <p class="note">{note}</p>
  {/each}
  {#if listed.length > 0}
    <p class="help">Listed under: {listed.join(', ')}</p>
  {/if}
  <div class="preview-frame" inert>
    <GoalsTable preview={shown} projects={activeProjects} timedActions={goalActions} {now} />
  </div>
</section>

<style>
  .record-preview {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  h3 {
    margin: 0.5rem 0 0;
    padding-bottom: 0.35rem;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 0.95rem;
  }

  p {
    margin: 0;
    font-size: 0.8rem;
    word-break: break-word;
  }

  .help {
    color: var(--text-muted);
  }

  .note {
    color: var(--action-accent);
  }

  .preview-frame {
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    padding: 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.75rem;
    background: var(--surface-0);
  }
</style>

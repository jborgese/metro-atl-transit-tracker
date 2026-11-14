<script lang="ts">
  import { emptyRelatedOrgRow } from '#lib/content/formModel/draft.ts';
  import { hiddenKeys } from '#lib/content/formModel/hiddenKeys.ts';
  import { fieldId } from '#lib/content/formModel/labels.ts';
  import type { GoalDraft, RelatedOrgRow } from '#lib/content/formModel/types.ts';
  import type { FieldIssue } from '#lib/content/formModel/validate.ts';
  import type { Project, TimedAction } from '#types/content.ts';
  import { countyOrder, shortCountyName } from '#utils/countyLookup.ts';
  import CheckboxGroup from './CheckboxGroup.svelte';
  import FormField from './FormField.svelte';
  import RepeatableRows from './RepeatableRows.svelte';

  interface Props {
    draft: GoalDraft;
    projects: Project[];
    actions: TimedAction[];
    issues: FieldIssue[];
    isNew: boolean;
    archived: boolean;
    readonly?: boolean;
    onaddaction: () => void;
  }

  let {
    draft = $bindable(),
    projects,
    actions,
    issues,
    isNew,
    archived,
    readonly = false,
    onaddaction,
  }: Props = $props();

  const COUNTY_OPTIONS = countyOrder.map((value) => ({ value, label: shortCountyName(value) }));

  const uid = $props.id();
  const id = (path: string) => fieldId('goal', path);
  const errorAt = (path: string) => issues.find((issue) => issue.path === path)?.message;
  const byTitle = (a: Project, b: Project) => a.title.localeCompare(b.title);
  const projectOptions = (archivedOnes: boolean) =>
    projects
      .filter((project) => (project.is_archived === true) === archivedOnes)
      .sort(byTitle)
      .map((project) => ({ value: project.id, label: project.title }));

  const activeProjectOptions = $derived(projectOptions(false));
  const archivedProjectOptions = $derived(projectOptions(true));
  const hidden = $derived(hiddenKeys(draft));
  const hiddenNotice = $derived(
    `This goal has ${hidden.length} ${hidden.length === 1 ? 'field' : 'fields'} the form does not show: ${hidden.join(', ')}. Use Edit as JSON to change them.`,
  );
  const actionLines = (archivedOnes: boolean) =>
    actions
      .filter((action) => (action.is_archived === true) === archivedOnes)
      .map((action) => ({ id: action.id, text: `${action.description} — ${action.expires_on}` }));

  const activeActionLines = $derived(actionLines(false));
  const archivedActionLines = $derived(actionLines(true));
  const actionsHeadingId = `${uid}-actions-heading`;
</script>

<form novalidate onsubmit={(event) => event.preventDefault()}>
  <fieldset class="body" disabled={readonly}>
    {#if hidden.length > 0}
      <p class="notice">{hiddenNotice}</p>
    {/if}
    <p class="intro">Fields marked (required) must be filled in.</p>

    <div class="section">
      <h3>Goal</h3>
      {#if isNew}
        <FormField
          id={id('id')}
          label="Id"
          required
          hint="Lowercase letters, numbers and hyphens. Cannot be changed later."
          error={errorAt('id')}
        >
          {#snippet children({ describedBy, invalid })}
            <input
              id={id('id')}
              type="text"
              autocomplete="off"
              spellcheck="false"
              aria-describedby={describedBy}
              aria-invalid={invalid ? 'true' : undefined}
              bind:value={draft.id}
            />
          {/snippet}
        </FormField>
      {:else}
        <p class="stored-id">Id: {draft.id}</p>
      {/if}

      <FormField id={id('goal')} label="Goal" required error={errorAt('goal')}>
        {#snippet children({ describedBy, invalid })}
          <textarea
            id={id('goal')}
            rows="3"
            aria-describedby={describedBy}
            aria-invalid={invalid ? 'true' : undefined}
            bind:value={draft.goal}></textarea>
        {/snippet}
      </FormField>

      <CheckboxGroup
        id={id('related_counties')}
        legend="Counties"
        hint="Leave all unchecked to list this goal under Regional."
        error={errorAt('related_counties')}
        options={COUNTY_OPTIONS}
        bind:selected={draft.related_counties}
      />
    </div>

    <div class="section">
      <h3>Progress</h3>
      <FormField
        id={id('status_related_projects')}
        label="Status"
        hint="Web addresses become links."
        error={errorAt('status_related_projects')}
      >
        {#snippet children({ describedBy, invalid })}
          <textarea
            id={id('status_related_projects')}
            rows="4"
            aria-describedby={describedBy}
            aria-invalid={invalid ? 'true' : undefined}
            bind:value={draft.status_related_projects}></textarea>
        {/snippet}
      </FormField>

      <FormField
        id={id('actions')}
        label="Ongoing actions"
        hint="Standing advice with no deadline."
        error={errorAt('actions')}
      >
        {#snippet children({ describedBy, invalid })}
          <textarea
            id={id('actions')}
            rows="4"
            aria-describedby={describedBy}
            aria-invalid={invalid ? 'true' : undefined}
            bind:value={draft.actions}></textarea>
        {/snippet}
      </FormField>
    </div>

    <div class="section">
      <h3>Links</h3>
      <CheckboxGroup
        id={id('related_project_ids')}
        legend="Related projects"
        error={errorAt('related_project_ids')}
        options={activeProjectOptions}
        archivedOptions={archivedProjectOptions}
        archivedLabel="Archived projects"
        bind:selected={draft.related_project_ids}
      />

      <RepeatableRows
        id={id('related_orgs')}
        legend="Related organizations"
        itemName="organization"
        bind:rows={draft.related_orgs}
        makeRow={emptyRelatedOrgRow}
      >
        {#snippet row(item: RelatedOrgRow, index: number)}
          <FormField
            id={id(`related_orgs.${index}.name`)}
            label="Name"
            required
            error={errorAt(`related_orgs.${index}.name`)}
          >
            {#snippet children({ describedBy, invalid })}
              <input
                id={id(`related_orgs.${index}.name`)}
                type="text"
                aria-describedby={describedBy}
                aria-invalid={invalid ? 'true' : undefined}
                bind:value={item.name}
              />
            {/snippet}
          </FormField>
          <FormField
            id={id(`related_orgs.${index}.url`)}
            label="Web address"
            error={errorAt(`related_orgs.${index}.url`)}
          >
            {#snippet children({ describedBy, invalid })}
              <input
                id={id(`related_orgs.${index}.url`)}
                type="text"
                inputmode="url"
                aria-describedby={describedBy}
                aria-invalid={invalid ? 'true' : undefined}
                bind:value={item.url}
              />
            {/snippet}
          </FormField>
          <FormField
            id={id(`related_orgs.${index}.contact_info`)}
            label="Contact info"
            error={errorAt(`related_orgs.${index}.contact_info`)}
          >
            {#snippet children({ describedBy, invalid })}
              <textarea
                id={id(`related_orgs.${index}.contact_info`)}
                rows="2"
                aria-describedby={describedBy}
                aria-invalid={invalid ? 'true' : undefined}
                bind:value={item.contact_info}></textarea>
            {/snippet}
          </FormField>
        {/snippet}
      </RepeatableRows>

      <div class="group">
        <h4 id={actionsHeadingId}>Actions for this goal</h4>
        {#if actions.length === 0}
          <p class="empty">No actions yet.</p>
        {:else if activeActionLines.length === 0}
          <p class="empty">No active actions.</p>
        {:else}
          <ul aria-labelledby={actionsHeadingId}>
            {#each activeActionLines as line (line.id)}
              <li>{line.text}</li>
            {/each}
          </ul>
        {/if}
        {#if archivedActionLines.length > 0}
          <details>
            <summary>Archived actions ({archivedActionLines.length})</summary>
            <ul>
              {#each archivedActionLines as line (line.id)}
                <li>{line.text}</li>
              {/each}
            </ul>
          </details>
        {/if}
        {#if isNew}
          <p class="hint">Save this goal before adding an action.</p>
        {:else if archived}
          <p class="hint">Restore this goal before adding an action.</p>
        {:else}
          <div>
            <button type="button" onclick={onaddaction}>Add an action for this goal</button>
          </div>
        {/if}
      </div>
    </div>
  </fieldset>
</form>

<style>
  fieldset {
    min-width: 0;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 40rem;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }

  h3 {
    margin: 0.5rem 0 0;
    padding-bottom: 0.35rem;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 0.95rem;
  }

  h4 {
    margin: 0;
    font-size: 0.86rem;
    font-weight: 600;
  }

  p {
    margin: 0;
  }

  .intro,
  .hint,
  .empty {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .notice {
    font-size: 0.8rem;
    color: var(--action-accent);
    word-break: break-word;
  }

  .stored-id {
    font-size: 0.86rem;
    word-break: break-word;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin: 0;
    padding-left: 1.1rem;
    font-size: 0.86rem;
    word-break: break-word;
  }

  summary {
    width: fit-content;
    min-height: 2rem;
    padding: 0.3rem 0.25rem;
    font-size: 0.86rem;
    color: var(--text-muted);
    cursor: pointer;
  }

  summary:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  details ul {
    padding-top: 0.25rem;
  }

  textarea,
  input[type='text'] {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  textarea {
    resize: vertical;
  }

  button {
    min-height: 2rem;
    border: 1px solid var(--field-border);
    border-radius: 0.5rem;
    background: var(--surface-1);
    color: inherit;
    font: inherit;
    font-size: 0.86rem;
    padding: 0.3rem 0.75rem;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  @media (pointer: coarse) {
    button {
      min-height: 2.75rem;
    }
  }
</style>

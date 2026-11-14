<script lang="ts">
  import { isCalendarDate } from '#lib/content/formModel/dates.ts';
  import { emptyMilestoneRow, emptyOrgRow, emptySourceRow } from '#lib/content/formModel/draft.ts';
  import { hiddenKeys } from '#lib/content/formModel/hiddenKeys.ts';
  import { fieldId } from '#lib/content/formModel/labels.ts';
  import type {
    MilestoneRow,
    OrgRow,
    ProjectDraft,
    SourceRow,
  } from '#lib/content/formModel/types.ts';
  import type { FieldIssue } from '#lib/content/formModel/validate.ts';
  import {
    GEO_SCOPES,
    geoScopeLabel,
    modeLabel,
    PROJECT_MODES,
    PROJECT_STATUSES,
  } from '#lib/content/options.ts';
  import { countyOrder, shortCountyName } from '#utils/countyLookup.ts';
  import { getStatusColor, getStatusTextColor, statusLabel } from '#utils/statusHelpers.ts';
  import CheckboxGroup from './CheckboxGroup.svelte';
  import FormField from './FormField.svelte';
  import RepeatableRows from './RepeatableRows.svelte';

  interface Props {
    draft: ProjectDraft;
    issues: FieldIssue[];
    isNew: boolean;
    hasStoredLeadOrg: boolean;
    hasStoredScope: boolean;
    readonly?: boolean;
  }

  interface Choice {
    value: string;
    label: string;
  }

  let {
    draft = $bindable(),
    issues,
    isNew,
    hasStoredLeadOrg,
    hasStoredScope,
    readonly = false,
  }: Props = $props();

  const TEXT_DATE_HINT = 'Stored as text; replace it with a date to use the picker.';
  const KEEP_HINT = 'Can be changed but not removed.';
  const COUNTY_OPTIONS = countyOrder.map((value) => ({ value, label: shortCountyName(value) }));
  const MODE_OPTIONS = PROJECT_MODES.map((value) => ({ value, label: modeLabel(value) }));
  const STATUS_OPTIONS = PROJECT_STATUSES.map((value) => ({ value, label: statusLabel(value) }));
  const SCOPE_OPTIONS = GEO_SCOPES.map((value) => ({ value, label: geoScopeLabel(value) }));

  const id = (path: string) => fieldId('project', path);
  const errorAt = (path: string) => issues.find((issue) => issue.path === path)?.message;
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const usesPicker = (stored: unknown) =>
    text(stored).trim() === '' || isCalendarDate(text(stored));
  const dateHint = (stored: unknown) => (usesPicker(stored) ? undefined : TEXT_DATE_HINT);

  function choices(listed: Choice[], stored: unknown, current: string): Choice[] {
    const storedValue = text(stored);
    const known = (value: string) => listed.some((option) => option.value === value);
    const extra = [...new Set([storedValue, current])]
      .filter((value) => value !== '' && !known(value))
      .map((value) => ({ value, label: `${value} (not in the list)` }));
    const notSet = storedValue.trim() === '' ? [{ value: '', label: 'Not set' }] : [];
    return [...notSet, ...listed, ...extra];
  }

  const statusChoices = $derived(choices(STATUS_OPTIONS, draft.base.status, draft.status));
  const scopeChoices = $derived(choices(SCOPE_OPTIONS, draft.base.geo_scope, draft.geo_scope));
  const hidden = $derived(hiddenKeys(draft));
  const hiddenNotice = $derived(
    `This project has ${hidden.length} ${hidden.length === 1 ? 'field' : 'fields'} the form does not show: ${hidden.join(', ')}. Use Edit as JSON to change them.`,
  );
  const leadHintId = `${id('lead_org')}-hint`;
</script>

<form novalidate onsubmit={(event) => event.preventDefault()}>
  <fieldset class="body" disabled={readonly}>
    {#if hidden.length > 0}
      <p class="notice">{hiddenNotice}</p>
    {/if}
    <p class="intro">Fields marked (required) must be filled in.</p>

    <div class="section">
      <h3>Basics</h3>
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

      <FormField id={id('title')} label="Title" required error={errorAt('title')}>
        {#snippet children({ describedBy, invalid })}
          <input
            id={id('title')}
            type="text"
            aria-describedby={describedBy}
            aria-invalid={invalid ? 'true' : undefined}
            bind:value={draft.title}
          />
        {/snippet}
      </FormField>

      <FormField id={id('status')} label="Status" error={errorAt('status')}>
        {#snippet children({ describedBy, invalid })}
          <select
            id={id('status')}
            aria-describedby={describedBy}
            aria-invalid={invalid ? 'true' : undefined}
            value={draft.status}
            onchange={(event) => (draft.status = event.currentTarget.value)}
          >
            {#each statusChoices as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
          {#if draft.status !== ''}
            <p class="preview" aria-hidden="true">
              <span>Preview</span>
              <span
                class="badge"
                style:background-color={getStatusColor(draft.status)}
                style:color={getStatusTextColor(draft.status)}>{statusLabel(draft.status)}</span
              >
            </p>
          {/if}
        {/snippet}
      </FormField>

      <FormField id={id('summary')} label="Summary" error={errorAt('summary')}>
        {#snippet children({ describedBy, invalid })}
          <textarea
            id={id('summary')}
            rows="4"
            aria-describedby={describedBy}
            aria-invalid={invalid ? 'true' : undefined}
            bind:value={draft.summary}></textarea>
        {/snippet}
      </FormField>
    </div>

    <div class="section">
      <h3>Dates and milestones</h3>
      <FormField
        id={id('start_date')}
        label="Start date"
        hint={dateHint(draft.base.start_date)}
        error={errorAt('start_date')}
      >
        {#snippet children({ describedBy, invalid })}
          <input
            id={id('start_date')}
            type={usesPicker(draft.base.start_date) ? 'date' : 'text'}
            aria-describedby={describedBy}
            aria-invalid={invalid ? 'true' : undefined}
            bind:value={draft.start_date}
          />
        {/snippet}
      </FormField>

      <FormField
        id={id('end_date')}
        label="End date"
        hint={dateHint(draft.base.end_date)}
        error={errorAt('end_date')}
      >
        {#snippet children({ describedBy, invalid })}
          <input
            id={id('end_date')}
            type={usesPicker(draft.base.end_date) ? 'date' : 'text'}
            aria-describedby={describedBy}
            aria-invalid={invalid ? 'true' : undefined}
            bind:value={draft.end_date}
          />
        {/snippet}
      </FormField>

      <RepeatableRows
        id={id('milestones')}
        legend="Milestones"
        itemName="milestone"
        bind:rows={draft.milestones}
        makeRow={emptyMilestoneRow}
      >
        {#snippet row(item: MilestoneRow, index: number)}
          <FormField
            id={id(`milestones.${index}.title`)}
            label="Title"
            required
            error={errorAt(`milestones.${index}.title`)}
          >
            {#snippet children({ describedBy, invalid })}
              <input
                id={id(`milestones.${index}.title`)}
                type="text"
                aria-describedby={describedBy}
                aria-invalid={invalid ? 'true' : undefined}
                bind:value={item.title}
              />
            {/snippet}
          </FormField>
          <FormField
            id={id(`milestones.${index}.date`)}
            label="Date"
            hint={dateHint(item.original.date)}
            error={errorAt(`milestones.${index}.date`)}
          >
            {#snippet children({ describedBy, invalid })}
              <input
                id={id(`milestones.${index}.date`)}
                type={usesPicker(item.original.date) ? 'date' : 'text'}
                aria-describedby={describedBy}
                aria-invalid={invalid ? 'true' : undefined}
                bind:value={item.date}
              />
            {/snippet}
          </FormField>
        {/snippet}
      </RepeatableRows>
    </div>

    <div class="section">
      <h3>Where and how</h3>
      <FormField
        id={id('geo_scope')}
        label="Geographic scope"
        hint={hasStoredScope ? KEEP_HINT : undefined}
        error={errorAt('geo_scope')}
      >
        {#snippet children({ describedBy, invalid })}
          <select
            id={id('geo_scope')}
            aria-describedby={describedBy}
            aria-invalid={invalid ? 'true' : undefined}
            value={draft.geo_scope}
            onchange={(event) => (draft.geo_scope = event.currentTarget.value)}
          >
            {#each scopeChoices as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        {/snippet}
      </FormField>

      <CheckboxGroup
        id={id('related_counties')}
        legend="Counties"
        error={errorAt('related_counties')}
        options={COUNTY_OPTIONS}
        bind:selected={draft.related_counties}
      />

      <CheckboxGroup
        id={id('modes')}
        legend="Modes"
        error={errorAt('modes')}
        options={MODE_OPTIONS}
        bind:selected={draft.modes}
      />
    </div>

    <div class="section">
      <h3>Organizations</h3>
      <fieldset
        class="group"
        id={id('lead_org')}
        aria-describedby={hasStoredLeadOrg ? leadHintId : undefined}
      >
        <legend>Lead organization</legend>
        {#if hasStoredLeadOrg}
          <p class="hint" id={leadHintId}>{KEEP_HINT}</p>
        {/if}
        <FormField
          id={id('lead_org.name')}
          label="Lead organization name"
          error={errorAt('lead_org.name')}
        >
          {#snippet children({ describedBy, invalid })}
            <input
              id={id('lead_org.name')}
              type="text"
              aria-describedby={describedBy}
              aria-invalid={invalid ? 'true' : undefined}
              bind:value={draft.lead_org.name}
            />
          {/snippet}
        </FormField>
        <FormField
          id={id('lead_org.url')}
          label="Lead organization web address"
          error={errorAt('lead_org.url')}
        >
          {#snippet children({ describedBy, invalid })}
            <input
              id={id('lead_org.url')}
              type="text"
              inputmode="url"
              aria-describedby={describedBy}
              aria-invalid={invalid ? 'true' : undefined}
              bind:value={draft.lead_org.url}
            />
          {/snippet}
        </FormField>
      </fieldset>

      <RepeatableRows
        id={id('partners')}
        legend="Partners"
        itemName="partner"
        bind:rows={draft.partners}
        makeRow={emptyOrgRow}
      >
        {#snippet row(item: OrgRow, index: number)}
          <FormField
            id={id(`partners.${index}.name`)}
            label="Name"
            required
            error={errorAt(`partners.${index}.name`)}
          >
            {#snippet children({ describedBy, invalid })}
              <input
                id={id(`partners.${index}.name`)}
                type="text"
                aria-describedby={describedBy}
                aria-invalid={invalid ? 'true' : undefined}
                bind:value={item.name}
              />
            {/snippet}
          </FormField>
          <FormField
            id={id(`partners.${index}.url`)}
            label="Web address"
            error={errorAt(`partners.${index}.url`)}
          >
            {#snippet children({ describedBy, invalid })}
              <input
                id={id(`partners.${index}.url`)}
                type="text"
                inputmode="url"
                aria-describedby={describedBy}
                aria-invalid={invalid ? 'true' : undefined}
                bind:value={item.url}
              />
            {/snippet}
          </FormField>
        {/snippet}
      </RepeatableRows>
    </div>

    <div class="section">
      <h3>Sources</h3>
      <RepeatableRows
        id={id('sources')}
        legend="Sources"
        hint="The first source is the one linked from the project card."
        itemName="source"
        reorder
        bind:rows={draft.sources}
        makeRow={emptySourceRow}
      >
        {#snippet row(item: SourceRow, index: number)}
          <FormField
            id={id(`sources.${index}.label`)}
            label="Label"
            required
            error={errorAt(`sources.${index}.label`)}
          >
            {#snippet children({ describedBy, invalid })}
              <input
                id={id(`sources.${index}.label`)}
                type="text"
                aria-describedby={describedBy}
                aria-invalid={invalid ? 'true' : undefined}
                bind:value={item.label}
              />
            {/snippet}
          </FormField>
          <FormField
            id={id(`sources.${index}.url`)}
            label="Web address"
            required
            error={errorAt(`sources.${index}.url`)}
          >
            {#snippet children({ describedBy, invalid })}
              <input
                id={id(`sources.${index}.url`)}
                type="text"
                inputmode="url"
                aria-describedby={describedBy}
                aria-invalid={invalid ? 'true' : undefined}
                bind:value={item.url}
              />
            {/snippet}
          </FormField>
          <FormField
            id={id(`sources.${index}.last_verified`)}
            label="Last verified"
            hint={dateHint(item.original.last_verified)}
            error={errorAt(`sources.${index}.last_verified`)}
          >
            {#snippet children({ describedBy, invalid })}
              <input
                id={id(`sources.${index}.last_verified`)}
                type={usesPicker(item.original.last_verified) ? 'date' : 'text'}
                aria-describedby={describedBy}
                aria-invalid={invalid ? 'true' : undefined}
                bind:value={item.last_verified}
              />
            {/snippet}
          </FormField>
        {/snippet}
      </RepeatableRows>
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

  p {
    margin: 0;
  }

  .intro,
  .hint {
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
    gap: 0.75rem;
    margin: 0;
    padding: 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
  }

  legend {
    padding: 0 0.3rem;
    font-size: 0.86rem;
    font-weight: 600;
  }

  .preview {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .badge {
    display: inline-block;
    padding: 0.22rem 0.65rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    word-break: break-word;
  }

  select,
  textarea,
  input[type='text'],
  input[type='date'] {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  textarea {
    resize: vertical;
  }
</style>

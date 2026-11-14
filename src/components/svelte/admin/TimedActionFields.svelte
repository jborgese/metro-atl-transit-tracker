<script lang="ts">
  import { fieldId } from '#lib/content/formModel/labels.ts';
  import type { TimedActionDraft } from '#lib/content/formModel/types.ts';
  import type { FieldIssue } from '#lib/content/formModel/validate.ts';
  import { addDays, FIELD_LIMITS, TIMED_ACTION_MAX_DAYS_AHEAD } from '#lib/content/schemas.ts';
  import type { Goal } from '#types/content.ts';
  import FormField from './FormField.svelte';

  interface Props {
    draft: TimedActionDraft;
    goals: Goal[];
    issues: FieldIssue[];
    today: string;
    readonly?: boolean;
  }

  const GOAL_TEXT_LENGTH = 80;

  let { draft = $bindable(), goals, issues, today, readonly = false }: Props = $props();

  const uid = $props.id();
  const id = (path: string) => fieldId('timed_action', path);
  const errorAt = (path: string) => issues.find((issue) => issue.path === path)?.message;
  const optionText = (goal: Goal) => `${goal.goal.slice(0, GOAL_TEXT_LENGTH).trim()} (${goal.id})`;
  const latest = $derived(addDays(today, TIMED_ACTION_MAX_DAYS_AHEAD));
  const activeGoals = $derived(goals.filter((goal) => goal.is_archived !== true));
  const strayOptions = $derived.by(() => {
    const stored = typeof draft.base.goal_id === 'string' ? draft.base.goal_id : '';
    const ids = [...new Set([draft.goal_id, stored])].filter((value) => value.trim() !== '');
    return ids.flatMap((value) => {
      const found = goals.find((goal) => goal.id === value);
      if (found === undefined) {
        return [{ value, text: `${value} (not found)` }];
      }
      return found.is_archived === true ? [{ value, text: `${optionText(found)} (archived)` }] : [];
    });
  });
  const linkHintId = `${uid}-link-hint`;
  const locationHintId = `${uid}-location-hint`;
</script>

<form novalidate onsubmit={(event) => event.preventDefault()}>
  <fieldset class="body" disabled={readonly}>
    <p class="intro">Fields marked (required) must be filled in.</p>

    <FormField id={id('goal_id')} label="Goal" required error={errorAt('goal_id')}>
      {#snippet children({ describedBy, invalid })}
        <select
          id={id('goal_id')}
          aria-describedby={describedBy}
          aria-invalid={invalid ? 'true' : undefined}
          value={draft.goal_id}
          onchange={(event) => (draft.goal_id = event.currentTarget.value)}
        >
          <option value="">Choose a goal</option>
          {#each activeGoals as goal (goal.id)}
            <option value={goal.id}>{optionText(goal)}</option>
          {/each}
          {#each strayOptions as option (option.value)}
            <option value={option.value}>{option.text}</option>
          {/each}
        </select>
      {/snippet}
    </FormField>

    <FormField
      id={id('description')}
      label="Description"
      required
      hint="Shown on the banner."
      error={errorAt('description')}
      limit={FIELD_LIMITS.description}
      value={draft.description}
    >
      {#snippet children({ describedBy, invalid })}
        <textarea
          id={id('description')}
          rows="4"
          aria-describedby={describedBy}
          aria-invalid={invalid ? 'true' : undefined}
          bind:value={draft.description}></textarea>
      {/snippet}
    </FormField>

    <FormField
      id={id('expires_on')}
      label="Last day"
      required
      hint={`The banner shows through the end of this day, Atlanta time. From ${today} to ${latest}.`}
      error={errorAt('expires_on')}
    >
      {#snippet children({ describedBy, invalid })}
        <input
          id={id('expires_on')}
          type="date"
          min={today}
          max={latest}
          aria-describedby={describedBy}
          aria-invalid={invalid ? 'true' : undefined}
          bind:value={draft.expires_on}
        />
      {/snippet}
    </FormField>

    <fieldset class="group" aria-describedby={linkHintId}>
      <legend>Link (optional)</legend>
      <p class="hint" id={linkHintId}>Fill in both or leave both empty.</p>
      <FormField
        id={id('link.label')}
        label="Link button label"
        error={errorAt('link.label')}
        limit={FIELD_LIMITS.label}
        value={draft.link.label}
      >
        {#snippet children({ describedBy, invalid })}
          <input
            id={id('link.label')}
            type="text"
            aria-describedby={describedBy}
            aria-invalid={invalid ? 'true' : undefined}
            bind:value={draft.link.label}
          />
        {/snippet}
      </FormField>
      <FormField id={id('link.url')} label="Link web address" error={errorAt('link.url')}>
        {#snippet children({ describedBy, invalid })}
          <input
            id={id('link.url')}
            type="text"
            inputmode="url"
            aria-describedby={describedBy}
            aria-invalid={invalid ? 'true' : undefined}
            bind:value={draft.link.url}
          />
        {/snippet}
      </FormField>
    </fieldset>

    <fieldset class="group" aria-describedby={locationHintId}>
      <legend>Location (optional)</legend>
      <p class="hint" id={locationHintId}>Fill in both or leave both empty.</p>
      <FormField
        id={id('location.label')}
        label="Location button label"
        error={errorAt('location.label')}
        limit={FIELD_LIMITS.label}
        value={draft.location.label}
      >
        {#snippet children({ describedBy, invalid })}
          <input
            id={id('location.label')}
            type="text"
            aria-describedby={describedBy}
            aria-invalid={invalid ? 'true' : undefined}
            bind:value={draft.location.label}
          />
        {/snippet}
      </FormField>
      <FormField
        id={id('location.address')}
        label="Address"
        hint="Opens in Google Maps."
        error={errorAt('location.address')}
        limit={FIELD_LIMITS.address}
        value={draft.location.address}
      >
        {#snippet children({ describedBy, invalid })}
          <input
            id={id('location.address')}
            type="text"
            aria-describedby={describedBy}
            aria-invalid={invalid ? 'true' : undefined}
            bind:value={draft.location.address}
          />
        {/snippet}
      </FormField>
    </fieldset>
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

  .intro,
  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted);
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

  select,
  textarea,
  input {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  textarea {
    resize: vertical;
  }
</style>

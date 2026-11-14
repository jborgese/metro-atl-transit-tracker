<script lang="ts">
  import FormField from './FormField.svelte';

  interface Props {
    id: string;
    label: string;
    hint?: string;
    error?: string;
    required?: boolean;
    limit?: number;
    value?: string;
  }

  let { id, label, hint, error, required, limit, value }: Props = $props();
</script>

<FormField {id} {label} {hint} {error} {required} {limit} {value}>
  {#snippet children({ describedBy, invalid })}
    <input {id} aria-describedby={describedBy} aria-invalid={invalid ? 'true' : undefined} />
  {/snippet}
</FormField>

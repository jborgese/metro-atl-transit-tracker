<script lang="ts">
  interface AskOptions {
    title: string;
    body: string;
    confirmLabel: string;
    cancelLabel?: string;
  }

  const uid = $props.id();
  const titleId = `${uid}-title`;
  const bodyId = `${uid}-body`;

  let dialog: HTMLDialogElement | undefined = $state();
  let cancelButton: HTMLButtonElement | undefined = $state();
  let title = $state('');
  let body = $state('');
  let confirmLabel = $state('');
  let cancelLabel = $state('Cancel');
  let settle: ((answer: boolean) => void) | null = null;
  let returnFocusTo: HTMLElement | null = null;

  export function ask(options: AskOptions): Promise<boolean> {
    settle?.(false);
    title = options.title;
    body = options.body;
    confirmLabel = options.confirmLabel;
    cancelLabel = options.cancelLabel ?? 'Cancel';
    return new Promise<boolean>((resolve) => {
      settle = resolve;
      if (dialog && !dialog.open) {
        returnFocusTo =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.showModal();
        cancelButton?.focus();
      }
    });
  }

  function finish(answer: boolean) {
    const resolve = settle;
    settle = null;
    if (dialog?.open) {
      dialog.close();
    }
    const target = returnFocusTo;
    returnFocusTo = null;
    if (target?.isConnected) {
      target.focus();
    }
    resolve?.(answer);
  }

  function handleCancel(event: Event) {
    event.preventDefault();
    finish(false);
  }
</script>

<dialog
  bind:this={dialog}
  role="alertdialog"
  aria-labelledby={titleId}
  aria-describedby={bodyId}
  oncancel={handleCancel}
>
  <h2 id={titleId}>{title}</h2>
  <p id={bodyId}>{body}</p>
  <div class="actions">
    <!-- svelte-ignore a11y_autofocus -->
    <button
      type="button"
      class="cancel"
      bind:this={cancelButton}
      autofocus
      onclick={() => finish(false)}>{cancelLabel}</button
    >
    <button type="button" class="confirm" onclick={() => finish(true)}>{confirmLabel}</button>
  </div>
</dialog>

<style>
  dialog {
    width: min(28rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    overflow-y: auto;
    padding: 1.25rem;
    border: 1px solid var(--border-strong);
    border-radius: 0.75rem;
    background: var(--surface-0);
    color: var(--text-on-dark);
    box-shadow: var(--shadow-2);
    z-index: var(--z-modal);
  }

  dialog::backdrop {
    background: var(--surface-2);
  }

  h2 {
    margin: 0 0 0.6rem;
    font-size: 1.1rem;
    overflow-wrap: anywhere;
  }

  p {
    margin: 0 0 1.1rem;
    color: var(--text-muted);
    line-height: 1.45;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.6rem;
  }

  button {
    min-height: 2.5rem;
    padding: 0.45rem 0.9rem;
    border: 1px solid var(--border-strong);
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  button.confirm {
    background: var(--text-on-dark);
    color: var(--text-on-light);
  }

  button:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }

  @media (max-width: 30rem) {
    .actions {
      flex-direction: column-reverse;
    }

    button {
      width: 100%;
    }
  }
</style>

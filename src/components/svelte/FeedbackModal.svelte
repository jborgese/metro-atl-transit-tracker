<script lang="ts">
  import Portal from './Portal.svelte';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let modalContent: HTMLDivElement | null = $state(null);
  let closeButton: HTMLButtonElement | null = $state(null);
  let lastFocused: HTMLElement | null = null;

  let category = $state('general');
  let name = $state('');
  let email = $state('');
  let message = $state('');
  let website = $state('');
  let status: 'idle' | 'submitting' | 'success' | 'error' = $state('idle');
  let errorMessage = $state('');

  $effect(() => {
    if (typeof document === 'undefined') return;
    if (open) {
      lastFocused = (document.activeElement as HTMLElement) ?? null;
      document.body.style.overflow = 'hidden';
      // Wait for the portal to mount, then move focus into the dialog.
      Promise.resolve().then(() => closeButton?.focus());
    } else {
      document.body.style.overflow = '';
      lastFocused?.focus();
      lastFocused = null;
    }
  });

  function resetForm() {
    category = 'general';
    name = '';
    email = '';
    message = '';
    website = '';
    status = 'idle';
    errorMessage = '';
  }

  function close() {
    open = false;
    if (status === 'success') {
      resetForm();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'Tab' && modalContent) {
      const focusables = Array.from(
        modalContent.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
        )
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function handleBackdropKeydown(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      close();
    }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (message.trim().length < 5) {
      status = 'error';
      errorMessage = 'Please write at least a few words of feedback.';
      return;
    }

    status = 'submitting';
    errorMessage = '';
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          category,
          page_url: location.pathname,
          website,
        }),
      });

      if (res.ok) {
        status = 'success';
        return;
      }

      if (res.status === 429) {
        status = 'error';
        errorMessage = 'Too many submissions — please try again in a minute.';
        return;
      }

      let serverMessage = '';
      try {
        const body = (await res.json()) as { message?: string; error?: string };
        serverMessage = body.message ?? body.error ?? '';
      } catch {
        // ignore non-JSON error bodies
      }
      status = 'error';
      errorMessage = serverMessage || 'Something went wrong — please try again.';
    } catch {
      status = 'error';
      errorMessage = 'Could not reach the server — please try again.';
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <Portal>
    <div
      class="modal-backdrop"
      onclick={handleBackdropClick}
      onkeydown={handleBackdropKeydown}
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
    >
      <div class="modal-content" bind:this={modalContent}>
        <button class="modal-close" onclick={close} aria-label="Close" bind:this={closeButton}>
          &times;
        </button>
        {#if status === 'success'}
          <div class="feedback-success" role="status">
            <h1 id="feedback-title">Thank you!</h1>
            <p>Your feedback has been sent.</p>
            <button class="feedback-submit" onclick={close}>Close</button>
          </div>
        {:else}
          <form class="feedback-form" onsubmit={handleSubmit}>
            <h1 id="feedback-title">Send feedback</h1>
            <p class="feedback-intro">
              Spotted a data error, a bug, or have an idea? Let us know.
            </p>

            <label class="feedback-field">
              <span>Topic</span>
              <select bind:value={category}>
                <option value="general">General</option>
                <option value="bug">Bug report</option>
                <option value="data-correction">Data correction</option>
                <option value="feature-request">Feature request</option>
              </select>
            </label>

            <label class="feedback-field">
              <span>Name <em>(optional)</em></span>
              <input type="text" bind:value={name} maxlength="120" autocomplete="name" />
            </label>

            <label class="feedback-field">
              <span>Email <em>(optional, if you'd like a reply)</em></span>
              <input type="email" bind:value={email} maxlength="254" autocomplete="email" />
            </label>

            <label class="feedback-field">
              <span>Feedback</span>
              <textarea
                bind:value={message}
                maxlength="4000"
                rows="6"
                required
                aria-required="true"
              ></textarea>
            </label>

            <!-- Honeypot: hidden from real users; bots that fill it are silently dropped. -->
            <div class="feedback-trap" aria-hidden="true">
              <label>
                Website
                <input
                  type="text"
                  name="website"
                  bind:value={website}
                  tabindex="-1"
                  autocomplete="off"
                />
              </label>
            </div>

            <div class="feedback-status" aria-live="polite">
              {#if status === 'error'}
                <p class="feedback-error">{errorMessage}</p>
              {/if}
            </div>

            <button class="feedback-submit" type="submit" disabled={status === 'submitting'}>
              {status === 'submitting' ? 'Sending…' : 'Send feedback'}
            </button>
          </form>
        {/if}
      </div>
    </div>
  </Portal>
{/if}

<style>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200000;
  padding: 1rem;
}

.modal-content {
  position: relative;
  width: min(100%, 28rem);
  max-height: 90vh;
  overflow-y: auto;
  background: var(--surface-2);
  border-radius: 0.75rem;
  padding: clamp(1.25rem, 3vw, 2rem);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

.modal-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: none;
  border: none;
  color: #a3a3a3;
  font-size: 1.75rem;
  cursor: pointer;
  line-height: 1;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.modal-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.feedback-form h1,
.feedback-success h1 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: #fff;
}

.feedback-intro,
.feedback-success p {
  color: var(--text-muted);
  margin-bottom: 1rem;
  line-height: 1.5;
}

.feedback-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-bottom: 0.9rem;
}

.feedback-field span {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.feedback-field em {
  font-style: normal;
  color: var(--text-dim);
}

.feedback-field input,
.feedback-field select,
.feedback-field textarea {
  border: 1px solid var(--border-subtle);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-on-dark);
  padding: 0.45rem 0.6rem;
  border-radius: 0.5rem;
  font: inherit;
}

.feedback-field textarea {
  resize: vertical;
  min-height: 7rem;
}

.feedback-field input:focus-visible,
.feedback-field select:focus-visible,
.feedback-field textarea:focus-visible {
  outline: none;
  border-color: var(--atl-blue);
  box-shadow: 0 0 0 3px rgba(66, 128, 196, 0.35);
}

.feedback-trap {
  position: absolute;
  left: -9999px;
  height: 1px;
  width: 1px;
  overflow: hidden;
}

.feedback-status {
  min-height: 1.2rem;
  margin-bottom: 0.5rem;
}

.feedback-error {
  color: #fca5a5;
  background: rgba(220, 38, 38, 0.15);
  border: 1px solid rgba(220, 38, 38, 0.4);
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
}

.feedback-submit {
  border: 1px solid var(--border-strong);
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-on-dark);
  padding: 0.5rem 1.1rem;
  border-radius: 0.5rem;
  font: inherit;
  cursor: pointer;
}

.feedback-submit:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.14);
}

.feedback-submit:disabled {
  opacity: 0.6;
  cursor: default;
}

.feedback-submit:focus-visible {
  outline: none;
  border-color: var(--atl-blue);
  box-shadow: 0 0 0 3px rgba(66, 128, 196, 0.35);
}

@media (max-width: 600px) {
  .modal-content {
    border-radius: 0.5rem;
    max-height: 92vh;
  }

  .modal-close {
    top: 0.5rem;
    right: 0.5rem;
  }
}
</style>

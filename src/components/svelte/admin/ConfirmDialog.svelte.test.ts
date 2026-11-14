import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ConfirmDialog from './ConfirmDialog.svelte';

type Ask = (next: typeof options & { cancelLabel?: string }) => Promise<boolean>;

const options = {
  title: 'Archive Goal g1?',
  body: 'It will disappear.',
  confirmLabel: 'Archive',
};

function renderDialog() {
  const { component } = render(ConfirmDialog);
  const ask = (next = options) => (component as unknown as { ask: Ask }).ask(next);
  return {
    ask,
    dialog: () => screen.getByRole('alertdialog', { hidden: true }) as HTMLDialogElement,
  };
}

describe('ConfirmDialog', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the title and body when asked', async () => {
    const { ask, dialog } = renderDialog();
    void ask();
    expect(await screen.findByRole('heading', { name: options.title })).toBeTruthy();
    expect(screen.getByText(options.body)).toBeTruthy();
    expect(dialog().open).toBe(true);
    expect(dialog().getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog().getAttribute('aria-describedby')).toBeTruthy();
  });

  it('resolves true when confirmed and closes', async () => {
    const { ask, dialog } = renderDialog();
    const answer = ask();
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(await answer).toBe(true);
    expect(dialog().open).toBe(false);
  });

  it('resolves false when cancelled', async () => {
    const { ask, dialog } = renderDialog();
    const answer = ask();
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await answer).toBe(false);
    expect(dialog().open).toBe(false);
  });

  it('resolves false on the cancel event (Escape)', async () => {
    const { ask, dialog } = renderDialog();
    const answer = ask();
    await tick();
    await fireEvent(dialog(), new Event('cancel', { cancelable: true }));
    expect(await answer).toBe(false);
    expect(dialog().open).toBe(false);
  });

  it('shows the new text on a second ask and resolves the first as false', async () => {
    const { ask } = renderDialog();
    const first = ask();
    await tick();
    const second = ask({ title: 'Second?', body: 'Other body.', confirmLabel: 'Go' });
    await tick();
    expect(await first).toBe(false);
    expect(await screen.findByRole('heading', { name: 'Second?' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(await second).toBe(true);
  });

  it('returns focus to the element that was focused before it opened', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const { ask } = renderDialog();
    const answer = ask();
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await answer;
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

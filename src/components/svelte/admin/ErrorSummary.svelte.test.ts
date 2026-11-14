import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ErrorSummary from './ErrorSummary.svelte';

afterEach(cleanup);

describe('ErrorSummary', () => {
  it('lists problems as links and takes focus', async () => {
    const { component } = render(ErrorSummary, {
      props: { issues: [{ path: 'title', message: 'Enter a title', href: '#project-title' }] },
    });
    component.focus();
    const summary = screen.getByRole('alert');
    expect(document.activeElement).toBe(summary);
    expect(within(summary).getByRole('heading', { name: 'There is a problem' })).toBeTruthy();
    expect(within(summary).getByRole('link', { name: 'Enter a title' }).getAttribute('href')).toBe(
      '#project-title',
    );
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(ErrorSummary, { props: { issues: [] } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('moves focus to the control a link points at', async () => {
    const input = document.createElement('input');
    input.id = 'project-title';
    document.body.append(input);
    render(ErrorSummary, {
      props: { issues: [{ path: 'title', message: 'Enter a title', href: '#project-title' }] },
    });
    const notCancelled = await fireEvent.click(screen.getByRole('link', { name: 'Enter a title' }));
    expect(notCancelled).toBe(false);
    expect(document.activeElement).toBe(input);
    input.remove();
  });

  it('focuses the first control inside a target that cannot take focus itself', async () => {
    const group = document.createElement('fieldset');
    group.id = 'action-link';
    const input = document.createElement('input');
    group.append(input);
    document.body.append(group);
    render(ErrorSummary, {
      props: { issues: [{ path: 'link', message: 'Fill in both', href: '#action-link' }] },
    });
    await fireEvent.click(screen.getByRole('link', { name: 'Fill in both' }));
    expect(document.activeElement).toBe(input);
    group.remove();
  });
});

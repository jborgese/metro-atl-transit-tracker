import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeedbackModal from './FeedbackModal.svelte';

const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { id: 'f1' } }), { status: 201 }));

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FeedbackModal', () => {
  it('shows a validation error and sends nothing when the feedback is too short', async () => {
    render(FeedbackModal, { props: { open: true } });

    await fireEvent.input(screen.getByLabelText('Feedback'), { target: { value: 'hi' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    expect(screen.getByText('Please write at least a few words of feedback.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the trimmed feedback and thanks the visitor', async () => {
    render(FeedbackModal, { props: { open: true } });

    await fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'bug' } });
    await fireEvent.input(screen.getByLabelText('Feedback'), { target: { value: '  Route 12 shows the wrong stops  ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Thank you!'));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/feedback');
    expect(JSON.parse(String(init.body))).toEqual({
      message: 'Route 12 shows the wrong stops',
      category: 'bug',
      page_url: '/',
      website: '',
    });
  });
});

import { projectStatusLabel } from '#lib/content/options.ts';

export function statusLabel(status: string | undefined | null): string {
  if (!status) {
    return status ?? '';
  }
  return projectStatusLabel(status) ?? status;
}

export function getStatusColor(status: string | undefined | null): string {
  switch (status) {
    case 'planning':
      return '#4280c4';
    case 'public-outreach':
      return '#8a62b0';
    case 'funding-application':
      return '#a32f65';
    case 'implementation':
      return '#c4a042';
    case 'completed':
      return '#2d8659';
    case 'ongoing':
      return '#a73a32';
    default:
      return '#4280c4';
  }
}

// WCAG 1.4.3 AA contrast — the gold/lavender/green/blue badges all fall under
// 4.5:1 against #fff. Switching to dark text on the high-luminance backgrounds
// (gold + lavender + green + light blue) lifts contrast above the threshold.
export function getStatusTextColor(status: string | undefined | null): string {
  switch (status) {
    case 'implementation':
    case 'public-outreach':
    case 'completed':
    case 'planning':
      return '#1F1F1F';
    default:
      return '#fff';
  }
}

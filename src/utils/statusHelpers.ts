export function statusLabel(status: string | undefined | null): string {
  switch (status) {
    case 'planning':
      return 'Planning';
    case 'public-outreach':
      return 'Public Outreach';
    case 'funding-application':
      return 'Funding Application';
    case 'implementation':
      return 'Implementation';
    case 'completed':
      return 'Completed';
    case 'ongoing':
      return 'Ongoing';
    default:
      return status ?? '';
  }
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

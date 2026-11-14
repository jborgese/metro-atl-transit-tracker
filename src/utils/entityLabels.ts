const ENTITY_TYPE_LABELS: Record<string, string | undefined> = {
  project: 'Project',
  goal: 'Goal',
  timed_action: 'Timed action',
};

export function entityTypeLabel(type: string): string {
  return (Object.hasOwn(ENTITY_TYPE_LABELS, type) ? ENTITY_TYPE_LABELS[type] : undefined) ?? type;
}

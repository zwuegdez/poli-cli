export const PERMISSION_CHOICES = [
  { value: 'read-only', label: 'Read-only', description: 'Inspect files and search. No edits or shell commands.' },
  { value: 'ask', label: 'Ask before changes', description: 'Read freely. Approve file changes and shell commands.' },
  { value: 'full', label: 'Full access', description: 'Allow file changes and shell commands without approval.' },
];

export function permissionLevel(config = {}) {
  if (config.permission != null) return PERMISSION_CHOICES.some(c => c.value === config.permission) ? config.permission : 'read-only';
  return config.autoApprove ? 'full' : 'ask';
}

export function permissionLabel(config = {}) {
  return PERMISSION_CHOICES.find(c => c.value === permissionLevel(config)).label;
}

// Public runtime is paused. There is intentionally no environment or flag override.
export const COMING_SOON_MESSAGE = 'Poli CLI — Coming soon.\nCLI access is temporarily disabled while the public release is prepared.\n';

export function showComingSoon(output = process.stdout) {
  output.write(COMING_SOON_MESSAGE);
  return 0;
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const settingsSource = readFileSync(
  new URL('../../src/components/Settings.jsx', import.meta.url),
  'utf8'
);

describe('Settings source hygiene', () => {
  it('does not leave raw informational console logging in the renderer component', () => {
    expect(settingsSource).not.toContain('console.log(');
  });
});

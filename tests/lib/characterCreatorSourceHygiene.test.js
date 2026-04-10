import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const characterCreatorSource = readFileSync(
  new URL('../../src/components/CharacterCreator.jsx', import.meta.url),
  'utf8'
);

describe('CharacterCreator source hygiene', () => {
  it('does not leave raw informational console logging in the renderer component', () => {
    expect(characterCreatorSource).not.toContain('console.log(');
  });

  it('does not leave descriptive source comments in the component file', () => {
    expect(characterCreatorSource).not.toMatch(/(^|\s)\/\/|\{\/\*/m);
  });

  it('still navigates back through onSave after a successful save', () => {
    expect(characterCreatorSource).toMatch(/if \(saved\) \{\s+onSave\(character\);\s+\} else \{/);
  });
});

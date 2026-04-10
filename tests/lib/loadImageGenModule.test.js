import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractConversationContext, generateImage } from '../../src/lib/imageGen.js';

const chatInterfaceSource = readFileSync(new URL('../../src/components/ChatInterface.jsx', import.meta.url), 'utf8');

async function loadImageGenModuleApi() {
  return import('../../src/lib/loadImageGenModule.js');
}

afterEach(async () => {
  try {
    const { resetImageGenModuleCacheForTests } = await loadImageGenModuleApi();
    resetImageGenModuleCacheForTests();
  } catch {
    // The helper does not exist until the lazy-loading feature is implemented.
  }
});

describe('loadImageGenModule', () => {
  it('reuses the same in-flight promise and resolves to the image generation module exports', async () => {
    const { loadImageGenModule } = await loadImageGenModuleApi();
    const fakeModule = { generateImage, extractConversationContext };
    let resolveLoader;
    const loader = vi.fn(() => new Promise((resolve) => {
      resolveLoader = () => resolve(fakeModule);
    }));

    const firstPromise = loadImageGenModule(loader);
    const secondPromise = loadImageGenModule(loader);

    expect(secondPromise).toBe(firstPromise);
    expect(loader).toHaveBeenCalledTimes(1);

    resolveLoader();

    await expect(firstPromise).resolves.toBe(fakeModule);
  });

  it('clears the cached promise after a failed import so the next attempt can retry', async () => {
    const { loadImageGenModule } = await loadImageGenModuleApi();
    const failure = new Error('boom');
    const successModule = { generateImage, extractConversationContext };
    const loader = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(successModule);

    await expect(loadImageGenModule(loader)).rejects.toThrow('boom');
    await expect(loadImageGenModule(loader)).resolves.toBe(successModule);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe('ChatInterface image generation loading', () => {
  it('lazy-loads image generation helpers instead of importing them eagerly', () => {
    expect(chatInterfaceSource).toContain("import { loadImageGenModule } from '../lib/loadImageGenModule';");
    expect(chatInterfaceSource).not.toContain("import { generateImage, extractConversationContext } from '../lib/imageGen';");
    expect(chatInterfaceSource).toContain('const { generateImage } = await loadImageGenModule();');
    expect(chatInterfaceSource).toContain('const { extractConversationContext } = await loadImageGenModule();');
  });

  it('handles lazy conversation-context loading failures without leaving an unhandled rejection', () => {
    expect(chatInterfaceSource).toContain('const handleUseConversationContext = async () => {');
    expect(chatInterfaceSource).toContain('onClick={handleUseConversationContext}');
    expect(chatInterfaceSource).toMatch(/const handleUseConversationContext = async \(\) => \{[\s\S]*?try \{[\s\S]*?loadImageGenModule\(\)[\s\S]*?\} catch \(error\) \{[\s\S]*?toast\.error\(\(t\.chat\.imageGenFailed \|\| ''\)\.replace\('\{error\}', error\.message\)\);[\s\S]*?\}/);
  });
});

const defaultImageGenModuleLoader = () => import('./imageGen.js');

let imageGenModulePromise = null;

/**
 * Lazily load the image generation module and reuse the same module promise.
 * Resets the cache on failed imports so later attempts can retry.
 *
 * @param {() => Promise<typeof import('./imageGen.js')>} [loader]
 * @returns {Promise<typeof import('./imageGen.js')>}
 */
export function loadImageGenModule(loader = defaultImageGenModuleLoader) {
  if (!imageGenModulePromise) {
    imageGenModulePromise = loader().catch((error) => {
      imageGenModulePromise = null;
      throw error;
    });
  }

  return imageGenModulePromise;
}

/**
 * Test-only reset hook for the lazy image generation module cache.
 */
export function resetImageGenModuleCacheForTests() {
  imageGenModulePromise = null;
}

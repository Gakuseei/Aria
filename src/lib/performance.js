export function getPerformanceProfile(targetWindow = globalThis) {
  const navigatorRef = targetWindow?.navigator;
  const connection = navigatorRef?.connection;
  const hardwareConcurrency = Number.isFinite(Number(navigatorRef?.hardwareConcurrency))
    ? Number(navigatorRef.hardwareConcurrency)
    : null;
  const deviceMemory = Number.isFinite(Number(navigatorRef?.deviceMemory))
    ? Number(navigatorRef.deviceMemory)
    : null;
  const prefersReducedMotion = Boolean(
    targetWindow?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
  );
  const saveData = connection?.saveData === true;
  const lowCoreCount = hardwareConcurrency !== null && hardwareConcurrency <= 4;
  const lowMemory = deviceMemory !== null && deviceMemory <= 4;

  return {
    hardwareConcurrency,
    deviceMemory,
    prefersReducedMotion,
    saveData,
    reduceEffects: prefersReducedMotion || saveData || lowCoreCount || lowMemory,
  };
}

export function applyPerformanceProfile(profile, targetDocument = document) {
  if (!targetDocument?.body) {
    return Boolean(profile?.reduceEffects);
  }

  const shouldReduceEffects = Boolean(profile?.reduceEffects);
  targetDocument.body.classList.toggle('reduced-effects', shouldReduceEffects);
  targetDocument.body.dataset.performanceTier = shouldReduceEffects ? 'low' : 'default';
  return shouldReduceEffects;
}

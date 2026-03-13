import { useState, useEffect } from 'react';

/**
 * Entrance animation hook — delays visibility for a smooth fade-in.
 * @param {number} [delay=100] - Milliseconds before setting visible
 * @returns {boolean} Whether the component should be visible
 */
export default function useEntranceAnimation(delay = 100) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return isVisible;
}

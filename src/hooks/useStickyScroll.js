import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Sticky-scroll hook for chat-style message lists.
 *
 * Tracks whether a sentinel element at the bottom of a scroll container is in
 * view via `IntersectionObserver`. The observer state is the single source of
 * truth, fully decoupled from scroll events, so programmatic scrolls cannot
 * mis-flip the stickiness flag.
 *
 * Usage:
 *   const { scrollContainerRef, sentinelRef, isSticky, scrollToBottom, resetSticky } = useStickyScroll();
 *   <div ref={scrollContainerRef}>...<div ref={sentinelRef} aria-hidden="true" /></div>
 *
 * @returns {{
 *   scrollContainerRef: import('react').RefObject<HTMLElement>,
 *   sentinelRef: import('react').RefObject<HTMLElement>,
 *   isSticky: boolean,
 *   scrollToBottom: (options?: { smooth?: boolean }) => void,
 *   resetSticky: () => void,
 * }}
 */
export default function useStickyScroll() {
  const scrollContainerRef = useRef(null);
  const sentinelRef = useRef(null);
  const [isSticky, setIsSticky] = useState(true);
  const isStickyRef = useRef(true);

  useEffect(() => {
    isStickyRef.current = isSticky;
  }, [isSticky]);

  useEffect(() => {
    const root = scrollContainerRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) {
          isStickyRef.current = entry.isIntersecting;
          setIsSticky(entry.isIntersecting);
        }
      },
      { root, rootMargin: '0px 0px 64px 0px', threshold: 0 }
    );

    observer.observe(sentinel);

    /**
     * Detach sticky immediately when the user expresses upward intent.
     * Wheel/touch handlers run before observers can react, preventing
     * the next streaming token from yanking the viewport back down.
     */
    const detachOnUserScrollUp = (delta) => {
      if (delta < 0 && isStickyRef.current) {
        isStickyRef.current = false;
        setIsSticky(false);
      }
    };

    const handleWheel = (event) => {
      detachOnUserScrollUp(event.deltaY);
    };

    let touchStartY = 0;
    const handleTouchStart = (event) => {
      if (event.touches.length > 0) touchStartY = event.touches[0].clientY;
    };
    const handleTouchMove = (event) => {
      if (event.touches.length === 0) return;
      const dy = touchStartY - event.touches[0].clientY;
      detachOnUserScrollUp(dy);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'Home') {
        detachOnUserScrollUp(-1);
      }
    };

    root.addEventListener('wheel', handleWheel, { passive: true });
    root.addEventListener('touchstart', handleTouchStart, { passive: true });
    root.addEventListener('touchmove', handleTouchMove, { passive: true });
    root.addEventListener('keydown', handleKeyDown);

    return () => {
      observer.disconnect();
      root.removeEventListener('wheel', handleWheel);
      root.removeEventListener('touchstart', handleTouchStart);
      root.removeEventListener('touchmove', handleTouchMove);
      root.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return undefined;

    const pin = () => {
      if (!isStickyRef.current) return;
      root.scrollTo({ top: root.scrollHeight, behavior: 'auto' });
    };

    const resizeObserver = new ResizeObserver(pin);
    const observed = new Set();

    const observeChildren = () => {
      for (const child of root.children) {
        if (child instanceof Element && !observed.has(child)) {
          resizeObserver.observe(child);
          observed.add(child);
        }
      }
    };

    observeChildren();

    const mutationObserver = new MutationObserver((mutations) => {
      let added = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          added = true;
          break;
        }
      }
      if (added) observeChildren();
    });
    mutationObserver.observe(root, { childList: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      observed.clear();
    };
  }, []);

  const scrollToBottom = useCallback(({ smooth = false } = {}) => {
    const root = scrollContainerRef.current;
    if (!root) return;
    root.scrollTo({
      top: root.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  const resetSticky = useCallback(() => {
    isStickyRef.current = true;
    setIsSticky(true);
    requestAnimationFrame(() => {
      const root = scrollContainerRef.current;
      if (!root) return;
      root.scrollTo({ top: root.scrollHeight, behavior: 'auto' });
    });
  }, []);

  return { scrollContainerRef, sentinelRef, isSticky, scrollToBottom, resetSticky };
}

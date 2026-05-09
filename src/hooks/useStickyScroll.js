import { useEffect, useRef, useState } from 'react';

/**
 * Sticky-scroll hook for chat-style message lists.
 *
 * Tracks whether a sentinel element at the bottom of a scroll container is in
 * view via `IntersectionObserver`. The observer state is the single source of
 * truth, fully decoupled from scroll events, so programmatic scrolls cannot
 * mis-flip the stickiness flag.
 *
 * Usage:
 *   const { scrollContainerRef, sentinelRef, isSticky, scrollToBottom } = useStickyScroll();
 *   <div ref={scrollContainerRef}>...<div ref={sentinelRef} aria-hidden="true" /></div>
 *
 * @returns {{
 *   scrollContainerRef: import('react').RefObject<HTMLElement>,
 *   sentinelRef: import('react').RefObject<HTMLElement>,
 *   isSticky: boolean,
 *   scrollToBottom: (options?: { smooth?: boolean }) => void,
 * }}
 */
export default function useStickyScroll() {
  const scrollContainerRef = useRef(null);
  const sentinelRef = useRef(null);
  const [isSticky, setIsSticky] = useState(true);

  useEffect(() => {
    const root = scrollContainerRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setIsSticky(entry.isIntersecting);
      },
      { root, rootMargin: '0px 0px 64px 0px', threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const scrollToBottom = ({ smooth = false } = {}) => {
    sentinelRef.current?.scrollIntoView({
      block: 'end',
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  return { scrollContainerRef, sentinelRef, isSticky, scrollToBottom };
}

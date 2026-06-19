"use client";

import { useEffect, useRef, useState, useCallback, type RefObject } from "react";

interface UseCountUpOptions {
  /** Target number to count up to */
  target: number;
  /** Animation duration in ms (default 2000) */
  duration?: number;
  /** Decimal places to show (default 0) */
  decimals?: number;
  /** Whether the animation is enabled (default true) */
  enabled?: boolean;
}

interface UseCountUpReturn {
  /** Attach this ref to the container element to trigger on scroll-into-view */
  ref: RefObject<HTMLDivElement | null>;
  /** Current animated value */
  value: number;
}

/**
 * Animated count-up hook using requestAnimationFrame + IntersectionObserver.
 *
 * - Numbers count from 0 → target when the element scrolls into view.
 * - Fires only once (one-shot animation).
 * - Zero external dependencies.
 */
export function useCountUp({
  target,
  duration = 2000,
  decimals = 0,
  enabled = true,
}: UseCountUpOptions): UseCountUpReturn {
  const ref = useRef<HTMLDivElement | null>(null);
  const [value, setValue] = useState(0);
  const hasAnimated = useRef(false);

  const animate = useCallback(() => {
    if (hasAnimated.current || !enabled || target === 0) {
      if (target === 0) setValue(0);
      return;
    }
    hasAnimated.current = true;

    const start = performance.now();
    const from = 0;

    function step(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic for a satisfying deceleration feel
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        // Snap to exact target to avoid floating-point drift
        setValue(target);
      }
    }

    requestAnimationFrame(step);
  }, [target, duration, enabled]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    // If already visible (e.g. near top of page), animate immediately
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          animate();
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [animate, enabled]);

  return { ref, value };
}

/** Format a number with locale-aware separators. */
export function formatStat(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

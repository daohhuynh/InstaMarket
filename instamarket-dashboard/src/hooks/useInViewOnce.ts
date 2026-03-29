import { useEffect, useRef, useState } from "react";

interface UseInViewOnceOptions {
  threshold?: number;
  rootMargin?: string;
}

export function useInViewOnce(options: UseInViewOnceOptions = {}) {
  const { threshold = 0.24, rootMargin = "0px 0px -8% 0px" } = options;
  const ref = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isVisible) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold: [threshold],
        rootMargin,
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible, rootMargin, threshold]);

  return { ref, isVisible };
}

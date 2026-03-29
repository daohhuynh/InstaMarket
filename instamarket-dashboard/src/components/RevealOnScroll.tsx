import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { useInViewOnce } from "../hooks/useInViewOnce";

interface RevealOnScrollProps {
  children: (state: { isVisible: boolean; prefersReducedMotion: boolean }) => ReactNode;
  className?: string;
  delay?: number;
  as?: "article" | "div" | "section";
}

export function RevealOnScroll({
  children,
  className,
  delay = 0,
  as = "div",
}: RevealOnScrollProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const { ref, isVisible } = useInViewOnce();

  const Component = useMemo(() => {
    if (as === "article") return motion.article;
    if (as === "section") return motion.section;
    return motion.div;
  }, [as]);

  return (
    <Component
      ref={ref as never}
      className={className}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={
        prefersReducedMotion || isVisible
          ? { opacity: 1, y: 0 }
          : { opacity: 0, y: 12 }
      }
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children({ isVisible: prefersReducedMotion || isVisible, prefersReducedMotion })}
    </Component>
  );
}

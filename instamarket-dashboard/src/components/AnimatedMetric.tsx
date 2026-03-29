import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect } from "react";

interface AnimatedMetricProps {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  className?: string;
  start?: boolean;
  delay?: number;
}

export function AnimatedMetric({
  value,
  suffix = "",
  prefix = "",
  decimals = 0,
  className,
  start = true,
  delay = 0,
}: AnimatedMetricProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const motionValue = useMotionValue(prefersReducedMotion ? value : 0);
  const rounded = useTransform(motionValue, (latest) =>
    `${prefix}${latest.toFixed(decimals)}${suffix}`,
  );

  useEffect(() => {
    if (!start && !prefersReducedMotion) {
      motionValue.set(0);
      return;
    }

    const controls = animate(motionValue, value, {
      duration: prefersReducedMotion ? 0 : 0.82,
      delay: prefersReducedMotion ? 0 : delay,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [delay, motionValue, prefersReducedMotion, start, value]);

  return <motion.span className={className}>{rounded}</motion.span>;
}

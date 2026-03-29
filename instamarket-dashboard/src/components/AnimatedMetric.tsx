import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";

interface AnimatedMetricProps {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  className?: string;
}

export function AnimatedMetric({
  value,
  suffix = "",
  prefix = "",
  decimals = 0,
  className,
}: AnimatedMetricProps) {
  const motionValue = useMotionValue(value);
  const rounded = useTransform(motionValue, (latest) =>
    `${prefix}${latest.toFixed(decimals)}${suffix}`,
  );

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.7,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [motionValue, value]);

  return <motion.span className={className}>{rounded}</motion.span>;
}

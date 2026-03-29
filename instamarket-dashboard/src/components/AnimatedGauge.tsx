import { motion } from "framer-motion";
import { AnimatedMetric } from "./AnimatedMetric";

interface AnimatedGaugeProps {
  value: number;
  positive: boolean;
  visible: boolean;
  delay?: number;
}

export function AnimatedGauge({ value, positive, visible, delay = 0 }: AnimatedGaugeProps) {
  const progress = Math.max(0, Math.min(100, value));
  const circumference = 282.6;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className={`arc-wrap chart-reveal-shell ${visible ? "is-visible" : ""}`}>
      <svg viewBox="0 0 120 76" className="arc-svg">
        <path
          d="M 12 64 A 48 48 0 0 1 108 64"
          fill="none"
          stroke="rgba(88, 100, 120, 0.22)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <motion.path
          d="M 12 64 A 48 48 0 0 1 108 64"
          fill="none"
          stroke={positive ? "#3fba6a" : "#e24848"}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: visible ? offset : circumference }}
          transition={{ duration: 1.05, delay, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>

      <motion.div
        className="arc-center"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 8 }}
        transition={{ duration: 0.5, delay: delay + 0.22, ease: "easeOut" }}
      >
        <AnimatedMetric value={value} suffix="%" className="arc-value" start={visible} delay={delay + 0.1} />
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: visible ? 1 : 0 }}
          transition={{ duration: 0.35, delay: delay + 0.35, ease: "easeOut" }}
        >
          Chance
        </motion.span>
      </motion.div>
    </div>
  );
}

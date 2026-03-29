import { AnimatedSparkline } from "./AnimatedSparkline";
import type { ChartPoint } from "../types";

interface LiveLineChartProps {
  points: ChartPoint[];
  visible?: boolean;
  delay?: number;
}

export function LiveLineChart({
  points,
  visible = true,
  delay = 0,
}: LiveLineChartProps) {
  return (
    <AnimatedSparkline
      points={points}
      id="hero-market"
      strokeColor="#b9d2ff"
      fillColor="rgba(120, 168, 255, 0.42)"
      visible={visible}
      delay={delay}
      variant="hero"
    />
  );
}

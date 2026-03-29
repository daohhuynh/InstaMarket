import {
  Area,
  AreaChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
} from "recharts";
import type { ChartPoint } from "../types";

interface AnimatedSparklineProps {
  points: ChartPoint[];
  id: string;
  strokeColor: string;
  fillColor: string;
  height?: number;
  visible: boolean;
  delay?: number;
  variant?: "compact" | "hero";
}

export function AnimatedSparkline({
  points,
  id,
  strokeColor,
  fillColor,
  height = 92,
  visible,
  delay = 0,
  variant = "compact",
}: AnimatedSparklineProps) {
  const begin = Math.round(delay * 1000) + 80;
  const lineDuration = variant === "hero" ? 980 : 860;
  const areaDuration = variant === "hero" ? 760 : 620;
  const wrapperClass = variant === "hero" ? "hero-chart chart-reveal-shell" : "mini-chart chart-reveal-shell";
  const gradientId = `${variant}-fill-${id}`;

  return (
    <div className={`${wrapperClass} ${visible ? "is-visible" : ""}`}>
      <ResponsiveContainer width="100%" height={variant === "hero" ? 340 : height}>
        {variant === "hero" ? (
          <LineChart data={points} margin={{ top: 16, right: 18, left: -10, bottom: 8 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fillColor} stopOpacity={0.42} />
                <stop offset="100%" stopColor={fillColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(126, 147, 179, 0.12)" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#72809a", fontSize: 12 }}
              minTickGap={28}
            />
            <YAxis
              domain={[0, 100]}
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#72809a", fontSize: 12 }}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip
              cursor={{ stroke: "rgba(230, 236, 243, 0.18)", strokeWidth: 1 }}
              contentStyle={{
                background: "rgba(9, 14, 23, 0.96)",
                border: "1px solid rgba(99, 130, 170, 0.22)",
                borderRadius: "16px",
                boxShadow: "0 18px 50px rgba(0, 0, 0, 0.42)",
              }}
              formatter={(value: number) => [`${value}%`, "Probability"]}
              labelFormatter={(label) => `Updated ${label}`}
            />
            <Area
              type="monotone"
              dataKey="probability"
              stroke="none"
              fill={`url(#${gradientId})`}
              fillOpacity={visible ? 1 : 0}
              isAnimationActive={visible}
              animationBegin={begin + 180}
              animationDuration={areaDuration}
            />
            <Line
              type="monotone"
              dataKey="probability"
              stroke={strokeColor}
              strokeWidth={3.2}
              dot={false}
              activeDot={{ r: 5, fill: "#f2f5f9", strokeWidth: 0 }}
              isAnimationActive={visible}
              animationBegin={begin}
              animationDuration={lineDuration}
            />
          </LineChart>
        ) : (
          <AreaChart data={points}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={fillColor} stopOpacity={0.34} />
                <stop offset="95%" stopColor={fillColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip
              contentStyle={{
                background: "rgba(10, 15, 24, 0.98)",
                border: "1px solid rgba(96, 126, 164, 0.2)",
                borderRadius: "14px",
              }}
            />
            <Area
              type="monotone"
              dataKey="probability"
              stroke={strokeColor}
              fill={`url(#${gradientId})`}
              strokeWidth={2.4}
              fillOpacity={visible ? 1 : 0}
              isAnimationActive={visible}
              animationBegin={begin}
              animationDuration={lineDuration}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

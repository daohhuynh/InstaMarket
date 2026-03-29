import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartPoint } from "../types";

interface LiveLineChartProps {
  points: ChartPoint[];
}

export function LiveLineChart({ points }: LiveLineChartProps) {
  return (
    <div className="hero-chart">
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={points} margin={{ top: 16, right: 18, left: -10, bottom: 8 }}>
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
          <Line
            type="monotone"
            dataKey="probability"
            stroke="#d6deea"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5, fill: "#f2f5f9", strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

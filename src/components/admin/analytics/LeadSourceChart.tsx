"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { LeadSourceMetrics } from "@/types/analytics";

interface LeadSourceChartProps {
  data: LeadSourceMetrics[];
}

const COLORS = {
  web_form: "#3b82f6",
  chat: "#8b5cf6",
  voice: "#22c55e",
};

const LABELS = {
  web_form: "Web Form",
  chat: "AI Chat",
  voice: "Voice",
};

export function LeadSourceChart({ data }: LeadSourceChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    name: LABELS[d.source],
    color: COLORS[d.source],
  }));

  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No lead data available
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="count"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload;
                return (
                  <div className="rounded-lg border bg-background p-2 shadow-md">
                    <p className="text-sm font-semibold">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.count} leads ({item.percentage}%)
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend
            formatter={(value) => (
              <span className="text-sm text-foreground">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

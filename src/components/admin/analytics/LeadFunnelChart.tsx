"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { LeadFunnelMetrics } from "@/types/analytics";

interface LeadFunnelChartProps {
  data: LeadFunnelMetrics;
}

const COLORS = {
  new: "#22c55e",
  contacted: "#3b82f6",
  touring: "#8b5cf6",
  applied: "#f59e0b",
  leased: "#10b981",
  lost: "#6b7280",
};

const LABELS = {
  new: "New",
  contacted: "Contacted",
  touring: "Touring",
  applied: "Applied",
  leased: "Leased",
  lost: "Lost",
};

export function LeadFunnelChart({ data }: LeadFunnelChartProps) {
  const chartData = [
    { status: "new", count: data.new, label: LABELS.new },
    { status: "contacted", count: data.contacted, label: LABELS.contacted },
    { status: "touring", count: data.touring, label: LABELS.touring },
    { status: "applied", count: data.applied, label: LABELS.applied },
    { status: "leased", count: data.leased, label: LABELS.leased },
    { status: "lost", count: data.lost, label: LABELS.lost },
  ];

  const total = Object.values(data).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
          >
            <XAxis type="number" />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  const percentage = total > 0 ? ((item.count / total) * 100).toFixed(1) : 0;
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-md">
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.count} leads ({percentage}%)
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.status}
                  fill={COLORS[entry.status as keyof typeof COLORS]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Conversion rates */}
      <div className="grid grid-cols-3 gap-4 text-center text-sm">
        <div>
          <p className="text-muted-foreground">Contact Rate</p>
          <p className="font-semibold">
            {data.new > 0
              ? Math.round(((data.contacted + data.touring + data.applied + data.leased) / (data.new + data.contacted + data.touring + data.applied + data.leased)) * 100)
              : 0}%
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Tour Rate</p>
          <p className="font-semibold">
            {data.contacted > 0
              ? Math.round(((data.touring + data.applied + data.leased) / (data.contacted + data.touring + data.applied + data.leased)) * 100)
              : 0}%
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Close Rate</p>
          <p className="font-semibold">
            {total > 0 ? Math.round((data.leased / total) * 100) : 0}%
          </p>
        </div>
      </div>
    </div>
  );
}

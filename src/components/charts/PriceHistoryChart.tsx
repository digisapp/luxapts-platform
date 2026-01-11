"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface PriceSnapshot {
  date: string;
  price: number;
}

interface PriceHistoryChartProps {
  data: PriceSnapshot[];
  title?: string;
  className?: string;
}

export function PriceHistoryChart({
  data,
  title = "Price History",
  className = "",
}: PriceHistoryChartProps) {
  const { chartData, priceChange, percentChange, trend } = useMemo(() => {
    if (data.length === 0) {
      return { chartData: [], priceChange: 0, percentChange: 0, trend: "stable" as const };
    }

    // Sort by date and format for chart
    const sorted = [...data].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const chartData = sorted.map((d) => ({
      date: new Date(d.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      fullDate: d.date,
      price: d.price,
    }));

    // Calculate change
    const firstPrice = sorted[0].price;
    const lastPrice = sorted[sorted.length - 1].price;
    const priceChange = lastPrice - firstPrice;
    const percentChange = ((priceChange / firstPrice) * 100);

    let trend: "up" | "down" | "stable" = "stable";
    if (percentChange > 1) trend = "up";
    else if (percentChange < -1) trend = "down";

    return { chartData, priceChange, percentChange, trend };
  }, [data]);

  if (data.length < 2) {
    return null; // Don't show chart with insufficient data
  }

  const minPrice = Math.min(...chartData.map((d) => d.price));
  const maxPrice = Math.max(...chartData.map((d) => d.price));
  const avgPrice = chartData.reduce((sum, d) => sum + d.price, 0) / chartData.length;
  const padding = (maxPrice - minPrice) * 0.1 || 100;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex items-center gap-2">
            {trend === "up" && (
              <span className="flex items-center gap-1 text-sm text-red-500">
                <TrendingUp className="h-4 w-4" />
                +${Math.abs(priceChange).toLocaleString()} ({percentChange.toFixed(1)}%)
              </span>
            )}
            {trend === "down" && (
              <span className="flex items-center gap-1 text-sm text-green-500">
                <TrendingDown className="h-4 w-4" />
                -${Math.abs(priceChange).toLocaleString()} ({Math.abs(percentChange).toFixed(1)}%)
              </span>
            )}
            {trend === "stable" && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Minus className="h-4 w-4" />
                Stable
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
              />
              <YAxis
                domain={[minPrice - padding, maxPrice + padding]}
                tickFormatter={(value) => `$${(value / 1000).toFixed(1)}k`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={50}
                className="text-muted-foreground"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-md">
                        <p className="text-xs text-muted-foreground">
                          {new Date(data.fullDate).toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                        <p className="text-sm font-semibold">
                          ${data.price.toLocaleString()}/mo
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine
                y={avgPrice}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
                opacity={0.5}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, fill: "hsl(var(--primary))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-center text-muted-foreground">
          Avg: ${avgPrice.toLocaleString()}/mo
        </p>
      </CardContent>
    </Card>
  );
}

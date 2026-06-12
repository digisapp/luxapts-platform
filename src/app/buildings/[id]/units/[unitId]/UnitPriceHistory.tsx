"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { formatPrice } from "@/lib/utils";

interface PricePoint {
  date: string;
  price: number;
}

interface UnitPriceHistoryProps {
  data: PricePoint[];
}

function formatAxisDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}

export function UnitPriceHistory({ data }: UnitPriceHistoryProps) {
  if (data.length < 2) return null;

  const prices = data.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const diff = maxPrice - minPrice;
  const trend = data[data.length - 1].price - data[0].price;

  return (
    <div className="space-y-3">
      <div className="flex gap-6 text-sm">
        <div>
          <p className="text-muted-foreground">Current</p>
          <p className="font-semibold">{formatPrice(data[data.length - 1].price)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Lowest</p>
          <p className="font-semibold">{formatPrice(minPrice)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Highest</p>
          <p className="font-semibold">{formatPrice(maxPrice)}</p>
        </div>
        {diff > 0 && (
          <div>
            <p className="text-muted-foreground">Change</p>
            <p className={`font-semibold ${trend > 0 ? "text-red-500" : trend < 0 ? "text-green-600" : ""}`}>
              {trend > 0 ? "+" : trend < 0 ? "-" : ""}{formatPrice(Math.abs(trend))}
            </p>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tickFormatter={formatAxisDate}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
            domain={["auto", "auto"]}
          />
          <Tooltip
            formatter={(value) => [formatPrice(value as number), "Rent"]}
            labelFormatter={formatAxisDate}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid hsl(var(--border))",
              backgroundColor: "hsl(var(--background))",
              fontSize: "12px",
            }}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#priceGradient)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

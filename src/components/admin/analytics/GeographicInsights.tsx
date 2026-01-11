"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CityLeadMetrics, NeighborhoodLeadMetrics } from "@/types/analytics";

interface GeographicInsightsProps {
  leadsByCity: CityLeadMetrics[];
  topNeighborhoods: NeighborhoodLeadMetrics[];
}

export function GeographicInsights({
  leadsByCity,
  topNeighborhoods,
}: GeographicInsightsProps) {
  const cityData = leadsByCity.slice(0, 5).map((c) => ({
    name: c.cityName,
    count: c.leadCount,
  }));

  const neighborhoodData = topNeighborhoods.slice(0, 5).map((n) => ({
    name: n.neighborhoodName,
    city: n.cityName,
    count: n.leadCount,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leads by City</CardTitle>
        </CardHeader>
        <CardContent>
          {cityData.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No data available
            </div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={cityData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                >
                  <XAxis type="number" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload;
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-md">
                            <p className="text-sm font-semibold">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.count} leads
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Neighborhoods</CardTitle>
        </CardHeader>
        <CardContent>
          {neighborhoodData.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No data available
            </div>
          ) : (
            <div className="space-y-3">
              {neighborhoodData.map((n, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded bg-muted/50"
                >
                  <div>
                    <p className="font-medium text-sm">{n.name}</p>
                    <p className="text-xs text-muted-foreground">{n.city}</p>
                  </div>
                  <span className="text-sm font-semibold">{n.count} leads</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

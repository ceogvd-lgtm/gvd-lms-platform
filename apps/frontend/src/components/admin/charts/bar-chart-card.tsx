'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@lms/ui';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { ChartTooltip } from './chart-tooltip';

interface BarChartCardProps {
  title: string;
  description?: string;
  data: Array<{ label: string; value: number }>;
  loading?: boolean;
  color?: string;
  valueLabel?: string;
  /** Display bars horizontally (label on Y axis). Useful for long labels. */
  horizontal?: boolean;
}

export function BarChartCard({
  title,
  description,
  data,
  loading,
  color = '#1E40AF',
  valueLabel = 'Giá trị',
  horizontal = true,
}: BarChartCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <p className="text-sm text-muted">{description}</p>}
      </CardHeader>
      <CardContent className="h-[360px]">
        {loading ? (
          <div className="h-full w-full animate-pulse rounded-card bg-surface-2" />
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Chưa có dữ liệu
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {horizontal ? (
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  horizontal={false}
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  strokeOpacity={0.08}
                />
                <XAxis
                  type="number"
                  stroke="currentColor"
                  strokeOpacity={0.4}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  stroke="currentColor"
                  strokeOpacity={0.5}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={150}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: color, fillOpacity: 0.08 }} />
                <Bar
                  dataKey="value"
                  name={valueLabel}
                  fill={color}
                  radius={[0, 6, 6, 0]}
                  animationDuration={400}
                />
              </BarChart>
            ) : (
              <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                <XAxis
                  dataKey="label"
                  stroke="currentColor"
                  strokeOpacity={0.4}
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  stroke="currentColor"
                  strokeOpacity={0.4}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: color, fillOpacity: 0.08 }} />
                <Bar
                  dataKey="value"
                  name={valueLabel}
                  fill={color}
                  radius={[6, 6, 0, 0]}
                  animationDuration={400}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

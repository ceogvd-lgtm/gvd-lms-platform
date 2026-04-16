'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@lms/ui';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ChartTooltip } from './chart-tooltip';

interface LineChartCardProps {
  title: string;
  description?: string;
  data: Array<{ label: string; value: number }>;
  loading?: boolean;
  color?: string;
  formatValue?: (value: number | string) => string;
  valueLabel?: string;
}

export function LineChartCard({
  title,
  description,
  data,
  loading,
  color = '#1E40AF',
  formatValue,
  valueLabel = 'Giá trị',
}: LineChartCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <p className="text-sm text-muted">{description}</p>}
      </CardHeader>
      <CardContent className="h-[280px]">
        {loading ? (
          <div className="h-full w-full animate-pulse rounded-card bg-surface-2" />
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Chưa có dữ liệu
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -24 }}>
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
                width={48}
              />
              <Tooltip
                content={<ChartTooltip formatValue={formatValue} />}
                cursor={{ stroke: color, strokeOpacity: 0.2 }}
              />
              <Line
                type="monotone"
                dataKey="value"
                name={valueLabel}
                stroke={color}
                strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 2, fill: 'white' }}
                activeDot={{ r: 5 }}
                animationDuration={400}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

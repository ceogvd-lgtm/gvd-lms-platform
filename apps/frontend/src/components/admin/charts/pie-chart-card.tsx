'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@lms/ui';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { ChartTooltip } from './chart-tooltip';

interface PieChartCardProps {
  title: string;
  description?: string;
  data: Array<{ label: string; value: number; color?: string }>;
  loading?: boolean;
  donut?: boolean;
}

// Default palette — falls back to these when data entries don't supply their own color.
const DEFAULT_COLORS = [
  '#1E40AF', // primary
  '#7C3AED', // secondary
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#6366F1', // indigo
];

export function PieChartCard({
  title,
  description,
  data,
  loading,
  donut = true,
}: PieChartCardProps) {
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
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={donut ? 64 : 0}
                outerRadius={110}
                paddingAngle={2}
                animationDuration={400}
              >
                {data.map((entry, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={entry.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={32}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

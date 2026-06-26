import { formatCurrency } from '../../utils/business';

interface RevenueChartProps {
    data: Array<{
        date: string;
        total_amount_sum: number;
        total_paid_sum: number;
    }>;
    loading?: boolean;
}

export default function RevenueChart({ data, loading }: RevenueChartProps) {
    if (loading) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center p-20 text-gray-500 dark:text-gray-400">
                Nema podataka za prikaz
            </div>
        );
    }

    // Find max value for scaling
    const maxValue = Math.max(
        ...data.map(d => Math.max(d.total_amount_sum, d.total_paid_sum))
    );

    const chartHeight = 300;
    const chartPadding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartWidth = Math.max(600, data.length * 60);

    return (
        <div className="overflow-x-auto">
            <svg
                width={chartWidth}
                height={chartHeight + chartPadding.top + chartPadding.bottom}
                className="min-w-full"
            >
                {/* Y-axis labels */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                    const y = chartPadding.top + chartHeight * (1 - ratio);
                    const value = maxValue * ratio;
                    return (
                        <g key={ratio}>
                            <line
                                x1={chartPadding.left}
                                y1={y}
                                x2={chartWidth - chartPadding.right}
                                y2={y}
                                stroke="currentColor"
                                strokeWidth="1"
                                className="text-gray-200 dark:text-gray-800"
                                strokeDasharray="4"
                            />
                            <text
                                x={chartPadding.left - 10}
                                y={y + 4}
                                textAnchor="end"
                                className="text-xs fill-gray-600 dark:fill-gray-400"
                            >
                                {formatCurrency(value)}
                            </text>
                        </g>
                    );
                })}

                {/* X-axis */}
                <line
                    x1={chartPadding.left}
                    y1={chartPadding.top + chartHeight}
                    x2={chartWidth - chartPadding.right}
                    y2={chartPadding.top + chartHeight}
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-gray-300 dark:text-gray-700"
                />

                {/* Y-axis */}
                <line
                    x1={chartPadding.left}
                    y1={chartPadding.top}
                    x2={chartPadding.left}
                    y2={chartPadding.top + chartHeight}
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-gray-300 dark:text-gray-700"
                />

                {/* Data points and lines */}
                {data.map((point, index) => {
                    const x = chartPadding.left + (index / (data.length - 1 || 1)) * (chartWidth - chartPadding.left - chartPadding.right);
                    const yTotal = chartPadding.top + chartHeight - (point.total_amount_sum / maxValue) * chartHeight;
                    const yPaid = chartPadding.top + chartHeight - (point.total_paid_sum / maxValue) * chartHeight;

                    const nextPoint = data[index + 1];
                    const nextX = nextPoint ? chartPadding.left + ((index + 1) / (data.length - 1 || 1)) * (chartWidth - chartPadding.left - chartPadding.right) : x;
                    const nextYTotal = nextPoint ? chartPadding.top + chartHeight - (nextPoint.total_amount_sum / maxValue) * chartHeight : yTotal;
                    const nextYPaid = nextPoint ? chartPadding.top + chartHeight - (nextPoint.total_paid_sum / maxValue) * chartHeight : yPaid;

                    return (
                        <g key={point.date}>
                            {/* Lines */}
                            {nextPoint && (
                                <>
                                    <line
                                        x1={x}
                                        y1={yTotal}
                                        x2={nextX}
                                        y2={nextYTotal}
                                        stroke="#3b82f6"
                                        strokeWidth="2"
                                    />
                                    <line
                                        x1={x}
                                        y1={yPaid}
                                        x2={nextX}
                                        y2={nextYPaid}
                                        stroke="#10b981"
                                        strokeWidth="2"
                                    />
                                </>
                            )}

                            {/* Points */}
                            <circle cx={x} cy={yTotal} r="4" fill="#3b82f6" />
                            <circle cx={x} cy={yPaid} r="4" fill="#10b981" />

                            {/* X-axis labels */}
                            <text
                                x={x}
                                y={chartPadding.top + chartHeight + 20}
                                textAnchor="middle"
                                className="text-xs fill-gray-600 dark:fill-gray-400"
                            >
                                {new Date(point.date).toLocaleDateString('bs-BA', { month: 'short', day: 'numeric' })}
                            </text>
                        </g>
                    );
                })}

                {/* Legend */}
                <g transform={`translate(${chartPadding.left}, ${chartPadding.top - 10})`}>
                    <circle cx="0" cy="0" r="4" fill="#3b82f6" />
                    <text x="10" y="4" className="text-xs fill-gray-700 dark:fill-gray-300">
                        Ukupan prihod
                    </text>
                    <circle cx="120" cy="0" r="4" fill="#10b981" />
                    <text x="130" y="4" className="text-xs fill-gray-700 dark:fill-gray-300">
                        Plaćeno
                    </text>
                </g>
            </svg>
        </div>
    );
}

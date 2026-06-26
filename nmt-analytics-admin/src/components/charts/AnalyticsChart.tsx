import { useMemo } from "react";
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { DataPoint } from "../../api/metrics";

interface AnalyticsChartProps {
    title: string;
    subtitle: string;
    data?: DataPoint[];
    color?: string;
    yAxisLabel?: string;
    prefix?: string;
    loading?: boolean;
    onPointClick?: (date: string, value: number) => void;
}

export default function AnalyticsChart({
    title,
    subtitle,
    data = [],
    color = "#465FFF",
    prefix = "",
    loading = false,
    onPointClick,
}: AnalyticsChartProps) {
    const safeData = Array.isArray(data) ? data : [];

    const chartData = useMemo(() => {
        if (loading || !safeData.length) {
            return {
                categories: [],
                series: [{ name: title, data: [] }],
            };
        }

        const categories = safeData.map(item => {
            const date = new Date(item.date);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        const series = [
            {
                name: title,
                data: safeData.map(item => item.value),
            }
        ];

        return { categories, series };
    }, [safeData, loading, title]);

    const options: ApexOptions = {
        legend: {
            show: false,
        },
        colors: [color],
        chart: {
            fontFamily: "Inter, sans-serif",
            height: 310,
            type: "area",
            toolbar: {
                show: false,
            },
            animations: {
                enabled: true,
                speed: 800,
            },
            background: 'transparent',
            events: onPointClick ? {
                dataPointSelection: (_event: any, _chartContext: any, config: any) => {
                    const idx = config.dataPointIndex;
                    if (idx >= 0 && idx < safeData.length) {
                        onPointClick(safeData[idx].date, safeData[idx].value);
                    }
                },
            } : undefined,
        },
        stroke: {
            curve: "smooth",
            width: 2,
        },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.45,
                opacityTo: 0.05,
                stops: [20, 100, 100, 100]
            }
        },
        markers: {
            size: 0,
            hover: {
                size: 5,
            },
        },
        grid: {
            borderColor: '#f1f1f1',
            xaxis: {
                lines: {
                    show: false,
                },
            },
            yaxis: {
                lines: {
                    show: true,
                },
            },
        },
        dataLabels: {
            enabled: false,
        },
        tooltip: {
            enabled: true,
            theme: 'light',
            x: {
                show: true
            },
            y: {
                formatter: (value: number) => `${prefix}${value.toLocaleString()}`,
            },
        },
        xaxis: {
            type: "category",
            categories: chartData.categories,
            axisBorder: {
                show: false,
            },
            axisTicks: {
                show: false,
            },
            labels: {
                style: {
                    fontSize: "12px",
                    colors: "#6B7280",
                },
            },
        },
        yaxis: {
            labels: {
                style: {
                    fontSize: "12px",
                    colors: "#6B7280",
                },
                formatter: (value: number) => `${prefix}${value.toLocaleString()}`,
            },
        },
    };

    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
                </div>
            </div>

            {loading ? (
                <div className="h-[310px] flex items-center justify-center">
                    <div className="animate-pulse flex flex-col items-center">
                        <div className="h-4 w-48 bg-gray-200 rounded dark:bg-gray-700 mb-4"></div>
                        <div className="h-[250px] w-full bg-gray-100 rounded dark:bg-gray-800/50"></div>
                    </div>
                </div>
            ) : safeData.length > 0 ? (
                <Chart options={options} series={chartData.series} type="area" height={310} />
            ) : (
                <div className="h-[310px] flex flex-col items-center justify-center text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">No data yet</p>
                </div>
            )}
        </div>
    );
}

import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";

interface DonutChartProps {
  title: string;
  subtitle?: string;
  labels: string[];
  series: number[];
  colors?: string[];
  loading?: boolean;
}

const defaultColors = ["#12B76A", "#F79009", "#F04438", "#667085", "#475467"];

export default function DonutChart({ title, subtitle, labels, series, colors, loading }: DonutChartProps) {
  const hasData = series.length > 0 && series.some(v => v > 0);

  const options: ApexOptions = {
    chart: {
      fontFamily: "Inter, sans-serif",
      type: "donut",
      toolbar: { show: false },
      background: "transparent",
    },
    colors: colors || defaultColors,
    labels,
    legend: {
      position: "bottom",
      fontFamily: "Inter, sans-serif",
      fontSize: "13px",
      itemMargin: { horizontal: 16, vertical: 4 },
      markers: { size: 10 },
    },
    dataLabels: { enabled: false },
    plotOptions: {
      pie: {
        donut: {
          size: "72%",
          labels: {
            show: true,
            name: { show: true, fontSize: "14px", color: "#6B7280" },
            value: {
              show: true,
              fontSize: "24px",
              fontWeight: 700,
              color: "#101828",
              formatter: (val: string) => {
                const n = parseFloat(val);
                return isNaN(n) ? val : n.toLocaleString();
              },
            },
            total: {
              show: true,
              label: "Total",
              fontSize: "14px",
              color: "#6B7280",
              formatter: (w: any) => {
                const totals = w?.globals?.seriesTotals;
                return totals ? totals.reduce((a: number, b: number) => a + b, 0).toLocaleString() : "0";
              },
            },
          },
        },
      },
    },
    stroke: { show: false },
    tooltip: {
      enabled: true,
      theme: "light",
      y: {
        formatter: (val: number) => val.toLocaleString(),
      },
    },
    responsive: [{
      breakpoint: 480,
      options: {
        chart: { width: 300 },
        legend: { position: "bottom" },
      },
    }],
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>

      {loading ? (
        <div className="h-[310px] flex items-center justify-center">
          <div className="animate-pulse flex flex-col items-center">
            <div className="h-4 w-48 bg-gray-200 rounded dark:bg-gray-700 mb-4" />
            <div className="h-[200px] w-[200px] bg-gray-100 rounded-full dark:bg-gray-800/50" />
          </div>
        </div>
      ) : hasData ? (
        <Chart options={options} series={series} type="donut" height={340} />
      ) : (
        <div className="h-[310px] flex flex-col items-center justify-center text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">No payment data yet</p>
        </div>
      )}
    </div>
  );
}

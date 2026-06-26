import { useEffect, useCallback } from 'react';
import { useQueryParams } from '../../hooks/useQueryParams';

export interface DateRange {
    from: string;
    to: string;
    granularity: 'day' | 'week' | 'month';
}

interface DateRangeFilterProps {
    onRangeChange: (range: DateRange) => void;
}

export default function DateRangeFilter({ onRangeChange }: DateRangeFilterProps) {
    const { getParam, setParam } = useQueryParams();

    // Initial values from URL or defaults
    const from = getParam('from') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = getParam('to') || new Date().toISOString().split('T')[0];
    const granularity = (getParam('granularity') as any) || 'day';

    const handleRangeChange = useCallback(() => {
        onRangeChange({ from, to, granularity });
    }, [from, to, granularity, onRangeChange]);

    useEffect(() => {
        handleRangeChange();
    }, [handleRangeChange]);

    return (
        <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">From</label>
                <input
                    type="date"
                    value={from}
                    onChange={(e) => setParam('from', e.target.value)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-transparent dark:border-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">To</label>
                <input
                    type="date"
                    value={to}
                    onChange={(e) => setParam('to', e.target.value)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-transparent dark:border-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Granularity</label>
                <select
                    value={granularity}
                    onChange={(e) => setParam('granularity', e.target.value)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-transparent dark:border-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none bg-no-repeat bg-[right_0.5rem_center]"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundSize: '1rem' }}
                >
                    <option value="day">Daily</option>
                    <option value="week">Weekly</option>
                    <option value="month">Monthly</option>
                </select>
            </div>
        </div>
    );
}

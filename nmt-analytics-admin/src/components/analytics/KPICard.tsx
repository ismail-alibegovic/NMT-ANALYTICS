import React from 'react';

interface KPICardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: React.ReactNode;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    color?: 'primary' | 'success' | 'warning' | 'error' | 'info';
    loading?: boolean;
}

export default function KPICard({
    title,
    value,
    subtitle,
    icon,
    trend,
    color = 'primary',
    loading = false
}: KPICardProps) {
    const colorClasses = {
        primary: 'bg-brand-50 dark:bg-brand-950/20 text-brand-600 dark:text-brand-400',
        success: 'bg-success-50 dark:bg-success-950/20 text-success-600 dark:text-success-400',
        warning: 'bg-warning-50 dark:bg-warning-950/20 text-warning-600 dark:text-warning-400',
        error: 'bg-error-50 dark:bg-error-950/20 text-error-600 dark:text-error-400',
        info: 'bg-info-50 dark:bg-info-950/20 text-info-600 dark:text-info-400',
    };

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-24 mb-4"></div>
                    <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-32 mb-2"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-20"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 hover:shadow-lg transition-shadow duration-200">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                        {title}
                    </p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                        {value}
                    </p>
                    {subtitle && (
                        <p className="text-xs text-gray-500 dark:text-gray-500">
                            {subtitle}
                        </p>
                    )}
                    {trend && (
                        <div className={`mt-2 flex items-center text-xs font-medium ${trend.isPositive
                                ? 'text-success-600 dark:text-success-400'
                                : 'text-error-600 dark:text-error-400'
                            }`}>
                            <span>{trend.isPositive ? '↑' : '↓'}</span>
                            <span className="ml-1">{Math.abs(trend.value)}%</span>
                        </div>
                    )}
                </div>
                {icon && (
                    <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
                        {icon}
                    </div>
                )}
            </div>
        </div>
    );
}

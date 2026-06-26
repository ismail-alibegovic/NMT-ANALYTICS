import { get } from './client';

export interface RevenueAnalysisResponse {
    period: { from: string; to: string };
    previous: { from: string; to: string };
    metrics: {
        revenue_current: number;
        revenue_previous: number;
        revenue_change_pct: number;
        payment_count_current: number;
        payment_count_previous: number;
        avg_payment_current: number;
        avg_payment_previous: number;
        failed_count_current: number;
        failed_count_previous: number;
        pending_count_current: number;
        pending_count_previous: number;
        refunded_count_current: number;
        refunded_count_previous: number;
    };
    signals: {
        key: string;
        title: string;
        severity: 'low' | 'medium' | 'high';
        explanation: string;
        evidence: any;
    }[];
}

export async function analyzeRevenueDrop(from: string, to: string): Promise<RevenueAnalysisResponse> {
    const { data } = await get<RevenueAnalysisResponse>(`/ai/revenue-down?from=${from}&to=${to}`);
    return data;
}

import { supabaseAdmin } from './supabase';
import { buildInstallmentScheduleRows } from '../routes/installments';
import { toCents } from './money';

export class SaleRecoveryError extends Error {
  constructor(public code: string, message: string, public status = 500) { super(message); }
}

export async function resumeSaleCompletion(sale: any, orgId: string, installmentCount: number | undefined, database = supabaseAdmin) {
  if (sale.status === 'cancelled') throw new SaleRecoveryError('SALE_CANCELLED', 'Cancelled sales cannot be recovered', 409);
  if (sale.creation_state !== 'recovery_required' || !['installments', 'completion'].includes(sale.creation_error_stage)) return { sale, recovered: false };
  const stage = sale.creation_error_stage;
  const claim = await database.from('reservations').update({ creation_state: 'in_progress' })
    .eq('id', sale.id).eq('org_id', orgId).eq('creation_state', 'recovery_required')
    .eq('creation_error_stage', stage).neq('status', 'cancelled').select('id').maybeSingle();
  if (claim.error) throw claim.error;
  if (!claim.data) {
    const current = await database.from('reservations').select('*').eq('id', sale.id).eq('org_id', orgId).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) throw new SaleRecoveryError('NOT_FOUND', 'Saved sale not found', 404);
    if (current.data.status === 'cancelled') throw new SaleRecoveryError('SALE_CANCELLED', 'Cancelled sales cannot be recovered', 409);
    return { sale: current.data, recovered: false };
  }
  try {
    if (stage === 'installments') {
      if (!installmentCount) throw new SaleRecoveryError('SALE_MANUAL_RECOVERY_REQUIRED', 'Installment count is required for recovery', 409);
      const existing = await database.from('payments').select('id, amount, currency, installment_number')
        .eq('reservation_id', sale.id).eq('org_id', orgId).not('installment_number', 'is', null).order('installment_number');
      if (existing.error) throw existing.error;
      const schedule = existing.data || [];
      if (schedule.length > 0) {
        const valid = schedule.length === installmentCount &&
          schedule.every((row: any, index: number) => row.installment_number === index + 1 && row.currency === sale.currency && toCents(row.amount) > 0) &&
          schedule.reduce((sum: number, row: any) => sum + toCents(row.amount), 0) === toCents(sale.total_amount);
        if (!valid) throw new SaleRecoveryError('SALE_MANUAL_RECOVERY_REQUIRED', 'Existing installment history does not match the saved sale', 409);
      } else {
        const rows = buildInstallmentScheduleRows({
          reservationId: sale.id, orgId, totalAmount: Number(sale.total_amount), currency: sale.currency,
          installmentCount, firstDueDate: new Date(sale.created_at || sale.reservation_at).toISOString().slice(0, 10),
        });
        const result = await database.rpc('replace_reservation_installment_schedule_atomic', {
          p_org_id: orgId, p_reservation_id: sale.id,
          p_schedule: rows.map(({ reservation_id, org_id, status, payment_method, payment_date, ...row }) => row),
        });
        if (result.error) throw result.error;
      }
    }
    const completed = await database.from('reservations').update({ creation_state: 'completed', creation_error_stage: null })
      .eq('id', sale.id).eq('org_id', orgId).eq('creation_state', 'in_progress').neq('status', 'cancelled').select('id').maybeSingle();
    if (completed.error) throw completed.error;
    if (!completed.data) throw new SaleRecoveryError('SALE_STATE_CHANGED', 'The saved sale changed during recovery', 409);
    return { sale: { ...sale, creation_state: 'completed', creation_error_stage: null }, recovered: true };
  } catch (error) {
    const reset = await database.from('reservations').update({ creation_state: 'recovery_required', creation_error_stage: stage })
      .eq('id', sale.id).eq('org_id', orgId).eq('creation_state', 'in_progress');
    if (reset.error) console.error('Failed to retain sale recovery state:', reset.error);
    throw error;
  }
}

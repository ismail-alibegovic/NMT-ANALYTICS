import { supabaseAdmin } from './supabase';

export async function materializeDepartureCostsFromPackage(input: {
  orgId: string;
  packageId: string;
  departureId: string;
  currency: string;
}) {
  const { data: packageCosts, error: costError } = await supabaseAdmin
    .from('package_cost_items')
    .select('id, category, label, supplier_id, quantity, unit_cost, currency, notes')
    .eq('org_id', input.orgId)
    .eq('package_id', input.packageId)
    .order('created_at', { ascending: true });

  if (costError) throw costError;
  if (!packageCosts?.length) return { inserted: 0 };

  const rows = packageCosts.map((item: any) => ({
    org_id: input.orgId,
    departure_id: input.departureId,
    category: item.category,
    label: item.label,
    supplier_id: item.supplier_id || null,
    quantity: item.quantity,
    unit_cost: item.unit_cost,
    currency: item.currency || input.currency,
    notes: item.notes,
    source_package_cost_item_id: item.id,
  }));

  const { error: insertError } = await supabaseAdmin
    .from('departure_cost_items')
    .upsert(rows, {
      onConflict: 'org_id,departure_id,source_package_cost_item_id',
      ignoreDuplicates: true,
    });

  if (insertError) throw insertError;
  return { inserted: rows.length };
}

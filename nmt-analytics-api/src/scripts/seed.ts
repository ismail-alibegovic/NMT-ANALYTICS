#!/usr/bin/env tsx
/**
 * Seed script for NMT Analytics
 * Creates demo data for development and testing
 * 
 * Usage: npm run seed:dev
 */

import { supabaseAdmin } from '../lib/supabase';
import { config } from '../config';

const ORG_NAME = 'Demo Travel Agency';
const ORG_SLUG = 'demo-travel';
const ADMIN_EMAIL = 'admin@demo.com';

async function seed() {
    console.log('🌱 Starting seed process...\n');

    try {
        // 1. Create/Get Organization
        console.log('📦 Creating organization...');
        const { data: existingOrg } = await supabaseAdmin
            .from('organizations')
            .select('id, name')
            .eq('slug', ORG_SLUG)
            .single();

        let orgId: string;
        if (existingOrg) {
            orgId = existingOrg.id;
            console.log(`✓ Organization exists: ${existingOrg.name} (${orgId})`);
        } else {
            const { data: newOrg, error } = await supabaseAdmin
                .from('organizations')
                .insert({ name: ORG_NAME, slug: ORG_SLUG })
                .select()
                .single();

            if (error) throw error;
            orgId = newOrg.id;
            console.log(`✓ Created organization: ${ORG_NAME} (${orgId})`);
        }

        // 2. Create Admin Profile (if needed)
        console.log('\n👤 Creating admin profile...');
        const adminId = '00000000-0000-0000-0000-000000000001';
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: adminId,
                email: ADMIN_EMAIL,
                role: 'director',
                org_id: orgId
            }, { onConflict: 'id' });

        if (profileError) {
            console.log(`⚠ Profile upsert warning: ${profileError.message}`);
        } else {
            console.log(`✓ Admin profile ready: ${ADMIN_EMAIL}`);
        }

        // 3. Create Packages
        console.log('\n📦 Creating packages...');
        const packages = [
            { name: 'Mediterranean Cruise', destination: 'Greece & Italy', base_price: 1200, duration_days: 7 },
            { name: 'Alpine Adventure', destination: 'Swiss Alps', base_price: 950, duration_days: 5 },
            { name: 'Beach Paradise', destination: 'Maldives', base_price: 2500, duration_days: 10 },
            { name: 'City Explorer', destination: 'Paris & London', base_price: 800, duration_days: 4 },
            { name: 'Safari Experience', destination: 'Kenya', base_price: 3200, duration_days: 14 }
        ];

        const { data: createdPackages, error: pkgError } = await supabaseAdmin
            .from('packages')
            .upsert(
                packages.map(pkg => ({
                    ...pkg,
                    org_id: orgId,
                    currency: 'BAM',
                    is_active: true
                })),
                { onConflict: 'org_id,name,destination' }
            )
            .select();

        if (pkgError) throw pkgError;
        console.log(`✓ Created ${createdPackages.length} packages`);

        // 4. Create Departures
        console.log('\n✈️  Creating departures...');
        const now = new Date();
        const departures = createdPackages.flatMap((pkg, idx) => {
            const departDate = new Date(now);
            departDate.setDate(departDate.getDate() + (idx + 1) * 7);
            const returnDate = new Date(departDate);
            returnDate.setDate(returnDate.getDate() + (pkg.duration_days || 7));

            return {
                org_id: orgId,
                package_id: pkg.id,
                depart_at: departDate.toISOString(),
                return_at: returnDate.toISOString(),
                capacity: 50,
                booked: idx === 0 ? 50 : idx === 1 ? 45 : idx * 10, // First one FULL, second ALMOST FULL
                status: 'active'
            };
        });

        const { data: createdDepartures, error: depError } = await supabaseAdmin
            .from('departures')
            .upsert(departures, { onConflict: 'org_id,package_id,depart_at' })
            .select();

        if (depError) throw depError;
        console.log(`✓ Created ${createdDepartures.length} departures`);

        // 5. Create Customers
        console.log('\n👥 Creating customers...');
        const customers = [
            { full_name: 'John Smith', phone: '+38761111111', email: 'john@example.com' },
            { full_name: 'Jane Doe', phone: '+38761111112', email: 'jane@example.com' },
            { full_name: 'Mike Johnson', phone: '+38761111113', email: 'mike@example.com' },
            { full_name: 'Sarah Williams', phone: '+38761111114', email: 'sarah@example.com' },
            { full_name: 'David Brown', phone: '+38761111115', email: 'david@example.com' },
            { full_name: 'Emma Davis', phone: '+38761111116', email: 'emma@example.com' },
            { full_name: 'Chris Wilson', phone: '+38761111117', email: 'chris@example.com' },
            { full_name: 'Lisa Anderson', phone: '+38761111118', email: 'lisa@example.com' },
            { full_name: 'Tom Martinez', phone: '+38761111119', email: 'tom@example.com' },
            { full_name: 'Anna Garcia', phone: '+38761111120', email: 'anna@example.com' }
        ];

        const { data: createdCustomers, error: custError } = await supabaseAdmin
            .from('customers')
            .upsert(
                customers.map(c => ({ ...c, org_id: orgId })),
                { onConflict: 'org_id,phone' }
            )
            .select();

        if (custError) throw custError;
        console.log(`✓ Created ${createdCustomers.length} customers`);

        // 6. Create Reservations
        console.log('\n📝 Creating reservations...');
        const reservations = createdCustomers.slice(0, 10).map((customer, idx) => {
            const departure = createdDepartures[idx % createdDepartures.length];
            const totalAmount = createdPackages.find(p => p.id === departure.package_id)?.base_price || 1000;
            const paidAmount = idx % 3 === 0 ? totalAmount : idx % 3 === 1 ? totalAmount * 0.5 : 0;

            return {
                org_id: orgId,
                customer_id: customer.id,
                departure_id: departure.id,
                customer_name: customer.full_name,
                customer_phone: customer.phone,
                party_size: 2,
                status: 'confirmed',
                total_amount: totalAmount,
                paid_amount: paidAmount,
                reservation_at: new Date().toISOString(),
                currency: 'BAM'
            };
        });

        const { data: createdReservations, error: resError } = await supabaseAdmin
            .from('reservations')
            .upsert(reservations, { onConflict: 'org_id,customer_phone,reservation_at' })
            .select();

        if (resError) throw resError;
        console.log(`✓ Created ${createdReservations.length} reservations`);

        // 7. Create Payments/Transactions
        console.log('\n💰 Creating payments...');
        const transactions = createdReservations
            .filter(r => r.paid_amount > 0)
            .map(reservation => ({
                org_id: orgId,
                reservation_id: reservation.id,
                amount: reservation.paid_amount,
                currency: 'BAM',
                type: 'payment',
                occurred_at: new Date().toISOString(),
                note: `Payment for reservation ${reservation.id.substring(0, 8)}`
            }));

        if (transactions.length > 0) {
            const { data: createdTransactions, error: txError } = await supabaseAdmin
                .from('transactions')
                .insert(transactions)
                .select();

            if (txError) throw txError;
            console.log(`✓ Created ${createdTransactions.length} payment transactions`);
        }

        console.log('\n✅ Seed completed successfully!');
        console.log(`\n📊 Summary:`);
        console.log(`   Organization: ${ORG_NAME} (${orgId})`);
        console.log(`   Packages: ${createdPackages.length}`);
        console.log(`   Departures: ${createdDepartures.length}`);
        console.log(`   Customers: ${createdCustomers.length}`);
        console.log(`   Reservations: ${createdReservations.length}`);
        console.log(`   Payments: ${transactions.length}`);
        console.log(`\n💡 Set DEV_ORG_ID=${orgId} in your .env file for dev bypass\n`);

    } catch (error) {
        console.error('\n❌ Seed failed:', error);
        process.exit(1);
    }
}

// Run seed
seed()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });

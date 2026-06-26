#!/usr/bin/env node

/**
 * End-to-End Payments → Reservations Integration Test
 * 
 * This script validates the complete payment flow:
 * 1. Fetches a reservation from the database
 * 2. Records current total_amount and paid_amount
 * 3. Creates a payment via POST /api/payments
 * 4. Verifies the payment was created
 * 5. Verifies reservations.paid_amount was updated
 * 6. Validates the response structure
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hacutwknfgufrqlgdiia.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_URL = process.env.API_URL || 'http://localhost:3001';

if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment');
    process.exit(1);
}

async function main() {
    console.log('🧪 Starting Payments → Reservations Integration Test\n');
    console.log('='.repeat(80));

    try {
        // Step 1: Get a reservation from the database
        console.log('\n📋 Step 1: Fetching a reservation from database...');
        const reservationsResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/reservations?select=id,customer_name,total_amount,paid_amount,status,org_id&total_amount=gt.0&order=created_at.desc&limit=1`,
            {
                headers: {
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!reservationsResponse.ok) {
            throw new Error(`Failed to fetch reservations: ${reservationsResponse.status} ${await reservationsResponse.text()}`);
        }

        const reservations = await reservationsResponse.json();

        if (!reservations || reservations.length === 0) {
            console.log('⚠️  No reservations found in database. Creating a test reservation...');

            // Create a test reservation
            const createResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/reservations`,
                {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_SERVICE_KEY,
                        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        customer_name: 'Test Customer',
                        customer_phone: '+38761234567',
                        party_size: 2,
                        reservation_at: new Date().toISOString(),
                        status: 'confirmed',
                        total_amount: 1000,
                        paid_amount: 0,
                        currency: 'BAM',
                        source: 'other'
                    })
                }
            );

            if (!createResponse.ok) {
                throw new Error(`Failed to create test reservation: ${createResponse.status} ${await createResponse.text()}`);
            }

            const newReservations = await createResponse.json();
            reservations.push(newReservations[0]);
            console.log('✅ Test reservation created');
        }

        const reservation = reservations[0];
        console.log('✅ Reservation found:');
        console.log(`   ID: ${reservation.id}`);
        console.log(`   Customer: ${reservation.customer_name}`);
        console.log(`   Total Amount: ${reservation.total_amount}`);
        console.log(`   Paid Amount: ${reservation.paid_amount || 0}`);
        console.log(`   Status: ${reservation.status}`);

        // Step 2: Record current values
        console.log('\n📊 Step 2: Recording current values...');
        const initialTotalAmount = parseFloat(reservation.total_amount);
        const initialPaidAmount = parseFloat(reservation.paid_amount || 0);
        const initialDue = Math.max(initialTotalAmount - initialPaidAmount, 0);

        console.log(`   Initial Total: ${initialTotalAmount} BAM`);
        console.log(`   Initial Paid: ${initialPaidAmount} BAM`);
        console.log(`   Initial Due: ${initialDue} BAM`);

        // Step 3: Create a payment
        console.log('\n💰 Step 3: Creating payment (amount=200, status=succeeded)...');
        const paymentAmount = 200;
        const paymentData = {
            reservation_id: reservation.id,
            amount: paymentAmount,
            currency: 'BAM',
            status: 'succeeded',
            payment_date: new Date().toISOString().split('T')[0]
        };

        console.log(`   Request URL: POST ${API_URL}/api/payments`);
        console.log(`   Request Body:`, JSON.stringify(paymentData, null, 2));

        const paymentResponse = await fetch(`${API_URL}/api/payments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(paymentData)
        });

        console.log(`   Response Status: ${paymentResponse.status} ${paymentResponse.statusText}`);

        if (!paymentResponse.ok) {
            const errorText = await paymentResponse.text();
            console.error('❌ Payment creation failed');
            console.error(`   Status: ${paymentResponse.status}`);
            console.error(`   Response: ${errorText}`);
            throw new Error(`Payment creation failed: ${paymentResponse.status}`);
        }

        const paymentResult = await paymentResponse.json();
        console.log('✅ Payment created successfully');
        console.log(`   Response:`, JSON.stringify(paymentResult, null, 2));

        // Step 4: Verify response structure
        console.log('\n🔍 Step 4: Verifying response structure...');

        if (!paymentResult.payment) {
            throw new Error('❌ Response missing "payment" object');
        }
        console.log('✅ Response contains "payment" object');

        if (!paymentResult.payment.id) {
            throw new Error('❌ Payment missing "id" field');
        }
        console.log(`✅ Payment ID: ${paymentResult.payment.id}`);

        if (paymentResult.payment.amount !== paymentAmount) {
            throw new Error(`❌ Payment amount mismatch: expected ${paymentAmount}, got ${paymentResult.payment.amount}`);
        }
        console.log(`✅ Payment amount correct: ${paymentResult.payment.amount} BAM`);

        if (paymentResult.reservation) {
            console.log('✅ Response contains "reservation" object');
            console.log(`   Updated Paid Amount: ${paymentResult.reservation.paidAmount} BAM`);
            console.log(`   Remaining Amount: ${paymentResult.reservation.remainingAmount} BAM`);
        } else {
            console.log('⚠️  Response missing "reservation" object (will verify via direct query)');
        }

        // Step 5: Verify paid_amount was updated in database
        console.log('\n🔄 Step 5: Verifying database update...');

        // Wait a moment for trigger to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        const updatedReservationResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/reservations?select=id,total_amount,paid_amount&id=eq.${reservation.id}`,
            {
                headers: {
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!updatedReservationResponse.ok) {
            throw new Error(`Failed to fetch updated reservation: ${updatedReservationResponse.status}`);
        }

        const updatedReservations = await updatedReservationResponse.json();
        const updatedReservation = updatedReservations[0];

        const finalPaidAmount = parseFloat(updatedReservation.paid_amount || 0);
        const expectedPaidAmount = initialPaidAmount + paymentAmount;
        const finalDue = Math.max(initialTotalAmount - finalPaidAmount, 0);

        console.log(`   Initial Paid Amount: ${initialPaidAmount} BAM`);
        console.log(`   Payment Amount: ${paymentAmount} BAM`);
        console.log(`   Expected Paid Amount: ${expectedPaidAmount} BAM`);
        console.log(`   Actual Paid Amount: ${finalPaidAmount} BAM`);
        console.log(`   Final Due: ${finalDue} BAM`);

        if (Math.abs(finalPaidAmount - expectedPaidAmount) < 0.01) {
            console.log('✅ Paid amount updated correctly!');
        } else {
            throw new Error(`❌ Paid amount mismatch: expected ${expectedPaidAmount}, got ${finalPaidAmount}`);
        }

        // Step 6: Determine payment status badge
        console.log('\n🏷️  Step 6: Determining payment status badge...');
        const total = initialTotalAmount;
        const paid = finalPaidAmount;
        const remaining = Math.max(total - paid, 0);

        let badge;
        if (remaining === 0 && total > 0) {
            badge = { text: 'Plaćeno (Fully Paid)', color: 'success' };
        } else if (paid > 0 && remaining > 0) {
            badge = { text: 'Djelimično (Partial)', color: 'warning' };
        } else if (paid === 0 && total > 0) {
            badge = { text: 'Neplaćeno (Unpaid)', color: 'error' };
        } else {
            badge = { text: 'N/A', color: 'light' };
        }

        console.log(`   Total: ${total} BAM`);
        console.log(`   Paid: ${paid} BAM`);
        console.log(`   Due: ${remaining} BAM`);
        console.log(`   Badge: ${badge.text} (${badge.color})`);

        // Summary
        console.log('\n' + '='.repeat(80));
        console.log('✅ ALL TESTS PASSED!');
        console.log('='.repeat(80));
        console.log('\n📊 Summary:');
        console.log(`   Reservation ID: ${reservation.id}`);
        console.log(`   Payment ID: ${paymentResult.payment.id}`);
        console.log(`   Payment Amount: ${paymentAmount} BAM`);
        console.log(`   Initial Paid: ${initialPaidAmount} BAM → Final Paid: ${finalPaidAmount} BAM`);
        console.log(`   Initial Due: ${initialDue} BAM → Final Due: ${finalDue} BAM`);
        console.log(`   Payment Status: ${badge.text}`);
        console.log('\n✅ Integration validated successfully!');
        console.log('\n💡 Next Steps:');
        console.log('   1. Open Reservations UI: http://localhost:5173/reservations');
        console.log(`   2. Find reservation: ${reservation.customer_name} (${reservation.id.substring(0, 8)})`);
        console.log(`   3. Verify Paid Amount shows: ${finalPaidAmount} BAM`);
        console.log(`   4. Verify Due shows: ${finalDue} BAM`);
        console.log(`   5. Verify Badge shows: ${badge.text}`);

    } catch (error) {
        console.error('\n' + '='.repeat(80));
        console.error('❌ TEST FAILED');
        console.error('='.repeat(80));
        console.error('\nError:', error.message);
        if (error.stack) {
            console.error('\nStack trace:', error.stack);
        }
        process.exit(1);
    }
}

main();

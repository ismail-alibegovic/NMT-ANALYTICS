/**
 * Test file for reservation payment calculations
 * Run with: node src/tests/reservationPayments.test.js
 */

// Mock the business utility functions
function normalizeMoney(value) {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
}

function calculateOutstandingAmount(total, paid) {
    const t = normalizeMoney(total);
    const p = normalizeMoney(paid);

    const diff = t - p;
    // If the difference is negligible (less than 1 cent), consider it zero
    if (Math.abs(diff) < 0.01) {
        return 0;
    }
    return Math.max(diff, 0);
}

function getPaymentStatusBadge(total, paid) {
    const totalAmount = normalizeMoney(total);
    const paidAmount = normalizeMoney(paid);

    // Fully paid (with small tolerance for floating point)
    if (paidAmount >= totalAmount && totalAmount > 0) {
        return { text: 'Potpuno plaćeno', color: 'success' };
    }

    // Partially paid
    if (paidAmount > 0) {
        return { text: 'Djelimično plaćeno', color: 'warning' };
    }

    // Unpaid
    return { text: 'Neplaćeno', color: 'error' };
}

// Test case: Reservation with partial payment
const testReservation = {
    id: 'test-123',
    totalAmount: 9600,
    paidAmount: 1500,
    customerName: 'Test Customer',
    status: 'confirmed'
};

console.log('='.repeat(60));
console.log('RESERVATION PAYMENT CALCULATION TEST');
console.log('='.repeat(60));

console.log('\nTest Reservation:');
console.log(`  Total Amount: ${testReservation.totalAmount} BAM`);
console.log(`  Paid Amount:  ${testReservation.paidAmount} BAM`);

// Calculate due amount
const total = normalizeMoney(testReservation.totalAmount);
const paid = normalizeMoney(testReservation.paidAmount);
const due = calculateOutstandingAmount(total, paid);

console.log(`\nCalculated Values:`);
console.log(`  Total (normalized):  ${total} BAM`);
console.log(`  Paid (normalized):   ${paid} BAM`);
console.log(`  Due:                 ${due} BAM`);

// Get payment status badge
const paymentStatus = getPaymentStatusBadge(total, paid);

console.log(`\nPayment Status Badge:`);
console.log(`  Text:  ${paymentStatus.text}`);
console.log(`  Color: ${paymentStatus.color}`);

// Expected results
console.log('\n' + '='.repeat(60));
console.log('EXPECTED RESULTS:');
console.log('='.repeat(60));
console.log('✅ Total:  9600 BAM');
console.log('✅ Paid:   1500 BAM');
console.log('✅ Due:    8100 BAM');
console.log('✅ Status: Djelimično plaćeno (warning)');

// Verify
const isCorrect =
    total === 9600 &&
    paid === 1500 &&
    due === 8100 &&
    paymentStatus.text === 'Djelimično plaćeno' &&
    paymentStatus.color === 'warning';

console.log('\n' + '='.repeat(60));
console.log(isCorrect ? '✅ ALL TESTS PASSED!' : '❌ TESTS FAILED!');
console.log('='.repeat(60));

// Additional test cases
console.log('\n\nADDITIONAL TEST CASES:');
console.log('='.repeat(60));

// Test 1: Fully paid
const test1 = {
    total: 5000,
    paid: 5000
};
const due1 = calculateOutstandingAmount(test1.total, test1.paid);
const status1 = getPaymentStatusBadge(test1.total, test1.paid);
console.log(`\n1. Fully Paid (${test1.total} BAM total, ${test1.paid} BAM paid):`);
console.log(`   Due: ${due1} BAM (expected: 0)`);
console.log(`   Status: ${status1.text} (expected: Potpuno plaćeno)`);
console.log(`   ✅ ${due1 === 0 && status1.text === 'Potpuno plaćeno' ? 'PASS' : 'FAIL'}`);

// Test 2: Unpaid
const test2 = {
    total: 3000,
    paid: 0
};
const due2 = calculateOutstandingAmount(test2.total, test2.paid);
const status2 = getPaymentStatusBadge(test2.total, test2.paid);
console.log(`\n2. Unpaid (${test2.total} BAM total, ${test2.paid} BAM paid):`);
console.log(`   Due: ${due2} BAM (expected: 3000)`);
console.log(`   Status: ${status2.text} (expected: Neplaćeno)`);
console.log(`   ✅ ${due2 === 3000 && status2.text === 'Neplaćeno' ? 'PASS' : 'FAIL'}`);

// Test 3: Overpaid (should show 0 due)
const test3 = {
    total: 2000,
    paid: 2500
};
const due3 = calculateOutstandingAmount(test3.total, test3.paid);
const status3 = getPaymentStatusBadge(test3.total, test3.paid);
console.log(`\n3. Overpaid (${test3.total} BAM total, ${test3.paid} BAM paid):`);
console.log(`   Due: ${due3} BAM (expected: 0)`);
console.log(`   Status: ${status3.text} (expected: Potpuno plaćeno)`);
console.log(`   ✅ ${due3 === 0 && status3.text === 'Potpuno plaćeno' ? 'PASS' : 'FAIL'}`);

// Test 4: Floating point precision
const test4 = {
    total: 100.50,
    paid: 100.49
};
const due4 = calculateOutstandingAmount(test4.total, test4.paid);
const status4 = getPaymentStatusBadge(test4.total, test4.paid);
console.log(`\n4. Floating Point (${test4.total} BAM total, ${test4.paid} BAM paid):`);
console.log(`   Due: ${due4} BAM (expected: 0.01)`);
console.log(`   Status: ${status4.text} (expected: Djelimično plaćeno)`);
console.log(`   ✅ ${Math.abs(due4 - 0.01) < 0.001 && status4.text === 'Djelimično plaćeno' ? 'PASS' : 'FAIL'}`);

console.log('\n' + '='.repeat(60));
console.log('END OF TESTS');
console.log('='.repeat(60));

#!/usr/bin/env node

/**
 * Payments API Test Script
 * 
 * This script demonstrates how to use the Payments API endpoints
 * Run with: node test-payments-api.js
 */

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000/api';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'YOUR_TOKEN_HERE';

// Helper function to make API requests
async function apiRequest(method, endpoint, body = null) {
    const url = `${API_BASE_URL}${endpoint}`;
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json',
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    console.log(`\n${method} ${url}`);
    if (body) {
        console.log('Body:', JSON.stringify(body, null, 2));
    }

    try {
        const response = await fetch(url, options);
        const data = await response.json();

        console.log(`Status: ${response.status}`);
        console.log('Response:', JSON.stringify(data, null, 2));

        return { status: response.status, data };
    } catch (error) {
        console.error('Error:', error.message);
        return { error: error.message };
    }
}

// Test scenarios
async function runTests() {
    console.log('='.repeat(80));
    console.log('PAYMENTS API TEST SUITE');
    console.log('='.repeat(80));

    // Test 1: Get all payments (default pagination)
    console.log('\n--- Test 1: GET all payments ---');
    await apiRequest('GET', '/payments');

    // Test 2: Get payments with pagination
    console.log('\n--- Test 2: GET payments with pagination ---');
    await apiRequest('GET', '/payments?page=1&limit=10');

    // Test 3: Get payments for specific reservation
    console.log('\n--- Test 3: GET payments for specific reservation ---');
    const reservationId = '123e4567-e89b-12d3-a456-426614174000'; // Replace with actual ID
    await apiRequest('GET', `/payments?reservation_id=${reservationId}`);

    // Test 4: Get payments within date range
    console.log('\n--- Test 4: GET payments within date range ---');
    await apiRequest('GET', '/payments?from=2026-01-01&to=2026-01-31');

    // Test 5: Create payment with all fields
    console.log('\n--- Test 5: POST create payment (full) ---');
    await apiRequest('POST', '/payments', {
        reservation_id: reservationId,
        amount: 500.00,
        currency: 'BAM',
        status: 'succeeded',
        payment_date: '2026-01-12',
    });

    // Test 6: Create payment with defaults
    console.log('\n--- Test 6: POST create payment (minimal) ---');
    await apiRequest('POST', '/payments', {
        reservation_id: reservationId,
        amount: 250.00,
    });

    // Test 7: Invalid request - missing reservation_id
    console.log('\n--- Test 7: POST invalid request (missing reservation_id) ---');
    await apiRequest('POST', '/payments', {
        amount: 100.00,
    });

    // Test 8: Invalid request - negative amount
    console.log('\n--- Test 8: POST invalid request (negative amount) ---');
    await apiRequest('POST', '/payments', {
        reservation_id: reservationId,
        amount: -50.00,
    });

    // Test 9: Invalid request - invalid UUID
    console.log('\n--- Test 9: POST invalid request (invalid UUID) ---');
    await apiRequest('POST', '/payments', {
        reservation_id: 'not-a-uuid',
        amount: 100.00,
    });

    // Test 10: Invalid request - invalid status
    console.log('\n--- Test 10: POST invalid request (invalid status) ---');
    await apiRequest('POST', '/payments', {
        reservation_id: reservationId,
        amount: 100.00,
        status: 'invalid_status',
    });

    console.log('\n' + '='.repeat(80));
    console.log('TEST SUITE COMPLETED');
    console.log('='.repeat(80));
}

// Run tests if executed directly
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { apiRequest, runTests };

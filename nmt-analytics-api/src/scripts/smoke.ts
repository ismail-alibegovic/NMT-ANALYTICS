import axios from 'axios';
import 'dotenv/config';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

async function runSmokeTest() {
  console.log('--- Travline API Smoke Test ---');
  console.log(`Testing against: ${BASE_URL}`);

  let hasFailures = false;

  // Helper function to make authenticated requests
  const makeAuthRequest = (method: 'get' | 'post', url: string, config?: any) => {
    return axios({
      method,
      url: `${BASE_URL}${url}`,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      ...config,
    });
  };

  // 1. Test /api/health
  try {
    const healthRes = await axios.get(`${BASE_URL}/api/health`);
    console.log(`[OK] /api/health - Status: ${healthRes.status}`, healthRes.data);
  } catch (error: any) {
    console.error(`[FAIL] /api/health - Error: ${error.message}`);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    hasFailures = true;
  }

  // 2. Test /api/me
  if (ACCESS_TOKEN) {
    try {
      const meRes = await makeAuthRequest('get', '/api/me');
      console.log(`[OK] /api/me - Status: ${meRes.status}`, meRes.data);
    } catch (error: any) {
      console.error(`[FAIL] /api/me - Error: ${error.message}`);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
      hasFailures = true;
    }
  } else {
    console.log('[SKIP] /api/me (no ACCESS_TOKEN provided)');
  }

  // 3. Test /api/metrics/overview
  if (ACCESS_TOKEN) {
    try {
      // Use last 7 days for the test
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const from = startDate.toISOString().split('T')[0];
      const to = endDate.toISOString().split('T')[0];

      const overviewRes = await makeAuthRequest('get', `/api/metrics/overview?from=${from}&to=${to}`);
      console.log(`[OK] /api/metrics/overview - Status: ${overviewRes.status}`, overviewRes.data);
    } catch (error: any) {
      console.error(`[FAIL] /api/metrics/overview - Error: ${error.message}`);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
      hasFailures = true;
    }
  } else {
    console.log('[SKIP] /api/metrics/overview (no ACCESS_TOKEN provided)');
  }

  // 4. Test /api/metrics/revenue-series
  if (ACCESS_TOKEN) {
    try {
      // Use last 7 days for the test
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const from = startDate.toISOString().split('T')[0];
      const to = endDate.toISOString().split('T')[0];

      const seriesRes = await makeAuthRequest('get', `/api/metrics/revenue-series?from=${from}&to=${to}`);
      console.log(`[OK] /api/metrics/revenue-series - Status: ${seriesRes.status}, returned ${seriesRes.data.length} data points`);
    } catch (error: any) {
      console.error(`[FAIL] /api/metrics/revenue-series - Error: ${error.message}`);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
      hasFailures = true;
    }
  } else {
    console.log('[SKIP] /api/metrics/revenue-series (no ACCESS_TOKEN provided)');
  }

  // 5. Test /api/metrics/transactions-breakdown
  if (ACCESS_TOKEN) {
    try {
      const breakdownRes = await makeAuthRequest('get', '/api/metrics/transactions-breakdown');
      console.log(`[OK] /api/metrics/transactions-breakdown - Status: ${breakdownRes.status}`, breakdownRes.data);
    } catch (error: any) {
      console.error(`[FAIL] /api/metrics/transactions-breakdown - Error: ${error.message}`);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
      hasFailures = true;
    }
  } else {
    console.log('[SKIP] /api/metrics/transactions-breakdown (no ACCESS_TOKEN provided)');
  }

  // 6. Test /api/metrics/reservations-breakdown
  if (ACCESS_TOKEN) {
    try {
      const breakdownRes = await makeAuthRequest('get', '/api/metrics/reservations-breakdown');
      console.log(`[OK] /api/metrics/reservations-breakdown - Status: ${breakdownRes.status}`, breakdownRes.data);
    } catch (error: any) {
      console.error(`[FAIL] /api/metrics/reservations-breakdown - Error: ${error.message}`);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
      hasFailures = true;
    }
  } else {
    console.log('[SKIP] /api/metrics/reservations-breakdown (no ACCESS_TOKEN provided)');
  }

  // 7. Create test data (customer, package, departure)
  let testCustomerId: string | null = null;
  let testPackageId: string | null = null;
  let testDepartureId: string | null = null;

  if (ACCESS_TOKEN) {
    try {
      // Create a customer
      const customerData = {
        fullName: 'Smoke Test Customer',
        phone: '+38761123456',
        email: 'smoke@test.com'
      };
      const customerRes = await makeAuthRequest('post', '/api/customers', { data: customerData });
      testCustomerId = customerRes.data.id;
      console.log(`[OK] Created customer - Status: ${customerRes.status}, ID: ${testCustomerId}`);

      // Create a package
      const packageData = {
        name: 'Smoke Test Package',
        destination: 'Test Destination',
        basePrice: 100.00,
        currency: 'BAM',
        isActive: true
      };
      const packageRes = await makeAuthRequest('post', '/api/packages', { data: packageData });
      testPackageId = packageRes.data.id;
      console.log(`[OK] Created package - Status: ${packageRes.status}, ID: ${testPackageId}`);

      // Create a departure
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);

      const departureData = {
        packageId: testPackageId,
        departAt: tomorrow.toISOString(),
        returnAt: dayAfter.toISOString(),
        capacity: 10,
        status: 'active'
      };
      const departureRes = await makeAuthRequest('post', '/api/departures', { data: departureData });
      testDepartureId = departureRes.data.id;
      console.log(`[OK] Created departure - Status: ${departureRes.status}, ID: ${testDepartureId}`);

    } catch (error: any) {
      console.error(`[FAIL] Test data creation - Error: ${error.message}`);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
      hasFailures = true;
    }
  }

  // 8. Test reservation creation and booked count verification
  if (ACCESS_TOKEN && testDepartureId && testCustomerId) {
    try {
      // Get the departure to check initial booked count
      const departureRes = await makeAuthRequest('get', `/api/departures/${testDepartureId}`);
      const originalBooked = departureRes.data.booked;
      console.log(`[OK] Initial departure booked count: ${originalBooked}`);

      // Create a confirmed reservation
      const reservationData = {
        customerName: 'Smoke Test Customer',
        customerPhone: '+38761123456',
        partySize: 2,
        reservationAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        status: 'confirmed',
        departureId: testDepartureId,
        customerId: testCustomerId
      };

      const createRes = await makeAuthRequest('post', '/api/reservations', { data: reservationData });
      console.log(`[OK] Created reservation - Status: ${createRes.status}, ID: ${createRes.data.id}`);

      // Verify booked count increased
      const updatedDepartureRes = await makeAuthRequest('get', `/api/departures/${testDepartureId}`);
      const updatedBooked = updatedDepartureRes.data.booked;

      if (updatedBooked === originalBooked + reservationData.partySize) {
        console.log(`[PASS] Booked count verification - Original: ${originalBooked}, Updated: ${updatedBooked}`);
      } else {
        console.error(`[FAIL] Booked count verification - Expected: ${originalBooked + reservationData.partySize}, Got: ${updatedBooked}`);
        hasFailures = true;
      }

    } catch (error: any) {
      console.error(`[FAIL] Reservation creation and booked count test - Error: ${error.message}`);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
      hasFailures = true;
    }
  } else {
    console.log('[SKIP] Reservation creation test (missing test data or ACCESS_TOKEN)');
  }

  // 9. Test transaction creation
  if (ACCESS_TOKEN) {
    try {
      const transactionData = {
        amount: 150.00,
        currency: 'BAM',
        type: 'payment',
        note: 'Smoke test transaction',
        occurredAt: new Date().toISOString()
      };

      const transactionRes = await makeAuthRequest('post', '/api/transactions', { data: transactionData });
      console.log(`[OK] Created transaction - Status: ${transactionRes.status}, ID: ${transactionRes.data.id}`);

    } catch (error: any) {
      console.error(`[FAIL] Transaction creation - Error: ${error.message}`);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
      hasFailures = true;
    }
  } else {
    console.log('[SKIP] Transaction creation test (no ACCESS_TOKEN provided)');
  }

  console.log('--- Smoke Test Complete ---');

  if (hasFailures) {
    console.error('❌ Smoke test failed - some endpoints are not working');
    process.exit(1);
  } else {
    console.log('✅ All smoke tests passed');
    process.exit(0);
  }
}

runSmokeTest().catch((error) => {
  console.error('Unexpected error during smoke test:', error);
  process.exit(1);
});

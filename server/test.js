const assert = require('assert');
const { app } = require('./index');
const { calculateMonthSettlement } = require('./calculation');
const { db } = require('./db');

// In-memory HTTP simulator for Express without binding TCP sockets
function simulateRequest(method, url, body = null) {
  return new Promise((resolve, reject) => {
    const { EventEmitter } = require('events');
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { 'content-type': 'application/json' };
    req.query = {};
    req.params = {};
    req.body = body;

    let resBody = '';
    const res = new EventEmitter();
    res.statusCode = 200;
    res._headers = {};
    res.setHeader = (k, v) => { res._headers[k.toLowerCase()] = v; };
    res.getHeader = (k) => res._headers[k.toLowerCase()];
    res.removeHeader = (k) => { delete res._headers[k.toLowerCase()]; };
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      resolve({ status: res.statusCode, body: data });
    };
    res.send = (data) => {
      resolve({ status: res.statusCode, body: data });
    };
    res.sendFile = (filePath) => {
      resolve({ status: 200, filePath });
    };

    try {
      app(req, res, (err) => {
        if (err) {
          console.error("Express middleware error:", err);
          reject(err);
        } else resolve({ status: 404, body: null });
      });
    } catch (e) {
      console.error("Exception:", e);
      reject(e);
    }
  });
}

async function runTests() {
  console.log('--- STARTING MESS MANAGEMENT SYSTEM TEST SUITE ---');

  // Test 1: Database and Settings
  console.log('\n[1/5] Testing Database and Settings...');
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  assert.ok(settings, 'Settings row exists');
  assert.strictEqual(settings.general_secretary, 'Pawan', 'General Secretary is Pawan');
  console.log('✓ Database and settings verified');

  // Test 2: Members loaded from Excel
  console.log('\n[2/5] Testing Member list...');
  const members = db.prepare('SELECT * FROM members ORDER BY display_order ASC').all();
  assert.strictEqual(members.length, 9, 'Should have exactly 9 imported members');
  const memberNames = members.map(m => m.name);
  ['Saimomm', 'Sayeed', 'Pawan', 'Abrar', 'Siraj', 'Soad', 'Rafsun', 'Tamim', 'Sakib'].forEach(name => {
    assert.ok(memberNames.includes(name), `Member ${name} exists`);
  });
  console.log(`✓ 9 members verified: ${memberNames.join(', ')}`);

  // Test 3: Math and Settlement Engine for Oct-2026
  console.log('\n[3/5] Testing Settlement Engine Accuracy...');
  const settlement = calculateMonthSettlement('2026-10');
  assert.ok(settlement, 'October 2026 settlement exists');

  const { summary, memberSettlements } = settlement;
  assert.strictEqual(summary.totalBazar, 16186, 'Total Bazar matches 16186');
  assert.strictEqual(summary.totalMeals, 340, 'Total Meals matches 340');
  assert.strictEqual(parseFloat(summary.mealRate.toFixed(4)), 47.6059, 'Meal Rate matches 47.6059');
  assert.strictEqual(summary.totalSharedExtra, 30, 'Total Shared Extra matches 30');
  assert.strictEqual(summary.isBalanced, true, 'Settlement is mathematically balanced');
  assert.ok(Math.abs(summary.netBalanceSum) < 0.05, 'Net balance sum is ~ 0');

  // Check specific member balances
  const sayeed = memberSettlements.find(m => m.name === 'Sayeed');
  assert.strictEqual(sayeed.status, 'Pabe (Receive)', 'Sayeed status is Pabe');
  assert.strictEqual(sayeed.netBalance, 913.49, 'Sayeed net balance is +913.49');

  const sakib = memberSettlements.find(m => m.name === 'Sakib');
  assert.strictEqual(sakib.status, 'Dibe (Pay)', 'Sakib status is Dibe');
  assert.strictEqual(sakib.netBalance, -1383.9, 'Sakib net balance is -1383.90');

  console.log('✓ All financial math and member calculations match Excel exactly');

  // Test 4: Express In-Memory REST API Endpoints
  console.log('\n[4/5] Testing Express REST API Endpoints...');

  const resSettings = await simulateRequest('GET', '/api/settings');
  assert.strictEqual(resSettings.status, 200);
  assert.strictEqual(resSettings.body.success, true);
  console.log('✓ GET /api/settings returned 200 with valid settings');

  const resSettlement = await simulateRequest('GET', '/api/months/2026-10/settlement');
  assert.strictEqual(resSettlement.status, 200);
  assert.strictEqual(resSettlement.body.data.summary.totalMeals, 340);
  console.log('✓ GET /api/months/2026-10/settlement returned 200 with 340 meals');

  const resMeals = await simulateRequest('GET', '/api/months/2026-10/meals');
  assert.strictEqual(resMeals.status, 200);
  assert.strictEqual(resMeals.body.data.members.length, 9);
  console.log('✓ GET /api/months/2026-10/meals returned 200 with 9 members');

  // Test 5: Input Validation & Security
  console.log('\n[5/5] Testing Input Validation & Security...');
  const invalidBazar = await simulateRequest('POST', '/api/months/2026-10/bazar', {
    member_id: -999,
    amount: -50
  });
  assert.strictEqual(invalidBazar.status, 400);
  console.log('✓ Negative amount / invalid member rejected with 400 Bad Request');

  console.log('\n=========================================');
  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! (5/5)');
  console.log('=========================================');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

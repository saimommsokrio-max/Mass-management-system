const { db } = require('./db');

/**
 * Calculates complete mess metrics, member balances, meal rates, and settlement status for a given month.
 * @param {string} monthId - e.g. '2026-10'
 */
function calculateMonthSettlement(monthId) {
  // 1. Fetch Month Details
  const month = db.prepare('SELECT * FROM months WHERE id = ?').get(monthId);
  if (!month) {
    return null;
  }

  // 2. Fetch Settings
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() || {
    mess_name: 'Bachelor Mess',
    general_secretary: 'Pawan',
    split_extra_equally: 1,
    currency_symbol: '৳'
  };

  // 3. Fetch All Members
  const members = db.prepare('SELECT * FROM members ORDER BY display_order ASC, name ASC').all();

  // 4. Fetch Manual Meals for this month
  const manualMealsRows = db.prepare('SELECT member_id, manual_meals FROM member_manual_meals WHERE month_id = ?').all(monthId);
  const manualMealsMap = {};
  for (const r of manualMealsRows) {
    manualMealsMap[r.member_id] = r.manual_meals;
  }

  // 5. Fetch Daily Meals for this month
  const dailyMealsRows = db.prepare(`
    SELECT member_id, day, breakfast, lunch, dinner, meal_count
    FROM daily_meals 
    WHERE month_id = ?
  `).all(monthId);

  const dailyMealsMap = {}; // memberId -> { [day]: meal_count }
  const memberDailyTotals = {}; // memberId -> total
  for (const r of dailyMealsRows) {
    if (!dailyMealsMap[r.member_id]) dailyMealsMap[r.member_id] = {};
    dailyMealsMap[r.member_id][r.day] = r.meal_count;
    memberDailyTotals[r.member_id] = (memberDailyTotals[r.member_id] || 0) + r.meal_count;
  }

  // 6. Fetch Bazar Entries
  const bazarRows = db.prepare(`
    SELECT b.*, m.name as member_name
    FROM bazar_entries b
    JOIN members m ON b.member_id = m.id
    WHERE b.month_id = ?
    ORDER BY b.id ASC
  `).all(monthId);

  const memberBazarMap = {};
  let totalBazar = 0;
  for (const b of bazarRows) {
    totalBazar += b.amount;
    memberBazarMap[b.member_id] = (memberBazarMap[b.member_id] || 0) + b.amount;
  }

  // 7. Fetch Deposits
  const depositRows = db.prepare(`
    SELECT d.*, m.name as member_name
    FROM deposits d
    JOIN members m ON d.member_id = m.id
    WHERE d.month_id = ?
    ORDER BY d.deposit_date ASC, d.id ASC
  `).all(monthId);

  const memberDepositMap = {};
  let totalDeposits = 0;
  for (const d of depositRows) {
    totalDeposits += d.amount;
    memberDepositMap[d.member_id] = (memberDepositMap[d.member_id] || 0) + d.amount;
  }

  // 8. Fetch Extra Expenses
  const extraRows = db.prepare(`
    SELECT e.*, m.name as paid_by_name
    FROM extra_expenses e
    LEFT JOIN members m ON e.paid_by_member_id = m.id
    WHERE e.month_id = ?
    ORDER BY e.id ASC
  `).all(monthId);

  // Split between shared extra (Bibidh) and utility bills
  let totalSharedExtra = 0;
  let totalUtilityBills = 0;
  const memberExtraPaidMap = {};

  for (const e of extraRows) {
    if (e.category === 'utility') {
      totalUtilityBills += e.amount;
    } else {
      totalSharedExtra += e.amount;
    }

    if (e.paid_by_member_id) {
      memberExtraPaidMap[e.paid_by_member_id] = (memberExtraPaidMap[e.paid_by_member_id] || 0) + e.amount;
    }
  }

  // 9. Compute Meals per Member
  let totalMeals = 0;
  const memberMealsData = {};
  for (const m of members) {
    const dailySum = memberDailyTotals[m.id] || 0;
    const manualCount = manualMealsMap[m.id] || 0;
    // If daily entries exist, use dailySum, otherwise manualCount
    const finalMealCount = dailySum > 0 ? dailySum : manualCount;
    memberMealsData[m.id] = finalMealCount;
    totalMeals += finalMealCount;
  }

  // 10. Compute Meal Rate
  const mealRate = totalMeals > 0 ? (totalBazar / totalMeals) : 0;

  // 11. Extra Cost Per Head
  const activeMembers = members.filter(m => m.is_active === 1);
  const activeCount = activeMembers.length;
  const extraPerHead = (settings.split_extra_equally && activeCount > 0)
    ? (totalSharedExtra / activeCount)
    : 0;

  // 12. Individual Member Settlement Breakdown
  let totalMemberCost = 0;
  let totalMemberCredit = 0;
  let netBalanceSum = 0;

  const memberSettlements = members.map(m => {
    const meals = memberMealsData[m.id] || 0;
    const mealCost = meals * mealRate;
    const extraShare = (m.is_active === 1 && settings.split_extra_equally) ? extraPerHead : 0;
    const totalCost = mealCost + extraShare;

    const bazarCredit = memberBazarMap[m.id] || 0;
    const depositCredit = memberDepositMap[m.id] || 0;
    const extraPaidCredit = memberExtraPaidMap[m.id] || 0;
    const totalCredit = bazarCredit + depositCredit + extraPaidCredit;

    const netBalance = totalCredit - totalCost;

    totalMemberCost += totalCost;
    totalMemberCredit += totalCredit;
    netBalanceSum += netBalance;

    let status = 'Settled';
    if (netBalance > 0.5) {
      status = 'Pabe (Receive)';
    } else if (netBalance < -0.5) {
      status = 'Dibe (Pay)';
    }

    return {
      memberId: m.id,
      name: m.name,
      role: m.role,
      isActive: m.is_active === 1,
      meals: parseFloat(meals.toFixed(2)),
      mealRate: parseFloat(mealRate.toFixed(4)),
      mealCost: parseFloat(mealCost.toFixed(2)),
      extraShare: parseFloat(extraShare.toFixed(2)),
      totalCost: parseFloat(totalCost.toFixed(2)),
      bazarCredit: parseFloat(bazarCredit.toFixed(2)),
      depositCredit: parseFloat(depositCredit.toFixed(2)),
      extraPaidCredit: parseFloat(extraPaidCredit.toFixed(2)),
      totalCredit: parseFloat(totalCredit.toFixed(2)),
      netBalance: parseFloat(netBalance.toFixed(2)),
      status
    };
  });

  // 13. Fund Calculations
  // Opening Fund + Adjustments
  const openingFund = month.opening_fund || 0;
  const fundAdjustment = month.fund_adjustment || 0;
  const closingFund = openingFund + fundAdjustment; // Matches Excel formula

  return {
    month: {
      id: month.id,
      name: month.name,
      year: month.year,
      monthNum: month.month_num,
      daysInMonth: month.days_in_month,
      openingFund,
      fundAdjustment,
      closingFund: parseFloat(closingFund.toFixed(2)),
      isClosed: month.is_closed === 1
    },
    settings,
    summary: {
      totalBazar: parseFloat(totalBazar.toFixed(2)),
      totalMeals: parseFloat(totalMeals.toFixed(2)),
      mealRate: parseFloat(mealRate.toFixed(4)),
      totalSharedExtra: parseFloat(totalSharedExtra.toFixed(2)),
      totalUtilityBills: parseFloat(totalUtilityBills.toFixed(2)),
      totalDeposits: parseFloat(totalDeposits.toFixed(2)),
      activeMembers: activeCount,
      extraPerHead: parseFloat(extraPerHead.toFixed(2)),
      netBalanceSum: parseFloat(netBalanceSum.toFixed(2)),
      isBalanced: Math.abs(netBalanceSum) < 1.0 // Within 1 Taka rounding tolerance
    },
    memberSettlements,
    bazarRows,
    depositRows,
    extraRows,
    dailyMealsMap,
    manualMealsMap
  };
}

module.exports = {
  calculateMonthSettlement
};

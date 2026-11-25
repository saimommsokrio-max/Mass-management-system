// Smart Mess Management System Frontend Controller
// Strict adherence to secure DOM manipulation & escaping

let currentMonthId = '2026-10';
let currentSettlement = null;
let currentMembers = [];
let currentMonths = [];
let currentSettings = {};

// DOM Helper: Safe Element Creator
function el(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'dataset') {
      for (const [dKey, dVal] of Object.entries(value)) {
        element.dataset[dKey] = dVal;
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      element.setAttribute(key, value);
    }
  }

  for (const child of children) {
    if (typeof child === 'string' || typeof child === 'number') {
      element.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      element.appendChild(child);
    }
  }
  return element;
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = el('div', { className: `toast toast-${type}` },
    type === 'success' ? '✓ ' : (type === 'danger' ? '⚠️ ' : 'ℹ️ '),
    message
  );

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// API Helper
async function api(path, method = 'GET', body = null) {
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(path, opts);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Request failed');
    }
    return data.data;
  } catch (err) {
    showToast(err.message, 'danger');
    throw err;
  }
}

// Format Currency
function formatMoney(amount, symbol = '৳') {
  const num = parseFloat(amount || 0);
  return `${symbol}${num.toFixed(2)}`;
}

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupThemeToggle();
  await loadSettings();
  await loadMonths();
  await loadMembers();
  await refreshSettlement();
  setupEventListeners();
});

// Theme Toggle
function setupThemeToggle() {
  const btn = document.getElementById('btnToggleTheme');
  const savedTheme = localStorage.getItem('mess_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  btn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mess_theme', next);
  });
}

// Tab Navigation
function setupNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  const panes = document.querySelectorAll('.tab-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.style.display = 'none');

      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      const targetPane = document.getElementById(targetId);
      if (targetPane) {
        targetPane.style.display = 'block';
        if (targetId === 'tab-meals') loadMealGrid();
        if (targetId === 'tab-bazar') renderBazarTable();
        if (targetId === 'tab-deposits') renderDepositTable();
        if (targetId === 'tab-extra') renderExtraTable();
        if (targetId === 'tab-members') renderMemberTable();
      }
    });
  });

  // Print button
  document.getElementById('btnPrint').addEventListener('click', () => {
    window.print();
  });
}

// -------------------------------------------------------------
// Data Loaders
// -------------------------------------------------------------
async function loadSettings() {
  try {
    currentSettings = await api('/api/settings');
    const nameEl = document.getElementById('appMessName');
    const mgrEl = document.getElementById('appManagerText');
    if (nameEl) nameEl.textContent = currentSettings.mess_name;
    if (mgrEl) mgrEl.textContent = `General Secretary: ${currentSettings.general_secretary || 'None'} | Smart Bachelor Mess`;

    // Populate Settings form
    document.getElementById('inputMessName').value = currentSettings.mess_name || '';
    document.getElementById('inputGeneralSec').value = currentSettings.general_secretary || '';
    document.getElementById('inputCurrency').value = currentSettings.currency_symbol || '৳';
    document.getElementById('selectSplitExtra').value = String(currentSettings.split_extra_equally ?? 1);
  } catch (e) {
    console.error('Failed to load settings', e);
  }
}

async function loadMonths() {
  try {
    currentMonths = await api('/api/months');
    const select = document.getElementById('monthSelect');
    select.replaceChildren();

    // Default to current month or first available
    if (currentMonths.length > 0) {
      if (!currentMonths.some(m => m.id === currentMonthId)) {
        currentMonthId = currentMonths[0].id;
      }
    }

    currentMonths.forEach(m => {
      const opt = el('option', { value: m.id }, m.name);
      if (m.id === currentMonthId) opt.selected = true;
      select.appendChild(opt);
    });

    select.addEventListener('change', async (e) => {
      currentMonthId = e.target.value;
      await refreshSettlement();
      // If currently on meals tab, reload meals
      const activeTab = document.querySelector('.nav-tab.active');
      if (activeTab && activeTab.dataset.tab === 'tab-meals') {
        loadMealGrid();
      }
    });
  } catch (e) {
    console.error('Failed to load months', e);
  }
}

async function loadMembers() {
  try {
    currentMembers = await api('/api/members');
  } catch (e) {
    console.error('Failed to load members', e);
  }
}

// Refresh Current Month Metrics & Settlement
async function refreshSettlement() {
  if (!currentMonthId) return;
  try {
    currentSettlement = await api(`/api/months/${currentMonthId}/settlement`);
    renderKPIs();
    renderSettlementTable();
    renderBazarTable();
    renderDepositTable();
    renderExtraTable();
  } catch (e) {
    console.error('Failed to refresh settlement', e);
  }
}

// -------------------------------------------------------------
// Renderers
// -------------------------------------------------------------
function renderKPIs() {
  if (!currentSettlement) return;
  const s = currentSettlement.summary;
  const cur = currentSettings.currency_symbol || '৳';

  document.getElementById('kpiMealRate').textContent = `${cur}${s.mealRate.toFixed(2)}`;
  document.getElementById('kpiTotalBazar').textContent = formatMoney(s.totalBazar, cur);
  document.getElementById('kpiBazarCount').textContent = `${currentSettlement.bazarRows.length} Shopping trips recorded`;
  document.getElementById('kpiTotalMeals').textContent = `${s.totalMeals} meals`;
  document.getElementById('kpiActiveMembers').textContent = `${s.activeMembers} Active members`;
  document.getElementById('kpiExtraPerHead').textContent = formatMoney(s.extraPerHead, cur);
  document.getElementById('kpiTotalExtra').textContent = `Shared Extra: ${formatMoney(s.totalSharedExtra, cur)}`;

  const closing = currentSettlement.month.closingFund;
  document.getElementById('kpiFundBalance').textContent = formatMoney(closing, cur);
  document.getElementById('kpiOpeningFund').textContent = `Opening Fund: ${formatMoney(currentSettlement.month.openingFund, cur)}`;

  // Balance Badge
  const badge = document.getElementById('balanceCheckBadge');
  if (s.isBalanced) {
    badge.className = 'badge badge-receive';
    badge.textContent = `Net Balance Sum = ${cur}${s.netBalanceSum.toFixed(2)} (100% Balanced ✓)`;
  } else {
    badge.className = 'badge badge-pay';
    badge.textContent = `Net Balance Difference = ${cur}${s.netBalanceSum.toFixed(2)} (Please Check)`;
  }
}

function renderSettlementTable() {
  if (!currentSettlement) return;
  const tbody = document.getElementById('settlementTableBody');
  const tfoot = document.getElementById('settlementTableFoot');
  tbody.replaceChildren();
  tfoot.replaceChildren();

  const cur = currentSettings.currency_symbol || '৳';
  let totalMeals = 0;
  let totalMealCost = 0;
  let totalExtraShare = 0;
  let totalOverallCost = 0;
  let totalBazarCredit = 0;
  let totalDepCredit = 0;
  let totalOverallCredit = 0;
  let totalNet = 0;

  currentSettlement.memberSettlements.forEach((m, idx) => {
    totalMeals += m.meals;
    totalMealCost += m.mealCost;
    totalExtraShare += m.extraShare;
    totalOverallCost += m.totalCost;
    totalBazarCredit += m.bazarCredit;
    totalDepCredit += (m.depositCredit + m.extraPaidCredit);
    totalOverallCredit += m.totalCredit;
    totalNet += m.netBalance;

    let statusBadgeClass = 'badge-settled';
    let statusText = 'Settled (পরিশোধিত)';
    if (m.status.includes('Receive')) {
      statusBadgeClass = 'badge-receive';
      statusText = 'Pabe (পাবে)';
    } else if (m.status.includes('Pay')) {
      statusBadgeClass = 'badge-pay';
      statusText = 'Dibe (দিবে)';
    }

    const tr = el('tr', {},
      el('td', {}, idx + 1),
      el('td', { style: 'font-weight: 600;' },
        m.name,
        m.role === 'secretary' ? el('span', { className: 'badge badge-role', style: 'margin-left: 6px;' }, 'Sec') : ''
      ),
      el('td', { style: 'font-weight: 700;' }, m.meals),
      el('td', {}, formatMoney(m.bazarCredit, cur)),
      el('td', {}, formatMoney(m.depositCredit + m.extraPaidCredit, cur)),
      el('td', { style: 'font-weight: 700;' }, formatMoney(m.totalCredit, cur)),
      el('td', {}, formatMoney(m.mealCost, cur)),
      el('td', {}, formatMoney(m.extraShare, cur)),
      el('td', {
        style: `font-weight: 800; color: ${m.netBalance > 0.5 ? 'var(--success-text)' : (m.netBalance < -0.5 ? 'var(--danger-text)' : 'inherit')};`
      }, `${m.netBalance > 0 ? '+' : ''}${formatMoney(m.netBalance, cur)}`),
      el('td', {}, el('span', { className: `badge ${statusBadgeClass}` }, statusText))
    );
    tbody.appendChild(tr);
  });

  // Table Footer Totals (Matches Excel Row 28)
  const footTr = el('tr', {},
    el('td', { colSpan: 2, style: 'font-weight: 800;' }, 'TOTAL (সর্বমোট)'),
    el('td', { style: 'font-weight: 800;' }, totalMeals.toFixed(1)),
    el('td', { style: 'font-weight: 800;' }, formatMoney(totalBazarCredit, cur)),
    el('td', { style: 'font-weight: 800;' }, formatMoney(totalDepCredit, cur)),
    el('td', { style: 'font-weight: 800;' }, formatMoney(totalOverallCredit, cur)),
    el('td', { style: 'font-weight: 800;' }, formatMoney(totalMealCost, cur)),
    el('td', { style: 'font-weight: 800;' }, formatMoney(totalExtraShare, cur)),
    el('td', { style: 'font-weight: 800;' }, formatMoney(totalNet, cur)),
    el('td', {}, el('span', { className: 'badge badge-receive' }, 'Balanced ✓'))
  );
  tfoot.appendChild(footTr);
}

// -------------------------------------------------------------
// Daily Meals Grid
// -------------------------------------------------------------
async function loadMealGrid() {
  if (!currentMonthId) return;
  const mealData = await api(`/api/months/${currentMonthId}/meals`);
  const daysInMonth = mealData.month.days_in_month;
  const members = mealData.members;

  const thead = document.getElementById('mealGridHead');
  const tbody = document.getElementById('mealGridBody');
  const tfoot = document.getElementById('mealGridFoot');
  thead.replaceChildren();
  tbody.replaceChildren();
  tfoot.replaceChildren();

  // Head row: Day | Member1 | Member2 ... | Daily Total
  const headCells = [el('th', {}, 'Day')];
  members.forEach(m => {
    headCells.push(el('th', {}, m.name));
  });
  headCells.push(el('th', { style: 'font-weight: 700;' }, 'Daily Total'));
  thead.appendChild(el('tr', {}, ...headCells));

  // Map daily meals by day and memberId
  const dayMemberMap = {};
  mealData.daily.forEach(d => {
    if (!dayMemberMap[d.day]) dayMemberMap[d.day] = {};
    dayMemberMap[d.day][d.member_id] = d.meal_count;
  });

  const memberTotals = {};
  members.forEach(m => memberTotals[m.id] = 0);

  // Rows 1 to daysInMonth
  for (let day = 1; day <= daysInMonth; day++) {
    let dailyRowSum = 0;
    const rowCells = [el('td', { style: 'font-weight: 600;' }, `Day ${day}`)];

    members.forEach(m => {
      const count = (dayMemberMap[day] && dayMemberMap[day][m.id] !== undefined)
        ? dayMemberMap[day][m.id]
        : 0;

      memberTotals[m.id] += count;
      dailyRowSum += count;

      const input = el('input', {
        type: 'number',
        step: '0.5',
        min: '0',
        max: '10',
        value: count === 0 ? '' : count,
        className: 'meal-input',
        placeholder: '0'
      });

      input.addEventListener('change', async (e) => {
        const val = parseFloat(e.target.value || 0);
        await api(`/api/months/${currentMonthId}/meals/daily`, 'POST', {
          member_id: m.id,
          day,
          meal_count: val
        });
        showToast(`Saved Day ${day} meal for ${m.name}`, 'success');
        refreshSettlement();
      });

      rowCells.push(el('td', {}, input));
    });

    rowCells.push(el('td', { style: 'font-weight: 700;' }, dailyRowSum > 0 ? dailyRowSum : '0'));
    tbody.appendChild(el('tr', {}, ...rowCells));
  }

  // Map manual meals
  const manualMap = {};
  mealData.manual.forEach(m => {
    manualMap[m.member_id] = m.manual_meals;
  });

  const manualCells = [el('td', { style: 'font-weight: 700; color: var(--text-muted); background: var(--bg-main);' }, 'Manual Total*')];
  let manualGrandTotal = 0;
  members.forEach(m => {
    const manVal = manualMap[m.id] || 0;
    manualGrandTotal += manVal;
    const input = el('input', {
      type: 'number',
      step: '0.5',
      min: '0',
      value: manVal > 0 ? manVal : '',
      className: 'meal-input',
      placeholder: '0',
      style: 'background: var(--bg-main); font-weight: 700;'
    });
    input.addEventListener('change', async (e) => {
      const val = parseFloat(e.target.value || 0);
      await api(`/api/months/${currentMonthId}/meals/manual`, 'POST', {
        member_id: m.id,
        manual_meals: val
      });
      showToast(`Updated manual meal for ${m.name}`, 'success');
      await refreshSettlement();
      loadMealGrid();
    });
    manualCells.push(el('td', { style: 'background: var(--bg-main);' }, input));
  });
  manualCells.push(el('td', { style: 'font-weight: 700; color: var(--text-muted); background: var(--bg-main);' }, manualGrandTotal > 0 ? manualGrandTotal.toFixed(1) : '0'));
  tbody.appendChild(el('tr', { style: 'border-top: 2px solid var(--border);' }, ...manualCells));

  // Footer: Member totals (matches Excel Row 68: SUM daily + manual)
  const footCells = [el('td', { style: 'font-weight: 800;' }, 'TOTAL MEALS (মোট মিল)')];
  let finalGrandTotal = 0;
  members.forEach(m => {
    const dailyTot = memberTotals[m.id] || 0;
    const manTot = manualMap[m.id] || 0;
    const finalTot = dailyTot > 0 ? dailyTot : manTot;
    finalGrandTotal += finalTot;
    footCells.push(el('td', { style: 'font-weight: 800;' }, finalTot.toFixed(1)));
  });
  footCells.push(el('td', { style: 'font-weight: 800; color: var(--primary); font-size: 1.05rem;' }, finalGrandTotal.toFixed(1)));
  tfoot.appendChild(el('tr', {}, ...footCells));

  // Also setup Manual Totals view
  renderManualMealInputs(mealData);
}

function renderManualMealInputs(mealData) {
  const container = document.getElementById('manualMealInputs');
  container.replaceChildren();

  const manualMap = {};
  mealData.manual.forEach(m => {
    manualMap[m.member_id] = m.manual_meals;
  });

  mealData.members.forEach(m => {
    const val = manualMap[m.id] || 0;
    const input = el('input', {
      type: 'number',
      step: '0.5',
      min: '0',
      value: val,
      className: 'form-control',
      id: `manualMeal_${m.id}`
    });

    input.addEventListener('change', async (e) => {
      const meals = parseFloat(e.target.value || 0);
      await api(`/api/months/${currentMonthId}/meals/manual`, 'POST', {
        member_id: m.id,
        manual_meals: meals
      });
      showToast(`Updated total meals for ${m.name}`, 'success');
      refreshSettlement();
    });

    const group = el('div', { className: 'form-group' },
      el('label', { htmlFor: `manualMeal_${m.id}` }, `${m.name} Total Meals`),
      input
    );
    container.appendChild(group);
  });
}

// -------------------------------------------------------------
// Bazar Table
// -------------------------------------------------------------
function renderBazarTable() {
  if (!currentSettlement) return;
  const tbody = document.getElementById('bazarTableBody');
  const tfoot = document.getElementById('bazarTableFoot');
  tbody.replaceChildren();
  if (tfoot) tfoot.replaceChildren();

  const cur = currentSettings.currency_symbol || '৳';
  let totalBazarAmount = 0;
  let totalBazarMeals = 0;

  currentSettlement.bazarRows.forEach(b => {
    totalBazarAmount += b.amount;
    totalBazarMeals += (b.meals_during_period || 0);
    const periodRate = b.meals_during_period > 0 ? (b.amount / b.meals_during_period).toFixed(2) : '-';

    const btnDelete = el('button', { className: 'btn btn-sm btn-danger' }, 'Delete');
    btnDelete.addEventListener('click', async () => {
      openConfirmModal(`Delete bazar entry of ${formatMoney(b.amount, cur)} by ${b.member_name}?`, async () => {
        await api(`/api/bazar/${b.id}`, 'DELETE');
        showToast('Bazar entry deleted', 'success');
        refreshSettlement();
      });
    });

    const tr = el('tr', {},
      el('td', {}, b.date_str),
      el('td', { style: 'font-weight: 600;' }, b.member_name),
      el('td', { style: 'font-weight: 700;' }, formatMoney(b.amount, cur)),
      el('td', {}, b.meals_during_period || '-'),
      el('td', {}, periodRate !== '-' ? `${cur}${periodRate}` : '-'),
      el('td', {}, b.description || '-'),
      el('td', {}, btnDelete)
    );
    tbody.appendChild(tr);
  });

  if (tfoot) {
    const avgRate = totalBazarMeals > 0 ? (totalBazarAmount / totalBazarMeals).toFixed(2) : '-';
    tfoot.appendChild(el('tr', { style: 'font-weight: 800;' },
      el('td', { colSpan: 2 }, 'TOTAL BAZAR (সর্বমোট বাজার)'),
      el('td', { style: 'color: var(--primary); font-size: 1rem;' }, formatMoney(totalBazarAmount, cur)),
      el('td', {}, totalBazarMeals > 0 ? totalBazarMeals.toFixed(1) : '-'),
      el('td', {}, avgRate !== '-' ? `${cur}${avgRate}` : '-'),
      el('td', { colSpan: 2 }, `${currentSettlement.bazarRows.length} Shopping trips recorded`)
    ));
  }
}

// -------------------------------------------------------------
// Deposit Table
// -------------------------------------------------------------
function renderDepositTable() {
  if (!currentSettlement) return;
  const tbody = document.getElementById('depositTableBody');
  const tfoot = document.getElementById('depositTableFoot');
  tbody.replaceChildren();
  if (tfoot) tfoot.replaceChildren();

  const cur = currentSettings.currency_symbol || '৳';
  let totalDeposits = 0;

  currentSettlement.depositRows.forEach(d => {
    totalDeposits += d.amount;
    const btnDelete = el('button', { className: 'btn btn-sm btn-danger' }, 'Delete');
    btnDelete.addEventListener('click', async () => {
      openConfirmModal(`Delete deposit of ${formatMoney(d.amount, cur)} by ${d.member_name}?`, async () => {
        await api(`/api/deposits/${d.id}`, 'DELETE');
        showToast('Deposit deleted', 'success');
        refreshSettlement();
      });
    });

    const tr = el('tr', {},
      el('td', {}, d.deposit_date),
      el('td', { style: 'font-weight: 600;' }, d.member_name),
      el('td', { style: 'font-weight: 700; color: var(--success-text);' }, formatMoney(d.amount, cur)),
      el('td', {}, el('span', { className: 'badge badge-role' }, d.category || 'Deposit')),
      el('td', {}, d.notes || '-'),
      el('td', {}, btnDelete)
    );
    tbody.appendChild(tr);
  });

  if (tfoot) {
    tfoot.appendChild(el('tr', { style: 'font-weight: 800;' },
      el('td', { colSpan: 2 }, 'TOTAL DEPOSITS (সর্বমোট জমা)'),
      el('td', { style: 'color: var(--success-text); font-size: 1rem;' }, formatMoney(totalDeposits, cur)),
      el('td', { colSpan: 3 }, '')
    ));
  }
}

// -------------------------------------------------------------
// Extra Table
// -------------------------------------------------------------
function renderExtraTable() {
  if (!currentSettlement) return;
  const tbody = document.getElementById('extraTableBody');
  const tfoot = document.getElementById('extraTableFoot');
  tbody.replaceChildren();
  if (tfoot) tfoot.replaceChildren();

  const cur = currentSettings.currency_symbol || '৳';
  let totalExtraCost = 0;

  currentSettlement.extraRows.forEach(e => {
    totalExtraCost += e.amount;
    const btnDelete = el('button', { className: 'btn btn-sm btn-danger' }, 'Delete');
    btnDelete.addEventListener('click', async () => {
      openConfirmModal(`Delete expense "${e.title}" (${formatMoney(e.amount, cur)})?`, async () => {
        await api(`/api/extra/${e.id}`, 'DELETE');
        showToast('Expense deleted', 'success');
        refreshSettlement();
      });
    });

    const tr = el('tr', {},
      el('td', { style: 'font-weight: 600;' }, e.title),
      el('td', {}, el('span', { className: 'badge badge-role' }, e.category)),
      el('td', { style: 'font-weight: 700;' }, formatMoney(e.amount, cur)),
      el('td', {}, e.paid_by_name ? `Paid by ${e.paid_by_name}` : 'Mess Fund'),
      el('td', {}, e.date_str || '-'),
      el('td', {}, e.notes || '-'),
      el('td', {}, btnDelete)
    );
    tbody.appendChild(tr);
  });

  if (tfoot) {
    tfoot.appendChild(el('tr', { style: 'font-weight: 800;' },
      el('td', { colSpan: 2 }, 'TOTAL EXTRA & UTILITY (সর্বমোট বিল)'),
      el('td', { style: 'font-size: 1rem;' }, formatMoney(totalExtraCost, cur)),
      el('td', { colSpan: 4 }, '')
    ));
  }
}

// -------------------------------------------------------------
// Member Table
// -------------------------------------------------------------
function renderMemberTable() {
  const tbody = document.getElementById('memberTableBody');
  tbody.replaceChildren();

  currentMembers.forEach((m, idx) => {
    const btnToggle = el('button', { className: 'btn btn-sm btn-outline' }, m.is_active ? 'Deactivate' : 'Activate');
    btnToggle.addEventListener('click', async () => {
      await api(`/api/members/${m.id}`, 'PUT', { is_active: !m.is_active });
      await loadMembers();
      renderMemberTable();
      refreshSettlement();
    });

    const tr = el('tr', {},
      el('td', {}, idx + 1),
      el('td', { style: 'font-weight: 600;' }, m.name),
      el('td', {}, el('span', { className: 'badge badge-role' }, m.role)),
      el('td', {}, m.room_no || '-'),
      el('td', {}, m.phone || '-'),
      el('td', {}, el('span', { className: `badge ${m.is_active ? 'badge-receive' : 'badge-pay'}` }, m.is_active ? 'Active' : 'Inactive')),
      el('td', {}, btnToggle)
    );
    tbody.appendChild(tr);
  });
}

// -------------------------------------------------------------
// Event Listeners & Modals
// -------------------------------------------------------------
function setupEventListeners() {
  // Mode toggle in Meals tab
  const btnDaily = document.getElementById('btnModeDaily');
  const btnManual = document.getElementById('btnModeManual');
  const viewDaily = document.getElementById('dailyMealView');
  const viewManual = document.getElementById('manualMealView');

  btnDaily.addEventListener('click', () => {
    btnDaily.classList.add('active');
    btnManual.classList.remove('active');
    viewDaily.style.display = 'block';
    viewManual.style.display = 'none';
  });

  btnManual.addEventListener('click', () => {
    btnManual.classList.add('active');
    btnDaily.classList.remove('active');
    viewDaily.style.display = 'none';
    viewManual.style.display = 'block';
  });

  // Settings Save
  document.getElementById('btnSaveSettings').addEventListener('click', async () => {
    const mess_name = document.getElementById('inputMessName').value;
    const general_secretary = document.getElementById('inputGeneralSec').value;
    const currency_symbol = document.getElementById('inputCurrency').value;
    const split_extra_equally = parseInt(document.getElementById('selectSplitExtra').value, 10);

    await api('/api/settings', 'PUT', {
      mess_name,
      general_secretary,
      currency_symbol,
      split_extra_equally
    });
    showToast('Settings saved successfully', 'success');
    await loadSettings();
    await refreshSettlement();
  });

  // Open Modals
  document.getElementById('btnNewMonth').addEventListener('click', openNewMonthModal);
  document.getElementById('btnOpenAddBazar').addEventListener('click', openAddBazarModal);
  document.getElementById('btnOpenAddDeposit').addEventListener('click', openAddDepositModal);
  document.getElementById('btnOpenAddExtra').addEventListener('click', openAddExtraModal);
  document.getElementById('btnOpenAddMember').addEventListener('click', openAddMemberModal);
}

// Modal Builders
function openModal(title, formElements, onSubmit) {
  const container = document.getElementById('modalContainer');
  container.replaceChildren();

  const closeBtn = el('button', { className: 'close-btn' }, '×');
  const cancelBtn = el('button', { className: 'btn btn-outline' }, 'Cancel');
  const saveBtn = el('button', { className: 'btn btn-primary' }, 'Save');

  const modal = el('div', { className: 'modal-backdrop' },
    el('div', { className: 'modal-content' },
      el('div', { className: 'modal-header' },
        el('h3', { style: 'font-weight: 700; font-size: 1.1rem;' }, title),
        closeBtn
      ),
      el('div', { className: 'modal-body' }, ...formElements),
      el('div', { className: 'modal-footer' }, cancelBtn, saveBtn)
    )
  );

  const closeModal = () => modal.remove();
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  saveBtn.addEventListener('click', async () => {
    try {
      await onSubmit();
      closeModal();
    } catch (e) {
      // Error handled by api()
    }
  });

  container.appendChild(modal);
}

function openConfirmModal(message, onConfirm) {
  openModal('Confirmation', [
    el('p', { style: 'font-size: 1rem; color: var(--text-main);' }, message)
  ], onConfirm);
}

// New Month Modal
function openNewMonthModal() {
  const now = new Date();
  const yearInput = el('input', { type: 'number', className: 'form-control', value: now.getFullYear(), min: '2025', max: '2030' });
  const monthSelect = el('select', { className: 'form-control' });
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  months.forEach((m, i) => {
    const opt = el('option', { value: i + 1 }, m);
    if (i === now.getMonth()) opt.selected = true;
    monthSelect.appendChild(opt);
  });
  const openFundInput = el('input', { type: 'number', step: '0.01', className: 'form-control', placeholder: '0.00', value: '0' });

  openModal('Add New Month Session', [
    el('div', { className: 'form-group' }, el('label', {}, 'Year'), yearInput),
    el('div', { className: 'form-group' }, el('label', {}, 'Month'), monthSelect),
    el('div', { className: 'form-group' }, el('label', {}, 'Opening Fund Balance (৳)'), openFundInput)
  ], async () => {
    const res = await api('/api/months', 'POST', {
      year: parseInt(yearInput.value, 10),
      monthNum: parseInt(monthSelect.value, 10),
      opening_fund: parseFloat(openFundInput.value || 0)
    });
    showToast(`Month ${res.name} created!`, 'success');
    await loadMonths();
    currentMonthId = res.id;
    document.getElementById('monthSelect').value = res.id;
    await refreshSettlement();
  });
}

// Add Bazar Modal
function openAddBazarModal() {
  const memberSelect = el('select', { className: 'form-control' });
  currentMembers.forEach(m => {
    memberSelect.appendChild(el('option', { value: m.id }, m.name));
  });

  const dateInput = el('input', { type: 'text', className: 'form-control', placeholder: 'e.g. 5,6 or 2026-11-24', value: new Date().toISOString().slice(8, 10) });
  const amountInput = el('input', { type: 'number', step: '0.01', min: '1', className: 'form-control', placeholder: 'Amount in ৳' });
  const mealsInput = el('input', { type: 'number', step: '0.5', min: '0', className: 'form-control', placeholder: 'Meals consumed in period (optional)', value: '0' });
  const descInput = el('input', { type: 'text', className: 'form-control', placeholder: 'e.g. Fish, Vegetables, Chicken' });

  openModal('Add Bazar Purchase (বাজার খরচ)', [
    el('div', { className: 'form-group' }, el('label', {}, 'Shopped By (সদস্য)'), memberSelect),
    el('div', { className: 'form-group' }, el('label', {}, 'Date or Day Range (তারিখ/দিন)'), dateInput),
    el('div', { className: 'form-group' }, el('label', {}, 'Total Amount (টাকা ৳)'), amountInput),
    el('div', { className: 'form-group' }, el('label', {}, 'Meals during this Bazar Period (ঐ বাজারের মিল সংখ্যা)'), mealsInput),
    el('div', { className: 'form-group' }, el('label', {}, 'Item Description / Notes'), descInput)
  ], async () => {
    await api(`/api/months/${currentMonthId}/bazar`, 'POST', {
      member_id: parseInt(memberSelect.value, 10),
      date_str: dateInput.value,
      amount: parseFloat(amountInput.value),
      meals_during_period: parseFloat(mealsInput.value || 0),
      description: descInput.value
    });
    showToast('Bazar expense recorded!', 'success');
    await refreshSettlement();
  });
}

// Add Deposit Modal
function openAddDepositModal() {
  const memberSelect = el('select', { className: 'form-control' });
  currentMembers.forEach(m => {
    memberSelect.appendChild(el('option', { value: m.id }, m.name));
  });

  const amountInput = el('input', { type: 'number', step: '0.01', min: '1', className: 'form-control', placeholder: 'Amount in ৳' });
  const dateInput = el('input', { type: 'date', className: 'form-control', value: new Date().toISOString().slice(0, 10) });
  const catSelect = el('select', { className: 'form-control' },
    el('option', { value: 'deposit' }, 'Standard Deposit (মেস জমা)'),
    el('option', { value: 'advance' }, 'Advance Payment (অগ্রিম জমা)'),
    el('option', { value: 'extra_payment' }, 'Extra / Utilities Payment (বিল জমা)')
  );
  const notesInput = el('input', { type: 'text', className: 'form-control', placeholder: 'Cash / bKash / Nagad TrxID' });

  openModal('Record Member Deposit (টাকা জমা)', [
    el('div', { className: 'form-group' }, el('label', {}, 'Member (সদস্য)'), memberSelect),
    el('div', { className: 'form-group' }, el('label', {}, 'Amount (টাকা ৳)'), amountInput),
    el('div', { className: 'form-group' }, el('label', {}, 'Deposit Date (তারিখ)'), dateInput),
    el('div', { className: 'form-group' }, el('label', {}, 'Category (ধরন)'), catSelect),
    el('div', { className: 'form-group' }, el('label', {}, 'Payment Reference / Note'), notesInput)
  ], async () => {
    await api(`/api/months/${currentMonthId}/deposits`, 'POST', {
      member_id: parseInt(memberSelect.value, 10),
      amount: parseFloat(amountInput.value),
      deposit_date: dateInput.value,
      category: catSelect.value,
      notes: notesInput.value
    });
    showToast('Deposit recorded successfully!', 'success');
    await refreshSettlement();
  });
}

// Add Extra Expense Modal
function openAddExtraModal() {
  const titleInput = el('input', { type: 'text', className: 'form-control', placeholder: 'e.g. Wi-Fi Bill, Electricity, Maid Salary' });
  const catSelect = el('select', { className: 'form-control' },
    el('option', { value: 'bibidh' }, 'Bibidh / Miscellaneous (বিবিধ - Shared)'),
    el('option', { value: 'utility' }, 'Utility Bill (বিদ্যুৎ, গ্যাস, পানি, নেট)'),
    el('option', { value: 'cleaning' }, 'Cleaning / Cook Maid (বুয়া / খালা)'),
    el('option', { value: 'other' }, 'Other Expense')
  );
  const amountInput = el('input', { type: 'number', step: '0.01', min: '1', className: 'form-control', placeholder: 'Amount in ৳' });
  const paidBySelect = el('select', { className: 'form-control' },
    el('option', { value: '' }, 'Mess Fund (মেস ফান্ড থেকে)')
  );
  currentMembers.forEach(m => {
    paidBySelect.appendChild(el('option', { value: m.id }, `Paid by ${m.name}`));
  });

  const notesInput = el('input', { type: 'text', className: 'form-control', placeholder: 'Notes / receipt info' });

  openModal('Add Shared Extra / Utility Expense', [
    el('div', { className: 'form-group' }, el('label', {}, 'Expense Title (খরচের বিবরণ)'), titleInput),
    el('div', { className: 'form-group' }, el('label', {}, 'Category (ক্যাটাগরি)'), catSelect),
    el('div', { className: 'form-group' }, el('label', {}, 'Amount (টাকা ৳)'), amountInput),
    el('div', { className: 'form-group' }, el('label', {}, 'Paid By (কে পরিশোধ করেছে)'), paidBySelect),
    el('div', { className: 'form-group' }, el('label', {}, 'Notes'), notesInput)
  ], async () => {
    await api(`/api/months/${currentMonthId}/extra`, 'POST', {
      title: titleInput.value,
      category: catSelect.value,
      amount: parseFloat(amountInput.value),
      paid_by_member_id: paidBySelect.value ? parseInt(paidBySelect.value, 10) : null,
      notes: notesInput.value
    });
    showToast('Expense recorded!', 'success');
    await refreshSettlement();
  });
}

// Add Member Modal
function openAddMemberModal() {
  const nameInput = el('input', { type: 'text', className: 'form-control', placeholder: 'Member Name' });
  const roleSelect = el('select', { className: 'form-control' },
    el('option', { value: 'member' }, 'General Member'),
    el('option', { value: 'manager' }, 'Mess Manager'),
    el('option', { value: 'secretary' }, 'General Secretary')
  );
  const roomInput = el('input', { type: 'text', className: 'form-control', placeholder: 'Room Number (optional)' });
  const phoneInput = el('input', { type: 'text', className: 'form-control', placeholder: 'Mobile Phone (optional)' });

  openModal('Add New Mess Member', [
    el('div', { className: 'form-group' }, el('label', {}, 'Full Name (নাম)'), nameInput),
    el('div', { className: 'form-group' }, el('label', {}, 'Role (দায়িত্ব)'), roleSelect),
    el('div', { className: 'form-group' }, el('label', {}, 'Room No'), roomInput),
    el('div', { className: 'form-group' }, el('label', {}, 'Phone Number'), phoneInput)
  ], async () => {
    await api('/api/members', 'POST', {
      name: nameInput.value,
      role: roleSelect.value,
      room_no: roomInput.value,
      phone: phoneInput.value
    });
    showToast('Member added successfully!', 'success');
    await loadMembers();
    renderMemberTable();
    await refreshSettlement();
  });
}

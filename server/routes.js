const express = require('express');
const router = express.Router();
const { db } = require('./db');
const { calculateMonthSettlement } = require('./calculation');

// Helper: validation
function isValidId(val) {
  const num = parseInt(val, 10);
  return !isNaN(num) && num > 0;
}

function isValidAmount(val) {
  const num = parseFloat(val);
  return !isNaN(num) && num >= 0 && isFinite(num);
}

// -------------------------------------------------------------
// 1. SETTINGS
// -------------------------------------------------------------
router.get('/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load settings' });
  }
});

router.put('/settings', (req, res) => {
  try {
    const { mess_name, general_secretary, split_extra_equally, currency_symbol } = req.body;
    const name = String(mess_name || 'Bachelor Mess').slice(0, 100);
    const sec = String(general_secretary || 'Pawan').slice(0, 100);
    const split = split_extra_equally ? 1 : 0;
    const cur = String(currency_symbol || '৳').slice(0, 10);

    db.prepare(`
      UPDATE settings 
      SET mess_name = ?, general_secretary = ?, split_extra_equally = ?, currency_symbol = ?, updated_at = datetime('now')
      WHERE id = 1
    `).run(name, sec, split, cur);

    const updated = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// -------------------------------------------------------------
// 2. MEMBERS
// -------------------------------------------------------------
router.get('/members', (req, res) => {
  try {
    const members = db.prepare('SELECT * FROM members ORDER BY display_order ASC, name ASC').all();
    res.json({ success: true, data: members });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load members' });
  }
});

router.post('/members', (req, res) => {
  try {
    const { name, phone, room_no, role, is_active } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Member name is required' });
    }
    const cleanName = name.trim().slice(0, 60);
    const cleanPhone = phone ? String(phone).slice(0, 30) : null;
    const cleanRoom = room_no ? String(room_no).slice(0, 20) : null;
    const cleanRole = (role === 'manager' || role === 'secretary') ? role : 'member';
    const active = is_active !== false && is_active !== 0 ? 1 : 0;

    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM members').get();
    const order = countRow ? countRow.cnt + 1 : 1;

    const result = db.prepare(`
      INSERT INTO members (name, phone, room_no, role, is_active, display_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(cleanName, cleanPhone, cleanRoom, cleanRole, active, order);

    const newMember = db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: newMember });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ success: false, error: 'A member with this name already exists' });
    }
    res.status(500).json({ success: false, error: 'Failed to add member' });
  }
});

router.put('/members/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!isValidId(id)) return res.status(400).json({ success: false, error: 'Invalid member ID' });

    const { name, phone, room_no, role, is_active, display_order } = req.body;
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    if (!member) return res.status(404).json({ success: false, error: 'Member not found' });

    const cleanName = name ? String(name).trim().slice(0, 60) : member.name;
    const cleanPhone = phone !== undefined ? String(phone).slice(0, 30) : member.phone;
    const cleanRoom = room_no !== undefined ? String(room_no).slice(0, 20) : member.room_no;
    const cleanRole = role !== undefined ? role : member.role;
    const active = is_active !== undefined ? (is_active ? 1 : 0) : member.is_active;
    const order = display_order !== undefined ? parseInt(display_order, 10) : member.display_order;

    db.prepare(`
      UPDATE members 
      SET name = ?, phone = ?, room_no = ?, role = ?, is_active = ?, display_order = ?
      WHERE id = ?
    `).run(cleanName, cleanPhone, cleanRoom, cleanRole, active, order, id);

    const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update member' });
  }
});

router.delete('/members/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!isValidId(id)) return res.status(400).json({ success: false, error: 'Invalid member ID' });

    db.prepare('DELETE FROM members WHERE id = ?').run(id);
    res.json({ success: true, message: 'Member deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete member' });
  }
});

// -------------------------------------------------------------
// 3. MONTHS & SETTLEMENT
// -------------------------------------------------------------
router.get('/months', (req, res) => {
  try {
    const months = db.prepare('SELECT * FROM months ORDER BY id ASC').all();
    res.json({ success: true, data: months });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load months' });
  }
});

router.post('/months', (req, res) => {
  try {
    const { year, monthNum, opening_fund, fund_adjustment } = req.body;
    const y = parseInt(year, 10);
    const m = parseInt(monthNum, 10);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12 || y < 2020 || y > 2050) {
      return res.status(400).json({ success: false, error: 'Invalid year or month' });
    }

    const monthId = `${y}-${String(m).padStart(2, '0')}`;
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const name = `${monthNames[m - 1]}-${y}`;
    const daysInMonth = new Date(y, m, 0).getDate();
    const openFund = isValidAmount(opening_fund) ? parseFloat(opening_fund) : 0;
    const adj = !isNaN(parseFloat(fund_adjustment)) ? parseFloat(fund_adjustment) : 0;

    db.prepare(`
      INSERT INTO months (id, name, year, month_num, days_in_month, opening_fund, fund_adjustment)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        days_in_month = excluded.days_in_month
    `).run(monthId, name, y, m, daysInMonth, openFund, adj);

    const month = db.prepare('SELECT * FROM months WHERE id = ?').get(monthId);
    res.status(201).json({ success: true, data: month });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create month' });
  }
});

router.put('/months/:id', (req, res) => {
  try {
    const monthId = req.params.id;
    const { opening_fund, fund_adjustment, is_closed } = req.body;

    const month = db.prepare('SELECT * FROM months WHERE id = ?').get(monthId);
    if (!month) return res.status(404).json({ success: false, error: 'Month not found' });

    const openFund = isValidAmount(opening_fund) ? parseFloat(opening_fund) : month.opening_fund;
    const adj = !isNaN(parseFloat(fund_adjustment)) ? parseFloat(fund_adjustment) : month.fund_adjustment;
    const closed = is_closed !== undefined ? (is_closed ? 1 : 0) : month.is_closed;

    db.prepare(`
      UPDATE months 
      SET opening_fund = ?, fund_adjustment = ?, is_closed = ?
      WHERE id = ?
    `).run(openFund, adj, closed, monthId);

    const updated = db.prepare('SELECT * FROM months WHERE id = ?').get(monthId);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update month' });
  }
});

router.get('/months/:id/settlement', (req, res) => {
  try {
    const monthId = req.params.id;
    const settlement = calculateMonthSettlement(monthId);
    if (!settlement) {
      return res.status(404).json({ success: false, error: 'Month not found' });
    }
    res.json({ success: true, data: settlement });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Calculation failed' });
  }
});

// -------------------------------------------------------------
// 4. DAILY MEALS & MANUAL MEALS
// -------------------------------------------------------------
router.get('/months/:id/meals', (req, res) => {
  try {
    const monthId = req.params.id;
    const month = db.prepare('SELECT * FROM months WHERE id = ?').get(monthId);
    if (!month) return res.status(404).json({ success: false, error: 'Month not found' });

    const members = db.prepare('SELECT id, name, is_active FROM members ORDER BY display_order ASC, name ASC').all();
    const daily = db.prepare('SELECT * FROM daily_meals WHERE month_id = ?').all(monthId);
    const manual = db.prepare('SELECT * FROM member_manual_meals WHERE month_id = ?').all(monthId);

    res.json({
      success: true,
      data: {
        month,
        members,
        daily,
        manual
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load meals' });
  }
});

router.post('/months/:id/meals/daily', (req, res) => {
  try {
    const monthId = req.params.id;
    const { member_id, day, meal_count, breakfast, lunch, dinner } = req.body;

    const mId = parseInt(member_id, 10);
    const d = parseInt(day, 10);
    const count = parseFloat(meal_count || 0);

    if (!isValidId(mId) || isNaN(d) || d < 1 || d > 31 || count < 0) {
      return res.status(400).json({ success: false, error: 'Invalid meal entry parameters' });
    }

    const b = isValidAmount(breakfast) ? parseFloat(breakfast) : 0;
    const l = isValidAmount(lunch) ? parseFloat(lunch) : 0;
    const dn = isValidAmount(dinner) ? parseFloat(dinner) : 0;

    db.prepare(`
      INSERT INTO daily_meals (month_id, member_id, day, breakfast, lunch, dinner, meal_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(month_id, member_id, day) DO UPDATE SET
        breakfast = excluded.breakfast,
        lunch = excluded.lunch,
        dinner = excluded.dinner,
        meal_count = excluded.meal_count
    `).run(monthId, mId, d, b, l, dn, count);

    res.json({ success: true, message: 'Meal count updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update daily meal' });
  }
});

router.post('/months/:id/meals/manual', (req, res) => {
  try {
    const monthId = req.params.id;
    const { member_id, manual_meals } = req.body;
    const mId = parseInt(member_id, 10);
    const meals = parseFloat(manual_meals);

    if (!isValidId(mId) || isNaN(meals) || meals < 0) {
      return res.status(400).json({ success: false, error: 'Invalid manual meal count' });
    }

    db.prepare(`
      INSERT INTO member_manual_meals (month_id, member_id, manual_meals)
      VALUES (?, ?, ?)
      ON CONFLICT(month_id, member_id) DO UPDATE SET manual_meals = excluded.manual_meals
    `).run(monthId, mId, meals);

    res.json({ success: true, message: 'Manual meal count updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update manual meals' });
  }
});

// -------------------------------------------------------------
// 5. BAZAR ENTRIES
// -------------------------------------------------------------
router.get('/months/:id/bazar', (req, res) => {
  try {
    const monthId = req.params.id;
    const rows = db.prepare(`
      SELECT b.*, m.name as member_name
      FROM bazar_entries b
      JOIN members m ON b.member_id = m.id
      WHERE b.month_id = ?
      ORDER BY b.id ASC
    `).all(monthId);

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load bazar records' });
  }
});

router.post('/months/:id/bazar', (req, res) => {
  try {
    const monthId = req.params.id;
    const { date_str, member_id, amount, meals_during_period, description } = req.body;

    const mId = parseInt(member_id, 10);
    const amt = parseFloat(amount);
    if (!isValidId(mId) || !isValidAmount(amt) || amt <= 0) {
      return res.status(400).json({ success: false, error: 'Valid member and amount greater than 0 required' });
    }

    const dateClean = String(date_str || new Date().toISOString().slice(0, 10)).slice(0, 50);
    const meals = isValidAmount(meals_during_period) ? parseFloat(meals_during_period) : 0;
    const desc = description ? String(description).slice(0, 200) : null;

    const result = db.prepare(`
      INSERT INTO bazar_entries (month_id, date_str, member_id, amount, meals_during_period, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(monthId, dateClean, mId, amt, meals, desc);

    const newEntry = db.prepare(`
      SELECT b.*, m.name as member_name
      FROM bazar_entries b
      JOIN members m ON b.member_id = m.id
      WHERE b.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ success: true, data: newEntry });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to add bazar entry' });
  }
});

router.delete('/bazar/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!isValidId(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    db.prepare('DELETE FROM bazar_entries WHERE id = ?').run(id);
    res.json({ success: true, message: 'Bazar entry deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete bazar entry' });
  }
});

// -------------------------------------------------------------
// 6. DEPOSITS
// -------------------------------------------------------------
router.get('/months/:id/deposits', (req, res) => {
  try {
    const monthId = req.params.id;
    const rows = db.prepare(`
      SELECT d.*, m.name as member_name
      FROM deposits d
      JOIN members m ON d.member_id = m.id
      WHERE d.month_id = ?
      ORDER BY d.deposit_date ASC, d.id ASC
    `).all(monthId);

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load deposits' });
  }
});

router.post('/months/:id/deposits', (req, res) => {
  try {
    const monthId = req.params.id;
    const { member_id, amount, deposit_date, category, notes } = req.body;

    const mId = parseInt(member_id, 10);
    const amt = parseFloat(amount);
    if (!isValidId(mId) || !isValidAmount(amt) || amt <= 0) {
      return res.status(400).json({ success: false, error: 'Valid member and deposit amount required' });
    }

    const dateClean = String(deposit_date || new Date().toISOString().slice(0, 10)).slice(0, 30);
    const cat = (category === 'advance' || category === 'extra_payment') ? category : 'deposit';
    const noteClean = notes ? String(notes).slice(0, 200) : null;

    const result = db.prepare(`
      INSERT INTO deposits (month_id, member_id, amount, deposit_date, category, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(monthId, mId, amt, dateClean, cat, noteClean);

    const newDep = db.prepare(`
      SELECT d.*, m.name as member_name
      FROM deposits d
      JOIN members m ON d.member_id = m.id
      WHERE d.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ success: true, data: newDep });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to record deposit' });
  }
});

router.delete('/deposits/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!isValidId(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    db.prepare('DELETE FROM deposits WHERE id = ?').run(id);
    res.json({ success: true, message: 'Deposit deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete deposit' });
  }
});

// -------------------------------------------------------------
// 7. EXTRA & UTILITY EXPENSES
// -------------------------------------------------------------
router.get('/months/:id/extra', (req, res) => {
  try {
    const monthId = req.params.id;
    const rows = db.prepare(`
      SELECT e.*, m.name as paid_by_name
      FROM extra_expenses e
      LEFT JOIN members m ON e.paid_by_member_id = m.id
      WHERE e.month_id = ?
      ORDER BY e.id ASC
    `).all(monthId);

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load extra expenses' });
  }
});

router.post('/months/:id/extra', (req, res) => {
  try {
    const monthId = req.params.id;
    const { title, category, amount, date_str, paid_by_member_id, notes } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Expense title is required' });
    }
    const amt = parseFloat(amount);
    if (!isValidAmount(amt) || amt <= 0) {
      return res.status(400).json({ success: false, error: 'Valid amount required' });
    }

    const tClean = String(title).trim().slice(0, 100);
    const catClean = String(category || 'bibidh').slice(0, 30);
    const dateClean = date_str ? String(date_str).slice(0, 30) : null;
    const paidBy = isValidId(paid_by_member_id) ? parseInt(paid_by_member_id, 10) : null;
    const noteClean = notes ? String(notes).slice(0, 200) : null;

    const result = db.prepare(`
      INSERT INTO extra_expenses (month_id, title, category, amount, date_str, paid_by_member_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(monthId, tClean, catClean, amt, dateClean, paidBy, noteClean);

    const newExpense = db.prepare(`
      SELECT e.*, m.name as paid_by_name
      FROM extra_expenses e
      LEFT JOIN members m ON e.paid_by_member_id = m.id
      WHERE e.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ success: true, data: newExpense });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to add extra expense' });
  }
});

router.delete('/extra/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!isValidId(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    db.prepare('DELETE FROM extra_expenses WHERE id = ?').run(id);
    res.json({ success: true, message: 'Expense deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete expense' });
  }
});

module.exports = router;

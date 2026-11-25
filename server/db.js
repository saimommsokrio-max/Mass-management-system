const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const isVercel = !!process.env.VERCEL;
let dbPath;

if (isVercel) {
  dbPath = path.join('/tmp', 'mess.db');
  const bundledDb = path.join(__dirname, '..', 'data', 'mess.db');
  if (!fs.existsSync(dbPath) && fs.existsSync(bundledDb)) {
    try {
      fs.copyFileSync(bundledDb, dbPath);
    } catch (e) {
      console.warn('Could not copy bundled DB to /tmp, starting fresh DB', e.message);
    }
  }
} else {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  dbPath = path.join(dataDir, 'mess.db');
}

const db = new DatabaseSync(dbPath);

// Enable Foreign Keys and WAL Mode
db.exec('PRAGMA foreign_keys = ON;');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      mess_name TEXT NOT NULL DEFAULT 'Bachelor Mess Management',
      general_secretary TEXT DEFAULT 'Pawan',
      split_extra_equally INTEGER NOT NULL DEFAULT 1,
      currency_symbol TEXT NOT NULL DEFAULT '৳',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO settings (id, mess_name, general_secretary, split_extra_equally, currency_symbol)
    VALUES (1, 'Bachelor Mess Management', 'Pawan', 1, '৳');

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT,
      room_no TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      role TEXT NOT NULL DEFAULT 'member', -- 'manager', 'secretary', 'member'
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS months (
      id TEXT PRIMARY KEY, -- e.g. '2026-10'
      name TEXT NOT NULL,  -- e.g. 'October-2026'
      year INTEGER NOT NULL,
      month_num INTEGER NOT NULL,
      days_in_month INTEGER NOT NULL,
      opening_fund REAL NOT NULL DEFAULT 0,
      fund_adjustment REAL NOT NULL DEFAULT 0,
      notes TEXT,
      is_closed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_id TEXT NOT NULL REFERENCES months(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      day INTEGER NOT NULL CHECK (day >= 1 AND day <= 31),
      breakfast REAL NOT NULL DEFAULT 0,
      lunch REAL NOT NULL DEFAULT 0,
      dinner REAL NOT NULL DEFAULT 0,
      meal_count REAL NOT NULL DEFAULT 0,
      UNIQUE(month_id, member_id, day)
    );

    CREATE TABLE IF NOT EXISTS member_manual_meals (
      month_id TEXT NOT NULL REFERENCES months(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      manual_meals REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (month_id, member_id)
    );

    CREATE TABLE IF NOT EXISTS bazar_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_id TEXT NOT NULL REFERENCES months(id) ON DELETE CASCADE,
      date_str TEXT NOT NULL, -- e.g. "2026-10-03" or "3,4,5"
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      amount REAL NOT NULL CHECK (amount >= 0),
      meals_during_period REAL NOT NULL DEFAULT 0,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_id TEXT NOT NULL REFERENCES months(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      amount REAL NOT NULL CHECK (amount >= 0),
      deposit_date TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'deposit', -- 'deposit', 'advance', 'extra_payment'
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS extra_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_id TEXT NOT NULL REFERENCES months(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other', -- 'utility', 'bibidh', 'cleaning', 'rent', 'wifi', 'other'
      amount REAL NOT NULL CHECK (amount >= 0),
      date_str TEXT,
      paid_by_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_meals_month ON daily_meals(month_id);
    CREATE INDEX IF NOT EXISTS idx_bazar_month ON bazar_entries(month_id);
    CREATE INDEX IF NOT EXISTS idx_deposits_month ON deposits(month_id);
    CREATE INDEX IF NOT EXISTS idx_extra_month ON extra_expenses(month_id);
  `);
}

initSchema();

module.exports = {
  db,
  initSchema
};

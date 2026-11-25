const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const { db, initSchema } = require('./db');

function importWorkbook(filePath) {
  console.log(`Importing from ${filePath}...`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  initSchema();

  const zip = new AdmZip(filePath);

  // 1. Shared Strings
  const sstEntry = zip.getEntry('xl/sharedStrings.xml');
  let sst = [];
  if (sstEntry) {
    const sstXml = sstEntry.getData().toString('utf8');
    const matches = sstXml.match(/<si>(.*?)<\/si>/gs) || [];
    sst = matches.map(m => {
      const t = m.match(/<t[^>]*>(.*?)<\/t>/gs);
      if (!t) return '';
      return t.map(x => x.replace(/<[^>]+>/g, '')).join('');
    });
  }

  // 2. Workbook sheet mapping
  const wbXml = zip.getEntry('xl/workbook.xml').getData().toString('utf8');
  const relsXml = zip.getEntry('xl/_rels/workbook.xml.rels').getData().toString('utf8');

  // Extract sheet id -> r:id -> target
  const relsMap = {};
  const relMatches = relsXml.match(/<Relationship [^>]+>/g) || [];
  for (const r of relMatches) {
    const id = (r.match(/Id="([^"]+)"/) || [])[1];
    const target = (r.match(/Target="([^"]+)"/) || [])[1];
    if (id && target) {
      relsMap[id] = target.replace(/^worksheets\//, '');
    }
  }

  const sheetMatches = wbXml.match(/<sheet [^>]+>/g) || [];
  const sheets = [];
  for (const s of sheetMatches) {
    const name = (s.match(/name="([^"]+)"/) || [])[1];
    const sheetId = (s.match(/sheetId="([^"]+)"/) || [])[1];
    const rId = (s.match(/r:id="([^"]+)"/) || [])[1];
    const fileName = relsMap[rId] || `sheet${sheetId}.xml`;
    sheets.push({ name, sheetId, fileName });
  }

  function parseRows(entryPath) {
    const entry = zip.getEntry('xl/' + entryPath) || zip.getEntry('xl/worksheets/' + entryPath);
    if (!entry) return [];
    const xml = entry.getData().toString('utf8');
    const rowMatches = xml.match(/<row [^>]+>.*?<\/row>/gs) || [];
    const rows = [];
    for (const r of rowMatches) {
      const rNum = parseInt((r.match(/r="(\d+)"/) || [])[1]);
      const cMatches = r.match(/<c [^>]+>(.*?)<\/c>/gs) || [];
      const cellMap = {};
      for (const c of cMatches) {
        const cellRef = (c.match(/r="([A-Z0-9]+)"/) || [])[1];
        const col = cellRef.replace(/[0-9]/g, '');
        const isString = c.includes('t="s"');
        const valMatch = c.match(/<v>(.*?)<\/v>/);
        let val = valMatch ? valMatch[1] : '';
        if (isString && sst[parseInt(val)] !== undefined) {
          val = sst[parseInt(val)];
        }
        cellMap[col] = val;
      }
      rows.push({ rowNum: rNum, cells: cellMap });
    }
    return rows;
  }

  // 3. Process "Setup" sheet
  const setupSheet = sheets.find(s => s.name.toLowerCase() === 'setup');
  let generalSecretary = 'Pawan';
  let splitExtra = 1;
  const memberList = [];

  if (setupSheet) {
    const setupRows = parseRows(setupSheet.fileName);
    for (const r of setupRows) {
      if (r.cells.A && r.cells.A.includes('General Secretary')) {
        generalSecretary = r.cells.B ? r.cells.B.trim() : 'Pawan';
      }
      if (r.cells.A && r.cells.A.includes('Extra (Bibidh)')) {
        splitExtra = (r.cells.B && r.cells.B.trim().toLowerCase() === 'no') ? 0 : 1;
      }
      // Member rows (Row 9-20)
      if (r.rowNum >= 9 && r.rowNum <= 20) {
        const name = r.cells.B ? r.cells.B.trim() : '';
        const active = r.cells.C ? r.cells.C.trim().toLowerCase() === 'yes' : false;
        if (name) {
          memberList.push({
            name,
            isActive: active ? 1 : 0,
            displayOrder: r.rowNum - 8,
            role: name.toLowerCase() === generalSecretary.toLowerCase() ? 'secretary' : 'member'
          });
        }
      }
    }
  }

  // Save Settings
  db.prepare(`
    UPDATE settings 
    SET general_secretary = ?, split_extra_equally = ?, updated_at = datetime('now')
    WHERE id = 1
  `).run(generalSecretary, splitExtra);

  // Save Members
  const insertMemberStmt = db.prepare(`
    INSERT INTO members (name, role, is_active, display_order)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      role = excluded.role,
      is_active = excluded.is_active,
      display_order = excluded.display_order
  `);

  for (const m of memberList) {
    insertMemberStmt.run(m.name, m.role, m.isActive, m.displayOrder);
  }

  console.log(`Imported ${memberList.length} members. General Secretary: ${generalSecretary}`);

  // Fetch saved member map
  const memberRows = db.prepare('SELECT id, name FROM members').all();
  const memberMap = {};
  for (const m of memberRows) {
    memberMap[m.name.toLowerCase()] = m.id;
  }

  // 4. Process Monthly sheets
  const monthRegex = /^([A-Za-z]{3})-(\d{4})$/;
  const monthNameMap = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };

  const insertMonthStmt = db.prepare(`
    INSERT INTO months (id, name, year, month_num, days_in_month, opening_fund, fund_adjustment)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      opening_fund = excluded.opening_fund,
      fund_adjustment = excluded.fund_adjustment
  `);

  const insertBazarStmt = db.prepare(`
    INSERT INTO bazar_entries (month_id, date_str, member_id, amount, meals_during_period, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertManualMealsStmt = db.prepare(`
    INSERT INTO member_manual_meals (month_id, member_id, manual_meals)
    VALUES (?, ?, ?)
    ON CONFLICT(month_id, member_id) DO UPDATE SET manual_meals = excluded.manual_meals
  `);

  const insertExtraStmt = db.prepare(`
    INSERT INTO extra_expenses (month_id, title, category, amount, date_str, paid_by_member_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const sheet of sheets) {
    const match = sheet.name.match(monthRegex);
    if (!match) continue;

    const monStr = match[1].toLowerCase();
    const year = parseInt(match[2]);
    const monthNum = monthNameMap[monStr];
    if (!monthNum) continue;

    const monthId = `${year}-${String(monthNum).padStart(2, '0')}`;
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    const mRows = parseRows(sheet.fileName);
    if (mRows.length === 0) continue;

    // Check Opening Fund & Adjustment
    let openingFund = 0;
    let fundAdj = 0;
    for (const r of mRows) {
      if (r.cells.A && r.cells.A.includes('Opening fund')) {
        openingFund = parseFloat(r.cells.B || '0') || 0;
      }
      if (r.cells.A && r.cells.A.includes('adjustment')) {
        fundAdj = parseFloat(r.cells.B || '0') || 0;
      }
    }

    insertMonthStmt.run(monthId, `${match[1]}-${year}`, year, monthNum, daysInMonth, openingFund, fundAdj);

    // Clean existing entries for this month before re-importing
    db.prepare('DELETE FROM bazar_entries WHERE month_id = ?').run(monthId);
    db.prepare('DELETE FROM member_manual_meals WHERE month_id = ?').run(monthId);
    db.prepare('DELETE FROM extra_expenses WHERE month_id = ?').run(monthId);

    // Member meal column mapping from Row 35 or Setup
    // Headers in row 35: A=Day, B=Member1, C=Member2, etc.
    const row35 = mRows.find(r => r.rowNum === 35);
    const colToMember = {};
    if (row35) {
      for (const [col, val] of Object.entries(row35.cells)) {
        if (col === 'A') continue;
        const name = val ? val.trim().toLowerCase() : '';
        if (name && memberMap[name]) {
          colToMember[col] = memberMap[name];
        }
      }
    } else {
      // Fallback to display order
      const cols = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
      memberList.forEach((m, idx) => {
        if (cols[idx] && memberMap[m.name.toLowerCase()]) {
          colToMember[cols[idx]] = memberMap[m.name.toLowerCase()];
        }
      });
    }

    // Manual total meals (Row 67)
    const row67 = mRows.find(r => r.rowNum === 67);
    if (row67) {
      for (const [col, memberId] of Object.entries(colToMember)) {
        const val = parseFloat(row67.cells[col] || '0') || 0;
        if (val > 0) {
          insertManualMealsStmt.run(monthId, memberId, val);
        }
      }
    }

    // Bazar Rows (73-92)
    for (const r of mRows) {
      if (r.rowNum >= 73 && r.rowNum <= 92) {
        const dateStr = r.cells.A ? r.cells.A.trim() : '';
        const byName = r.cells.B ? r.cells.B.trim() : '';
        const amount = parseFloat(r.cells.C || '0') || 0;
        const mealsPeriod = parseFloat(r.cells.D || '0') || 0;

        if (amount > 0 && byName) {
          const memberId = memberMap[byName.toLowerCase()];
          if (memberId) {
            insertBazarStmt.run(monthId, dateStr || 'Bazar', memberId, amount, mealsPeriod, `Bazar by ${byName}`);
          }
        }
      }
    }

    // Extra / Bibidh Rows (99-113)
    for (const r of mRows) {
      if (r.rowNum >= 99 && r.rowNum <= 113) {
        const name = r.cells.A ? r.cells.A.trim() : '';
        const amount = parseFloat(r.cells.B || '0') || 0;
        const remark = r.cells.C ? r.cells.C.trim() : '';
        const dateStr = r.cells.D ? r.cells.D.trim() : '';

        if (amount > 0 && name) {
          const memberId = memberMap[name.toLowerCase()] || null;
          insertExtraStmt.run(
            monthId,
            remark || 'Extra (Bibidh)',
            'bibidh',
            amount,
            dateStr || null,
            memberId,
            `Paid by ${name}`
          );
        }
      }
    }

    // Accessories / Utility bills (Rows 119-126)
    for (const r of mRows) {
      if (r.rowNum >= 119 && r.rowNum <= 126) {
        const title = r.cells.A ? r.cells.A.trim() : '';
        const amount = parseFloat(r.cells.E || r.cells.C || r.cells.B || '0') || 0;
        if (title && title.toLowerCase() !== 'other' && amount > 0) {
          insertExtraStmt.run(
            monthId,
            title,
            'utility',
            amount,
            null,
            null,
            `Accessories: ${title}`
          );
        }
      }
    }

    console.log(`Imported month tab: ${sheet.name} (${monthId})`);
  }

  console.log('Excel import completed successfully.');
}

if (require.main === module) {
  const excelFile = path.join(__dirname, '..', 'Mess_Management_System (1).xlsx');
  importWorkbook(excelFile);
}

module.exports = { importWorkbook };

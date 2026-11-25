# 🏢 Smart Mess Management System (মেস ম্যানেজমেন্ট সিস্টেম)

A modern, fast, secure, and mobile-friendly Full-Stack Web Application designed specifically for bachelor flats, hostels, and shared mess living in Bangladesh and South Asia.

Built to replicate and enhance the workflow of your `Mess_Management_System (1).xlsx` spreadsheet with zero-latency automated calculations, interactive daily meal logging, market/bazar expense tracking, member deposits, and instant printable/PDF monthly settlement statements.

---

## 🌟 Key Features

1. **📊 Live Dashboard & Auto-Balancing Settlement**:
   - **Meal Rate (খাবার রেট)**: Automatically calculated as `Total Bazar Cost ÷ Total Meals Consumed`.
   - **Member Net Balance**: 
     $$\text{Net Balance} = (\text{Bazar Credit} + \text{Deposits} + \text{Extra Paid}) - (\text{Member Meals} \times \text{Meal Rate} + \text{Extra Share})$$
   - **Clear Status Badges**:
     - 🟢 **Pabe (পাবে / Receive)**: Member gets refund from mess fund.
     - 🔴 **Dibe (দিবে / Pay)**: Member owes money to mess fund.
     - ⚪ **Settled**: Balance is zero.
   - **Auto-Balancing Check**: Built-in verification guaranteeing $\sum \text{Net Balances} = ৳0.00$.

2. **🍚 Interactive Daily Meal Tracker (দৈনিক মিল খাতা)**:
   - Full 1 to 31 day matrix for all members.
   - Quick numeric inputs supporting decimals (e.g., `1`, `1.5`, `2`, `3`).
   - Real-time row-by-row daily totals and member column totals.
   - **Manual Total Mode**: Option to enter total monthly meals directly per member if daily breakdown is not maintained.

3. **🛒 Bazar / Market Purchase Tracker (বাজার খরচ)**:
   - Record who shopped, the total amount spent, date/day range (e.g. `3,4,5`), and meals during that period.
   - Computes period-specific meal rates.

4. **💵 Member Deposits (মেস জমা / অগ্রিম)**:
   - Record advance cash, bKash, or Nagad deposits given by members to the manager.

5. **💡 Shared Extra & Utility Expenses (বিবিধ ও বিল)**:
   - Track shared costs like Electricity Bill, Gas Bill, Wi-Fi, Water jars, Maid/Cook salary, Spices, etc.
   - Auto-distributed equally among active members or paid out of mess fund.

6. **👥 Member Management & Role Delegation**:
   - Add/edit members, toggle Active/Inactive status.
   - Designate General Secretary / Mess Manager (e.g., Pawan).

7. **🖨️ Print & PDF Export**:
   - One-click print-ready statement formatted cleanly for A4 paper and PDF saving.

8. **🌓 Dark / Light Mode**:
   - Beautiful responsive UI with dark/light mode toggle that works seamlessly on mobile phones and desktops.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18+ or v24+)

### 1. Start the Application
Run the following command in the terminal:
```bash
npm start
```
The server will start at:
```
http://127.0.0.1:3000
```
Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser!

### 2. Run Tests
To verify all calculations and API endpoints:
```bash
npm test
```

### 3. Re-import Data from Excel (Optional)
To re-seed or update data from `Mess_Management_System (1).xlsx`:
```bash
npm run seed
```

---

## 📂 Project Architecture

```
mass management system/
├── data/
│   └── mess.db               # SQLite database (ACID compliant, zero config)
├── public/                   # Frontend Web Application
│   ├── index.html            # Responsive UI layout
│   ├── css/style.css         # Modern styling, print rules, dark mode
│   └── js/app.js             # Reactive controller & safe DOM rendering
├── server/                   # Backend API Engine
│   ├── index.js              # Express server with Helmet security headers
│   ├── db.js                 # SQLite schema & database manager
│   ├── routes.js             # REST API routes (Settings, Members, Meals, Bazar, Settlements)
│   ├── calculation.js        # Mathematical settlement engine
│   ├── importExcel.js        # Excel workbook parser
│   └── test.js               # Comprehensive test suite
├── Mess_Management_System (1).xlsx # Original Excel spreadsheet
├── package.json
└── README.md
```

---

## 🔒 Security Standards Implemented
- Strict input parameterization preventing SQL injection (`node:sqlite`).
- Strict Helmet-based Content Security Policy (CSP).
- Native DOM text escaping against XSS.
- Localhost binding on `127.0.0.1` preventing unauthorized network exposure.

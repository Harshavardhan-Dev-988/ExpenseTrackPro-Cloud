# 💰 Expense Tracker Dashboard

A comprehensive React-based expense tracking application with analytics, visualizations, and data export capabilities.

## 🚀 Features

### ✅ Completed Features

- **Expense Management**
  - Add expenses manually with detailed form
  - Bulk import from CSV, Excel, or JSON files
  - View expenses in a sortable table
  - Edit and delete expenses
  - Tag expenses for better organization

- **Data Visualization**
  - Pie chart for category distribution
  - Line chart for monthly spending trends
  - Bar chart for payment method breakdown
  - Real-time chart updates

- **Analytics**
  - Total expenses tracking
  - Average expense calculation
  - Top spending categories
  - Transaction count
  - Category-wise statistics

- **Data Export**
  - Export to CSV format
  - Export to Excel (.xlsx)
  - Export to JSON
  - Export summary statistics

- **Storage**
  - IndexedDB for offline storage
  - No server required
  - All data stored locally in browser

- **UI/UX**
  - Dark mode support
  - Responsive design
  - Modern, clean interface
  - Real-time updates

## 🏗️ Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite 8
- **Styling**: Tailwind CSS v4
- **Charts**: Recharts
- **Storage**: IndexedDB (via idb)
- **Data Processing**: papaparse, xlsx
- **Date Handling**: date-fns

## 📦 Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🎯 Usage

### Adding Expenses

1. Click the **"+ Add Expense"** button in the header
2. Fill in the expense details:
   - Date (defaults to today)
   - Amount (in ₹)
   - Category (28 categories available)
   - Payment method (cash, card, UPI, etc.)
   - Description
   - Tags (optional, comma-separated)
3. Click **"Add Expense"**

### Bulk Import

1. Click the **"Import Data"** button in the welcome screen
2. Select a CSV, Excel, or JSON file
3. Preview the first 10 rows
4. Click **"Upload Expenses"** to import

**CSV Format** (see `sample-expenses.csv`):
```csv
date,amount,category,description,paymentMethod,tags
2026-04-01,150.50,grocery,Weekly groceries,card,monthly,essential
```

**Required columns**: date, amount, category, description
**Optional columns**: paymentMethod, tags

### Exporting Data

Click the **"📥 Export"** button in the header and choose:
- **CSV**: Spreadsheet format, opens in Excel
- **Excel**: Native .xlsx format
- **JSON**: For programmatic use
- **Summary**: Statistics report in CSV format

### Available Categories (28 total)

**Food & Dining**: grocery, dine_out, coffee_snacks
**Transportation**: fuel, public_transport, vehicle_maintenance
**Bills & Utilities**: bills_power, bills_wifi, bills_mobile, bills_water, rent_mortgage
**Lifestyle**: shopping_clothes, shopping_electronics, entertainment, subscriptions, personal_care, fitness_gym
**Medical**: medical_consultation, medical_medicines, medical_tests, medical_hospitalization, medical_insurance
**Gifting & Donations**: gifting_personal, gifting_festivals, donations_charity
**Agriculture**: agri_seeds_fertilizers, agri_equipment, agri_irrigation, agri_livestock, agri_labor, agri_land_lease, agri_crop_insurance, agri_loan_interest, agri_storage_transport, agri_other
**Education**: education
**Travel**: travel_vacation
**Financial & Others**: insurance_general, investments_savings, pets, household_maintenance, other

## 📊 Dashboard Components

### Summary Cards
- **Total Expenses**: Sum of all expense amounts
- **Total Transactions**: Number of expense entries
- **Average Expense**: Mean transaction amount

### Charts
- **Category Pie Chart**: Visual breakdown by category with percentages
- **Monthly Trend**: 12-month spending history with averages
- **Payment Method Bar Chart**: Spending by payment type

### Expense List
- Sortable table with all expenses
- Shows date, amount, category, payment method
- Edit and delete options for each expense
- Tags displayed as chips

## 🗂️ Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── charts/          # Chart components
│   │   ├── expenses/        # Expense list
│   │   ├── export/          # Export menu
│   │   └── forms/           # Forms (Add, Bulk Upload)
│   ├── hooks/               # Custom React hooks
│   ├── services/            # Business logic
│   ├── types/               # TypeScript interfaces
│   └── utils/               # Utilities & constants
├── sample-expenses.csv      # Sample data for testing
└── README.md               # This file
```

## 💾 Data Storage

All data is stored locally in your browser using IndexedDB:
- **Database**: ExpenseTrackerDB
- **No server required**
- **Data persists across sessions**

### Backup Your Data
Use the **Export** feature regularly to backup your data.

## 🐛 Troubleshooting

### Charts not showing
- Make sure you have added some expenses
- Charts only display when expenses exist

### Import failing
- Check CSV format matches the example
- Ensure date format is yyyy-mm-dd
- Amount should be a number (no currency symbols)
- Category must be one of the 28 valid categories

### Data not persisting
- Check browser storage permissions
- Try clearing browser cache and re-importing data
- Make sure you're not in private/incognito mode

---

**Built with ❤️ using React + TypeScript + Vite**

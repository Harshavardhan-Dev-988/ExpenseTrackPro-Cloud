# 💰 Savings Tracker Feature

## Overview
The Savings Tracker is a comprehensive feature that helps you track your savings, set financial goals, and gain insights into your financial health.

## Features

### 1. **Savings Tracking**
- Track all your savings across different categories
- Support for 18 savings categories including:
  - Emergency Fund
  - Retirement Savings
  - Mutual Funds, Stocks, Gold, Real Estate
  - Fixed Deposits (FD) & Recurring Deposits (RD)
  - PPF (Public Provident Fund)
  - NPS (National Pension System)
  - Education Fund, Travel Fund, Wedding Fund
  - Home Purchase, Vehicle Purchase
  - Business Investment
  - General Savings

### 2. **Savings Goals**
- Set savings goals with target amounts
- Track progress towards each goal
- Set priorities (Low, Medium, High, Critical)
- Optional deadline tracking
- Visual progress bars

### 3. **Insights & Analytics**

#### Key Metrics:
- **Total Savings**: Sum of all savings entries
- **Savings Rate**: Percentage of income saved (savings vs expenses)
- **Monthly Average**: Average savings per month
- **Net Cash Flow**: Difference between savings and expenses

#### Date Range Filters:
- All Time
- This Month
- This Year

### 4. **Account Tracking**
- Track which account/bank each saving is in
- Record interest rates for deposits
- Track maturity dates for FDs, RDs, etc.

## How to Use

### Adding Savings Entry
1. Click "Add Savings" button
2. Fill in the form:
   - **Date**: When you saved the money
   - **Amount**: How much you saved (in ₹)
   - **Category**: Type of savings (FD, Mutual Fund, etc.)
   - **Description**: What this saving is for
   - **Account** (optional): Bank/account name
   - **Interest Rate** (optional): Expected returns
3. Click "Add Savings"

### Creating Savings Goals
1. Click "Add Goal" button
2. Fill in the form:
   - **Goal Name**: e.g., "Emergency Fund", "New Car"
   - **Target Amount**: How much you want to save
   - **Category**: Type of savings
   - **Priority**: How important is this goal
   - **Deadline** (optional): Target date
3. Click "Add Goal"

### Understanding Insights

#### Savings Rate
- Shows what percentage of your total cash flow goes to savings
- Higher is better (aim for 20-30%)
- Formula: `(Total Savings / (Total Savings + Total Expenses)) × 100`

#### Net Cash Flow
- **Positive (Green)**: You're saving more than spending ✅
- **Negative (Red)**: You're spending more than saving ⚠️

## Sample Data

We've included `sample-savings.json` with example entries including:
- Emergency fund contributions
- SIP investments in mutual funds
- Fixed deposits
- PPF contributions
- Stock investments
- Gold purchases
- Retirement savings (NPS)

## Database Schema

### Savings Entry
```typescript
{
  id: string;                // Unique identifier
  date: Date;                // When you saved
  amount: number;            // Amount saved
  category: SavingsCategory; // Type of savings
  description: string;       // What it's for
  account?: string;          // Bank/account name
  interestRate?: number;     // Expected returns
  maturityDate?: Date;       // When it matures
  isRecurring?: boolean;     // Is it recurring (SIP)
  tags?: string[];           // Custom tags
}
```

### Savings Goal
```typescript
{
  id: string;
  name: string;              // Goal name
  targetAmount: number;      // Target to achieve
  currentAmount: number;     // How much saved
  deadline?: Date;           // Target date
  category: SavingsCategory;
  priority: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
}
```

## Tips for Effective Savings Tracking

1. **Regular Updates**: Add savings entries as soon as you make them
2. **Set Realistic Goals**: Start with achievable goals and increase gradually
3. **Emergency Fund First**: Aim for 6-12 months of expenses
4. **Diversify**: Use different savings categories (FD, MF, Stocks, etc.)
5. **Track Returns**: Record interest rates to compare options
6. **Review Monthly**: Check your savings rate and adjust spending

## Integration with Expenses

The Savings Tracker works seamlessly with your expense tracking:
- Compare savings vs expenses in real-time
- Calculate net cash flow automatically
- Track your overall financial health
- See if you're meeting your financial goals

## Privacy & Security

- All data is stored locally in IndexedDB (browser storage)
- No data is sent to external servers
- Use the Backup feature regularly to keep your data safe
- Export your data for external analysis or backup

## Future Enhancements

Planned features:
- [ ] Import savings from CSV/Excel
- [ ] Charts showing savings trends over time
- [ ] Auto-calculate goal completion date
- [ ] Savings vs Expenses comparison charts
- [ ] Investment portfolio tracking
- [ ] Returns calculator for different investment types
- [ ] Compound interest calculator
- [ ] Automatic goal progress updates when adding savings

## Support

For issues or feature requests related to Savings Tracker, please check:
1. This README file
2. Sample data in `sample-savings.json`
3. The main application documentation

---

**Remember**: The key to financial freedom is consistent savings and smart investments! 💪💰

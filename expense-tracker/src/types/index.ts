// Core Data Types

export type PaymentMethod = 'cash' | 'card' | 'upi' | 'netbanking' | 'cheque' | 'other';

export type CategoryType = 
  // Food & Dining (5)
  | 'grocery' 
  | 'dine_out' 
  | 'coffee_snacks'
  | 'milk_dairy'
  | 'street_food'
  
  // Transportation (6)
  | 'fuel'
  | 'public_transport'
  | 'auto_rickshaw'
  | 'vehicle_maintenance'
  | 'vehicle_rto_fees'
  | 'parking_fees'
  
  // Bills & Utilities (8)
  | 'bills_power' 
  | 'bills_wifi' 
  | 'bills_mobile'
  | 'bills_water'
  | 'bills_lpg_gas'
  | 'bills_dth_cable'
  | 'mobile_recharge'
  | 'rent_mortgage'
  
  // Lifestyle (9)
  | 'shopping_clothes'
  | 'shopping_electronics'
  | 'entertainment'
  | 'subscriptions'
  | 'personal_care'
  | 'fitness_gym'
  | 'salon_beauty'
  | 'tailor_alterations'
  | 'laundry_dryclean'
  
  // Online Shopping & Food Delivery (5)
  | 'ecommerce_blinkit'
  | 'ecommerce_zepto'
  | 'ecommerce_zomato'
  | 'ecommerce_flipkart'
  | 'ecommerce_amazon'
  
  // Medical Expenses (8)
  | 'medical_consultation'
  | 'medical_medicines'
  | 'medical_tests'
  | 'medical_hospitalization'
  | 'medical_insurance'
  | 'medical_dental'
  | 'medical_pharmacy'
  | 'medical_emergency'
  
  // Gifting & Donations (5)
  | 'gifting_personal'
  | 'gifting_festivals'
  | 'gifting_weddings'
  | 'donations_charity'
  | 'donations_religious'
  
  // Agriculture & Farming (17)
  | 'agri_seeds_fertilizers'  // Legacy: combined category for backward compatibility
  | 'agri_seeds'              // Granular: Seeds only
  | 'agri_fertilizers'        // Granular: Fertilizers only
  | 'agri_pesticides'         // Granular: Pesticides & insecticides
  | 'agri_equipment'
  | 'agri_irrigation'
  | 'agri_livestock'
  | 'agri_labor'              // Farm labor wages
  | 'agri_fuel'               // Diesel/petrol for farm vehicles
  | 'agri_tractor_rental'     // Tractor rental charges
  | 'agri_harvester_rental'   // Harvester/combine rental
  | 'agri_land_lease'
  | 'agri_crop_insurance'
  | 'agri_loan_interest'
  | 'agri_storage_transport'
  | 'agri_machinery_rental'   // Other machinery rentals
  | 'agri_other'
  
  // Education (3)
  | 'education'
  | 'school_fees'
  | 'tuition_classes'
  
  // Travel & Leisure (5)
  | 'travel_flights'
  | 'travel_hotels'
  | 'travel_local_transport'
  | 'travel_activities'
  | 'travel_vacation'
  
  // Household Services (5)
  | 'domestic_help_maid'
  | 'domestic_help_cook'
  | 'domestic_help_driver'
  | 'home_repairs'
  | 'home_furnishing'
  
  // Financial & Others (4)
  | 'insurance_general'
  | 'investments_savings'
  | 'pets'
  | 'household_maintenance'
  | 'other';

export interface Expense {
  id: string;                    // UUID
  date: Date;                    // Transaction date
  amount: number;                // Amount in currency
  category: CategoryType;        // Category
  description: string;           // Expense description
  paymentMethod?: PaymentMethod; // Payment type
  tags?: string[];               // Custom tags for filtering
  receiptUrl?: string;           // Optional receipt image (future)
  createdAt: Date;               // Record creation timestamp
  updatedAt: Date;               // Last update timestamp
}

// Category grouping for UI organization
export interface CategoryGroup {
  name: string;
  icon: string;
  categories: CategoryType[];
  color: string;
}

export interface CategoryBudget {
  category: CategoryType;
  monthlyLimit?: number;         // Optional: for monthly budgets
  yearlyLimit?: number;          // Optional: for yearly budgets
  budgetType: 'monthly' | 'yearly';
  alertThreshold: number;        // percentage (e.g., 80%)
  isActive: boolean;
}

export interface Settings {
  currency: 'INR' | 'USD' | 'EUR' | string;
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  theme: 'light' | 'dark' | 'system';
  locale: string;
}

// Savings Types

export type SavingsCategory = 
  | 'emergency_fund'
  | 'retirement'
  | 'investment_mutual_funds'
  | 'investment_stocks'
  | 'investment_gold'
  | 'investment_real_estate'
  | 'fixed_deposit'
  | 'recurring_deposit'
  | 'ppf'
  | 'nps'
  | 'education_fund'
  | 'travel_fund'
  | 'wedding_fund'
  | 'home_purchase'
  | 'vehicle_purchase'
  | 'business_investment'
  | 'general_savings'
  | 'other_savings';

export interface SavingsEntry {
  id: string;                    // UUID
  date: Date;                    // Transaction date
  amount: number;                // Amount saved
  category: SavingsCategory;     // Savings category
  description: string;           // Description
  account?: string;              // Account name (e.g., "SBI FD", "HDFC Mutual Fund")
  interestRate?: number;         // Interest rate (if applicable)
  maturityDate?: Date;           // Maturity date (for FD, RD, etc.)
  isRecurring?: boolean;         // Is this a recurring savings (SIP, etc.)
  tags?: string[];               // Custom tags
  createdAt: Date;               // Record creation timestamp
  updatedAt: Date;               // Last update timestamp
}

export interface SavingsGoal {
  id: string;
  name: string;                  // Goal name (e.g., "Emergency Fund", "House Down Payment")
  targetAmount: number;          // Target amount to save
  currentAmount: number;         // Current saved amount
  deadline?: Date;               // Target date to achieve goal
  category: SavingsCategory;
  priority: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
  createdAt: Date;
}

// Analytics Types

export interface AnalyticsDateRange {
  startDate: Date;
  endDate: Date;
}

export interface CategoryStats {
  category: CategoryType;
  total: number;
  average: number;
  min: number;
  max: number;
  median: number;
  stdDev: number;
  count: number;
}

export interface YoYComparison {
  year: number;
  total: number;
  percentageChange?: number;
}

export interface MoMComparison {
  month: string;
  year: number;
  total: number;
  percentageChange?: number;
}

export interface TrendData {
  date: string;
  actual: number;
  predicted?: number;
  ma7?: number;          // 7-day moving average
  ma30?: number;         // 30-day moving average
}

export interface Anomaly {
  expense: Expense;
  deviation: number;     // Number of standard deviations from mean
  categoryAverage: number;
}

// Filter Types

export interface FilterOptions {
  dateRange?: AnalyticsDateRange;
  categories?: CategoryType[];
  amountRange?: {
    min: number;
    max: number;
  };
  paymentMethods?: PaymentMethod[];
  searchQuery?: string;
}

// Export Types

export type ExportFormat = 'csv' | 'excel' | 'json' | 'pdf';

export interface ExportOptions {
  format: ExportFormat;
  dateRange?: AnalyticsDateRange;
  categories?: CategoryType[];
  includeSections?: string[];
}

// Chart Data Types

export interface ChartDataPoint {
  name: string;
  value: number;
  [key: string]: string | number;
}

export interface MultiSeriesChartData {
  name: string;
  [key: string]: string | number;
}

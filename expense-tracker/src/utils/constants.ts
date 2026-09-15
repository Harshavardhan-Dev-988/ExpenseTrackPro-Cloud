// Constants for expense categories and application settings
import type { CategoryGroup, CategoryType } from '../types/index';

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    name: 'Groceries',
    icon: '🛒',
    // Household grocery runs, whether at a store or via a quick-commerce
    // app — Zepto and Blinkit deliver the same milk-and-vegetables basket
    // a supermarket trip would, so they belong here rather than lumped in
    // with restaurant spend.
    categories: ['grocery', 'milk_dairy', 'ecommerce_zepto', 'ecommerce_blinkit'],
    color: '#6B8F71'
  },
  {
    name: 'Dining & Takeout',
    icon: '🍽️',
    // Eating out is not grocery shopping — split into its own group so
    // "how much did we spend on food we didn't cook" is its own number.
    categories: ['dine_out', 'coffee_snacks', 'street_food', 'ecommerce_zomato'],
    color: '#B3492F'
  },
  {
    name: 'Fuel & Transportation',
    icon: '🚗',
    categories: ['fuel', 'public_transport', 'auto_rickshaw', 'vehicle_maintenance', 'vehicle_rto_fees', 'parking_fees'],
    color: '#5C7A8A'
  },
  {
    name: 'Home & Bills',
    icon: '🏠',
    categories: ['bills_power', 'bills_wifi', 'bills_mobile', 'bills_water', 'bills_lpg_gas', 'bills_dth_cable', 'mobile_recharge', 'rent_mortgage'],
    color: '#45B7D1'
  },
  {
    name: 'Shopping',
    icon: '🛍️',
    // Retail purchases — clothing, electronics, and general online
    // marketplaces — kept apart from Lifestyle's recurring services.
    categories: ['shopping_clothes', 'shopping_electronics', 'ecommerce_flipkart', 'ecommerce_amazon'],
    color: '#C9A66B'
  },
  {
    name: 'Lifestyle & Entertainment',
    icon: '🎬',
    categories: ['entertainment', 'subscriptions', 'personal_care', 'fitness_gym', 'salon_beauty', 'tailor_alterations', 'laundry_dryclean'],
    color: '#7C6A9C'
  },
  {
    name: 'Medical Expenses',
    icon: '🏥',
    categories: ['medical_consultation', 'medical_medicines', 'medical_tests', 'medical_hospitalization', 'medical_insurance', 'medical_dental', 'medical_pharmacy', 'medical_emergency'],
    color: '#98D8C8'
  },
  {
    name: 'Gifting & Donations',
    icon: '🎁',
    categories: ['gifting_personal', 'gifting_festivals', 'gifting_weddings', 'donations_charity', 'donations_religious'],
    color: '#8C5A5A'
  },
  {
    name: 'Agriculture & Farming',
    icon: '🌾',
    categories: ['agri_seeds_fertilizers', 'agri_seeds', 'agri_fertilizers', 'agri_pesticides', 'agri_equipment', 'agri_irrigation', 'agri_livestock', 'agri_labor', 'agri_fuel', 'agri_tractor_rental', 'agri_harvester_rental', 'agri_machinery_rental', 'agri_land_lease', 'agri_crop_insurance', 'agri_loan_interest', 'agri_storage_transport', 'agri_other'],
    color: '#82B74B'
  },
  {
    name: 'Education',
    icon: '📚',
    categories: ['education', 'school_fees', 'tuition_classes'],
    color: '#9B59B6'
  },
  {
    name: 'Travel',
    icon: '✈️',
    // Broken out by what the money actually went to — flights, stay,
    // getting around, and doing things — instead of one catch-all
    // "vacation" bucket that hides where a trip's budget really goes.
    // travel_vacation stays as a general/legacy bucket for anything that
    // doesn't fit the four specific ones (and for entries recorded before
    // this split).
    categories: ['travel_flights', 'travel_hotels', 'travel_local_transport', 'travel_activities', 'travel_vacation'],
    color: '#3E6E7E'
  },
  {
    name: 'Household Services',
    icon: '🏡',
    categories: ['domestic_help_maid', 'domestic_help_cook', 'domestic_help_driver', 'home_repairs', 'home_furnishing'],
    color: '#D4A373'
  },
  {
    name: 'Financial & Others',
    icon: '💰',
    categories: ['insurance_general', 'investments_savings', 'pets', 'household_maintenance', 'other'],
    color: '#95A5A6'
  },
];

export const CATEGORY_LABELS: Record<CategoryType, string> = {
  // Food & Dining
  grocery: 'Grocery',
  dine_out: 'Dining Out',
  coffee_snacks: 'Coffee & Snacks',
  milk_dairy: 'Milk & Dairy',
  street_food: 'Street Food',
  
  // Transportation
  fuel: 'Fuel',
  public_transport: 'Public Transport',
  auto_rickshaw: 'Auto/Rickshaw',
  vehicle_maintenance: 'Vehicle Maintenance',
  vehicle_rto_fees: 'RTO/Vehicle Registration',
  parking_fees: 'Parking Fees',
  
  // Bills & Utilities
  bills_power: 'Electricity Bill',
  bills_wifi: 'Internet Bill',
  bills_mobile: 'Mobile Bill',
  bills_water: 'Water Bill',
  bills_lpg_gas: 'LPG/Gas Cylinder',
  bills_dth_cable: 'DTH/Cable TV',
  mobile_recharge: 'Mobile Recharge',
  rent_mortgage: 'Rent/Mortgage',
  
  // Lifestyle
  shopping_clothes: 'Clothing',
  shopping_electronics: 'Electronics',
  entertainment: 'Entertainment',
  subscriptions: 'Subscriptions',
  personal_care: 'Personal Care',
  fitness_gym: 'Fitness & Gym',
  salon_beauty: 'Salon & Beauty Parlor',
  tailor_alterations: 'Tailor & Alterations',
  laundry_dryclean: 'Laundry & Dry Cleaning',
  
  // Online Shopping & Food Delivery
  ecommerce_blinkit: 'Blinkit',
  ecommerce_zepto: 'Zepto',
  ecommerce_zomato: 'Zomato',
  ecommerce_flipkart: 'Flipkart',
  ecommerce_amazon: 'Amazon',
  
  // Medical
  medical_consultation: 'Doctor Consultation',
  medical_medicines: 'Medicines',
  medical_tests: 'Medical Tests',
  medical_hospitalization: 'Hospitalization',
  medical_insurance: 'Health Insurance',
  medical_dental: 'Dental Care',
  medical_pharmacy: 'Pharmacy',
  medical_emergency: 'Emergency Medical',
  
  // Gifting
  gifting_personal: 'Personal Gifts',
  gifting_festivals: 'Festival Gifts',
  gifting_weddings: 'Wedding & Marriage Gifts',
  donations_charity: 'Donations & Charity',
  donations_religious: 'Temple & Religious Donations',
  
  // Agriculture
  agri_seeds_fertilizers: 'Seeds & Fertilizers (Combined)',
  agri_seeds: 'Seeds',
  agri_fertilizers: 'Fertilizers',
  agri_pesticides: 'Pesticides & Insecticides',
  agri_equipment: 'Farm Equipment',
  agri_irrigation: 'Irrigation',
  agri_livestock: 'Livestock',
  agri_labor: 'Farm Labor',
  agri_fuel: 'Farm Fuel (Diesel/Petrol)',
  agri_tractor_rental: 'Tractor Rental',
  agri_harvester_rental: 'Harvester Rental',
  agri_machinery_rental: 'Other Machinery Rental',
  agri_land_lease: 'Land Lease',
  agri_crop_insurance: 'Crop Insurance',
  agri_loan_interest: 'Loan Interest',
  agri_storage_transport: 'Storage & Transport',
  agri_other: 'Other Farm Expenses',
  
  // Education
  education: 'Education',
  school_fees: 'School Fees',
  tuition_classes: 'Tuition Classes',
  
  // Travel
  travel_flights: 'Flights & Airfare',
  travel_hotels: 'Hotels & Stay',
  travel_local_transport: 'Local Transport (Trip)',
  travel_activities: 'Activities & Sightseeing',
  travel_vacation: 'Other Travel',
  
  // Household Services
  domestic_help_maid: 'Maid/House Help',
  domestic_help_cook: 'Cook',
  domestic_help_driver: 'Driver',
  home_repairs: 'Home Repairs',
  home_furnishing: 'Home Furnishing',
  
  // Financial & Others
  insurance_general: 'General Insurance',
  investments_savings: 'Investments & Savings',
  pets: 'Pet Care',
  household_maintenance: 'Household Maintenance',
  other: 'Other',
};

// A cohesive, muted spectrum drawn from the ledger palette rather than a
// default rainbow — enough distinct, low-saturation tones to carry every
// category group without any one of them reading as "the app's color."
// Shared by the category pie chart and the 3D walkthrough's rooms so the
// same group always reads as the same color everywhere in the app.
export const CATEGORY_GROUP_PALETTE = [
  '#2F4D3F', // pine
  '#A9762E', // brass
  '#5C7A8A', // dusty slate-blue
  '#9C6B4F', // rust / terracotta (one slice among many, not the identity)
  '#6B8F71', // sage
  '#7C6A9C', // muted plum
  '#C9A66B', // sand
  '#8C5A5A', // dusty rose
  '#3E6E7E', // muted teal
  '#8C9A8C', // sage-grey
  '#B3492F', // ember
  '#5A6B8C', // slate-navy
  '#4F7942', // fern
];

export const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  netbanking: 'Net Banking',
  cheque: 'Cheque',
  other: 'Other',
};

export const SAVINGS_CATEGORY_LABELS = {
  emergency_fund: 'Emergency Fund',
  retirement: 'Retirement Savings',
  investment_mutual_funds: 'Mutual Funds',
  investment_stocks: 'Stocks & Equity',
  investment_gold: 'Gold Investment',
  investment_real_estate: 'Real Estate',
  fixed_deposit: 'Fixed Deposit (FD)',
  recurring_deposit: 'Recurring Deposit (RD)',
  ppf: 'Public Provident Fund (PPF)',
  nps: 'National Pension System (NPS)',
  education_fund: 'Education Fund',
  travel_fund: 'Travel Fund',
  wedding_fund: 'Wedding Fund',
  home_purchase: 'Home Purchase Fund',
  vehicle_purchase: 'Vehicle Purchase Fund',
  business_investment: 'Business Investment',
  general_savings: 'General Savings',
  other_savings: 'Other Savings',
};

export const DATE_RANGE_PRESETS = {
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
  last3Months: 'Last 3 Months',
  last6Months: 'Last 6 Months',
  last12Months: 'Last 12 Months',
  thisYear: 'This Year',
  lastYear: 'Last Year',
  custom: 'Custom Range',
};

export const DB_NAME = 'ExpenseTrackerDB';
export const DB_VERSION = 2; // Incremented for savings feature
export const EXPENSES_STORE_NAME = 'expenses';
export const CATEGORIES_STORE_NAME = 'categories';
export const SETTINGS_STORE_NAME = 'settings';
export const BUDGETS_STORE_NAME = 'budgets';
export const SAVINGS_STORE_NAME = 'savings';
export const SAVINGS_GOALS_STORE_NAME = 'savingsGoals';

import { useState } from 'react';
import type { CategoryType, PaymentMethod } from '../../types';
import { CATEGORY_LABELS } from '../../utils/constants';

interface ExpenseFiltersProps {
  filters: {
    searchText: string;
    categories: CategoryType[];
    paymentMethods: PaymentMethod[];
    dateFrom: string;
    dateTo: string;
    minAmount: string;
    maxAmount: string;
  };
  onFilterChange: (filters: {
    searchText: string;
    categories: CategoryType[];
    paymentMethods: PaymentMethod[];
    dateFrom: string;
    dateTo: string;
    minAmount: string;
    maxAmount: string;
  }) => void;
}

export default function ExpenseFilters({ filters, onFilterChange }: ExpenseFiltersProps) {
  const [searchText, setSearchText] = useState(filters.searchText);
  const [selectedCategories, setSelectedCategories] = useState<CategoryType[]>(filters.categories);
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<PaymentMethod[]>(filters.paymentMethods);
  const [dateFrom, setDateFrom] = useState(filters.dateFrom);
  const [dateTo, setDateTo] = useState(filters.dateTo);
  const [minAmount, setMinAmount] = useState(filters.minAmount);
  const [maxAmount, setMaxAmount] = useState(filters.maxAmount);
  const [isExpanded, setIsExpanded] = useState(false);

  const categories = Object.keys(CATEGORY_LABELS) as CategoryType[];
  const paymentMethods: PaymentMethod[] = ['cash', 'card', 'upi', 'netbanking', 'cheque', 'other'];

  const handleFilterUpdate = (updates: any) => {
    const newFilters = {
      searchText,
      categories: selectedCategories,
      paymentMethods: selectedPaymentMethods,
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
      ...updates,
    };

    setSearchText(newFilters.searchText);
    setSelectedCategories(newFilters.categories);
    setSelectedPaymentMethods(newFilters.paymentMethods);
    setDateFrom(newFilters.dateFrom);
    setDateTo(newFilters.dateTo);
    setMinAmount(newFilters.minAmount);
    setMaxAmount(newFilters.maxAmount);

    onFilterChange(newFilters);
  };

  const handleCategoryToggle = (category: CategoryType) => {
    const newCategories = selectedCategories.includes(category)
      ? selectedCategories.filter(c => c !== category)
      : [...selectedCategories, category];
    handleFilterUpdate({ categories: newCategories });
  };

  const handlePaymentMethodToggle = (method: PaymentMethod) => {
    const newMethods = selectedPaymentMethods.includes(method)
      ? selectedPaymentMethods.filter(m => m !== method)
      : [...selectedPaymentMethods, method];
    handleFilterUpdate({ paymentMethods: newMethods });
  };

  const handleClearFilters = () => {
    handleFilterUpdate({
      searchText: '',
      categories: [],
      paymentMethods: [],
      dateFrom: '',
      dateTo: '',
      minAmount: '',
      maxAmount: '',
    });
  };

  const activeFilterCount =
    (searchText ? 1 : 0) +
    selectedCategories.length +
    selectedPaymentMethods.length +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (minAmount ? 1 : 0) +
    (maxAmount ? 1 : 0);

  const hasActiveFilters = activeFilterCount > 0;

  const ledgerInput = 'w-full px-3 py-2 border border-line rounded-lg bg-surface text-ink placeholder:text-slate/70 focus:outline-none focus:border-pine transition-colors';
  const ledgerLabel = 'block text-xs font-medium text-slate mb-1.5';

  return (
    <div className="card-surface p-4 mb-6">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchText}
            onChange={(e) => handleFilterUpdate({ searchText: e.target.value })}
            placeholder="Search by description..."
            className="w-full px-4 py-2.5 border border-line rounded-lg bg-surface text-ink placeholder:text-slate/70 focus:outline-none focus:border-pine transition-colors"
          />
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine hover:text-pine-strong transition-colors"
        >
          <span aria-hidden="true">⚲</span> Filters
          {hasActiveFilters && (
            <span className="px-2 py-0.5 bg-pine text-paper text-xs font-mono tabular rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="px-4 py-2.5 rounded-lg border border-line text-slate text-sm font-medium hover:border-pine hover:text-ink transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-4 pt-4 border-t border-line">
          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={ledgerLabel}>
                From date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => handleFilterUpdate({ dateFrom: e.target.value })}
                className={ledgerInput}
              />
            </div>
            <div>
              <label className={ledgerLabel}>
                To date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => handleFilterUpdate({ dateTo: e.target.value })}
                className={ledgerInput}
              />
            </div>
          </div>

          {/* Amount Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={ledgerLabel}>
                Min amount (₹)
              </label>
              <input
                type="number"
                value={minAmount}
                onChange={(e) => handleFilterUpdate({ minAmount: e.target.value })}
                placeholder="0"
                className={`${ledgerInput} font-mono tabular`}
              />
            </div>
            <div>
              <label className={ledgerLabel}>
                Max amount (₹)
              </label>
              <input
                type="number"
                value={maxAmount}
                onChange={(e) => handleFilterUpdate({ maxAmount: e.target.value })}
                placeholder="No limit"
                className={`${ledgerInput} font-mono tabular`}
              />
            </div>
          </div>

          {/* Payment Methods */}
          <div>
            <label className={ledgerLabel}>
              Payment methods
            </label>
            <div className="flex flex-wrap gap-2">
              {paymentMethods.map(method => (
                <button
                  key={method}
                  onClick={() => handlePaymentMethodToggle(method)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    selectedPaymentMethods.includes(method)
                      ? 'bg-pine text-paper'
                      : 'border border-line text-slate hover:border-pine hover:text-ink'
                  }`}
                >
                  {method.charAt(0).toUpperCase() + method.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div>
            <label className={ledgerLabel}>
              Categories ({selectedCategories.length} selected)
            </label>
            <div className="max-h-48 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-paper [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {categories.map(category => (
                  <button
                    key={category}
                    onClick={() => handleCategoryToggle(category)}
                    className={`px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                      selectedCategories.includes(category)
                        ? 'bg-pine text-paper'
                        : 'bg-paper text-ink hover:bg-line/60'
                    }`}
                  >
                    {CATEGORY_LABELS[category] || category}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

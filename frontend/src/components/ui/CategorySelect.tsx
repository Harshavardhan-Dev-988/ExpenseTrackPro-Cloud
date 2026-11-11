/** A plain grouped <select> of every category (built-in and custom). */
import { CATEGORY_GROUPS } from '../../utils/constants';
import { categoryLabel } from '../../utils/categoryRegistry';
import { useCategories } from '../categories/categoriesContext';

export default function CategorySelect({
  id,
  value,
  onChange,
  className,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  useCategories(); // re-render when custom categories change
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {CATEGORY_GROUPS.map((g) => (
        <optgroup key={g.id} label={`${g.icon} ${g.name}`}>
          {g.categories.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

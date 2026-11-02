/**
 * "Categories" — every group with its sub-categories. Built-in ones are shown
 * for reference; the user's own groups and categories can be added, renamed,
 * moved and deleted. Deleting a category that's in use moves its expenses to
 * a category the user picks first, so nothing is left pointing at nothing.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { CategoryGroup, CategoryType, Expense } from '../../types';
import { CATEGORY_GROUPS, CATEGORY_LABELS } from '../../utils/constants';
import {
  GROUP_COLOR_CHOICES,
  GROUP_ICON_CHOICES,
  groupColor,
  newCustomCategoryId,
  newCustomGroupId,
} from '../../utils/categoryRegistry';
import { formatMoney } from '../../utils/helpers';
import { useCategories } from './categoriesContext';
import { useConfirm } from '../ui/confirmContext';
import { useToast, errorMessage } from '../ui/toastContext';
import Spinner from '../ui/Spinner';

interface CategoryManagerProps {
  expenses: Expense[];
  currency: string;
  onClose: () => void;
  /** Moves every expense in `from` to `to` (used before deleting a category). */
  onReassign: (from: string, to: string, onProgress?: (done: number, total: number) => void) => Promise<void>;
}

const inputCls =
  'px-3 py-2 rounded-lg border border-line bg-surface text-sm text-ink focus:outline-none focus:border-pine min-w-0';

export default function CategoryManager({ expenses, currency, onClose, onReassign }: CategoryManagerProps) {
  const { version, saveGroup, deleteGroup, saveCategory, deleteCategory, data } = useCategories();
  const confirm = useConfirm();
  const toast = useToast();
  const reduce = useReducedMotion();

  const [query, setQuery] = useState('');
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);

  // Usage per category, for "12 entries · ₹4,300" and delete warnings.
  const usage = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>();
    for (const e of expenses) {
      const u = m.get(e.category) ?? { count: 0, total: 0 };
      u.count += 1;
      u.total += e.amount;
      m.set(e.category, u);
    }
    return m;
  }, [expenses]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groups = useMemo(() => [...CATEGORY_GROUPS], [version]);
  const q = query.trim().toLowerCase();
  const visible = groups.filter(
    (g) => !q || g.name.toLowerCase().includes(q) || g.categories.some((c) => (CATEGORY_LABELS[c] || c).toLowerCase().includes(q))
  );
  const customCount = data.categories.length + data.groups.length;

  const removeCategory = async (id: string) => {
    const used = usage.get(id);
    const label = CATEGORY_LABELS[id as CategoryType] || id;
    let target = 'other';
    const ok = await confirm({
      title: `Delete “${label}”?`,
      message: used
        ? `${used.count} ${used.count === 1 ? 'expense uses' : 'expenses use'} this category. Pick where they should go, then delete.`
        : 'No expenses use it, so nothing else changes.',
      details: used ? <ReassignPicker exclude={id} onChange={(v) => (target = v)} /> : undefined,
      confirmLabel: used ? 'Move expenses and delete' : 'Delete category',
      busyLabel: used ? 'Moving expenses…' : 'Deleting…',
      tone: 'danger',
      onConfirm: async () => {
        if (used) await onReassign(id, target);
        await deleteCategory(id);
      },
    });
    if (ok) toast.success('Category deleted', used ? `${used.count} expenses moved to ${CATEGORY_LABELS[target as CategoryType] || target}` : label);
  };

  const removeGroup = async (group: CategoryGroup) => {
    if (group.categories.length) {
      toast.info('Empty the group first', 'Delete or move its categories, then delete the group.');
      return;
    }
    const ok = await confirm({
      title: `Delete the “${group.name}” group?`,
      message: 'It has no categories, so no expenses are affected.',
      confirmLabel: 'Delete group',
      busyLabel: 'Deleting…',
      tone: 'danger',
      onConfirm: () => deleteGroup(group.id),
    });
    if (ok) toast.success('Group deleted', group.name);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <motion.div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Categories"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative card-surface w-full max-w-2xl max-h-[92vh] flex flex-col"
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-line">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate font-mono">Your ledger’s taxonomy</p>
            <h2 className="font-display text-2xl font-semibold text-ink">Categories</h2>
            <p className="text-sm text-slate mt-0.5">
              {groups.length} groups · {groups.reduce((n, g) => n + g.categories.length, 0)} categories
              {customCount > 0 && <> · <span className="text-pine-strong dark:text-pine">{customCount} yours</span></>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate hover:text-ink hover:bg-paper"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-3 flex flex-col sm:flex-row gap-2 border-b border-line">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a group or category…"
            aria-label="Find a group or category"
            className={`${inputCls} flex-1`}
          />
          <button
            type="button"
            onClick={() => setShowNewGroup((v) => !v)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-pine text-paper text-sm font-semibold hover:bg-pine-strong"
            aria-expanded={showNewGroup}
          >
            + New group
          </button>
        </div>

        <AnimatePresence initial={false}>
          {showNewGroup && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-line"
            >
              <GroupEditor
                onCancel={() => setShowNewGroup(false)}
                onSave={async (name, icon, color) => {
                  const id = newCustomGroupId(name);
                  await saveGroup({ id, name, icon, color });
                  setShowNewGroup(false);
                  setOpenGroup(id);
                  toast.success('Group created', `${icon} ${name}. Add its first category below.`);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-3 space-y-2">
          {visible.length === 0 && <p className="text-sm text-slate p-4 text-center">Nothing matches “{query}”.</p>}
          {visible.map((group) => (
            <GroupRow
              key={group.id}
              group={group}
              open={openGroup === group.id || !!q}
              onToggle={() => setOpenGroup((o) => (o === group.id ? null : group.id))}
              usage={usage}
              currency={currency}
              highlight={q}
              onAddCategory={async (label) => {
                await saveCategory({ id: newCustomCategoryId(label), label, groupId: group.id });
                toast.success('Category added', `${label} · ${group.name}`);
              }}
              onRenameCategory={async (id, label) => {
                await saveCategory({ id, label, groupId: group.id });
              }}
              onMoveCategory={async (id, groupId) => {
                const label = CATEGORY_LABELS[id as CategoryType] || id;
                await saveCategory({ id, label, groupId });
                toast.success('Category moved', `${label} → ${groups.find((g) => g.id === groupId)?.name ?? ''}`);
              }}
              onDeleteCategory={removeCategory}
              onEditGroup={async (name, icon, color) => {
                await saveGroup({ id: group.id, name, icon, color });
              }}
              onDeleteGroup={() => removeGroup(group)}
              allGroups={groups}
            />
          ))}
        </div>

        <p className="px-5 py-3 border-t border-line text-xs text-slate">
          Built-in categories can’t be renamed or removed, but you can add your own to any group. Budgets can be set on a
          whole group from the Budgets tab.
        </p>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function GroupRow({
  group,
  open,
  onToggle,
  usage,
  currency,
  highlight,
  onAddCategory,
  onRenameCategory,
  onMoveCategory,
  onDeleteCategory,
  onEditGroup,
  onDeleteGroup,
  allGroups,
}: {
  group: CategoryGroup;
  open: boolean;
  onToggle: () => void;
  usage: Map<string, { count: number; total: number }>;
  currency: string;
  highlight: string;
  onAddCategory: (label: string) => Promise<void>;
  onRenameCategory: (id: string, label: string) => Promise<void>;
  onMoveCategory: (id: string, groupId: string) => Promise<void>;
  onDeleteCategory: (id: string) => void;
  onEditGroup: (name: string, icon: string, color: string) => Promise<void>;
  onDeleteGroup: () => void;
  allGroups: CategoryGroup[];
}) {
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingGroup, setEditingGroup] = useState(false);
  const toast = useToast();
  const groupTotal = group.categories.reduce((s, c) => s + (usage.get(c)?.total ?? 0), 0);
  const color = groupColor(group);

  const add = async () => {
    const label = newLabel.trim();
    if (!label) return setError('Give it a name');
    if (Object.values(CATEGORY_LABELS).some((l) => l.toLowerCase() === label.toLowerCase())) {
      return setError('A category with that name already exists');
    }
    setBusy(true);
    setError('');
    try {
      await onAddCategory(label);
      setNewLabel('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button type="button" onClick={onToggle} className="flex-1 min-w-0 flex items-center gap-3 text-left" aria-expanded={open}>
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0" style={{ background: `${color}22` }} aria-hidden="true">
            {group.icon}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="font-medium text-ink truncate">{group.name}</span>
              {group.custom && <span className="text-[10px] font-mono uppercase tracking-wide text-pine-strong dark:text-pine bg-pine/10 rounded px-1.5 py-0.5">yours</span>}
            </span>
            <span className="block text-xs text-slate">
              {group.categories.length} {group.categories.length === 1 ? 'category' : 'categories'}
              {groupTotal > 0 && <> · {formatMoney(groupTotal, currency)} all time</>}
            </span>
          </span>
        </button>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} aria-hidden="true" />
        <svg className={`w-4 h-4 text-slate transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {open && (
        <div className="border-t border-line px-3 py-3 bg-paper/50 space-y-3">
          {group.custom && (
            <div className="flex flex-wrap items-center gap-2">
              {editingGroup ? (
                <div className="w-full">
                  <GroupEditor
                    initial={{ name: group.name, icon: group.icon, color: group.color }}
                    onCancel={() => setEditingGroup(false)}
                    onSave={async (name, icon, c) => {
                      await onEditGroup(name, icon, c);
                      setEditingGroup(false);
                      toast.success('Group updated', name);
                    }}
                  />
                </div>
              ) : (
                <>
                  <SmallButton onClick={() => setEditingGroup(true)}>Edit group</SmallButton>
                  <SmallButton tone="danger" onClick={onDeleteGroup}>Delete group</SmallButton>
                </>
              )}
            </div>
          )}

          <ul className="space-y-1">
            {group.categories.length === 0 && <li className="text-xs text-slate">No categories yet — add the first one below.</li>}
            {group.categories.map((cat) => (
              <CategoryRow
                key={cat}
                id={cat}
                usage={usage.get(cat)}
                currency={currency}
                highlight={highlight}
                groupId={group.id}
                allGroups={allGroups}
                onRename={onRenameCategory}
                onMove={onMoveCategory}
                onDelete={onDeleteCategory}
              />
            ))}
          </ul>

          <div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newLabel}
                maxLength={40}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
                placeholder={`New category in ${group.name}`}
                aria-label={`New category in ${group.name}`}
                className={`${inputCls} flex-1`}
              />
              <button
                type="button"
                onClick={add}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-pine text-pine-strong dark:text-pine text-sm font-semibold hover:bg-pine/10 disabled:opacity-60"
              >
                {busy ? <Spinner size="sm" /> : '+'} Add
              </button>
            </div>
            {error && <p className="text-xs text-ember mt-1">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryRow({
  id,
  usage,
  currency,
  highlight,
  groupId,
  allGroups,
  onRename,
  onMove,
  onDelete,
}: {
  id: string;
  usage?: { count: number; total: number };
  currency: string;
  highlight: string;
  groupId: string;
  allGroups: CategoryGroup[];
  onRename: (id: string, label: string) => Promise<void>;
  onMove: (id: string, groupId: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const custom = id.startsWith('custom_');
  const label = CATEGORY_LABELS[id as CategoryType] || id;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const match = highlight && label.toLowerCase().includes(highlight);

  const save = async () => {
    const next = draft.trim();
    if (!next || next === label) return setEditing(false);
    setBusy(true);
    try {
      await onRename(id, next);
      setEditing(false);
    } catch (e) {
      toast.error("Couldn't rename", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 ${match ? 'bg-brass/10' : 'hover:bg-surface'}`}>
      {editing ? (
        <input
          autoFocus
          value={draft}
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          className={`${inputCls} py-1 flex-1`}
          aria-label="Category name"
        />
      ) : (
        <span className="flex-1 min-w-0 text-sm text-ink truncate">
          {label}
          {custom && <span className="ml-1.5 text-[10px] font-mono text-pine-strong dark:text-pine">yours</span>}
        </span>
      )}
      <span className="text-xs text-slate font-mono tabular shrink-0">
        {usage ? `${usage.count} · ${formatMoney(usage.total, currency)}` : 'unused'}
      </span>
      {custom && (
        <span className="flex items-center gap-1 shrink-0">
          {editing ? (
            <SmallButton onClick={save}>{busy ? 'Saving…' : 'Save'}</SmallButton>
          ) : (
            <SmallButton onClick={() => { setDraft(label); setEditing(true); }}>Rename</SmallButton>
          )}
          <select
            value={groupId}
            onChange={(e) => onMove(id, e.target.value).catch((err) => toast.error("Couldn't move", errorMessage(err)))}
            aria-label={`Move ${label} to another group`}
            className="text-xs px-1.5 py-1 rounded-md border border-line bg-surface text-ink max-w-[8.5rem]"
          >
            {allGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.icon} {g.name}</option>
            ))}
          </select>
          <SmallButton tone="danger" onClick={() => onDelete(id)}>Delete</SmallButton>
        </span>
      )}
    </li>
  );
}

function GroupEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: { name: string; icon: string; color: string };
  onSave: (name: string, icon: string, color: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? GROUP_ICON_CHOICES[0]);
  const [color, setColor] = useState(initial?.color ?? GROUP_COLOR_CHOICES[5]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const n = name.trim();
    if (!n) return setError('Give the group a name');
    const clash = CATEGORY_GROUPS.some((g) => g.name.toLowerCase() === n.toLowerCase() && g.name !== initial?.name);
    if (clash) return setError('A group with that name already exists');
    setBusy(true);
    setError('');
    try {
      await onSave(n, icon, color);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-5 py-4 space-y-3 bg-paper/60">
      <input
        autoFocus
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Group name, e.g. Kids"
        aria-label="Group name"
        className={`${inputCls} w-full`}
      />
      <Field label="Icon">
        <div className="flex flex-wrap gap-1.5">
          {GROUP_ICON_CHOICES.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIcon(i)}
              aria-pressed={icon === i}
              className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border ${icon === i ? 'border-pine bg-pine/10' : 'border-line bg-surface hover:border-pine/50'}`}
            >
              {i}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Colour">
        <div className="flex flex-wrap gap-1.5">
          {GROUP_COLOR_CHOICES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              className={`w-7 h-7 rounded-full border-2 ${color === c ? 'border-ink' : 'border-transparent'}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </Field>
      {error && <p className="text-xs text-ember">{error}</p>}
      <div className="flex justify-end gap-2">
        <SmallButton onClick={onCancel}>Cancel</SmallButton>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-pine text-paper text-sm font-semibold hover:bg-pine-strong disabled:opacity-60"
        >
          {busy && <Spinner size="sm" tone="paper" />}
          {initial ? 'Save group' : 'Create group'}
        </button>
      </div>
    </div>
  );
}

function ReassignPicker({ exclude, onChange }: { exclude: string; onChange: (v: string) => void }) {
  const [value, setValue] = useState('other');
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-slate font-mono">Move its expenses to</span>
      <select
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value);
        }}
        className={`${inputCls} w-full mt-1`}
      >
        {CATEGORY_GROUPS.map((g) => (
          <optgroup key={g.id} label={`${g.icon} ${g.name}`}>
            {g.categories
              .filter((c) => c !== exclude)
              .map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate font-mono mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function SmallButton({ children, onClick, tone }: { children: ReactNode; onClick: () => void; tone?: 'danger' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
        tone === 'danger' ? 'border-ember/40 text-ember-strong dark:text-ember hover:bg-ember/10' : 'border-line text-ink hover:border-pine hover:text-pine-strong'
      }`}
    >
      {children}
    </button>
  );
}

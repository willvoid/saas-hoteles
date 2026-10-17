import { useNavigate } from 'react-router-dom';

export type SuperadminTab = 'hoteles' | 'finanzas';

const TABS: { key: SuperadminTab; label: string; path: string }[] = [
  { key: 'hoteles', label: 'Hoteles', path: '/superadmin' },
  { key: 'finanzas', label: 'Finanzas', path: '/superadmin/finanzas' },
];

/** Hoteles | Finanzas navigation shared by the superadmin pages. Uses the
 *  `tabs-bar` styles of StatusTabs without its mandatory count badge. */
export function SuperadminTabs({ active }: { active: SuperadminTab }) {
  const navigate = useNavigate();
  return (
    <div className="tabs-bar" role="tablist" style={{ marginBottom: '20px' }}>
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className={`tab-btn ${active === t.key ? 'active' : ''}`}
          onClick={() => active !== t.key && navigate(t.path)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

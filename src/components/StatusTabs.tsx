export interface TabOption {
  key: string;
  label: string;
  color?: string;
  count: number;
}

interface StatusTabsProps {
  tabs: TabOption[];
  value: string;
  onChange: (key: string) => void;
}

export function StatusTabs({ tabs, value, onChange }: StatusTabsProps) {
  return (
    <div className="tabs-bar">
      {tabs.map(tab => (
        <button
          key={tab.key}
          className={`tab-btn ${value === tab.key ? 'active' : ''}`}
          onClick={() => onChange(tab.key)}
          style={value === tab.key && tab.color ? { color: tab.color, borderColor: tab.color } : {}}
        >
          {tab.color && (
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: tab.color,
              display: 'inline-block',
              marginRight: '2px'
            }} />
          )}
          {tab.label}
          <span style={{ opacity: 0.6, fontSize: '12px', marginLeft: '4px' }}>({tab.count})</span>
        </button>
      ))}
    </div>
  );
}

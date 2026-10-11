import React, { ReactNode } from 'react';

export interface QuickAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

interface QuickActionsProps {
  actions: QuickAction[];
  title?: string;
}

const QuickActions: React.FC<QuickActionsProps> = ({ 
  actions, 
  title = "Acciones Rápidas" 
}) => {
  return (
    <div className="module-container" style={{ marginTop: '20px', minHeight: 'auto' }}>
      {title && <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>{title}</h2>}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {actions.map((action, index) => {
          const isPrimary = action.variant === 'primary' || !action.variant;
          
          return (
            <button 
              key={index}
              className="login-btn action-button" 
              style={{ 
                width: 'auto', 
                padding: '12px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                ...(isPrimary 
                  ? {} 
                  : { background: 'rgba(255,255,255,0.1)', border: '1px solid var(--glass-border)' }
                )
              }}
              onClick={action.onClick}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  );
};

export default QuickActions;

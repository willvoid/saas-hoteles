import React, { ReactNode } from 'react';
import { COLORS } from '../constants/colors';

interface ModuleLayoutProps {
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function ModuleLayout({ title, description, actions, children }: ModuleLayoutProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '30px', 
        flexWrap: 'wrap', 
        gap: '16px' 
      }}>
        <div style={{ flex: '1 1 min-content' }}>
          <h1 style={{ 
            marginBottom: '8px', 
            fontSize: '28px', 
            textAlign: 'left', 
            wordBreak: 'break-word',
            background: `linear-gradient(135deg, ${COLORS.white}, ${COLORS.textSecondary})`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            {title}
          </h1>
          <p style={{ color: 'var(--text-secondary)', textAlign: 'left', margin: 0 }}>
            {description}
          </p>
        </div>
        {actions && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: '1 1 auto' }}>
            {actions}
          </div>
        )}
      </div>
      
      <div style={{ width: '100%', overflowX: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

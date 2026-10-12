import React, { ReactNode, useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { COLORS, tint } from '../constants/colors';

export interface Column<T = any> {
  header: string;
  accessor?: keyof T | string;
  render?: (item: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T = any> {
  data: T[];
  columns: Column<T>[];
  emptyMessage?: string;
  keyExtractor: (item: T) => string | number;
}

export function DataTable<T>({
  data,
  columns,
  emptyMessage = 'No hay datos disponibles.',
  keyExtractor
}: DataTableProps<T>) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [expandedRows, setExpandedRows] = useState<Record<string | number, boolean>>({});

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleRow = (key: string | number) => {
    setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (isMobile) {
    return (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {data.length === 0 ? (
          <div style={{ 
            background: tint('black', 0.2), 
            borderRadius: '16px', 
            border: '1px solid var(--glass-border)',
            padding: '40px', 
            textAlign: 'center', 
            color: 'var(--text-secondary)' 
          }}>
            {emptyMessage}
          </div>
        ) : (
          data.map((item) => {
            const key = keyExtractor(item);
            const isExpanded = expandedRows[key];
            // Render first column as header
            const mainCol = columns[0];
            
            return (
              <div key={key} style={{ 
                background: tint('black', 0.2), 
                borderRadius: '12px', 
                border: '1px solid var(--glass-border)',
                overflow: 'hidden'
              }}>
                <div 
                  onClick={() => toggleRow(key)}
                  style={{ 
                    padding: '16px', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    cursor: 'pointer',
                    background: isExpanded ? COLORS.glassBg : 'transparent',
                    transition: 'background 0.2s'
                  }}
                >
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)', flex: 1, paddingRight: '12px' }}>
                    {mainCol.render ? mainCol.render(item) : (mainCol.accessor ? (item as any)[mainCol.accessor] || '-' : '-')}
                  </div>
                  {isExpanded ? <ChevronUp size={20} color="var(--text-secondary)" /> : <ChevronDown size={20} color="var(--text-secondary)" />}
                </div>
                
                {isExpanded && (
                  <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${COLORS.glassBg}` }}>
                    {columns.slice(1).map((col, index) => (
                      <div key={index} style={{ 
                        display: 'flex', 
                        flexDirection: 'column',
                        paddingTop: '12px',
                        marginTop: index > 0 ? '12px' : '0',
                        borderTop: index > 0 ? `1px solid ${COLORS.glassBg}` : 'none'
                      }}>
                        <span style={{ 
                          fontSize: '12px', 
                          color: 'var(--text-secondary)', 
                          textTransform: 'uppercase',
                          marginBottom: '4px',
                          fontWeight: '600'
                        }}>
                          {col.header}
                        </span>
                        <div style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                          {col.render ? col.render(item) : (col.accessor ? (item as any)[col.accessor] || '-' : '-')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div style={{
      background: tint('black', 0.2),
      borderRadius: '16px',
      border: '1px solid var(--glass-border)',
      overflow: 'hidden',
      width: '100%'
    }}>
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)', background: COLORS.glassBg }}>
              {columns.map((col, index) => (
                <th key={index} style={{
                  padding: '16px',
                  color: 'var(--text-secondary)',
                  fontWeight: '600',
                  fontSize: '13px',
                  textTransform: 'uppercase',
                  textAlign: col.align || 'left',
                  whiteSpace: 'nowrap'
                }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr key={keyExtractor(item)} style={{ borderBottom: `1px solid ${COLORS.glassBg}`, transition: 'background 0.2s' }}>
                  {columns.map((col, index) => (
                    <td key={index} style={{ padding: '16px', textAlign: col.align || 'left' }}>
                      {col.render ? col.render(item) : (col.accessor ? (item as any)[col.accessor] || '-' : '-')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

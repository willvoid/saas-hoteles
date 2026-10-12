import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { tint } from '../constants/colors';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Overrides the default 500px cap for content that needs more room, e.g. a card grid. */
  maxWidth?: number;
  /** Pinned below the scrollable content — e.g. action buttons that must stay
   *  visible without scrolling the whole modal body. */
  footer?: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children, maxWidth = 500, footer }: ModalProps) {
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: tint('black', 0.65),
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: tint('bgStart', 0.95),
          border: '1px solid var(--glass-border)',
          borderRadius: '20px',
          width: '100%',
          maxWidth: `${maxWidth}px`,
          boxShadow: `0 25px 50px -12px ${tint('black', 0.5)}`,
          overflow: 'hidden',
          animation: 'fadeIn 0.25s ease-out',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 24px',
          borderBottom: '1px solid var(--glass-border)'
        }}>
          <h3 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0
          }}>
            {title}
          </h3>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              borderRadius: '50%',
              transition: 'all 0.2s ease'
            }}
            className="close-modal-btn"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{
          padding: '24px',
          overflowY: 'auto',
          flex: 1
        }}>
          {children}
        </div>

        {/* Pinned footer (stays visible while content scrolls) */}
        {footer && (
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--glass-border)',
            flexShrink: 0
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

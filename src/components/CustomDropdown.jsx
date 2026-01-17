// ARIA v1.0 BLOCK 7.2 - CustomDropdown (React Portal Solution)
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

/**
 * CustomDropdown - OLED-Friendly Custom Select Component
 * BLOCK 7.2: Uses React Portal to render menu outside modal hierarchy
 * This guarantees the menu floats above ALL content without clipping
 */
export default function CustomDropdown({ value, onChange, options, className = '', disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef(null);

  // Calculate position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);
  const selectedLabel = selectedOption ? selectedOption.label : 'Select...';

  const handleSelect = (optionValue) => {
    onChange({ target: { value: optionValue } });
    setIsOpen(false);
  };

  const handleBackdropClick = () => {
    setIsOpen(false);
  };

  return (
    <>
      {/* Dropdown Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full px-4 py-3
          bg-zinc-900 border rounded-xl
          text-white text-left
          flex items-center justify-between
          transition-all duration-200
          ${className}
          ${isOpen
            ? 'border-rose-500 ring-1 ring-rose-500/50'
            : 'border-white/10'
          }
          ${disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:border-rose-500/50 focus:outline-none'
          }
        `}
      >
        <span className="truncate text-sm">{selectedLabel}</span>
        <ChevronDown
          size={16}
          className={`text-zinc-500 transition-transform duration-200 flex-shrink-0 ml-2 ${isOpen ? 'rotate-180 text-rose-400' : ''}`}
        />
      </button>

      {/* BLOCK 7.2: Portal-based Dropdown Menu */}
      {isOpen && !disabled && createPortal(
        <>
          {/* Invisible Backdrop for click-outside detection */}
          <div
            className="fixed inset-0 z-[10001]"
            onClick={handleBackdropClick}
          />

          {/* Floating Menu */}
          <div
            className="fixed z-[10002] bg-zinc-950 border border-white/10 rounded-xl shadow-2xl shadow-rose-900/20 overflow-hidden min-w-[200px]"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
              width: `${menuPosition.width}px`
            }}
          >
            <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
              {options.map((option) => (
                <div
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  className={`
                    p-3 text-sm cursor-pointer transition-colors
                    ${value === option.value
                      ? 'bg-white/5 text-rose-400 font-medium'
                      : 'text-zinc-300 hover:bg-rose-500/20 hover:text-white'}
                  `}
                >
                  {option.label}
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

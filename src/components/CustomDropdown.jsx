import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

/**
 * CustomDropdown — Dark theme select component using React Portal.
 * Renders menu outside modal hierarchy to avoid clipping.
 * @param {object} props
 * @param {string} props.value - Current selected value
 * @param {Function} props.onChange - Called with { target: { value } } on selection
 * @param {Array<{value: string, label: string}>} props.options - Available options
 * @param {string} [props.className] - Additional classes for the button
 * @param {boolean} [props.disabled] - Disable the dropdown
 */
export default function CustomDropdown({ value, onChange, options, className = '', disabled = false }) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef(null);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const menuHeight = Math.min(options.length * 40, 280);
      const openAbove = spaceBelow < menuHeight && rect.top > menuHeight;

      setMenuPosition({
        top: openAbove ? rect.top + window.scrollY - menuHeight - 4 : rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 200)
      });
    }
  }, [isOpen, options.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);
  const selectedLabel = selectedOption ? selectedOption.label : (t.common?.select || 'Select...');

  const handleSelect = (optionValue) => {
    onChange({ target: { value: optionValue } });
    setIsOpen(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`theme-control flex items-center justify-between text-left transition-all duration-200 ${className} ${
          isOpen ? 'border-[color:var(--theme-accent-border)] text-[var(--color-text)] shadow-[0_0_0_1px_rgb(var(--color-primary-rgb)/0.18)]' : 'theme-label'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className="truncate text-sm">{selectedLabel}</span>
        <ChevronDown
          size={16}
          className={`ml-2 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[color:var(--theme-accent-strong)]' : 'theme-text-soft'
          }`}
        />
      </button>

      {isOpen && !disabled && createPortal(
        <>
          <div className="fixed inset-0 z-[10001]" onClick={() => setIsOpen(false)} />
          <div
            className="theme-popover fixed z-[10002] overflow-hidden rounded-xl"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
              width: `${menuPosition.width}px`
            }}
          >
            <div className="scrollbar-thin max-h-[280px] overflow-y-auto py-1">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                    value === option.value
                      ? 'bg-[color:var(--theme-accent-soft)] text-[color:var(--color-text)]'
                      : 'theme-label hover:bg-[color:var(--theme-accent-muted)] hover:text-[color:var(--color-text)]'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    {option.label}
                    {value === option.value && <span className="text-[color:var(--theme-accent-strong)] text-xs">●</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

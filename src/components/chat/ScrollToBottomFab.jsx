import React from 'react';
import { ChevronDown } from 'lucide-react';

const ScrollToBottomFab = ({ visible, onClick, label = 'Scroll to bottom' }) => {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="absolute bottom-24 right-6 w-10 h-10 rounded-full bg-rose-500 text-white shadow-lg flex items-center justify-center border-2 border-transparent hover:border-rose-300 transition-colors z-30"
    >
      <ChevronDown className="w-5 h-5" />
    </button>
  );
};

export default ScrollToBottomFab;

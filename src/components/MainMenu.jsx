// ARIA v1.0 RELEASE - MainMenu (Rose Noir Theme)
import { useState, useMemo } from 'react';
import { Heart } from 'lucide-react';
import SupporterModal from './SupporterModal';
import { useLanguage } from '../context/LanguageContext';
import useGoldMode from '../hooks/useGoldMode';
import useEntranceAnimation from '../hooks/useEntranceAnimation';

function MainMenu({ onNewGame, onLoadGame, onSettings }) {
  const { t } = useLanguage();
  const isVisible = useEntranceAnimation(100);
  const [showSupporterModal, setShowSupporterModal] = useState(false);
  const isSupporter = useMemo(() => localStorage.getItem('isSupporter') === 'true', []);
  const isGoldMode = useGoldMode();

  return (
    <div className="theme-screen-shell relative flex h-full w-full flex-col items-center justify-center overflow-hidden p-8">
      {/* Logo / Title Area - BLOCK 6.9: Smooth Fade-In / Premium Gold */}
      <div className={`relative z-10 text-center mb-16 transition-all ${
        isGoldMode ? 'duration-[1500ms] ease-out' : 'duration-500'
      } ${
        isVisible 
          ? 'opacity-100 scale-100' 
          : (isGoldMode ? 'opacity-0 scale-105' : 'opacity-0 scale-95')
      }`}>
        {/* Decorative Element - Graphite Premium / Gold Dynamic */}
        <div className="relative inline-block mb-8">
          <div className="theme-brand-badge relative mx-auto flex h-28 w-28 items-center justify-center rounded-[2rem] backdrop-blur-xl">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              {/* Outer Ring */}
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={isGoldMode ? "url(#goldGradient)" : "url(#roseGradient)"}
                strokeWidth="1"
                className="animate-spin-slow"
              />
              {/* Inner Design */}
              <circle
                cx="50"
                cy="50"
                r="30"
                fill="none"
                stroke={isGoldMode ? "url(#goldGradient)" : "url(#roseGradient)"}
                strokeWidth="0.5"
              />
              {/* Center Icon */}
              <path
                d="M35 30 L35 70 L70 50 Z"
                fill={isGoldMode ? "url(#goldGradient)" : "url(#roseGradient)"}
                opacity="0.8"
              />
              <defs>
                <linearGradient id="roseGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f4f6fb" />
                  <stop offset="52%" stopColor="#c9d0db" />
                  <stop offset="100%" stopColor="#b49aaa" />
                </linearGradient>
                
                <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="50%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#d97706" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Title - Graphite Premium / Gold Mode */}
        <h1 className="text-6xl font-bold mb-4 tracking-tight">
          <span className={isGoldMode 
            ? "bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(251,191,36,0.4)]"
            : "theme-brand-gradient"
          }>
            Aria
          </span>
        </h1>

        <p className="theme-mainmenu-tagline text-xs font-medium uppercase tracking-[0.3em]">
          {t.mainMenu?.tagline || '100% Local • Uncensored • Offline'}
        </p>
      </div>

      {/* Menu Buttons - BLOCK 6.9: Cinema Cards with Smooth Fade / Premium Gold */}
      <div className={`relative z-10 flex flex-col gap-4 w-full max-w-sm transition-all ease-out delay-200 ${
        isGoldMode ? 'duration-[1500ms]' : 'duration-500'
      } ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}>
        {/* New Game Button - Primary Rose / Gold Mode */}
        <button
          onClick={onNewGame}
          className="group relative w-full px-8 py-5 overflow-hidden rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          aria-label={t.mainMenu.newGame}
        >
          {/* Background */}
          <div className={`absolute inset-0 ${
            isGoldMode 
              ? 'bg-gradient-to-r from-amber-600 to-yellow-500 opacity-90 group-hover:opacity-100 group-hover:shadow-[0_0_20px_rgba(251,191,36,0.3)]'
              : 'theme-brand-button opacity-95 group-hover:opacity-100'
          } transition-opacity`} />

          {/* Glass Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-white/8 to-transparent" />

          {/* Glow Effect */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="absolute inset-[-2px] bg-white blur-xl opacity-12" />
          </div>

          {/* Content */}
          <span className={`relative flex items-center justify-center gap-3 font-semibold tracking-widest uppercase text-sm ${
            isGoldMode ? 'text-black font-bold' : 'text-[#101115] font-bold'
          }`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t.mainMenu.newGame}
          </span>
        </button>

        {/* Load Game Button - Cinema Card */}
        <button
          onClick={onLoadGame}
          className="group relative w-full px-8 py-5 overflow-hidden rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          aria-label={t.mainMenu.load}
        >
          {/* Background */}
          <div className="theme-outline-button absolute inset-0 rounded-2xl backdrop-blur-sm transition-all duration-300" />

          {/* Content */}
          <span className="relative flex items-center justify-center gap-3 text-[#eceaf4] font-semibold tracking-widest uppercase text-sm transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {t.mainMenu.load}
          </span>
        </button>

        {/* Settings Button - Cinema Card */}
        <button
          onClick={onSettings}
          className="group relative w-full px-8 py-5 overflow-hidden rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          aria-label={t.mainMenu.settings}
        >
          {/* Background */}
          <div className="theme-outline-button absolute inset-0 rounded-2xl backdrop-blur-sm transition-all duration-300" />

          {/* Content */}
          <span className="relative flex items-center justify-center gap-3 text-[#eceaf4] font-semibold tracking-widest uppercase text-sm transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t.mainMenu.settings}
          </span>
        </button>
      </div>

      {/* Footer - BLOCK 7.0: Support Button + Badge / Premium Gold */}
      <div className={`absolute z-10 bottom-8 w-full flex items-center justify-between px-8 transition-all ease-out delay-300 ${
        isGoldMode ? 'duration-[1500ms]' : 'duration-500'
      } ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}>
        {/* Support Button (Bottom Left) - Premium Design */}
        <button
          onClick={() => setShowSupporterModal(true)}
          className="theme-mainmenu-support group relative flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all overflow-hidden"
        >
          {/* Gradient Border Background */}
          <div className="absolute inset-0 rounded-xl border border-[color:var(--theme-accent-border)] bg-gradient-to-r from-white/4 via-[color:var(--theme-accent-soft)] to-transparent transition-all group-hover:border-[color:var(--theme-accent-strong)]/40" />
          
          {/* Glow Effect */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="absolute inset-[-2px] bg-white blur-lg opacity-10 rounded-xl" />
          </div>
          
          {/* Shadow */}
          <div className="absolute inset-0 transition-shadow rounded-xl" />
          
          {/* Content */}
          <Heart size={18} className="relative text-[color:var(--theme-accent-strong)] group-hover:scale-110 transition-transform animate-pulse" />
          <span className="theme-text-muted relative text-sm font-semibold transition-colors group-hover:text-[var(--color-text)]">
            {t.mainMenu.support}
          </span>
        </button>

        {/* Center: Version Info */}
        <div className="text-center">
          {isSupporter && (
            <div className="mt-1 flex items-center justify-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full">
              <svg className="w-3 h-3 text-amber-400 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-xs font-bold text-amber-400">{t.mainMenu.premiumSupporter}</span>
            </div>
          )}
        </div>

        {/* Spacer for layout balance */}
        <div className="w-[100px]" />
      </div>

      {/* BLOCK 7.0: Supporter Modal */}
      {showSupporterModal && (
        <SupporterModal onClose={() => setShowSupporterModal(false)} />
      )}
    </div>
  );
}

export default MainMenu;
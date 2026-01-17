// ARIA v1.0 RELEASE - MainMenu (Rose Noir Theme)
import React, { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import SupporterModal from './SupporterModal';
import { useLanguage } from '../context/LanguageContext';

function MainMenu({ onNewGame, onLoadGame, onSettings }) {
  const { t } = useLanguage();
  const [isVisible, setIsVisible] = useState(false);
  const [showSupporterModal, setShowSupporterModal] = useState(false);
  const [isSupporter, setIsSupporter] = useState(false);
  const [isGoldMode, setIsGoldMode] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setIsVisible(true), 100);
    
    // Check Gold Mode function
    const checkGoldMode = () => {
      const isSupporter = localStorage.getItem('isSupporter') === 'true';
      const goldTheme = localStorage.getItem('goldThemeEnabled') === 'true';
      setIsSupporter(isSupporter);
      setIsGoldMode(isSupporter && goldTheme);
    };
    
    // Initial check
    checkGoldMode();
    
    // Listen for changes
    window.addEventListener('gold-theme-changed', checkGoldMode);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('gold-theme-changed', checkGoldMode);
    };
  }, []);

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-8 relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-900 to-black">
      {/* Logo / Title Area - BLOCK 6.9: Smooth Fade-In / Premium Gold */}
      <div className={`relative z-10 text-center mb-16 transition-all ${
        isGoldMode ? 'duration-[1500ms] ease-out' : 'duration-500'
      } ${
        isVisible 
          ? 'opacity-100 scale-100' 
          : (isGoldMode ? 'opacity-0 scale-105' : 'opacity-0 scale-95')
      }`}>
        {/* Decorative Element - Rose Noir / Gold Dynamic */}
        <div className="relative inline-block mb-8">
          <div className="relative w-28 h-28 mx-auto">
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
                  <stop offset="0%" stopColor="#f43f5e" />
                  <stop offset="50%" stopColor="#e11d48" />
                  <stop offset="100%" stopColor="#be123c" />
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

        {/* Title - Rose Noir / Gold Mode */}
        <h1 className="text-6xl font-bold mb-4 tracking-tight">
          <span className={isGoldMode 
            ? "bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(251,191,36,0.4)]"
            : "bg-gradient-to-r from-rose-400 via-rose-500 to-pink-600 bg-clip-text text-transparent"
          }>
            Aria
          </span>
        </h1>

        <p className="text-zinc-500 text-xs tracking-[0.3em] uppercase font-medium">
          100% Local • Uncensored • Offline
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
        >
          {/* Background */}
          <div className={`absolute inset-0 ${
            isGoldMode 
              ? 'bg-gradient-to-r from-amber-600 to-yellow-500 opacity-90 group-hover:opacity-100 group-hover:shadow-[0_0_20px_rgba(251,191,36,0.3)]'
              : 'bg-gradient-to-r from-rose-600 to-pink-600 opacity-90 group-hover:opacity-100'
          } transition-opacity`} />

          {/* Glass Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />

          {/* Glow Effect */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="absolute inset-[-2px] bg-rose-500 blur-xl opacity-30" />
          </div>

          {/* Content */}
          <span className={`relative flex items-center justify-center gap-3 font-semibold tracking-widest uppercase text-sm ${
            isGoldMode ? 'text-black font-bold' : 'text-white'
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
        >
          {/* Background */}
          <div className="absolute inset-0 bg-zinc-900/80 backdrop-blur-sm border border-white/5 rounded-2xl group-hover:border-rose-500/50 group-hover:bg-zinc-900 group-hover:shadow-[0_0_30px_rgba(226,29,72,0.2)] transition-all duration-300" />

          {/* Content */}
          <span className="relative flex items-center justify-center gap-3 text-zinc-400 group-hover:text-white font-medium tracking-widest uppercase text-sm transition-colors">
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
        >
          {/* Background */}
          <div className="absolute inset-0 bg-zinc-900/80 backdrop-blur-sm border border-white/5 rounded-2xl group-hover:border-rose-500/50 group-hover:bg-zinc-900 group-hover:shadow-[0_0_30px_rgba(226,29,72,0.2)] transition-all duration-300" />

          {/* Content */}
          <span className="relative flex items-center justify-center gap-3 text-zinc-400 group-hover:text-white font-medium tracking-widest uppercase text-sm transition-colors">
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
          className="group relative flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all overflow-hidden"
        >
          {/* Gradient Border Background */}
          <div className="absolute inset-0 bg-gradient-to-r from-rose-900/20 via-rose-500/10 to-transparent rounded-xl border border-rose-500/20 group-hover:border-rose-500/40 transition-all" />
          
          {/* Glow Effect */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="absolute inset-[-2px] bg-rose-500 blur-lg opacity-30 rounded-xl" />
          </div>
          
          {/* Shadow */}
          <div className="absolute inset-0 shadow-rose-500/20 group-hover:shadow-rose-500/40 transition-shadow rounded-xl" />
          
          {/* Content */}
          <Heart size={18} className="relative text-rose-400 group-hover:scale-110 transition-transform animate-pulse" />
          <span className="relative text-sm text-zinc-400 group-hover:text-rose-300 font-semibold transition-colors">
            {t.mainMenu.support}
          </span>
        </button>

        {/* Center: Version Info */}
        <div className="text-center">
          <p className="text-zinc-600 text-xs tracking-widest uppercase">
            {t.mainMenu.footer}
          </p>
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
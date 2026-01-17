// ARIA v1.0 RELEASE - SupporterModal (Final Polish - Pay What You Want Slider)
import React, { useState, useEffect } from 'react';
import { Heart, Check, X, Sparkles, Crown } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function SupporterModal({ onClose }) {
  const { t } = useLanguage();
  const [donationAmount, setDonationAmount] = useState(15);
  const [supporterKey, setSupporterKey] = useState('');
  const [isPremium, setIsPremium] = useState(false);
  const [showGoldTheme, setShowGoldTheme] = useState(false);
  const [validationMessage, setValidationMessage] = useState(null);

  // Load Premium status and Gold Theme preference on mount
  useEffect(() => {
    const saved = localStorage.getItem('isSupporter');
    if (saved === 'true') {
      setIsPremium(true);
    }
    const goldTheme = localStorage.getItem('goldThemeEnabled');
    if (goldTheme === 'true') {
      setShowGoldTheme(true);
    }
  }, []);

  const validateKey = () => {
    if (supporterKey.trim() === 'ARIA-SUP-2025-GOLD') {
      localStorage.setItem('isSupporter', 'true');
      setIsPremium(true);
      setValidationMessage({ type: 'success', text: t.supporter.goldModeActivated });
      setTimeout(() => {
        onClose();
      }, 2000);
    } else {
      setValidationMessage({ type: 'error', text: t.supporter.invalidSupporterKey });
    }
  };

  const handleGoldThemeToggle = (enabled) => {
    setShowGoldTheme(enabled);
    localStorage.setItem('goldThemeEnabled', enabled.toString());
    // Dispatch event to notify other components
    window.dispatchEvent(new Event('gold-theme-changed'));
  };

  const openKoFi = () => {
    if (window.electronAPI?.openExternal) {
      const url = `https://ko-fi.com/gakuseei?amount=${donationAmount}`;
      window.electronAPI.openExternal(url);
    }
  };

  // Dynamic gradient calculation based on donation amount
  const getGradientClasses = () => {
    if (donationAmount >= 5 && donationAmount <= 15) {
      return {
        from: 'from-rose-600',
        to: 'to-rose-500',
        fromColor: 'rgb(225, 29, 72)',
        toColor: 'rgb(244, 63, 94)',
        textColor: 'text-rose-400',
        shadowColor: 'shadow-rose-500/30'
      };
    } else if (donationAmount >= 20 && donationAmount <= 25) {
      return {
        from: 'from-rose-500',
        to: 'to-amber-500',
        fromColor: 'rgb(244, 63, 94)',
        toColor: 'rgb(245, 158, 11)',
        textColor: 'text-amber-400',
        shadowColor: 'shadow-amber-500/30'
      };
    } else {
      return {
        from: 'from-amber-500',
        to: 'to-yellow-400',
        fromColor: 'rgb(245, 158, 11)',
        toColor: 'rgb(250, 204, 21)',
        textColor: 'text-yellow-400',
        shadowColor: 'shadow-yellow-400/30'
      };
    }
  };

  const gradient = getGradientClasses();
  const sliderPercentage = ((donationAmount - 5) / (50 - 5)) * 100;

  // Generate Minimalist Rose Particles (8 particles)
  const particles = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 10}s`,
    duration: `${15 + Math.random() * 10}s`
  }));

  // Theme based on Gold Mode toggle
  const useGoldTheme = showGoldTheme && isPremium;

  // Base perks
  const basePerks = [
    { icon: '⭐', text: t.supporter.unlocksGoldMode },
    { icon: '✨', text: t.supporter.premiumCharacters },
    { icon: '❤️', text: t.supporter.prioritySupport },
    { icon: '🚀', text: t.supporter.betaFeatures }
  ];

  // Conditional perk for 30€+
  const perks = donationAmount >= 30
    ? [...basePerks, { icon: '🏆', text: t.supporter.eternalGratitude }]
    : basePerks;

  // Tick marks positions (5, 10, 15, 20, 25, 30, 40, 50)
  const tickMarks = [5, 10, 15, 20, 25, 30, 40, 50];
  const getTickPosition = (value) => ((value - 5) / 45) * 100;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden bg-zinc-950">
      {/* Minimalist Rose Particles Background - Backdrop Click to Close */}
      <div 
        className="absolute inset-0 overflow-hidden cursor-pointer"
        onClick={onClose}
      >
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute w-1 h-1 bg-rose-400 opacity-[0.03] rounded-full blur-sm"
            style={{
              left: particle.left,
              bottom: '-10px',
              animation: `floatUp ${particle.duration} ${particle.delay} infinite linear`
            }}
          />
        ))}
      </div>

      {/* Modal Container */}
      <div className="relative bg-zinc-950 border border-rose-500/20 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden backdrop-blur-md">
        {/* Velvet Noise Texture */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-5"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.5'/%3E%3C/svg%3E")`
          }}
        />
        {/* Header */}
        <div className={`p-8 border-b ${useGoldTheme ? 'border-amber-400/20' : 'border-rose-500/20'} bg-zinc-900/50 backdrop-blur-md`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-xl ${useGoldTheme ? 'bg-amber-400/20' : 'bg-rose-500/20'} flex items-center justify-center border ${useGoldTheme ? 'border-amber-400/30' : 'border-rose-500/30'} animate-pulse`}>
                <Heart size={28} className={useGoldTheme ? 'text-amber-400' : 'text-rose-400'} />
              </div>
              <div>
                <h2 className="text-3xl font-sans font-bold tracking-tight text-white mb-1">{t.supporter.supportAria}</h2>
                <p className="text-sm text-zinc-400">{t.supporter.localUncensored}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Gold Theme Toggle (if Premium) */}
              {isPremium && (
                <div className="flex items-center gap-2">
                  <Crown size={18} className={useGoldTheme ? 'text-amber-400' : 'text-rose-400'} />
                  <button
                    onClick={() => handleGoldThemeToggle(!showGoldTheme)}
                    className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${
                      showGoldTheme ? 'bg-amber-400/30' : 'bg-zinc-700'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-300 ${
                        showGoldTheme ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-zinc-800/50 rounded-lg transition-all"
              >
                <X size={20} className="text-zinc-400 hover:text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Slider Section (Centerpiece) */}
          <div className="mb-8">
            {/* Amount Display */}
            <div className="text-center mb-8">
              <div className={`text-7xl font-bold mb-2 ${gradient.textColor}`}>
                €{donationAmount}
              </div>
              <p className="text-sm text-zinc-400">{t.supporter.payWhatYouWant}</p>
            </div>

            {/* Custom Range Slider with Tick Marks */}
            <div className="mb-8 relative">
              <div className="relative w-full">
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={donationAmount}
                  onChange={(e) => setDonationAmount(Number(e.target.value))}
                  className="w-full h-3 bg-zinc-800 rounded-lg appearance-none cursor-pointer custom-slider"
                  style={{
                    background: `linear-gradient(to right, 
                      ${gradient.fromColor} 0%, 
                      ${gradient.fromColor} ${sliderPercentage}%, 
                      ${gradient.toColor} ${sliderPercentage}%, 
                      ${gradient.toColor} 100%)`
                  }}
                />
                
                {/* Tick Marks - Precise alignment */}
                <div className="absolute top-3 left-0 w-full h-2 pointer-events-none">
                  {tickMarks.map((tick) => (
                    <div
                      key={tick}
                      className="absolute w-1 h-1 bg-zinc-600 rounded-full -translate-x-1/2"
                      style={{ left: `${getTickPosition(tick)}%` }}
                    />
                  ))}
                </div>
              </div>
              
              {/* Slider Labels */}
              <div className="flex justify-between mt-4 text-xs text-zinc-500">
                <span>€5</span>
                <span>€50</span>
              </div>
            </div>

            {/* What You Get Box */}
            <div className="bg-zinc-900/50 backdrop-blur-sm rounded-xl p-6 border border-zinc-800 mb-8">
              <h3 className="text-lg font-bold text-white mb-5">{t.supporter.whatYouGet}</h3>
              <ul className="space-y-3">
                {perks.map((perk, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-zinc-300">
                    <span className="text-base flex-shrink-0">{perk.icon}</span>
                    <span>{perk.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Main Action Button */}
          <button
            onClick={openKoFi}
            className={`w-full py-4 bg-gradient-to-r ${gradient.from} ${gradient.to} hover:opacity-90 rounded-xl text-white font-bold text-lg transition-all shadow-lg ${gradient.shadowColor} hover:shadow-xl mb-8`}
          >
            {t.supporter.ignitePassion.replace('{amount}', donationAmount)}
          </button>

          {/* Activation Section */}
          <div className="rounded-xl p-6 border border-zinc-800 bg-zinc-900/30 backdrop-blur-md">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles size={22} className={useGoldTheme ? 'text-amber-400' : 'text-rose-400'} />
              <h3 className="text-xl font-bold text-white">{t.supporter.activateGoldMode}</h3>
            </div>

            <p className="text-sm text-zinc-400 mb-5 leading-relaxed">
              {t.supporter.afterDonation}
            </p>

            <div className="flex gap-3">
              <input
                type="text"
                value={supporterKey}
                onChange={(e) => setSupporterKey(e.target.value)}
                placeholder={t.supporter.supporterKeyPlaceholder}
                className={`flex-1 bg-zinc-900 border ${useGoldTheme ? 'border-amber-400/30 focus:border-amber-400' : 'border-rose-500/30 focus:border-rose-500'} rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none transition-colors disabled:opacity-50`}
                disabled={isPremium}
              />
              <button
                onClick={validateKey}
                disabled={isPremium || !supporterKey.trim()}
                className="px-8 py-3 bg-gradient-to-r from-rose-500 to-amber-400 hover:from-rose-600 hover:to-amber-500 rounded-xl text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-rose-500/20"
              >
                {t.supporter.activateGoldModeButton}
              </button>
            </div>

            {validationMessage && (
              <div className={`mt-4 p-4 rounded-lg border ${
                validationMessage.type === 'success'
                  ? 'bg-green-500/10 border-green-500/30 text-green-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}>
                <p className="text-sm font-medium">{validationMessage.text}</p>
              </div>
            )}
          </div>

          {/* Footer Note */}
          <div className="mt-8 text-center">
            <p className="text-sm text-zinc-500 leading-relaxed">
              {t.supporter.ariaStaysFree.split('{free}')[0]}
              <span className={`${useGoldTheme ? 'text-amber-400' : 'text-rose-400'} font-semibold`}>{t.supporter.freeLocal}</span>
              {t.supporter.ariaStaysFree.split('{free}')[1]}
            </p>
          </div>
        </div>
      </div>

      {/* CSS Animations & Custom Slider Styles */}
      <style>{`
        @keyframes floatUp {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 0.5;
          }
          90% {
            opacity: 0.5;
          }
          100% {
            transform: translateY(-100vh) rotate(360deg);
            opacity: 0;
          }
        }
        
        .custom-slider {
          -webkit-appearance: none;
          appearance: none;
          outline: none;
        }
        
        .custom-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: white;
          border: 3px solid rgb(251, 191, 36);
          cursor: pointer;
          box-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
          transition: all 0.2s;
        }
        
        .custom-slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
          box-shadow: 0 0 20px rgba(251, 191, 36, 0.8);
        }
        
        .custom-slider::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: white;
          border: 3px solid rgb(251, 191, 36);
          cursor: pointer;
          box-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
          transition: all 0.2s;
        }
        
        .custom-slider::-moz-range-thumb:hover {
          transform: scale(1.15);
          box-shadow: 0 0 20px rgba(251, 191, 36, 0.8);
        }
      `}</style>
    </div>
  );
}

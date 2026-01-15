// ARIA v1.0 RELEASE - Language Context

import { createContext, useContext, useState, useEffect } from 'react';
import { getTranslations } from '../lib/translations';

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState('en'); // Default: English
  const [t, setT] = useState(getTranslations('en'));

  // Load language from localStorage on mount
  useEffect(() => {
    const savedLanguage = localStorage.getItem('language') || 'en';
    setLanguageState(savedLanguage);
    setT(getTranslations(savedLanguage));
  }, []);

  const setLanguage = (lang) => {
    setLanguageState(lang);
    setT(getTranslations(lang));
    localStorage.setItem('language', lang);

    const settings = JSON.parse(localStorage.getItem('settings') || '{}');
    if (settings.preferredLanguage !== lang) {
      settings.preferredLanguage = lang;
      localStorage.setItem('settings', JSON.stringify(settings));
      console.log('[v1.0 LanguageContext] Synced preferredLanguage:', lang);
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

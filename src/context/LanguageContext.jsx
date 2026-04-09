import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { FALLBACK_LANGUAGE, getTranslations, loadTranslations } from '../lib/translations';

const LanguageContext = createContext();

function getInitialLanguage() {
  if (typeof window === 'undefined') {
    return FALLBACK_LANGUAGE;
  }

  const savedLanguage = window.localStorage.getItem('language');
  return typeof savedLanguage === 'string' && savedLanguage.trim()
    ? savedLanguage.trim().toLowerCase()
    : FALLBACK_LANGUAGE;
}

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(getInitialLanguage);
  const [t, setT] = useState(() => getTranslations(getInitialLanguage()));
  const loadRequestRef = useRef(0);

  useEffect(() => {
    let active = true;
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;

    loadTranslations(language)
      .then((nextTranslations) => {
        if (!active || requestId !== loadRequestRef.current) {
          return;
        }
        setT(nextTranslations);
      })
      .catch((error) => {
        console.error('[LanguageContext] Failed to load translations:', error);
        if (active && requestId === loadRequestRef.current) {
          setT(getTranslations(FALLBACK_LANGUAGE));
        }
      });

    return () => {
      active = false;
    };
  }, [language]);

  const setLanguage = (lang) => {
    const nextLanguage = typeof lang === 'string' && lang.trim()
      ? lang.trim().toLowerCase()
      : FALLBACK_LANGUAGE;

    setLanguageState(nextLanguage);
    setT(getTranslations(nextLanguage));

    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('language', nextLanguage);

    let settings = {};
    try {
      settings = JSON.parse(window.localStorage.getItem('settings') || '{}');
    } catch {
      settings = {};
    }

    if (settings.preferredLanguage !== nextLanguage) {
      settings.preferredLanguage = nextLanguage;
      window.localStorage.setItem('settings', JSON.stringify(settings));
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

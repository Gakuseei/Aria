import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import useGoldMode from '../hooks/useGoldMode';
import useEntranceAnimation from '../hooks/useEntranceAnimation';

const LANGUAGES = [
  { code: 'English', label: 'English', beta: false },
  { code: 'German', label: 'Deutsch', beta: true },
  { code: 'French', label: 'Français', beta: true },
  { code: 'Spanish', label: 'Español', beta: true },
  { code: 'Japanese', label: '日本語', beta: true },
  { code: 'Korean', label: '한국어', beta: true },
  { code: 'Chinese', label: '中文', beta: true },
  { code: 'Portuguese', label: 'Português', beta: true },
  { code: 'Russian', label: 'Русский', beta: true },
  { code: 'Italian', label: 'Italiano', beta: true },
  { code: 'Polish', label: 'Polski', beta: true },
  { code: 'Turkish', label: 'Türkçe', beta: true },
  { code: 'Arabic', label: 'العربية', beta: true },
];

function AICharacterBuilder({ onSave, onBack, settings }) {
  const { t } = useLanguage();
  const isGoldMode = useGoldMode();
  const isVisible = useEntranceAnimation(50);

  const [currentStep, setCurrentStep] = useState(1);
  const [description, setDescription] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [availableModels, setAvailableModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generatedCharacter, setGeneratedCharacter] = useState(null);

  useEffect(() => {
    async function loadModels() {
      const result = await window.electronAPI.ollamaModels({ ollamaUrl: settings.ollamaUrl });
      if (result.success) {
        setAvailableModels(result.models);
        if (result.models.length > 0 && !selectedModel) {
          setSelectedModel(settings.ollamaModel || result.models[0]);
        }
      }
    }
    loadModels();
  }, []);

  return (
    <div className={`h-full w-full flex flex-col p-8 bg-gradient-to-br from-zinc-900 via-zinc-900 to-black transition-all duration-300 ${
      isVisible ? 'opacity-100' : 'opacity-0'
    }`}>
      <div className="glass-header flex items-center justify-between px-6 py-5 mb-8 rounded-2xl">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-3 hover:bg-white/5 rounded-xl transition-all duration-200 text-zinc-500 hover:text-white"
            aria-label={t.common?.back || 'Back'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h2 className={`text-2xl font-bold ${
              isGoldMode
                ? 'bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent'
                : 'text-white'
            }`}>
              {t.aiCharacterBuilder?.title || 'AI Character Builder'}
            </h2>
            <p className="text-zinc-500 text-sm">
              {t.aiCharacterBuilder?.subtitle || 'Describe your character and let AI bring it to life'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 ${
                step === currentStep
                  ? isGoldMode
                    ? 'bg-amber-500 text-black'
                    : 'bg-violet-500 text-white'
                  : step < currentStep
                    ? isGoldMode
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-violet-500/20 text-violet-400'
                    : 'bg-zinc-800 text-zinc-500'
              }`}>
                {step < currentStep ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : step}
              </div>
              {step < 4 && (
                <div className={`w-8 h-0.5 transition-all duration-300 ${
                  step < currentStep
                    ? isGoldMode ? 'bg-amber-500/40' : 'bg-violet-500/40'
                    : 'bg-zinc-800'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {currentStep === 1 && (
          <div className="w-full max-w-2xl space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                {t.aiCharacterBuilder?.descriptionLabel || 'Describe your character'}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t.aiCharacterBuilder?.descriptionPlaceholder || 'A shy elven healer who lives in an enchanted forest...'}
                rows={6}
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-5 py-4 text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 text-lg leading-relaxed"
                autoFocus
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  {t.aiCharacterBuilder?.modelLabel || 'AI Model'}
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 appearance-none cursor-pointer"
                >
                  {availableModels.length === 0 && (
                    <option value="">{t.aiCharacterBuilder?.noModels || 'No models installed'}</option>
                  )}
                  {availableModels.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>

              <div className="w-48">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  {t.aiCharacterBuilder?.languageLabel || 'Output Language'}
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 appearance-none cursor-pointer"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}{lang.beta ? ' (Beta)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={() => {}}
              disabled={!description.trim() || !selectedModel || loading}
              className={`w-full py-4 rounded-xl font-medium text-lg transition-all duration-200 flex items-center justify-center gap-3 ${
                !description.trim() || !selectedModel
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : isGoldMode
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:from-amber-400 hover:to-yellow-400'
                    : 'bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-500 hover:to-purple-500'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              {t.aiCharacterBuilder?.generateButton || 'Generate Character'}
            </button>
          </div>
        )}

        {currentStep === 2 && (
          <div className="text-zinc-500">Generating... (to be implemented)</div>
        )}
        {currentStep === 3 && (
          <div className="text-zinc-500">Review & Edit (to be implemented)</div>
        )}
        {currentStep === 4 && (
          <div className="text-zinc-500">Save (to be implemented)</div>
        )}
      </div>
    </div>
  );
}

export default AICharacterBuilder;

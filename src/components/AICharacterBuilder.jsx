import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { fileToBase64 } from '../lib/api';
import { MAX_FILE_SIZE_BYTES } from '../lib/defaults';
import { useLanguage } from '../context/LanguageContext';
import useGoldMode from '../hooks/useGoldMode';
import useEntranceAnimation from '../hooks/useEntranceAnimation';
import CustomDropdown from './CustomDropdown';
import ResponseModeField from './ResponseModeField';
import { normalizeResponseMode } from '../lib/responseModes';

function RegenerateButton({ field, regeneratingField, onRegenerate, t }) {
  return (
    <button
      type="button"
      onClick={() => onRegenerate(field)}
      disabled={regeneratingField === field}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all ${
        regeneratingField === field
          ? 'bg-violet-500/10 text-violet-400'
          : 'text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10'
      }`}
      title={t.aiCharacterBuilder?.regenerate || 'Regenerate'}
    >
      {regeneratingField === field ? (
        <div className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M4.031 9.865" />
        </svg>
      )}
      <span>{regeneratingField === field ? (t.aiCharacterBuilder?.regenerating || 'Regenerating...') : (t.aiCharacterBuilder?.regenerate || 'Regenerate')}</span>
    </button>
  );
}

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
  const [regeneratingField, setRegeneratingField] = useState(null);
  const [avatarBase64, setAvatarBase64] = useState('');
  const [passionEnabled, setPassionEnabled] = useState(true);
  const [selectedType, setSelectedType] = useState('character');
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function loadModels() {
      const result = await window.electronAPI.ollamaModels({ ollamaUrl: settings.ollamaUrl });
      if (result.success) {
        setAvailableModels(result.models);
        if (result.models.length > 0) {
          setSelectedModel(prev => prev || settings.ollamaModel || result.models[0]);
        }
      }
    }
    loadModels();
  }, [settings.ollamaUrl, settings.ollamaModel]);

  const dispatchBuilderEvent = useCallback((type, message) => {
    window.dispatchEvent(new CustomEvent('aria-api-stats', {
      detail: { responseTime: 0, wordCount: 0, tokens: 0, model: selectedModel, wordsPerSecond: 0, passionRaw: null, builderEvent: `[CharBuilder] ${type}: ${message}` }
    }));
  }, [selectedModel]);

  const handleGenerate = async () => {
    if (!description.trim() || !selectedModel) return;

    setLoading(true);
    setError(null);
    setCurrentStep(2);
    dispatchBuilderEvent('generate', `Starting with ${selectedModel}, lang=${selectedLanguage}`);

    const startTime = Date.now();
    const result = await window.electronAPI.aiGenerateCharacter({
      description: description.trim(),
      model: selectedModel,
      language: selectedLanguage,
      type: selectedType,
      ollamaUrl: settings.ollamaUrl,
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    setLoading(false);

    if (result.success) {
      let character = result.character;
      const requiredFields = ['name', 'systemPrompt', 'startingMessage'];
      const missingFields = requiredFields.filter(f => !character[f]?.trim());

      if (missingFields.length > 0) {
        dispatchBuilderEvent('auto-heal', `Fixing missing fields: ${missingFields.join(', ')}`);
        for (const fieldName of missingFields) {
          const healResult = await window.electronAPI.aiGenerateCharacter({
            description: description.trim(),
            model: selectedModel,
            language: selectedLanguage,
            type: selectedType,
            field: fieldName,
            existingCharacter: character,
            ollamaUrl: settings.ollamaUrl,
          });
          if (healResult.success) {
            character = { ...character, [fieldName]: healResult.content.trim() };
          }
        }
      }

      setGeneratedCharacter({
        ...character,
        responseMode: normalizeResponseMode(character.responseMode ?? character.responseStyle, 'normal')
      });
      setCurrentStep(3);
      dispatchBuilderEvent('success', `Generated "${character?.name}" in ${elapsed}s${missingFields.length > 0 ? ` (healed: ${missingFields.join(', ')})` : ''}`);
    } else {
      const errorMsg = result.raw
        ? `${result.error}\n\nRaw output:\n${result.raw.substring(0, 500)}`
        : (result.error || 'Generation failed');
      setError(errorMsg);
      setCurrentStep(1);
      dispatchBuilderEvent('error', `Failed after ${elapsed}s: ${result.error}`);
    }
  };

  const handleCancel = () => {
    window.electronAPI.abortAiChat('character-builder');
    setLoading(false);
    setCurrentStep(1);
  };

  const handleRegenerateField = async (fieldName) => {
    setRegeneratingField(fieldName);
    dispatchBuilderEvent('regenerate', `Regenerating "${fieldName}"`);

    const result = await window.electronAPI.aiGenerateCharacter({
      description: description.trim(),
      model: selectedModel,
      language: selectedLanguage,
      type: selectedType,
      field: fieldName,
      existingCharacter: generatedCharacter,
      ollamaUrl: settings.ollamaUrl,
    });

    if (result.success) {
      setGeneratedCharacter(prev => ({ ...prev, [fieldName]: result.content.trim() }));
      dispatchBuilderEvent('regenerate-ok', `"${fieldName}" regenerated`);
    } else {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: `${t.aiCharacterBuilder?.generationFailed || 'Regeneration failed'}: ${result.error}`, type: 'error' }
      }));
      dispatchBuilderEvent('regenerate-fail', `"${fieldName}" failed: ${result.error}`);
    }

    setRegeneratingField(null);
  };

  const handleCharacterFieldChange = (field, value) => {
    setGeneratedCharacter(prev => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: t.characterCreator?.pleaseSelectImage || 'Please select an image file', type: 'error' } }));
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: t.characterCreator?.imageTooLarge || 'Image too large (max 2MB)', type: 'error' } }));
      return;
    }

    setUploadingImage(true);
    try {
      const base64 = await fileToBase64(file);
      setAvatarBase64(base64);
    } catch (err) {
      console.error('Image upload error:', err);
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: t.characterCreator?.failedToUpload || 'Failed to upload image', type: 'error' } }));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = () => {
    if (!generatedCharacter) return;

    const trimmedStartingMessage = generatedCharacter.startingMessage?.trim() || '';
    const character = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: generatedCharacter.name?.trim() || 'Unnamed',
      subtitle: generatedCharacter.subtitle?.trim() || '',
      description: generatedCharacter.description?.trim() || '',
      systemPrompt: generatedCharacter.systemPrompt?.trim() || '',
      instructions: generatedCharacter.instructions?.trim() || '',
      scenario: generatedCharacter.scenario?.trim() || '',
      exampleDialogue: generatedCharacter.exampleDialogue?.trim() || '',
      exampleDialogues: [],
      themeColor: generatedCharacter.themeColor || '#ef4444',
      avatarBase64: avatarBase64 || null,
      startingMessage: trimmedStartingMessage,
      greeting: trimmedStartingMessage,
      type: selectedType,
      responseMode: normalizeResponseMode(generatedCharacter.responseMode, 'normal'),
      passionEnabled: selectedType === 'bot' ? false : passionEnabled,
      passionSpeed: generatedCharacter.passionSpeed || 'normal',
      isCustom: true,
    };

    onSave(character);
  };

  const textareaFields = useMemo(() => {
    const fields = [
      { key: 'systemPrompt', label: selectedType === 'bot' ? (t.characterCreator?.botInstructions || 'Bot Instructions') : (t.aiCharacterBuilder?.fieldSystemPrompt || 'System Prompt'), rows: 10, mono: true },
      { key: 'instructions', label: t.aiCharacterBuilder?.fieldInstructions || 'Instructions', rows: 4, mono: false },
      { key: 'scenario', label: t.aiCharacterBuilder?.fieldScenario || 'Scenario', rows: 4, mono: false },
    ];
    if (selectedType !== 'bot') {
      fields.push({ key: 'exampleDialogue', label: t.aiCharacterBuilder?.fieldExampleDialogue || 'Example Dialogue', rows: 4, mono: true });
    }
    fields.push({ key: 'startingMessage', label: t.aiCharacterBuilder?.fieldStartingMessage || 'Starting Message', rows: 4, mono: false });
    return fields;
  }, [t, selectedType]);

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

        <div className="flex items-center gap-2">
          {[
            { num: 1, label: t.aiCharacterBuilder?.step1 || 'Describe' },
            { num: 2, label: t.aiCharacterBuilder?.step2 || 'Generate' },
            { num: 3, label: t.aiCharacterBuilder?.step3 || 'Review' },
            { num: 4, label: t.aiCharacterBuilder?.step4 || 'Save' },
          ].map(({ num, label }) => (
            <div key={num} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 ${
                  num === currentStep
                    ? isGoldMode
                      ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                      : 'bg-violet-500 text-white shadow-[0_0_12px_rgba(139,92,246,0.4)]'
                    : num < currentStep
                      ? isGoldMode
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-violet-500/20 text-violet-400'
                      : 'bg-zinc-800 text-zinc-500'
                }`}>
                  {num < currentStep ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : num}
                </div>
                <span className={`text-[10px] font-medium transition-colors ${
                  num === currentStep
                    ? isGoldMode ? 'text-amber-400' : 'text-violet-400'
                    : num < currentStep
                      ? 'text-zinc-500'
                      : 'text-zinc-600'
                }`}>{label}</span>
              </div>
              {num < 4 && (
                <div className={`w-8 h-0.5 mb-5 transition-all duration-300 ${
                  num < currentStep
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
                {t.aiCharacterBuilder?.characterType || 'Type'}
              </label>
              <div className="flex gap-2">
                {['character', 'bot'].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setSelectedType(type);
                      setPassionEnabled(type === 'character');
                    }}
                    className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      selectedType === type
                        ? isGoldMode
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                        : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 border border-transparent'
                    }`}
                  >
                    {type === 'character'
                      ? (t.aiCharacterBuilder?.typeCharacter || 'Character')
                      : (t.aiCharacterBuilder?.typeBot || 'Bot / Scenario')}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                {selectedType === 'character'
                  ? (t.aiCharacterBuilder?.typeCharacterDesc || 'Roleplay persona with personality and backstory')
                  : (t.aiCharacterBuilder?.typeBotDesc || 'Utility bot, scenario, or tool — no roleplay framing')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                {selectedType === 'bot'
                  ? (t.aiCharacterBuilder?.descriptionLabelBot || 'Describe your bot')
                  : (t.aiCharacterBuilder?.descriptionLabel || 'Describe your character')}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={selectedType === 'bot'
                  ? (t.aiCharacterBuilder?.descriptionPlaceholderBot || 'A dirty talk generator that creates vivid, custom dialogue...')
                  : (t.aiCharacterBuilder?.descriptionPlaceholder || 'A shy elven healer who lives in an enchanted forest...')}
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
                <CustomDropdown
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  options={availableModels.length > 0
                    ? availableModels.map(m => ({ value: m, label: m }))
                    : [{ value: '', label: t.aiCharacterBuilder?.noModels || 'No models installed' }]
                  }
                />
              </div>

              <div className="w-48">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  {t.aiCharacterBuilder?.languageLabel || 'Output Language'}
                </label>
                <CustomDropdown
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  options={LANGUAGES.map(lang => ({
                    value: lang.code,
                    label: `${lang.label}${lang.beta ? ' (Beta)' : ''}`
                  }))}
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-red-400 text-sm whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                {error}
              </div>
            )}

            <button
              onClick={handleGenerate}
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
          <div className="flex flex-col items-center justify-center gap-6">
            <div className="relative w-24 h-24">
              <div className={`absolute inset-0 rounded-full animate-ping opacity-20 ${
                isGoldMode ? 'bg-amber-500' : 'bg-violet-500'
              }`} />
              <div className={`absolute inset-2 rounded-full animate-pulse ${
                isGoldMode ? 'bg-amber-500/10' : 'bg-violet-500/10'
              } flex items-center justify-center`}>
                <svg className={`w-12 h-12 ${isGoldMode ? 'text-amber-400' : 'text-violet-400'}`} style={{ animation: 'spin 3s linear infinite' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-semibold text-white mb-2">
                {t.aiCharacterBuilder?.generating || 'Generating your character...'}
              </h3>
              <p className="text-zinc-500 text-sm">
                {t.aiCharacterBuilder?.generatingSubtitle || 'This may take a moment depending on your model'}
              </p>
              <p className="text-zinc-600 text-xs mt-2">{selectedModel}</p>
            </div>
            <button
              onClick={handleCancel}
              className="px-6 py-2 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 hover:text-white hover:border-zinc-600 transition-all text-sm"
            >
              {t.aiCharacterBuilder?.cancel || 'Cancel'}
            </button>
          </div>
        )}
        {currentStep === 3 && generatedCharacter && (
          <div className="w-full max-w-3xl h-full overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
            <div className="space-y-5 pb-8">
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-zinc-300">{t.aiCharacterBuilder?.fieldName || 'Name'}</label>
                    <RegenerateButton regeneratingField={regeneratingField} onRegenerate={handleRegenerateField} t={t} field="name" />
                  </div>
                  <input
                    type="text"
                    value={generatedCharacter.name || ''}
                    onChange={(e) => handleCharacterFieldChange('name', e.target.value)}
                    className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-violet-500/50"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-zinc-300">{t.aiCharacterBuilder?.fieldSubtitle || 'Subtitle'}</label>
                    <RegenerateButton regeneratingField={regeneratingField} onRegenerate={handleRegenerateField} t={t} field="subtitle" />
                  </div>
                  <input
                    type="text"
                    value={generatedCharacter.subtitle || ''}
                    onChange={(e) => handleCharacterFieldChange('subtitle', e.target.value)}
                    className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-violet-500/50"
                  />
                </div>
                <div className="w-32">
                  <label className="text-sm font-medium text-zinc-300 mb-2 block">{t.aiCharacterBuilder?.fieldThemeColor || 'Color'}</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={generatedCharacter.themeColor || '#ef4444'}
                      onChange={(e) => handleCharacterFieldChange('themeColor', e.target.value)}
                      className="h-10 w-10 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={generatedCharacter.themeColor || '#ef4444'}
                      onChange={(e) => handleCharacterFieldChange('themeColor', e.target.value)}
                      className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-2 py-2 text-white font-mono text-xs focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-zinc-300">{t.aiCharacterBuilder?.fieldDescription || 'Description'}</label>
                  <RegenerateButton regeneratingField={regeneratingField} onRegenerate={handleRegenerateField} t={t} field="description" />
                </div>
                <textarea
                  value={generatedCharacter.description || ''}
                  onChange={(e) => handleCharacterFieldChange('description', e.target.value)}
                  rows={2}
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-4 py-3 text-white resize-none focus:outline-none focus:border-violet-500/50"
                />
              </div>

              <ResponseModeField
                value={generatedCharacter.responseMode}
                onChange={(value) => handleCharacterFieldChange('responseMode', value)}
                accent={isGoldMode ? 'amber' : 'violet'}
                idPrefix="ai-character-builder-response-mode"
              />

              {textareaFields.map(({ key, label, rows, mono }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-zinc-300">{label}</label>
                    <RegenerateButton regeneratingField={regeneratingField} onRegenerate={handleRegenerateField} t={t} field={key} />
                  </div>
                  <textarea
                    value={generatedCharacter[key] || ''}
                    onChange={(e) => handleCharacterFieldChange(key, e.target.value)}
                    rows={rows}
                    className={`w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-4 py-3 text-white resize-none focus:outline-none focus:border-violet-500/50 ${mono ? 'font-mono text-sm' : ''}`}
                  />
                </div>
              ))}

              {selectedType !== 'bot' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-zinc-300">
                    {t.characterCreator?.passionSystem || 'Passion System'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setPassionEnabled(!passionEnabled)}
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                      passionEnabled ? isGoldMode ? 'bg-amber-500' : 'bg-violet-500' : 'bg-zinc-700'
                    }`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      passionEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
                {passionEnabled && (
                  <div className="grid grid-cols-4 gap-2">
                    {['slow', 'normal', 'fast', 'extreme'].map(speed => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => handleCharacterFieldChange('passionSpeed', speed)}
                        className={`px-3 py-2 text-sm rounded-lg transition-colors cursor-pointer ${
                          generatedCharacter.passionSpeed === speed
                            ? isGoldMode
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                            : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 border border-transparent'
                        }`}
                      >
                        {t.characterCreator?.[`passionSpeed_${speed}`] || speed.charAt(0).toUpperCase() + speed.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              )}

              <div className="flex justify-between pt-4 border-t border-zinc-800">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-6 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 hover:text-white hover:border-zinc-600 transition-all"
                >
                  {t.aiCharacterBuilder?.backToDescription || 'Back to Description'}
                </button>
                <button
                  onClick={() => setCurrentStep(4)}
                  className={`px-8 py-3 rounded-xl font-medium transition-all ${
                    isGoldMode
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:from-amber-400 hover:to-yellow-400'
                      : 'bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-500 hover:to-purple-500'
                  }`}
                >
                  {t.aiCharacterBuilder?.continueToSave || 'Continue to Save'}
                </button>
              </div>
            </div>
          </div>
        )}
        {currentStep === 4 && generatedCharacter && (
          <div className="w-full max-w-2xl space-y-8">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              aria-label="Upload character avatar"
            />

            <div className="relative aspect-[3/4] max-w-xs mx-auto bg-zinc-900/80 rounded-2xl overflow-hidden border-2 border-transparent hover:border-violet-500/50 transition-all">
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                {avatarBase64 ? (
                  <img src={avatarBase64} alt={generatedCharacter.name} className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-32 h-32 rounded-full flex items-center justify-center text-4xl font-bold text-white shadow-2xl"
                    style={{
                      background: `linear-gradient(135deg, ${generatedCharacter.themeColor || '#ef4444'}, ${generatedCharacter.themeColor || '#ef4444'}88)`,
                      boxShadow: `0 0 60px ${generatedCharacter.themeColor || '#ef4444'}40`
                    }}
                  >
                    {(generatedCharacter.name || '?').charAt(0)}
                  </div>
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent p-6 pt-16">
                <h3 className="text-lg font-bold text-white mb-1">{generatedCharacter.name || 'Unnamed'}</h3>
                <p className="text-sm font-medium mb-2" style={{ color: generatedCharacter.themeColor || '#ef4444' }}>
                  {generatedCharacter.subtitle || ''}
                </p>
                <p className="text-zinc-400 text-xs leading-relaxed line-clamp-2">
                  {generatedCharacter.description || ''}
                </p>
              </div>
              <div className="absolute top-4 left-4">
                <span className="px-2 py-1 rounded-full bg-purple-600/80 text-white text-xs font-medium backdrop-blur-sm">
                  {t.characterSelect?.custom || 'Custom'}
                </span>
              </div>
            </div>

            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="px-5 py-2.5 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-zinc-300 hover:text-white hover:border-zinc-600 transition-all flex items-center gap-2"
              >
                {uploadingImage ? (
                  <>
                    <div className="w-4 h-4 border-2 border-zinc-400 border-t-white rounded-full animate-spin" />
                    <span>{t.characterCreator?.uploading || 'Uploading...'}</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{t.aiCharacterBuilder?.uploadAvatar || 'Upload Avatar'}</span>
                  </>
                )}
              </button>
              {avatarBase64 && (
                <button
                  type="button"
                  onClick={() => setAvatarBase64('')}
                  className="px-4 py-2.5 rounded-xl bg-red-900/20 border border-red-700/30 text-red-400 hover:bg-red-900/30 transition-all"
                >
                  {t.aiCharacterBuilder?.removeAvatar || 'Remove'}
                </button>
              )}
            </div>

            <div className="flex justify-between pt-4 border-t border-zinc-800">
              <button
                onClick={() => setCurrentStep(3)}
                className="px-6 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 hover:text-white hover:border-zinc-600 transition-all"
              >
                {t.aiCharacterBuilder?.backToReview || 'Back to Review'}
              </button>
              <button
                onClick={handleSave}
                className={`px-8 py-3 rounded-xl font-medium transition-all flex items-center gap-2 ${
                  isGoldMode
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:from-amber-400 hover:to-yellow-400'
                    : 'bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-500 hover:to-purple-500'
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {t.aiCharacterBuilder?.saveCharacter || 'Save Character'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AICharacterBuilder;

import React, { useState, useEffect, useRef } from 'react';
import characters from '../config/characters';
import { useLanguage } from '../context/LanguageContext';

function CharacterSelect({ onSelect, onBack, onCreateCharacter }) {
  const { t } = useLanguage();
  const [hoveredCharacter, setHoveredCharacter] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [customCharacters, setCustomCharacters] = useState([]);
  const [allCharacters, setAllCharacters] = useState([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isGoldMode, setIsGoldMode] = useState(false);
  const importFileRef = useRef(null);

  // Load custom characters from localStorage
  useEffect(() => {
    loadCustomCharacters();
  }, []);

  // v1.0 ROSE NOIR: Entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // v1.0: Check Gold Mode on mount and when theme changes
  useEffect(() => {
    const checkGoldMode = () => {
      const isSupporter = localStorage.getItem('isSupporter') === 'true';
      const goldTheme = localStorage.getItem('goldThemeEnabled') === 'true';
      setIsGoldMode(isSupporter && goldTheme);
    };
    
    // Initial check
    checkGoldMode();
    
    // Listen for gold-theme-changed event
    window.addEventListener('gold-theme-changed', checkGoldMode);
    
    return () => {
      window.removeEventListener('gold-theme-changed', checkGoldMode);
    };
  }, []);

  const loadCustomCharacters = () => {
    try {
      const stored = localStorage.getItem('custom_characters');
      if (stored) {
        const custom = JSON.parse(stored);
        setCustomCharacters(custom);
      }
    } catch (error) {
      console.error('Error loading custom characters:', error);
    }
  };

  // Combine standard and custom characters
  useEffect(() => {
    setAllCharacters([...characters, ...customCharacters]);
  }, [customCharacters]);

  const handleSelect = (character) => {
    setSelectedId(character.id);
    // Brief delay for visual feedback
    setTimeout(() => {
      onSelect(character);
    }, 200);
  };

  const handleCreateNew = () => {
    if (onCreateCharacter) {
      onCreateCharacter();
    }
  };

  const handleDeleteCustom = (characterId, e) => {
    e.stopPropagation();
    
    if (!window.confirm(t.characterSelect.areYouSureDelete)) return;

    try {
      const updated = customCharacters.filter(c => c.id !== characterId);
      localStorage.setItem('custom_characters', JSON.stringify(updated));
      setCustomCharacters(updated);
    } catch (error) {
      console.error('Error deleting character:', error);
    }
  };

  // Export character to JSON
  const handleExportCharacter = (character, e) => {
    e.stopPropagation();
    
    try {
      const exportData = {
        name: character.name,
        subtitle: character.subtitle,
        description: character.description,
        systemPrompt: character.systemPrompt,
        themeColor: character.themeColor,
        avatarBase64: character.avatarBase64 || null,
        startingMessage: character.startingMessage,
        exportedAt: new Date().toISOString(),
        version: '2.1',
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${character.name.replace(/\s+/g, '_')}_character.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert(t.characterSelect.failedToExport);
    }
  };

  // Import character from JSON
  const handleImportClick = () => {
    importFileRef.current?.click();
  };

  const handleImportCharacter = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      // Validate required fields
      if (!importData.name || !importData.systemPrompt || !importData.startingMessage) {
        alert(t.characterSelect.invalidCharacterFile);
        return;
      }

      // Create new character
      const newCharacter = {
        id: `custom_${Date.now()}`,
        name: importData.name,
        subtitle: importData.subtitle || 'Imported Character',
        description: importData.description || 'An imported character',
        systemPrompt: importData.systemPrompt,
        themeColor: importData.themeColor || '#ef4444',
        avatarBase64: importData.avatarBase64 || null,
        startingMessage: importData.startingMessage,
        isCustom: true,
      };

      // Add to custom characters
      const updated = [...customCharacters, newCharacter];
      localStorage.setItem('custom_characters', JSON.stringify(updated));
      setCustomCharacters(updated);

      alert(t.characterSelect.characterImported.replace('{name}', newCharacter.name));
    } catch (error) {
      console.error('Import error:', error);
      alert(t.characterSelect.failedToImport);
    } finally {
      // Reset file input
      e.target.value = '';
    }
  };

  return (
    <div className={`h-full w-full flex flex-col p-8 bg-gradient-to-br from-zinc-900 via-zinc-900 to-black transition-all duration-300 ${
      isVisible ? 'opacity-100' : 'opacity-0'
    }`}>
      {/* Hidden file input for import */}
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        onChange={handleImportCharacter}
        className="hidden"
      />

      {/* v1.0 ROSE NOIR: Premium Glass Header */}
      <div className="glass-header flex items-center justify-between px-6 py-5 mb-8 rounded-2xl">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-3 hover:bg-white/5 rounded-xl transition-all duration-200 text-zinc-500 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="flex-1">
            <h2 className={`text-2xl font-bold ${
              isGoldMode 
                ? 'bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(251,191,36,0.4)]'
                : 'text-white'
            }`}>
              {t.characterSelect.chooseCharacter}
            </h2>
            <p className="text-zinc-500 text-sm">
              {t.characterSelect.selectWhoToChat}
              {customCharacters.length > 0 && (
                <span className={`ml-2 ${isGoldMode ? 'text-amber-400' : 'text-rose-400'}`}>
                  • {customCharacters.length} {customCharacters.length !== 1 ? t.characterSelect.customCharactersPlural : t.characterSelect.customCharacters}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Import Button with Rose accent */}
        <button
          onClick={handleImportClick}
          className="px-5 py-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 hover:border-purple-500/50 text-purple-300 hover:text-purple-200 transition-all duration-200 flex items-center gap-2 font-medium"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span>{t.characterSelect.import}</span>
        </button>
      </div>

      {/* Character Grid */}
      <div className="flex-1 flex items-center justify-center">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-6xl w-full">
          {allCharacters.map((character, index) => {
            const isSelected = selectedId === character.id;
            
            // Determine Border & Shadow Classes based on state
            let borderClass = "";
            
            if (isSelected) {
              borderClass = isGoldMode 
                ? "border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.2)]" 
                : "border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.2)]";
            } else {
              borderClass = isGoldMode
                ? "border-amber-900/40 hover:border-amber-400 hover:shadow-lg"
                : "border-zinc-800 hover:border-rose-500 hover:shadow-lg";
            }

            return (
              <button
                key={character.id}
                onClick={() => handleSelect(character)}
                onMouseEnter={() => setHoveredCharacter(character.id)}
                onMouseLeave={() => setHoveredCharacter(null)}
                className={`
                  group relative aspect-[3/4] text-left 
                  rounded-2xl overflow-hidden 
                  border-2 transition-all duration-200
                  bg-zinc-900
                  ${borderClass}
                `}
              >
                {/* Inner Content (Image & Overlay) - No Borders here! */}
                <div className="absolute inset-0 w-full h-full">
                  {/* Character Image */}
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
                    {character.avatarBase64 ? (
                      <img 
                        src={character.avatarBase64} 
                        alt={character.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      /* Placeholder Avatar */
                      <div 
                        className="w-full h-full flex items-center justify-center"
                        style={{ background: `linear-gradient(135deg, ${character.themeColor}20, ${character.themeColor}05)` }}
                      >
                        <div 
                          className="w-32 h-32 rounded-full flex items-center justify-center text-4xl font-bold text-white shadow-2xl"
                          style={{ 
                            background: `linear-gradient(135deg, ${character.themeColor}, ${character.themeColor}88)`,
                            boxShadow: `0 0 60px ${character.themeColor}40`
                          }}
                        >
                          {character.name.charAt(0)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Info Overlay (Gradient) */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent p-6 pt-20">
                    <h3 className="text-lg font-bold text-white mb-1 truncate">
                      {character.isCustom ? character.name : (t.characters?.[character.id]?.name || character.name)}
                    </h3>
                    <p className="text-sm font-medium mb-3 truncate" style={{ color: character.themeColor }}>
                      {character.isCustom ? character.subtitle : (t.characters?.[character.id]?.subtitle || character.subtitle)}
                    </p>
                    <p className="text-zinc-400 text-xs leading-relaxed line-clamp-3 overflow-hidden">
                      {character.isCustom ? character.description : (t.characters?.[character.id]?.description || character.description)}
                    </p>
                    
                    {/* Custom Badge */}
                    {character.isCustom && (
                      <div className="absolute top-4 left-4">
                        <span className="px-2 py-1 rounded-full bg-purple-600/80 text-white text-xs font-medium backdrop-blur-sm">
                          {t.characterSelect.custom}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Hover Shine Effect */}
                  <div className={`absolute inset-0 bg-white/5 transition-opacity duration-300 pointer-events-none ${
                    hoveredCharacter === character.id ? 'opacity-100' : 'opacity-0'
                  }`} />
                  
                  {/* Selection Indicator */}
                  {isSelected && (
                    <div className={`absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center animate-scale-in shadow-lg ${
                      isGoldMode 
                        ? 'bg-gradient-to-br from-amber-500 to-yellow-500'
                        : 'bg-gradient-to-br from-rose-500 to-pink-600'
                    }`}>
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  
                  {/* Custom Actions (Delete/Export) */}
                  {character.isCustom && (
                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <div 
                        onClick={(e) => handleExportCharacter(character, e)} 
                        className="w-8 h-8 rounded-full bg-blue-900/80 flex items-center justify-center hover:bg-blue-800 transition-all cursor-pointer"
                        title={t.characterSelect.exportCharacter}
                      >
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </div>
                      <div 
                        onClick={(e) => handleDeleteCustom(character.id, e)} 
                        className="w-8 h-8 rounded-full bg-red-900/80 flex items-center justify-center hover:bg-red-800 transition-all cursor-pointer"
                        title={t.characterSelect.deleteCustom}
                      >
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              </button>
            );
          })}

          {/* Create New Card */}
          <button
            onClick={handleCreateNew}
            className={`
              relative aspect-[3/4] rounded-2xl 
              border-2 border-dashed
              flex flex-col items-center justify-center 
              transition-all duration-200 cursor-pointer group 
              bg-zinc-950/30 backdrop-blur-sm
              ${isGoldMode
                ? 'border-zinc-800 text-zinc-500 hover:border-amber-400 hover:text-amber-400'
                : 'border-zinc-800 text-zinc-500 hover:border-rose-500 hover:text-rose-500'
              }
            `}
          >
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors ${
              isGoldMode ? 'bg-amber-500/10 group-hover:bg-amber-500/20' : 'bg-rose-500/10 group-hover:bg-rose-500/20'
            }`}>
              <svg className={`w-8 h-8 ${isGoldMode ? 'text-amber-400' : 'text-rose-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-sm font-medium">{t.characterSelect.createNew}</span>
            <span className="text-xs opacity-50 mt-1">{t.characterSelect.custom}</span>
          </button>
        </div>
      </div>

      {/* Selected Character Preview (appears at bottom when hovering) */}
      {hoveredCharacter && (
        <div className="fixed bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent pointer-events-none">
          <div className="h-full max-w-4xl mx-auto flex items-center justify-center px-8">
            {allCharacters.filter(c => c.id === hoveredCharacter).map(character => (
              <div key={character.id} className="flex items-center gap-4 animate-fade-in">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white"
                  style={{ backgroundColor: character.themeColor }}
                >
                  {character.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium">
                      {character.isCustom ? character.name : (t.characters?.[character.id]?.name || character.name)}
                    </p>
                    {character.isCustom && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-600/80 text-white text-xs">
                        {t.characterSelect.custom}
                      </span>
                    )}
                  </div>
                  <p className="text-zinc-500 text-sm">
                    {character.isCustom ? character.subtitle : (t.characters?.[character.id]?.subtitle || character.subtitle)}
                  </p>
                </div>
                <div className="ml-8 text-zinc-400 text-sm max-w-md">
                  "{character.startingMessage.replace(/^\[[^\]]+\]\s*/, '').substring(0, 80)}..."
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CharacterSelect;

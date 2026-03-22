import { Fragment, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Heart, Minus, Moon, Plus, Search, Settings as SettingsIcon, Sparkles, Star, Trash2, Upload, X } from 'lucide-react';
import characters from '../config/characters';
import { version as appVersion } from '../../package.json';
import { useLanguage } from '../context/LanguageContext';
import useGoldMode from '../hooks/useGoldMode';
import useEntranceAnimation from '../hooks/useEntranceAnimation';
import downloadBlob from '../utils/downloadBlob';
import { translations } from '../lib/translations';
import { normalizeResponseMode } from '../lib/responseModes';

const CUSTOM_CHARACTERS_KEY = 'custom_characters';
const LEGACY_CUSTOM_CHARACTERS_KEY = 'customCharacters';
const ORGANIZER_STORAGE_KEY = 'character_organizer_v1';
const CARD_SCALE_STORAGE_KEY = 'character_select_card_scale_v1';
const STANDARD_FOLDER_ID = 'standard';
const UNSORTED_ID = 'unsorted';
const DEFAULT_STANDARD_FOLDER = {
  name: '',
  icon: 'folder',
  color: '#f43f5e',
};

const FOLDER_COLOR_OPTIONS = ['#f43f5e', '#fb7185', '#fb923c', '#f59e0b', '#22c55e', '#06b6d4', '#818cf8', '#c084fc'];

const FOLDER_ICON_OPTIONS = [
  { id: 'folder', Icon: FolderOpen },
  { id: 'heart', Icon: Heart },
  { id: 'sparkles', Icon: Sparkles },
  { id: 'moon', Icon: Moon },
  { id: 'star', Icon: Star },
];

const CARD_SCALE_OPTIONS = [
  {
    id: 'compact',
    cardMinHeight: 312,
    folderIconSize: 'h-10 w-10',
    avatarBubbleSize: 'h-24 w-24',
    gridClassName: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
  },
  {
    id: 'comfortable',
    cardMinHeight: 340,
    folderIconSize: 'h-11 w-11',
    avatarBubbleSize: 'h-28 w-28',
    gridClassName: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
  },
  {
    id: 'large',
    cardMinHeight: 372,
    folderIconSize: 'h-12 w-12',
    avatarBubbleSize: 'h-32 w-32',
    gridClassName: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  },
];

function safeJsonParse(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch (error) {
    console.error('Failed to parse local storage value:', error);
    return fallback;
  }
}

function uniqueCharactersById(items) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }

  return unique;
}

function persistCustomCharacters(customCharacters) {
  localStorage.setItem(CUSTOM_CHARACTERS_KEY, JSON.stringify(customCharacters));
  localStorage.removeItem(LEGACY_CUSTOM_CHARACTERS_KEY);
}

function loadMergedCustomCharacters() {
  const canonical = safeJsonParse(localStorage.getItem(CUSTOM_CHARACTERS_KEY), []);
  const legacy = safeJsonParse(localStorage.getItem(LEGACY_CUSTOM_CHARACTERS_KEY), []);
  const merged = uniqueCharactersById([...(Array.isArray(canonical) ? canonical : []), ...(Array.isArray(legacy) ? legacy : [])]);

  persistCustomCharacters(merged);
  return merged;
}

function createFolderRecord(overrides = {}) {
  return {
    id: overrides.id || `folder_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: overrides.name || '',
    icon: overrides.icon || FOLDER_ICON_OPTIONS[0].id,
    color: overrides.color || FOLDER_COLOR_OPTIONS[0],
    customIconDataUrl: typeof overrides.customIconDataUrl === 'string' ? overrides.customIconDataUrl : '',
    createdAt: overrides.createdAt || new Date().toISOString(),
  };
}

function sanitizeFolder(folder, index) {
  return createFolderRecord({
    id: folder?.id || `folder_${index}_${Date.now()}`,
    name: folder?.name || '',
    icon: FOLDER_ICON_OPTIONS.some((option) => option.id === folder?.icon) ? folder.icon : FOLDER_ICON_OPTIONS[0].id,
    color: typeof folder?.color === 'string' ? folder.color : FOLDER_COLOR_OPTIONS[index % FOLDER_COLOR_OPTIONS.length],
    customIconDataUrl: typeof folder?.customIconDataUrl === 'string' ? folder.customIconDataUrl : '',
    createdAt: folder?.createdAt,
  });
}

function sanitizeStandardFolder(standardFolder) {
  return {
    name: typeof standardFolder?.name === 'string' ? standardFolder.name : DEFAULT_STANDARD_FOLDER.name,
    icon: FOLDER_ICON_OPTIONS.some((option) => option.id === standardFolder?.icon) ? standardFolder.icon : DEFAULT_STANDARD_FOLDER.icon,
    color: typeof standardFolder?.color === 'string' ? standardFolder.color : DEFAULT_STANDARD_FOLDER.color,
    customIconDataUrl: typeof standardFolder?.customIconDataUrl === 'string' ? standardFolder.customIconDataUrl : '',
  };
}

function normalizeHexColorInput(value) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return '';
  return trimmedValue.startsWith('#') ? trimmedValue : `#${trimmedValue}`;
}

function isValidHexColor(value) {
  return /^#([0-9A-F]{3}|[0-9A-F]{6})$/i.test(value);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function getDefaultContainerId(character) {
  return character?.isCustom ? UNSORTED_ID : STANDARD_FOLDER_ID;
}

function normalizeOrganizerState(customCharacters, rawOrganizer) {
  const allCharacters = [...characters, ...customCharacters];
  const folderSource = Array.isArray(rawOrganizer?.folders) ? rawOrganizer.folders : [];
  const folders = folderSource.map(sanitizeFolder);
  const folderIds = folders.map((folder) => folder.id);
  const validContainers = [STANDARD_FOLDER_ID, UNSORTED_ID, ...folderIds];
  const validContainerSet = new Set(validContainers);
  const rawPlacement = rawOrganizer?.characterPlacement || {};
  const rawOrder = rawOrganizer?.characterOrder || {};
  const rawOpenFolders = rawOrganizer?.openFolders || {};
  const standardFolder = sanitizeStandardFolder(rawOrganizer?.standardFolder);
  const characterPlacement = {};
  const characterOrder = {};
  const openFolders = {
    [STANDARD_FOLDER_ID]: rawOpenFolders[STANDARD_FOLDER_ID] ?? true,
  };

  for (const folderId of folderIds) {
    openFolders[folderId] = rawOpenFolders[folderId] ?? false;
  }

  for (const character of allCharacters) {
    const preferredContainer = rawPlacement[character.id];
    characterPlacement[character.id] = validContainerSet.has(preferredContainer) ? preferredContainer : getDefaultContainerId(character);
  }

  for (const containerId of validContainers) {
    const rawContainerOrder = Array.isArray(rawOrder[containerId]) ? rawOrder[containerId] : [];
    const seen = new Set();
    const orderedIds = [];

    for (const id of rawContainerOrder) {
      if (seen.has(id) || characterPlacement[id] !== containerId) continue;
      seen.add(id);
      orderedIds.push(id);
    }

    for (const character of allCharacters) {
      if (characterPlacement[character.id] === containerId && !seen.has(character.id)) {
        seen.add(character.id);
        orderedIds.push(character.id);
      }
    }

    characterOrder[containerId] = orderedIds;
  }

  return {
    standardFolder,
    folders,
    characterPlacement,
    characterOrder,
    openFolders,
  };
}

function persistOrganizer(organizer) {
  localStorage.setItem(ORGANIZER_STORAGE_KEY, JSON.stringify(organizer));
}

function removeFromAllContainers(characterOrder, characterId) {
  const nextOrder = {};

  for (const [containerId, ids] of Object.entries(characterOrder)) {
    nextOrder[containerId] = ids.filter((id) => id !== characterId);
  }

  return nextOrder;
}

function insertAtPosition(ids, characterId, targetId, position = 'after') {
  const list = ids.filter((id) => id !== characterId);

  if (!targetId) {
    list.push(characterId);
    return list;
  }

  const targetIndex = list.indexOf(targetId);
  if (targetIndex === -1) {
    list.push(characterId);
    return list;
  }

  const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
  list.splice(insertIndex, 0, characterId);
  return list;
}

function getDropPosition(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const xRatio = (event.clientX - rect.left) / rect.width;
  return xRatio < 0.5 ? 'before' : 'after';
}

function getFolderIcon(iconId, isOpen = false) {
  if (iconId === 'folder') {
    return isOpen ? FolderOpen : Folder;
  }

  return FOLDER_ICON_OPTIONS.find((option) => option.id === iconId)?.Icon || FolderOpen;
}

function areDropStatesEqual(currentState, nextState) {
  if (currentState === nextState) return true;
  if (!currentState || !nextState) return currentState === nextState;

  return currentState.type === nextState.type
    && currentState.targetId === nextState.targetId
    && currentState.containerId === nextState.containerId
    && currentState.position === nextState.position;
}

function CharacterSelect({ onSelect, onBack, onCreateCharacter, onAIBuilder }) {
  const { t } = useLanguage();
  const characterSelectText = {
    ...translations.en.characterSelect,
    ...(t.characterSelect || {}),
  };
  const commonText = {
    ...translations.en.common,
    ...(t.common || {}),
  };
  const [selectedId, setSelectedId] = useState(null);
  const [customCharacters, setCustomCharacters] = useState([]);
  const [organizer, setOrganizer] = useState(() => normalizeOrganizerState([], null));
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dragState, setDragState] = useState(null);
  const [dropState, setDropState] = useState(null);
  const [folderModal, setFolderModal] = useState(null);
  const [cardScaleIndex, setCardScaleIndex] = useState(() => {
    const savedIndex = safeJsonParse(localStorage.getItem(CARD_SCALE_STORAGE_KEY), 0);
    return Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < CARD_SCALE_OPTIONS.length ? savedIndex : 0;
  });
  const isVisible = useEntranceAnimation(50);
  const isGoldMode = useGoldMode();
  const importFileRef = useRef(null);
  const folderIconFileRef = useRef(null);
  const suppressSelectionRef = useRef(false);
  const dropStateRef = useRef(null);

  useEffect(() => {
    const mergedCustomCharacters = loadMergedCustomCharacters();
    const rawOrganizer = safeJsonParse(localStorage.getItem(ORGANIZER_STORAGE_KEY), null);
    const normalizedOrganizer = normalizeOrganizerState(mergedCustomCharacters, rawOrganizer);

    setCustomCharacters(mergedCustomCharacters);
    setOrganizer(normalizedOrganizer);
    persistOrganizer(normalizedOrganizer);
  }, []);

  const allCharacters = [...characters, ...customCharacters];
  const characterMap = Object.fromEntries(allCharacters.map((character) => [character.id, character]));
  const searchTerm = search.trim().toLowerCase();
  const searchActive = searchTerm.length > 0;
  const cardScale = CARD_SCALE_OPTIONS[cardScaleIndex];

  const writeOrganizer = (nextCustomCharacters, updater) => {
    setOrganizer((currentOrganizer) => {
      const baseOrganizer = normalizeOrganizerState(nextCustomCharacters, currentOrganizer);
      const updatedOrganizer = updater ? updater(baseOrganizer) : baseOrganizer;
      const normalizedOrganizer = normalizeOrganizerState(nextCustomCharacters, updatedOrganizer);
      persistOrganizer(normalizedOrganizer);
      return normalizedOrganizer;
    });
  };

  const updateOrganizer = (updater) => {
    writeOrganizer(customCharacters, updater);
  };

  const saveCustomCharactersAndOrganizer = (nextCustomCharacters, updater) => {
    persistCustomCharacters(nextCustomCharacters);
    setCustomCharacters(nextCustomCharacters);
    writeOrganizer(nextCustomCharacters, updater);
  };

  const getCharacterLabel = (character, key) => {
    if (!character) return '';
    if (character.isCustom) return character[key] || '';
    return t.characters?.[character.id]?.[key] || character[key] || '';
  };

  const getCharacterSearchText = (character) => (
    [
      getCharacterLabel(character, 'name'),
      getCharacterLabel(character, 'subtitle'),
      getCharacterLabel(character, 'description'),
    ]
      .join(' ')
      .toLowerCase()
  );

  const matchesFilter = (character) => {
    if (filter === 'all') return true;
    if (filter === 'custom') return character.isCustom;
    return character.category === filter;
  };

  const matchesSearch = (character) => {
    if (!searchActive) return true;
    return getCharacterSearchText(character).includes(searchTerm);
  };

  const isCharacterVisible = (characterId) => {
    const character = characterMap[characterId];
    if (!character) return false;
    return matchesFilter(character) && matchesSearch(character);
  };

  const getVisibleCharacterIds = (containerId) => (organizer.characterOrder[containerId] || []).filter(isCharacterVisible);

  const getFolderCharacters = (folderId) => {
    const visibleCharacterIds = getVisibleCharacterIds(folderId);
    return visibleCharacterIds
      .map((characterId) => characterMap[characterId])
      .filter(Boolean);
  };

  const standardCharacters = getFolderCharacters(STANDARD_FOLDER_ID);
  const unsortedCharacters = getFolderCharacters(UNSORTED_ID);
  const visibleFolders = organizer.folders.filter((folder) => !searchActive || getFolderCharacters(folder.id).length > 0);
  const isFolderPersistentlyOpen = (folderId) => organizer.openFolders[folderId] ?? folderId === STANDARD_FOLDER_ID;

  const isFolderOpen = (folderId, hasVisibleCharacters) => {
    if (searchActive) return hasVisibleCharacters;
    return isFolderPersistentlyOpen(folderId);
  };

  const showStandardFolder = !searchActive || standardCharacters.length > 0;
  const standardFolderOpen = isFolderOpen(STANDARD_FOLDER_ID, standardCharacters.length > 0);
  const folderSections = [];

  const folderCardCount = (folderId) => (organizer.characterOrder[folderId] || []).length;

  if (showStandardFolder) {
    folderSections.push({
      folder: {
        id: STANDARD_FOLDER_ID,
        name: organizer.standardFolder?.name,
        icon: organizer.standardFolder?.icon || DEFAULT_STANDARD_FOLDER.icon,
        color: organizer.standardFolder?.color || DEFAULT_STANDARD_FOLDER.color,
        customIconDataUrl: organizer.standardFolder?.customIconDataUrl || '',
      },
      characters: standardCharacters,
      isOpen: standardFolderOpen,
    });
  }

  for (const folder of visibleFolders) {
    const folderCharacters = getFolderCharacters(folder.id);
    folderSections.push({
      folder,
      characters: folderCharacters,
      isOpen: isFolderOpen(folder.id, folderCharacters.length > 0),
    });
  }

  const surfaceHasContent =
    folderSections.length > 0 ||
    unsortedCharacters.length > 0 ||
    (dragState?.type === 'character' && !searchActive);
  const draggedCharacterContainerId = dragState?.type === 'character' ? organizer.characterPlacement[dragState.id] : null;
  const canMoveDraggedCharacterToUnsorted = draggedCharacterContainerId && draggedCharacterContainerId !== UNSORTED_ID;

  useEffect(() => {
    localStorage.setItem(CARD_SCALE_STORAGE_KEY, JSON.stringify(cardScaleIndex));
  }, [cardScaleIndex]);

  const setDropStateIfChanged = (nextDropState) => {
    if (areDropStatesEqual(dropStateRef.current, nextDropState)) return;
    dropStateRef.current = nextDropState;
    setDropState(nextDropState);
  };

  const clearDropState = () => {
    if (dropStateRef.current === null) return;
    dropStateRef.current = null;
    setDropState(null);
  };

  const handleSelect = (character) => {
    if (suppressSelectionRef.current) return;
    setSelectedId(character.id);
    setTimeout(() => {
      onSelect(character);
    }, 180);
  };

  const handleImportClick = () => {
    importFileRef.current?.click();
  };

  const handleImportCharacter = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      if (!importData.name || !importData.systemPrompt || !importData.startingMessage) {
        alert(characterSelectText.invalidCharacterFile);
        return;
      }

      const newCharacter = {
        id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: importData.name,
        subtitle: importData.subtitle || characterSelectText.importedCharacter,
        description: importData.description || characterSelectText.importedDescription,
        systemPrompt: importData.systemPrompt,
        instructions: importData.instructions || '',
        scenario: importData.scenario || '',
        exampleDialogue: importData.exampleDialogue || '',
        themeColor: importData.themeColor || '#ef4444',
        avatarBase64: importData.avatarBase64 || null,
        startingMessage: importData.startingMessage,
        greeting: importData.startingMessage,
        type: importData.type || 'character',
        responseMode: normalizeResponseMode(importData.responseMode ?? importData.responseStyle, 'normal'),
        passionEnabled: importData.passionEnabled ?? true,
        passionSpeed: importData.passionSpeed || 'normal',
        isCustom: true,
      };

      const nextCustomCharacters = [...customCharacters, newCharacter];
      saveCustomCharactersAndOrganizer(nextCustomCharacters);
      alert(characterSelectText.characterImported.replace('{name}', newCharacter.name));
    } catch (error) {
      console.error('Import error:', error);
      alert(characterSelectText.failedToImport);
    } finally {
      event.target.value = '';
    }
  };

  const handleExportCharacter = (character, event) => {
    event.stopPropagation();

    try {
      const exportData = {
        name: character.name,
        subtitle: character.subtitle,
        description: character.description,
        systemPrompt: character.systemPrompt,
        instructions: character.instructions || '',
        scenario: character.scenario || '',
        exampleDialogue: character.exampleDialogue || '',
        themeColor: character.themeColor,
        avatarBase64: character.avatarBase64 || null,
        startingMessage: character.startingMessage,
        type: character.type || 'character',
        responseMode: normalizeResponseMode(character.responseMode ?? character.responseStyle, 'normal'),
        passionEnabled: character.passionEnabled ?? true,
        passionSpeed: character.passionSpeed || 'normal',
        exportedAt: new Date().toISOString(),
        version: appVersion,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `${character.name.replace(/\s+/g, '_')}_character.json`);
    } catch (error) {
      console.error('Export error:', error);
      alert(characterSelectText.failedToExport);
    }
  };

  const handleDeleteCustom = (characterId, event) => {
    event.stopPropagation();

    if (!window.confirm(characterSelectText.areYouSureDelete)) return;

    try {
      const nextCustomCharacters = customCharacters.filter((character) => character.id !== characterId);
      saveCustomCharactersAndOrganizer(nextCustomCharacters);
    } catch (error) {
      console.error('Error deleting character:', error);
    }
  };

  const openCreateFolderModal = () => {
    setFolderModal({
      mode: 'create',
      name: '',
      icon: FOLDER_ICON_OPTIONS[0].id,
      color: FOLDER_COLOR_OPTIONS[0],
      colorInput: FOLDER_COLOR_OPTIONS[0],
      customIconDataUrl: '',
      isStandard: false,
    });
  };

  const openEditFolderModal = (folder) => {
    setFolderModal({
      mode: 'edit',
      folderId: folder.id,
      name: folder.name || (folder.id === STANDARD_FOLDER_ID ? characterSelectText.standardFolder : ''),
      icon: folder.icon || FOLDER_ICON_OPTIONS[0].id,
      color: folder.color || FOLDER_COLOR_OPTIONS[0],
      colorInput: folder.color || FOLDER_COLOR_OPTIONS[0],
      customIconDataUrl: folder.customIconDataUrl || '',
      isStandard: folder.id === STANDARD_FOLDER_ID,
    });
  };

  const closeFolderModal = () => {
    setFolderModal(null);
  };

  const handleFolderColorInputChange = (value) => {
    setFolderModal((currentModal) => {
      if (!currentModal) return currentModal;

      const normalizedColor = normalizeHexColorInput(value);
      return {
        ...currentModal,
        colorInput: value,
        color: isValidHexColor(normalizedColor) ? normalizedColor : currentModal.color,
      };
    });
  };

  const handleFolderIconUploadClick = () => {
    folderIconFileRef.current?.click();
  };

  const handleFolderIconFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !folderModal) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setFolderModal((currentModal) => (
        currentModal
          ? {
              ...currentModal,
              customIconDataUrl: dataUrl,
            }
          : currentModal
      ));
    } catch (error) {
      console.error('Failed to load folder icon:', error);
    } finally {
      event.target.value = '';
    }
  };

  const clearCustomFolderIcon = () => {
    setFolderModal((currentModal) => (
      currentModal
        ? {
            ...currentModal,
            customIconDataUrl: '',
          }
        : currentModal
    ));
  };

  const handleSaveFolder = () => {
    if (!folderModal) return;
    const resolvedColor = isValidHexColor(normalizeHexColorInput(folderModal.colorInput || folderModal.color))
      ? normalizeHexColorInput(folderModal.colorInput || folderModal.color)
      : folderModal.color;

    if (!folderModal.isStandard && !folderModal.name.trim()) {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: characterSelectText.folderNameRequired, type: 'error' },
      }));
      return;
    }

    if (folderModal.mode === 'create') {
      const newFolder = createFolderRecord({
        name: folderModal.name.trim(),
        icon: folderModal.icon,
        color: resolvedColor,
        customIconDataUrl: folderModal.customIconDataUrl,
      });

      updateOrganizer((currentOrganizer) => ({
        ...currentOrganizer,
        folders: [...currentOrganizer.folders, newFolder],
        openFolders: {
          ...currentOrganizer.openFolders,
          [newFolder.id]: true,
        },
        characterOrder: {
          ...currentOrganizer.characterOrder,
          [newFolder.id]: [],
        },
      }));
    } else if (folderModal.isStandard) {
      updateOrganizer((currentOrganizer) => ({
        ...currentOrganizer,
        standardFolder: {
          ...currentOrganizer.standardFolder,
          name: folderModal.name.trim(),
          icon: folderModal.icon,
          color: resolvedColor,
          customIconDataUrl: folderModal.customIconDataUrl,
        },
      }));
    } else {
      updateOrganizer((currentOrganizer) => ({
        ...currentOrganizer,
        folders: currentOrganizer.folders.map((folder) => (
          folder.id === folderModal.folderId
            ? {
                ...folder,
                name: folderModal.name.trim(),
                icon: folderModal.icon,
                color: resolvedColor,
                customIconDataUrl: folderModal.customIconDataUrl,
              }
            : folder
        )),
      }));
    }

    closeFolderModal();
  };

  const handleDeleteFolder = () => {
    if (!folderModal?.folderId || folderModal.isStandard) return;

    if (!window.confirm(characterSelectText.deleteFolderConfirm.replace('{name}', folderModal.name))) {
      return;
    }

    updateOrganizer((currentOrganizer) => {
      const folderCharacters = currentOrganizer.characterOrder[folderModal.folderId] || [];
      const nextPlacement = { ...currentOrganizer.characterPlacement };
      const nextOrder = { ...currentOrganizer.characterOrder };
      const unsortedOrder = [...(nextOrder[UNSORTED_ID] || [])];

      delete nextOrder[folderModal.folderId];

      for (const characterId of folderCharacters) {
        nextPlacement[characterId] = UNSORTED_ID;
        if (!unsortedOrder.includes(characterId)) {
          unsortedOrder.push(characterId);
        }
      }

      nextOrder[UNSORTED_ID] = unsortedOrder;

      const nextOpenFolders = { ...currentOrganizer.openFolders };
      delete nextOpenFolders[folderModal.folderId];

      return {
        ...currentOrganizer,
        folders: currentOrganizer.folders.filter((folder) => folder.id !== folderModal.folderId),
        characterPlacement: nextPlacement,
        characterOrder: nextOrder,
        openFolders: nextOpenFolders,
      };
    });

    closeFolderModal();
  };

  const toggleFolderOpen = (folderId) => {
    if (searchActive) return;

    updateOrganizer((currentOrganizer) => ({
      ...currentOrganizer,
      openFolders: {
        ...currentOrganizer.openFolders,
        [folderId]: !(currentOrganizer.openFolders[folderId] ?? folderId === STANDARD_FOLDER_ID),
      },
    }));
  };

  const moveCharacter = (characterId, targetContainerId, targetCharacterId = null, position = 'after') => {
    updateOrganizer((currentOrganizer) => {
      if (!currentOrganizer.characterPlacement[characterId]) return currentOrganizer;
      if (targetCharacterId === characterId) return currentOrganizer;

      const nextOrder = removeFromAllContainers(currentOrganizer.characterOrder, characterId);
      const targetIds = nextOrder[targetContainerId] || [];

      nextOrder[targetContainerId] = insertAtPosition(targetIds, characterId, targetCharacterId, position);

      return {
        ...currentOrganizer,
        characterPlacement: {
          ...currentOrganizer.characterPlacement,
          [characterId]: targetContainerId,
        },
        characterOrder: nextOrder,
      };
    });
  };

  const moveFolder = (folderId, targetFolderId, position = 'after') => {
    if (!folderId || !targetFolderId || folderId === targetFolderId) return;

    updateOrganizer((currentOrganizer) => {
      const folders = [...currentOrganizer.folders];
      const sourceIndex = folders.findIndex((folder) => folder.id === folderId);
      const targetIndex = folders.findIndex((folder) => folder.id === targetFolderId);

      if (sourceIndex === -1 || targetIndex === -1) return currentOrganizer;

      const [movedFolder] = folders.splice(sourceIndex, 1);
      const insertionIndex = position === 'before'
        ? (sourceIndex < targetIndex ? targetIndex - 1 : targetIndex)
        : (sourceIndex < targetIndex ? targetIndex : targetIndex + 1);

      folders.splice(insertionIndex, 0, movedFolder);

      return {
        ...currentOrganizer,
        folders,
      };
    });
  };

  const handleCharacterDragStart = (event, characterId) => {
    if (searchActive) {
      event.preventDefault();
      return;
    }

    suppressSelectionRef.current = true;
    event.dataTransfer.setData('text/plain', characterId);
    event.dataTransfer.effectAllowed = 'move';
    setDragState({ type: 'character', id: characterId });
  };

  const handleFolderDragStart = (event, folderId) => {
    if (searchActive || folderId === STANDARD_FOLDER_ID) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.setData('text/plain', folderId);
    event.dataTransfer.effectAllowed = 'move';
    setDragState({ type: 'folder', id: folderId });
  };

  const clearDragState = () => {
    setDragState(null);
    clearDropState();
    requestAnimationFrame(() => {
      suppressSelectionRef.current = false;
    });
  };

  const handleFolderDragOver = (event, folderId) => {
    if (!dragState) return;

    if (dragState.type === 'character') {
      event.preventDefault();
      event.stopPropagation();
      setDropStateIfChanged({ type: 'folder', targetId: folderId });
      return;
    }

    if (dragState.type === 'folder' && folderId !== STANDARD_FOLDER_ID && dragState.id !== folderId) {
      event.preventDefault();
      event.stopPropagation();
      setDropStateIfChanged({
        type: 'folder-reorder',
        targetId: folderId,
        position: getDropPosition(event),
      });
    }
  };

  const handleFolderDrop = (event, folderId) => {
    event.preventDefault();
    event.stopPropagation();
    if (!dragState) return;

    if (dragState.type === 'character') {
      moveCharacter(dragState.id, folderId);
    } else if (dragState.type === 'folder' && folderId !== STANDARD_FOLDER_ID && dragState.id !== folderId) {
      moveFolder(dragState.id, folderId, dropState?.position || 'after');
    }

    clearDragState();
  };

  const handleCharacterDragOver = (event, containerId, targetCharacterId) => {
    if (dragState?.type !== 'character' || searchActive) return;

    event.preventDefault();
    event.stopPropagation();
    setDropStateIfChanged({
      type: 'character',
      targetId: targetCharacterId,
      containerId,
      position: getDropPosition(event),
    });
  };

  const handleCharacterDrop = (event, containerId, targetCharacterId) => {
    event.preventDefault();
    event.stopPropagation();
    if (dragState?.type !== 'character' || searchActive) return;

    moveCharacter(dragState.id, containerId, targetCharacterId, dropState?.position || 'after');
    clearDragState();
  };

  const handleUnsortedDropZoneOver = (event) => {
    if (dragState?.type !== 'character' || searchActive || !canMoveDraggedCharacterToUnsorted) return;

    event.preventDefault();
    setDropStateIfChanged({ type: 'unsorted' });
  };

  const handleUnsortedDropZoneDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (dragState?.type !== 'character' || searchActive || !canMoveDraggedCharacterToUnsorted) return;

    moveCharacter(dragState.id, UNSORTED_ID);
    clearDragState();
  };

  const renderCharacterCard = (character, containerId) => {
    const isSelected = selectedId === character.id;
    const isDropTarget = dropState?.type === 'character' && dropState.targetId === character.id;
    const baseBorderClass = isSelected
      ? 'border-rose-500 shadow-[0_0_26px_rgba(244,63,94,0.24)]'
      : 'border-transparent hover:border-rose-500';

    return (
      <div
        key={character.id}
        role="button"
        tabIndex={0}
        draggable={!searchActive}
        onClick={() => handleSelect(character)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleSelect(character);
          }
        }}
        onDragStart={(event) => handleCharacterDragStart(event, character.id)}
        onDragEnd={clearDragState}
        onDragOver={(event) => handleCharacterDragOver(event, containerId, character.id)}
        onDrop={(event) => handleCharacterDrop(event, containerId, character.id)}
        className={`group relative aspect-[3/4] w-full overflow-hidden rounded-[30px] bg-zinc-900 text-left transition-all duration-200 cursor-pointer border-2 ${baseBorderClass} ${isDropTarget ? 'scale-[0.985] ring-2 ring-rose-400/60' : ''}`}
        style={{
          minHeight: `${cardScale.cardMinHeight}px`,
          contentVisibility: 'auto',
          containIntrinsicSize: `${cardScale.cardMinHeight}px 240px`,
        }}
      >
        <div className="absolute inset-0">
          {character.avatarBase64 ? (
            <img
              src={character.avatarBase64}
              alt={getCharacterLabel(character, 'name')}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ background: `linear-gradient(145deg, ${character.themeColor}22, rgba(24,24,27,0.92))` }}
            >
              <div
                className={`flex ${cardScale.avatarBubbleSize} items-center justify-center rounded-full text-4xl font-bold text-white shadow-2xl`}
                style={{
                  background: `linear-gradient(135deg, ${character.themeColor}, ${character.themeColor}88)`,
                  boxShadow: `0 0 42px ${character.themeColor}40`,
                }}
              >
                {getCharacterLabel(character, 'name').charAt(0)}
              </div>
            </div>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950 via-zinc-950/92 via-55% to-transparent px-5 pb-4 pt-12">
          <div className="mb-2 flex items-center gap-2">
            {character.isCustom && (
              <span className="rounded-full bg-rose-500/15 px-2 py-1 text-[11px] font-medium text-rose-200">
                {characterSelectText.custom}
              </span>
            )}
          </div>
          <h3 className="mb-1 truncate text-[1.05rem] font-semibold text-white">
            {getCharacterLabel(character, 'name')}
          </h3>
          <p className="mb-2 truncate text-sm font-medium" style={{ color: character.themeColor }}>
            {getCharacterLabel(character, 'subtitle')}
          </p>
          <p className="line-clamp-2 text-[12px] leading-relaxed text-zinc-400/90">
            {getCharacterLabel(character, 'description')}
          </p>
        </div>

        {character.isCustom && (
          <div className="absolute right-4 top-4 flex gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <button
              type="button"
              onClick={(event) => handleExportCharacter(character, event)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-blue-700/80 border-2 border-transparent hover:border-rose-500"
              aria-label={characterSelectText.exportCharacter}
            >
              <Upload className="h-4 w-4 rotate-180" />
            </button>
            <button
              type="button"
              onClick={(event) => handleDeleteCustom(character.id, event)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-red-700/80 border-2 border-transparent hover:border-rose-500"
              aria-label={characterSelectText.deleteCustom}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderFolderCard = (folder, options = {}) => {
    const folderId = folder.id;
    const count = folderCardCount(folderId);
    const isStandard = folderId === STANDARD_FOLDER_ID;
    const hasVisibleCharacters = options.visibleCharacters.length > 0;
    const isOpen = options.isOpen;
    const FolderIcon = getFolderIcon(folder.icon || FOLDER_ICON_OPTIONS[0].id, isOpen);
    const customIconDataUrl = folder.customIconDataUrl || '';
    const isCharacterDropTarget = dropState?.type === 'folder' && dropState.targetId === folderId;
    const isFolderDropTarget = dropState?.type === 'folder-reorder' && dropState.targetId === folderId;
    const folderTitle = folder.name || (isStandard ? characterSelectText.standardFolder : characterSelectText.newFolder);
    const ArrowIcon = isOpen ? ChevronDown : ChevronRight;
    const countLabel = `${count} ${count === 1 ? characterSelectText.personaSingular : characterSelectText.personaPlural}`;
    const closedBorderStyle = isStandard ? 'dashed' : 'dotted';

    return (
      <div
        key={folderId}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        draggable={!searchActive && !isStandard}
        onClick={() => toggleFolderOpen(folderId)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleFolderOpen(folderId);
          }
        }}
        onDragStart={(event) => handleFolderDragStart(event, folderId)}
        onDragEnd={clearDragState}
        onDragOver={(event) => handleFolderDragOver(event, folderId)}
        onDrop={(event) => handleFolderDrop(event, folderId)}
        className={`group relative aspect-[3/4] w-full overflow-hidden rounded-[30px] text-left transition-all duration-200 border-2 ${isCharacterDropTarget ? 'ring-2 ring-rose-400/60' : ''} ${isFolderDropTarget ? 'ring-2 ring-cyan-400/60' : ''}`}
        style={{
          minHeight: `${cardScale.cardMinHeight}px`,
          contentVisibility: 'auto',
          containIntrinsicSize: `${cardScale.cardMinHeight}px 240px`,
          borderColor: isOpen ? `${folder.color}88` : 'rgba(255,255,255,0.28)',
          borderStyle: isOpen ? 'solid' : closedBorderStyle,
          background: isOpen
            ? `linear-gradient(180deg, ${folder.color}1f, rgba(9,9,11,0.98) 62%)`
            : 'linear-gradient(180deg, rgba(24,24,27,0.86), rgba(9,9,11,0.98))',
          boxShadow: isOpen
            ? `0 0 0 1px ${folder.color}45, 0 18px 42px rgba(0, 0, 0, 0.38), 0 0 30px ${folder.color}22`
            : '0 18px 34px rgba(0, 0, 0, 0.22)',
        }}
      >
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-50'}`}
          style={{ background: `radial-gradient(circle at 50% 28%, ${folder.color}${isOpen ? '3b' : '20'}, transparent 46%)` }}
        />
        <div className={`absolute inset-x-0 top-0 h-1 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0'}`} style={{ backgroundColor: folder.color }} />

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openEditFolderModal(folder);
          }}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-zinc-200 transition-colors hover:bg-black/60 border-2 border-transparent hover:border-rose-500"
          aria-label={commonText.edit}
        >
          <SettingsIcon className="h-4 w-4" />
        </button>

        <div className="relative flex h-full flex-col justify-between p-5">
          <div className="flex items-start justify-between gap-3 pr-12">
            <div className="min-w-0">
              <h3 className="truncate text-[1.05rem] font-semibold text-white">{folderTitle}</h3>
              <p className="mt-1 text-sm text-zinc-300/80">
                {countLabel}
              </p>
            </div>
            <ArrowIcon className={`mt-1 h-5 w-5 shrink-0 transition-all duration-200 ${isOpen ? 'text-white' : 'text-zinc-500'}`} />
          </div>

          <div className="flex flex-1 items-center justify-center px-3">
            <div
              className={`flex h-24 w-24 items-center justify-center rounded-full border text-white transition-all duration-200 ${isOpen ? 'border-white/20 bg-black/20 shadow-[0_0_24px_rgba(0,0,0,0.2)]' : 'border-white/10 bg-black/15'}`}
              style={{ backgroundColor: isOpen ? `${folder.color}2b` : `${folder.color}18` }}
            >
              {customIconDataUrl ? (
                <img
                  src={customIconDataUrl}
                  alt={folderTitle}
                  className="h-14 w-14 rounded-2xl object-cover shadow-[0_0_18px_rgba(0,0,0,0.25)]"
                />
              ) : (
                <FolderIcon className={`${cardScale.folderIconSize} transition-transform duration-200 ${isOpen ? 'scale-110' : ''}`} style={{ color: folder.color }} />
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 text-xs">
            <span className={`rounded-full px-3 py-1.5 ${isOpen ? 'bg-white/10 text-white' : 'bg-white/[0.04] text-zinc-400'}`}>
              {countLabel}
            </span>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${isOpen ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
              <span className={`${isOpen ? 'text-white' : 'text-zinc-500'}`}>
                {hasVisibleCharacters || !searchActive ? folderTitle : characterSelectText.noCharacters}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderUnsortedDropCard = () => (
    <div
      key="unsorted-drop-zone"
      onDragOver={handleUnsortedDropZoneOver}
      onDrop={handleUnsortedDropZoneDrop}
      className={`flex aspect-[3/4] w-full flex-col items-center justify-center rounded-[30px] border-2 border-dashed bg-white/[0.03] px-6 text-center transition-colors ${dropState?.type === 'unsorted' ? 'border-rose-500 bg-rose-500/10 text-rose-100' : 'border-white/10 text-zinc-400'}`}
      style={{
        minHeight: `${cardScale.cardMinHeight}px`,
        contentVisibility: 'auto',
        containIntrinsicSize: `${cardScale.cardMinHeight}px 240px`,
      }}
    >
      <div className="mb-5 h-24 w-24 rounded-full border border-white/10 bg-blue-500/10" />
      <p className="text-sm font-medium">{characterSelectText.unsortedDrop}</p>
    </div>
  );

  return (
    <div className={`flex h-full w-full flex-col bg-gradient-to-br from-zinc-950 via-zinc-900 to-black px-6 pb-8 pt-6 transition-all duration-300 md:px-8 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        onChange={handleImportCharacter}
        className="hidden"
        aria-label={characterSelectText.import}
      />
      <input
        ref={folderIconFileRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
        onChange={handleFolderIconFileChange}
        className="hidden"
        aria-label={characterSelectText.folderIcon}
      />

      <div className="glass-header mb-6 rounded-[28px] px-5 py-5 md:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <button
              onClick={onBack}
              className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white border-2 border-transparent hover:border-rose-500"
              aria-label={commonText.back}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>

            <div className="min-w-0">
              <h2 className={`truncate text-2xl font-bold ${isGoldMode ? 'bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent' : 'text-white'}`}>
                {characterSelectText.chooseCharacter}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                {characterSelectText.selectWhoToChat}
              </p>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[620px]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={characterSelectText.searchPlaceholder}
                  className="w-full rounded-2xl border border-white/10 bg-black/35 py-3 pl-11 pr-11 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-rose-500/60"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/5 hover:text-white border-2 border-transparent hover:border-rose-500"
                    aria-label={commonText.close}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'all', label: characterSelectText.filterAll },
                  { key: 'nsfw', label: characterSelectText.filterNsfw },
                  { key: 'sfw', label: characterSelectText.filterSfw },
                  { key: 'custom', label: characterSelectText.custom },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`rounded-full px-3 py-2 text-xs font-medium transition-colors border ${filter === key ? 'border-rose-500/60 bg-rose-500/15 text-rose-200' : 'border-white/10 bg-white/5 text-zinc-400 hover:border-rose-500/40 hover:text-zinc-100'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] p-1">
                <button
                  type="button"
                  onClick={() => setCardScaleIndex((currentIndex) => Math.max(0, currentIndex - 1))}
                  disabled={cardScaleIndex === 0}
                  title={commonText.zoomOut}
                  aria-label={commonText.zoomOut}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600 border-2 border-transparent hover:border-rose-500"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCardScaleIndex((currentIndex) => Math.min(CARD_SCALE_OPTIONS.length - 1, currentIndex + 1))}
                  disabled={cardScaleIndex === CARD_SCALE_OPTIONS.length - 1}
                  title={commonText.zoomIn}
                  aria-label={commonText.zoomIn}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600 border-2 border-transparent hover:border-rose-500"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onCreateCharacter}
                className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm text-zinc-100 transition-colors hover:bg-white/10 border-2 border-transparent hover:border-rose-500"
              >
                <Plus className="h-4 w-4" />
                <span>{characterSelectText.createNew}</span>
              </button>
              <button
                type="button"
                onClick={onAIBuilder}
                className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm text-zinc-100 transition-colors hover:bg-white/10 border-2 border-transparent hover:border-rose-500"
              >
                <Sparkles className="h-4 w-4" />
                <span>{characterSelectText.createWithAI}</span>
              </button>
              <button
                type="button"
                onClick={handleImportClick}
                className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm text-zinc-100 transition-colors hover:bg-white/10 border-2 border-transparent hover:border-rose-500"
              >
                <Upload className="h-4 w-4" />
                <span>{characterSelectText.import}</span>
              </button>
              <button
                type="button"
                onClick={openCreateFolderModal}
                className="flex items-center gap-2 rounded-2xl bg-rose-500/12 px-4 py-3 text-sm text-rose-100 transition-colors hover:bg-rose-500/18 border-2 border-transparent hover:border-rose-500"
              >
                <FolderOpen className="h-4 w-4" />
                <span>{characterSelectText.newFolder}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        <div className={`grid items-stretch gap-5 ${cardScale.gridClassName}`}>
          {folderSections.map(({ folder, characters: sectionCharacters, isOpen }) => (
            <Fragment key={folder.id}>
              {renderFolderCard(folder, {
                visibleCharacters: sectionCharacters,
                isOpen,
              })}
              {isOpen && sectionCharacters.map((character) => renderCharacterCard(character, folder.id))}
            </Fragment>
          ))}

          {unsortedCharacters.map((character) => renderCharacterCard(character, UNSORTED_ID))}
          {dragState?.type === 'character' && !searchActive && canMoveDraggedCharacterToUnsorted && renderUnsortedDropCard()}
        </div>

        {!surfaceHasContent && (
          <div className="glass mt-3 rounded-[28px] px-6 py-12 text-center">
            <h3 className="text-lg font-semibold text-white">
              {searchActive ? characterSelectText.searchEmpty : characterSelectText.noCharacters}
            </h3>
            <p className="mt-2 text-sm text-zinc-400">
              {searchActive ? characterSelectText.searchHint : characterSelectText.selectWhoToChat}
            </p>
          </div>
        )}
      </div>

      {folderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="glass w-full max-w-lg rounded-[28px] border border-white/10 p-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {folderModal.mode === 'create' ? characterSelectText.createFolder : characterSelectText.editFolder}
                </h3>
                <p className="mt-1 text-sm text-zinc-400">
                  {folderModal.isStandard ? characterSelectText.standardSettingsHint : characterSelectText.folderSettingsHint}
                </p>
              </div>
              <button
                type="button"
                onClick={closeFolderModal}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white border-2 border-transparent hover:border-rose-500"
                aria-label={commonText.close}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-300">
                  {characterSelectText.folderName}
                </label>
                <input
                  value={folderModal.name}
                  onChange={(event) => setFolderModal((currentModal) => ({ ...currentModal, name: event.target.value }))}
                  placeholder={characterSelectText.folderNamePlaceholder}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-rose-500/60"
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-zinc-300">
                  {characterSelectText.folderIcon}
                </p>
                <div className="flex flex-wrap gap-2">
                  {FOLDER_ICON_OPTIONS.map(({ id, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFolderModal((currentModal) => ({ ...currentModal, icon: id, customIconDataUrl: '' }))}
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors ${folderModal.icon === id && !folderModal.customIconDataUrl ? 'border-rose-500/60 bg-rose-500/15 text-rose-100' : 'border-white/10 bg-white/5 text-zinc-300 hover:border-rose-500/40'}`}
                    >
                      <Icon className="h-5 w-5" />
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleFolderIconUploadClick}
                    className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm text-zinc-100 transition-colors hover:bg-white/10 border-2 border-transparent hover:border-rose-500"
                  >
                    <Upload className="h-4 w-4" />
                    <span>{characterSelectText.folderIconUpload}</span>
                  </button>
                  <p className="text-xs text-zinc-500">
                    {characterSelectText.folderIconFormats}
                  </p>
                  {folderModal.customIconDataUrl && (
                    <>
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-rose-500/60 bg-black/20">
                        <img
                          src={folderModal.customIconDataUrl}
                          alt={characterSelectText.folderIcon}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={clearCustomFolderIcon}
                        className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm text-zinc-100 transition-colors hover:bg-white/10 border-2 border-transparent hover:border-rose-500"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>{commonText.delete}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-zinc-300">
                  {characterSelectText.folderColor}
                </p>
                <div className="flex flex-wrap gap-2">
                  {FOLDER_COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFolderModal((currentModal) => ({ ...currentModal, color, colorInput: color }))}
                      className={`h-10 w-10 rounded-full border-2 transition-transform ${folderModal.color === color ? 'scale-105 border-white' : 'border-transparent hover:scale-105'}`}
                      style={{ backgroundColor: color }}
                      aria-label={characterSelectText.folderColor}
                    />
                  ))}
                </div>
                <input
                  value={folderModal.colorInput || folderModal.color}
                  onChange={(event) => handleFolderColorInputChange(event.target.value)}
                  className={`mt-3 w-full rounded-2xl border bg-black/30 px-4 py-3 text-white outline-none transition-colors placeholder:text-zinc-500 ${isValidHexColor(normalizeHexColorInput(folderModal.colorInput || '')) ? 'border-white/10 focus:border-rose-500/60' : 'border-red-500/40 focus:border-red-500/60'}`}
                  placeholder={characterSelectText.folderColorPlaceholder}
                />
                <p className="mt-2 text-xs text-zinc-500">
                  {characterSelectText.folderColorCustomHint}
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <div>
                {!folderModal.isStandard && folderModal.mode === 'edit' && (
                  <button
                    type="button"
                    onClick={handleDeleteFolder}
                    className="flex items-center gap-2 rounded-2xl bg-red-500/12 px-4 py-3 text-sm text-red-100 transition-colors hover:bg-red-500/20 border-2 border-transparent hover:border-rose-500"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>{commonText.delete}</span>
                  </button>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeFolderModal}
                  className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-zinc-200 transition-colors hover:bg-white/10 border-2 border-transparent hover:border-rose-500"
                >
                  {commonText.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleSaveFolder}
                  className="rounded-2xl bg-rose-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-rose-400 border-2 border-transparent hover:border-rose-500"
                >
                  {commonText.confirm}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CharacterSelect;

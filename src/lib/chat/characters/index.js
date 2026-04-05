import { normalizeResponseMode } from '../../responseModes.js';

export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }
    
    if (!file.type.startsWith('image/')) {
      reject(new Error('File must be an image'));
      return;
    }
    
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsDataURL(file);
  });
};

export const saveCustomCharacter = (characterData) => {
  try {
    if (!characterData || !characterData.name) {
      throw new Error('Invalid character data');
    }

    const normalizedCharacterData = {
      ...characterData,
      responseMode: normalizeResponseMode(characterData.responseMode ?? characterData.responseStyle, 'normal')
    };

    const canonicalCharacters = JSON.parse(localStorage.getItem('custom_characters') || '[]');
    const legacyCharacters = JSON.parse(localStorage.getItem('customCharacters') || '[]');
    const characters = [...canonicalCharacters, ...legacyCharacters].filter((character, index, array) => (
      character?.id && array.findIndex((candidate) => candidate?.id === character.id) === index
    ));
    
    if (!normalizedCharacterData.id) {
      normalizedCharacterData.id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    const existingIndex = characters.findIndex(c => c.id === normalizedCharacterData.id);
    
    if (existingIndex >= 0) {
      characters[existingIndex] = {
        ...normalizedCharacterData,
        updatedAt: new Date().toISOString()
      };
    } else {
      characters.push({
        ...normalizedCharacterData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    
    try {
      localStorage.setItem('custom_characters', JSON.stringify(characters));
      localStorage.removeItem('customCharacters');
    } catch (storageError) {
      if (storageError.name === 'QuotaExceededError' || storageError.code === 22) {
        console.error('[CharacterSave] localStorage quota exceeded');
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { message: 'Storage full — try removing some character avatars to free space', type: 'error' }
        }));
        return { success: false, error: 'Storage quota exceeded' };
      }
      throw storageError;
    }

    return { success: true, character: normalizedCharacterData };
  } catch (error) {
    console.error('[v8.1 Character] Error saving:', error);
    return { success: false, error: error.message };
  }
};

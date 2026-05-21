import React from 'react';
import MessageAvatar from './MessageAvatar';

const ChatEmptyState = ({ character }) => {
  if (!character) return null;
  const bio = (character.bio || character.description || '').trim();
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 px-6 text-center">
      <MessageAvatar character={character} size={96} />
      <h2 className="text-2xl font-semibold text-zinc-100">{character.name}</h2>
      {bio && (
        <p className="text-sm text-zinc-400 max-w-sm line-clamp-3 leading-relaxed">
          {bio}
        </p>
      )}
    </div>
  );
};

export default ChatEmptyState;

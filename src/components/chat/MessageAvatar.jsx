import React from 'react';

const MessageAvatar = ({ character, size = 36 }) => {
  const name = character?.name || '?';
  const initial = name.trim().charAt(0).toUpperCase();
  const style = { width: `${size}px`, height: `${size}px`, minWidth: `${size}px` };

  if (character?.profilePicture) {
    return (
      <img
        src={character.profilePicture}
        alt=""
        style={style}
        className="rounded-full object-cover border-2 border-transparent"
        loading="lazy"
        draggable={false}
      />
    );
  }

  return (
    <div
      style={style}
      className="rounded-full bg-gradient-to-br from-rose-500 to-rose-900 text-white flex items-center justify-center font-semibold border-2 border-transparent select-none"
    >
      <span style={{ fontSize: `${size * 0.42}px` }}>{initial}</span>
    </div>
  );
};

export default MessageAvatar;

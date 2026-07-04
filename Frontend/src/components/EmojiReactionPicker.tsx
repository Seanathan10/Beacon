import React from 'react';
import './styles/EmojiReactionPicker.css';

const AVAILABLE_EMOJIS = ['👍', '❤️', '😂', '😮', '🔥'];

interface EmojiReactionPickerProps {
  onEmojiSelect: (emoji: string) => void;
  // Optional: some call sites gate mounting themselves and omit these. When
  // isOpen is omitted the picker stays hidden (preserving existing behavior).
  isOpen?: boolean;
  onClose?: () => void;
}

export function EmojiReactionPicker({ onEmojiSelect, isOpen, onClose }: EmojiReactionPickerProps) {
  if (!isOpen) return null;

  return (
    <div className="emoji-picker">
      {AVAILABLE_EMOJIS.map(emoji => (
        <button
          key={emoji}
          className="emoji-button"
          onClick={() => {
            onEmojiSelect(emoji);
            onClose?.();
          }}
          title={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

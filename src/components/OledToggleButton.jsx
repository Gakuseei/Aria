import React, { useState, useEffect } from 'react'
import { Moon, Sun } from 'lucide-react'

export default function OledToggleButton({ oledMode, onToggle, currentView }) {
  const [isVisible, setIsVisible] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    setIsVisible(false)
    const timer = setTimeout(() => setIsVisible(true), 100)
    return () => clearTimeout(timer)
  }, [currentView])

  const handleClick = () => {
    setIsAnimating(true)
    onToggle('oledMode', !oledMode)
    setTimeout(() => setIsAnimating(false), 600)
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      className={`
        fixed bottom-4 right-4 z-50
        w-11 h-11 rounded-xl
        bg-zinc-800/50
        border border-zinc-700/50
        hover:border-zinc-600/50
        hover:bg-zinc-700/50
        active:scale-95
        flex items-center justify-center
        transition-all duration-300 ease-out
        shadow-lg shadow-black/20
        hover:shadow-xl
        ${isVisible 
          ? 'opacity-100 translate-y-0 scale-100' 
          : 'opacity-0 translate-y-4 scale-95'
        }
        ${isPressed ? 'scale-90' : ''}
        overflow-hidden
      `}
      title={oledMode ? 'Normal Mode' : 'OLED Mode'}
    >
      {/* Subtle gradient overlay */}
      <div className={`
        absolute inset-0
        transition-opacity duration-300
        ${oledMode 
          ? 'bg-gradient-to-br from-purple-500/5 to-transparent' 
          : 'bg-gradient-to-br from-amber-500/5 to-transparent'
        }
      `} />
      
      {/* Icon */}
      <div className={`
        relative z-10
        transition-all duration-500 ease-out
        ${isAnimating ? 'scale-0 rotate-180' : 'scale-100 rotate-0'}
      `}>
        {oledMode ? (
          <Moon 
            size={20} 
            className={`
              transition-all duration-300
              ${isHovered 
                ? 'text-purple-300 scale-110' 
                : 'text-zinc-500'
              }
            `} 
            strokeWidth={1.5}
          />
        ) : (
          <Sun 
            size={20} 
            className={`
              transition-all duration-300
              ${isHovered 
                ? 'text-amber-300 scale-110' 
                : 'text-zinc-500'
              }
            `} 
            strokeWidth={1.5}
          />
        )}
      </div>
    </button>
  )
}

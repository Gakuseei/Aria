import React from 'react';
import { GAME_MODES } from '../App';
import { useLanguage } from '../context/LanguageContext';

function ModeSelection({ onSelect, onBack }) {
  const { t } = useLanguage();
  
  const modes = [
    {
      id: GAME_MODES.CREATIVE_WRITING,
      title: t.modeSelection.storyTitle,
      description: t.modeSelection.storyDescription,
      icon: (
        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
      features: t.modeSelection.storyFeatures,
      accentColor: 'from-red-500 to-rose-600',
    },
    {
      id: GAME_MODES.CHARACTER_CHAT,
      title: t.modeSelection.chatTitle,
      description: t.modeSelection.chatDescription,
      icon: (
        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
        </svg>
      ),
      features: t.modeSelection.chatFeatures,
      accentColor: 'from-rose-500 to-pink-600',
    },
  ];

  return (
    <div className="h-full w-full flex flex-col p-8 bg-gradient-to-br from-zinc-900 via-zinc-900 to-black">
      {/* v1.0 ROSE NOIR: Premium Glass Header */}
      <div className="glass-header flex items-center gap-5 px-6 py-5 mb-8 rounded-2xl">
        <button
          onClick={onBack}
          className="p-3 hover:bg-white/5 rounded-xl transition-all duration-200 text-zinc-500 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h2 className="text-2xl font-bold text-white">{t.modeSelection.selectMode}</h2>
          <p className="text-zinc-500 text-sm">{t.modeSelection.chooseExperience}</p>
        </div>
      </div>

      {/* Mode Cards */}
      <div className="flex-1 flex items-center justify-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
          {modes.map((mode, index) => (
            <button
              key={mode.id}
              onClick={() => onSelect(mode.id)}
              className="group relative text-left p-8 rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              {/* v1.0 ROSE NOIR: Glass Background */}
              <div className="absolute inset-0 glass" />

              {/* Border Glow on Hover */}
              <div className="absolute inset-0 rounded-2xl border border-white/10 group-hover:border-rose-500/50 transition-colors duration-300" />
              
              {/* Accent Glow */}
              <div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-br ${mode.accentColor} opacity-0 group-hover:opacity-10 blur-3xl transition-opacity duration-500`} />
              
              {/* Content */}
              <div className="relative z-10">
                {/* Icon */}
                <div className={`inline-flex p-4 rounded-xl bg-gradient-to-br ${mode.accentColor} bg-opacity-20 text-white mb-6`}>
                  {mode.icon}
                </div>

                {/* Title - v1.0 ROSE NOIR */}
                <h3 className="text-xl font-bold text-white mb-3 group-hover:text-rose-400 transition-colors">
                  {mode.title}
                </h3>

                {/* Description */}
                <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                  {mode.description}
                </p>

                {/* Features */}
                <div className="space-y-2">
                  {mode.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-zinc-500">
                      <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${mode.accentColor}`} />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Arrow - v1.0 ROSE NOIR */}
                <div className="absolute bottom-8 right-8 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all">
                  <svg className="w-6 h-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ModeSelection;

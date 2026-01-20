// ARIA v1.0 - Image Gen Setup Tutorial (Refactored Premium)
import React, { useState, useEffect } from 'react';
import { Download, Check, RefreshCw, ExternalLink, Image as ImageIcon, Sparkles } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import TutorialLayout from './TutorialLayout';

export default function ImageGenSetup({ onClose, onVerified }) {
  const { t } = useLanguage();
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [testing, setTesting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [tierMode, setTierMode] = useState('standard'); // 'standard' (SDXL) | 'premium' (FLUX)
  const [fluxAvailable, setFluxAvailable] = useState(false);

  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    setTesting(true);
    try {
      const saved = JSON.parse(localStorage.getItem('settings') || '{}');
      const url = saved.imageGenUrl || 'http://127.0.0.1:7860';
      const result = await window.electronAPI?.testImageGen?.(url);
      if (result?.success) {
        setConnectionStatus('connected');
        checkFluxAvailable();
        if (onVerified) onVerified();

      } else {
        setConnectionStatus('disconnected');
      }
    } finally {
      setTesting(false);
    }
  };

  const checkFluxAvailable = async () => {
    try {
      const response = await fetch('http://127.0.0.1:7860/sdapi/v1/sd-models');
      if (response.ok) {
        const models = await response.json();
        const hasFlux = models.some(m => m.title?.toLowerCase().includes('flux'));
        setFluxAvailable(hasFlux);
      }
    } catch {
       setFluxAvailable(false);
    }
  };

  return (
    <TutorialLayout
       title={t.tutorials.imageGen?.title || "Image Generation"}
       subtitle={tierMode === 'premium' ? "FLUX.1-Dev (Cinematic Quality)" : "SDXL (Standard Quality)"}
       icon={tierMode === 'premium' ? "🎨" : "🖼️"}
       iconColor={tierMode === 'premium' ? "bg-purple-500/20" : "bg-pink-500/20"}
       steps={4}
       currentStep={currentStep}
       connectionStatus={connectionStatus}
       headerGradient={tierMode === 'premium' ? "from-purple-950/30 to-indigo-950/30" : "from-pink-950/30 to-rose-950/30"}
       onClose={onClose}
       footerContent={
          <div className="flex bg-zinc-900/50 p-1 rounded-xl border border-white/10 mr-auto">
             <button
                onClick={() => setTierMode('standard')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                   tierMode === 'standard' ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/20' : 'text-zinc-500 hover:text-zinc-300'
                }`}
             >
                Standard (SDXL)
             </button>
             <button
                onClick={() => setTierMode('premium')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                   tierMode === 'premium' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-zinc-500 hover:text-zinc-300'
                }`}
             >
                Premium (FLUX)
             </button>
          </div>
       }
    >
       {/* Premium Promo */}
       {tierMode === 'premium' && (
          <div className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border border-purple-500/30 rounded-xl p-4 flex items-center gap-4 mb-2">
             <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Sparkles size={24} className="text-purple-300" />
             </div>
             <div>
                <h4 className="font-bold text-white text-lg">Why use FLUX?</h4>
                <p className="text-sm text-purple-200/80">
                   Best-in-class prompt adherence. Can render proper text inside images. Cinematic lighting.
                   <br/><span className="text-xs opacity-70">Requires 12GB+ VRAM recommended.</span>
                </p>
             </div>
          </div>
       )}

       {/* Step 1: Stability Matrix */}
       <div className={`rocket-card glass p-1 border rounded-2xl ${currentStep===1 ? 'border-purple-500/50' : 'border-white/5 opacity-50'}`}>
          <div className="bg-zinc-900/50 p-5 rounded-xl flex gap-4">
             <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-300 font-bold flex items-center justify-center">1</div>
             <div className="flex-1">
                <h3 className="font-bold text-white mb-2">Install Stability Matrix</h3>
                <p className="text-sm text-zinc-400 mb-4">The all-in-one manager for Stable Diffusion.</p>
                <div className="flex gap-3">
                   <button 
                      onClick={() => window.electronAPI?.runToolScript?.('install_stability.bat')}
                      className={`px-5 py-2 rounded-lg font-bold text-white flex items-center gap-2 ${
                         tierMode === 'premium' ? 'bg-purple-600 hover:bg-purple-500' : 'bg-pink-600 hover:bg-pink-500'
                      }`}
                   >
                      Install Manager 📦
                   </button>
                   {currentStep === 1 && <button onClick={()=>setCurrentStep(2)} className="text-sm underline text-zinc-500 hover:text-white">Next Step</button>}
                </div>
             </div>
          </div>
       </div>

       {/* Step 2: Install Package */}
       <div className={`rocket-card glass p-1 border rounded-2xl ${currentStep===2 ? 'border-purple-500/50' : 'border-white/5 opacity-50'}`}>
          <div className="bg-zinc-900/50 p-5 rounded-xl flex gap-4">
             <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-300 font-bold flex items-center justify-center">2</div>
             <div className="flex-1">
                <h3 className="font-bold text-white mb-2">Install WebUI Forge</h3>
                <p className="text-sm text-zinc-400 mb-2">Open Stability Matrix, go to <b>Packages</b>, and install <b>ComfyUI</b> or <b>WebUI Forge</b>.</p>
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 text-xs mb-3">
                   ⚠️ <b>CRITICAL:</b> In Launch Options, you MUST add: <code>--api --cors-allow-origins=*</code>
                </div>
                {currentStep === 2 && <button onClick={()=>setCurrentStep(3)} className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300">Done? Next →</button>}
             </div>
          </div>
       </div>

       {/* Step 3: Launch */}
       <div className={`rocket-card glass p-1 border rounded-2xl ${currentStep>=3 ? 'border-purple-500/50' : 'border-white/5 opacity-50'}`}>
          <div className="bg-zinc-900/50 p-5 rounded-xl flex gap-4">
             <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-300 font-bold flex items-center justify-center">3</div>
             <div className="flex-1">
                 <h3 className="font-bold text-white mb-2">Launch & Verify</h3>
                 <p className="text-sm text-zinc-400 mb-4">Click "Launch" in Stability Matrix. Wait for the browser to open.</p>
                 
                 <button 
                    onClick={testConnection}
                    className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 ${
                       connectionStatus === 'connected' 
                       ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                       : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                 >
                    {connectionStatus === 'connected' ? "Connected! ✅" : "Test Connection 🔄"}
                 </button>

                 {connectionStatus === 'connected' && tierMode === 'premium' && (
                     <div className={`mt-3 p-2 rounded-lg border text-sm text-center ${
                        fluxAvailable ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-red-500/10 border-red-500/30 text-red-300'
                     }`}>
                        {fluxAvailable ? "✨ FLUX Model Detected" : "⚠️ FLUX Model NOT Found (Using Fallback)"}
                     </div>
                 )}
             </div>
          </div>
       </div>

    </TutorialLayout>
  );
}

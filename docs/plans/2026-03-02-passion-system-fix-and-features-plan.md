# Passion System Fix & Features — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all CRITICAL/MAJOR/MEDIUM/MINOR issues from the brutal-honest review and add 5 new features to the Passion System.

**Architecture:** All changes are in 3 files: `PassionManager.js` (core logic + constants), `api.js` (integration fixes), `ChatInterface.jsx` (UI features). Translations go in `translations.js`. No new files needed. No IPC migration.

**Tech Stack:** React 18, Electron 39, Vite 7, Tailwind 3, Ollama API

---

## Phase 1: PassionManager.js — Core Fixes + Constants + New Methods

All changes in `src/lib/PassionManager.js`. This phase touches only the core engine — no UI, no api.js.

**Files:**
- Modify: `src/lib/PassionManager.js`

**Step 1: Add named constants at the top of the file**

After line 13 (`const PASSION_STORAGE_KEY = 'aria_passion_data';`), add:

```js
const PASSION_MEMORY_KEY = 'aria_passion_memory';
const COOLDOWN_THRESHOLD = 3;
const HISTORY_LIMIT = 50;
const DECAY_INTERVAL_MS = 5 * 60 * 1000;
const DECAY_POINTS_PER_INTERVAL = 2;
const DECAY_MAX_POINTS = 10;
const KNOWN_SUFFIXES = ['_cooldown', '_history', '_streak', '_transition', '_lastUpdate'];
```

**Step 2: Replace hardcoded `3` in cooldown logic with `COOLDOWN_THRESHOLD`**

In `updatePassion()` (line 171 and 174), replace:
- `if (basePoints < 3)` → `if (basePoints < COOLDOWN_THRESHOLD)`
- `if (this.passionData[cooldownKey] >= 3)` → `if (this.passionData[cooldownKey] >= COOLDOWN_THRESHOLD)`

**Step 3: Replace hardcoded `50` in `trackHistory()` with `HISTORY_LIMIT`**

Line 314: `if (this.passionData[historyKey].length > 50)` → `> HISTORY_LIMIT`
Line 315: `.slice(-50)` → `.slice(-HISTORY_LIMIT)`

**Step 4: Add time-based decay to `updatePassion()`**

At the start of `updatePassion()`, after line 164 (`const currentLevel = ...`), add decay logic:

```js
    const lastUpdateKey = `${sessionId}_lastUpdate`;
    const now = Date.now();
    const lastUpdate = this.passionData[lastUpdateKey] || now;
    const elapsed = now - lastUpdate;
    let decayPoints = 0;
    if (elapsed > DECAY_INTERVAL_MS) {
      const intervals = Math.floor(elapsed / DECAY_INTERVAL_MS);
      decayPoints = Math.min(intervals * DECAY_POINTS_PER_INTERVAL, DECAY_MAX_POINTS);
    }
    this.passionData[lastUpdateKey] = now;
    const decayedLevel = Math.max(0, currentLevel - decayPoints);
```

Then change line 165 from:
```js
    const basePoints = this.calculatePassionPoints(userMessage, aiResponse);
```
to use `decayedLevel` as the base for the final calculation. At line 190 change:
```js
    const newLevel = Math.round(Math.max(0, Math.min(100, currentLevel + finalPoints)));
```
to:
```js
    const newLevel = Math.round(Math.max(0, Math.min(100, decayedLevel + finalPoints)));
```

**Step 5: Add `adjustPassion()` method**

After `setPassion()` (after line 301), add:

```js
  adjustPassion(sessionId, level) {
    const oldLevel = this.passionData[sessionId] || 0;
    const clamped = Math.round(Math.max(0, Math.min(100, level)));
    const oldTier = getTierKey(oldLevel);
    const newTier = getTierKey(clamped);
    const tierOrder = ['innocent', 'warm', 'passionate', 'primal'];
    if (oldTier !== newTier && tierOrder.indexOf(newTier) > tierOrder.indexOf(oldTier)) {
      this.passionData[`${sessionId}_transition`] = newTier;
    }
    this.passionData[sessionId] = clamped;
    this.trackHistory(sessionId, clamped);
    this.savePassionData();
    return clamped;
  }
```

**Step 6: Add tier transition detection to `setPassion()`**

Replace the existing `setPassion()` method body (lines 293-301) with:

```js
  setPassion(sessionId, level) {
    const oldLevel = this.passionData[sessionId] || 0;
    const clamped = Math.round(Math.max(0, Math.min(100, level)));
    const oldTier = getTierKey(oldLevel);
    const newTier = getTierKey(clamped);
    const tierOrder = ['innocent', 'warm', 'passionate', 'primal'];
    if (oldTier !== newTier && tierOrder.indexOf(newTier) > tierOrder.indexOf(oldTier)) {
      this.passionData[`${sessionId}_transition`] = newTier;
    }
    this.passionData[sessionId] = clamped;
    delete this.passionData[`${sessionId}_streak`];
    delete this.passionData[`${sessionId}_cooldown`];
    this.trackHistory(sessionId, clamped);
    this.savePassionData();
    return clamped;
  }
```

**Step 7: Fix `cleanupStaleSessions()` suffix stripping**

Replace line 381:
```js
      const baseKey = key.replace(/_cooldown$/, '').replace(/_history$/, '').replace(/_streak$/, '').replace(/_transition$/, '');
```
with:
```js
      let baseKey = key;
      for (const suffix of KNOWN_SUFFIXES) {
        if (key.endsWith(suffix)) {
          baseKey = key.slice(0, -suffix.length);
          break;
        }
      }
```

**Step 8: Update `resetPassion()` and `deleteCharacterPassion()` to clean `_lastUpdate`**

In `resetPassion()` (after line 338), add:
```js
    delete this.passionData[`${sessionId}_lastUpdate`];
```

In `deleteCharacterPassion()` (after line 368), add:
```js
    delete this.passionData[`${sessionId}_lastUpdate`];
```

Also update `getAllPassionLevels()` filter at line 351 to include `_lastUpdate`:
```js
      if (key.endsWith('_cooldown') || key.endsWith('_history') || key.endsWith('_streak') || key.endsWith('_transition') || key.endsWith('_lastUpdate')) return;
```

**Step 9: Add Per-Character Passion Memory methods**

Before the closing `}` of the class (before line 395), add:

```js
  saveCharacterMemory(characterId, level) {
    try {
      const stored = localStorage.getItem(PASSION_MEMORY_KEY);
      const memory = stored ? JSON.parse(stored) : {};
      memory[characterId] = {
        lastLevel: Math.round(Math.max(0, Math.min(100, level))),
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(PASSION_MEMORY_KEY, JSON.stringify(memory));
    } catch (error) {
      console.error('[PassionManager] Error saving character memory:', error);
    }
  }

  getCharacterMemory(characterId) {
    try {
      const stored = localStorage.getItem(PASSION_MEMORY_KEY);
      if (!stored) return null;
      const memory = JSON.parse(stored);
      return memory[characterId] || null;
    } catch (error) {
      console.error('[PassionManager] Error loading character memory:', error);
      return null;
    }
  }

  getMomentum(sessionId) {
    const history = this.getHistory(sessionId);
    if (history.length < 5) return 0;
    const recent = history.slice(-5);
    const n = recent.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += recent[i];
      sumXY += i * recent[i];
      sumX2 += i * i;
    }
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }
```

**Step 10: Add multi-language keywords to `calculatePassionPoints()`**

Expand the three keyword arrays (lines 218-235). After the existing EN/DE keywords, append:

```js
    const romanticKeywords = [
      // EN
      'love', 'kiss', 'hug', 'touch', 'hold', 'embrace', 'caress', 'stroke',
      'beautiful', 'gorgeous', 'sexy', 'hot', 'attractive', 'cute', 'adorable',
      'affection', 'desire', 'want', 'need', 'crave', 'yearn',
      // DE
      'liebe', 'küss', 'umarm', 'berühr', 'halt', 'streichel', 'schön', 'heiß',
      // ES
      'amor', 'beso', 'abrazo', 'tocar', 'hermosa', 'deseo', 'querer',
      // FR
      'amour', 'baiser', 'embrasser', 'toucher', 'belle', 'désir',
      // RU
      'любовь', 'поцелуй', 'обнять', 'красивая', 'желание',
      // JA
      '愛', 'キス', '抱きしめ', '触れ', '美しい', '欲しい',
      // PT
      'amor', 'beijo', 'abraço', 'tocar', 'bonita', 'desejo',
      // IT
      'amore', 'bacio', 'abbraccio', 'toccare', 'bella', 'desiderio',
      // KO
      '사랑', '키스', '포옹', '만지', '예쁜', '원해'
    ];

    const intimateKeywords = [
      // EN
      'bed', 'bedroom', 'naked', 'undress', 'clothes', 'body', 'skin',
      'moan', 'gasp', 'shiver', 'tremble', 'breathe', 'pant',
      // DE
      'bett', 'schlafzimmer', 'nackt', 'ausziehen', 'körper', 'haut',
      // ES
      'cama', 'desnudo', 'cuerpo', 'piel', 'gemir', 'temblar',
      // FR
      'lit', 'nu', 'corps', 'peau', 'gémir', 'frissonner',
      // RU
      'кровать', 'голый', 'тело', 'кожа', 'стон', 'дрожь',
      // JA
      'ベッド', '裸', '体', '肌', '喘ぐ', '震え',
      // PT
      'cama', 'nu', 'corpo', 'pele', 'gemer', 'tremer',
      // IT
      'letto', 'nudo', 'corpo', 'pelle', 'gemere', 'tremare',
      // KO
      '침대', '벗', '몸', '피부', '신음', '떨림'
    ];

    const explicitKeywords = [
      // EN
      'fuck', 'sex', 'cock', 'dick', 'pussy', 'breast', 'tits', 'ass',
      'cum', 'orgasm', 'climax', 'pleasure', 'lust',
      // DE
      'ficken', 'orgasmus', 'lust', 'verlangen',
      // ES
      'follar', 'sexo', 'polla', 'coño', 'orgasmo', 'placer',
      // FR
      'baiser', 'sexe', 'bite', 'chatte', 'orgasme', 'plaisir',
      // RU
      'секс', 'оргазм', 'удовольствие', 'похоть',
      // JA
      'セックス', 'オーガズム', '快感', '欲望',
      // PT
      'foder', 'sexo', 'pau', 'buceta', 'orgasmo', 'prazer',
      // IT
      'scopare', 'sesso', 'cazzo', 'orgasmo', 'piacere',
      // KO
      '섹스', '오르가즘', '쾌감', '욕망'
    ];
```

**Step 11: Run `npm run dev` to verify no syntax errors**

Run: `npm run dev`
Expected: App starts without errors in console. PassionManager loads.

**Step 12: Commit Phase 1**

```bash
git add src/lib/PassionManager.js
git commit -m "Fix PassionManager: constants, adjustPassion, decay, i18n keywords, memory"
git push
```

---

## Phase 2: api.js — Integration Fixes

All changes in `src/lib/api.js`.

**Files:**
- Modify: `src/lib/api.js`

**Step 1: Remove dead import**

Change lines 11-16 from:
```js
import {
  enhanceSystemPromptWithPacing,
  getPacingReminder,
  getSensoryGuidance,
  validateResponseQuality
} from './slowBurn.js';
```
to:
```js
import {
  getPacingReminder,
  getSensoryGuidance,
  validateResponseQuality
} from './slowBurn.js';
```

**Step 2: Add constants after DEFAULT_SETTINGS**

After line 179 (end of `DEFAULT_SETTINGS`), add:

```js
const LLM_BLEND_RATIO = { keyword: 0.7, llm: 0.3 };
const LLM_SCORING_TIMEOUT_MS = 10000;
```

**Step 3: Add `passionSpeedMultiplier` to DEFAULT_SETTINGS**

In `DEFAULT_SETTINGS` (before the closing `}`), add:
```js
  passionSpeedMultiplier: 1.0
```

**Step 4: Defensive settings copy**

Replace line 828:
```js
    const settings = settingsOverride || await loadSettings();
```
with:
```js
    const settings = { ...(settingsOverride || await loadSettings()) };
```

**Step 5: Remove projected passion level**

Replace lines 857-864:
```js
    // PASSION TRACKING (v9.2 FIX: Track per SESSION, not per character name)
    let currentPassionLevel = 0;
    if (settings.passionSystemEnabled && sessionId) {
      currentPassionLevel = passionManager.getPassionLevel(sessionId);
      const projectedPoints = passionManager.calculatePassionPoints(userMessage, '');
      const projectedLevel = Math.round(Math.max(0, Math.min(100, currentPassionLevel + projectedPoints)));
      currentPassionLevel = projectedLevel;
    }
```
with:
```js
    let currentPassionLevel = 0;
    if (settings.passionSystemEnabled && sessionId) {
      currentPassionLevel = passionManager.getPassionLevel(sessionId);
    }
```

**Step 6: Use `passionSpeedMultiplier` in passion update**

Replace line 967:
```js
      const speedMultiplier = character?.passionProfile || 1.0;
```
with:
```js
      const speedMultiplier = (character?.passionProfile || 1.0) * (settings.passionSpeedMultiplier || 1.0);
```

**Step 7: Fix LLM scoring — use `adjustPassion()` + timeout + constants**

Replace lines 979-1004 with:

```js
    if (settings.aiPassionScoringEnabled && settings.passionSystemEnabled && sessionId && !skipPassionUpdate) {
      const scoringAbort = new AbortController();
      const scoringTimer = setTimeout(() => scoringAbort.abort(), LLM_SCORING_TIMEOUT_MS);
      try {
        const scoringResponse = await fetch(`${settings.ollamaUrl || 'http://127.0.0.1:11434'}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: scoringAbort.signal,
          body: JSON.stringify({
            model: settings.ollamaModel || 'hermes3',
            messages: [{ role: 'user', content: `Rate the intimacy/sexual intensity of this exchange on a scale of 0-10. 0=casual, 5=flirting, 10=explicit. User: "${userMessage.substring(0, 200)}" AI: "${aiMessage.substring(0, 200)}". Reply with ONLY a number 0-10.` }],
            stream: false,
            options: { temperature: 0.1, num_predict: 5 }
          })
        });
        if (scoringResponse.ok) {
          const scoringData = await scoringResponse.json();
          const rawScore = parseInt(scoringData.message?.content?.trim(), 10);
          if (!isNaN(rawScore) && rawScore >= 0 && rawScore <= 10) {
            const llmLevel = rawScore * 10;
            const currentKw = passionManager.getPassionLevel(sessionId);
            const blended = Math.round(currentKw * LLM_BLEND_RATIO.keyword + llmLevel * LLM_BLEND_RATIO.llm);
            passionManager.adjustPassion(sessionId, Math.max(0, Math.min(100, blended)));
            currentPassionLevel = passionManager.getPassionLevel(sessionId);
          }
        }
      } catch (e) { /* LLM scoring failed or timed out */ }
      finally { clearTimeout(scoringTimer); }
    }
```

**Step 8: Run `npm run dev` to verify**

Run: `npm run dev`
Expected: App starts, messages send correctly, passion updates without projection.

**Step 9: Commit Phase 2**

```bash
git add src/lib/api.js
git commit -m "Fix api.js: remove projection, dead import, settings mutation, LLM timeout"
git push
```

---

## Phase 3: ChatInterface.jsx — UI Fixes + Features

All changes in `src/components/ChatInterface.jsx`.

**Files:**
- Modify: `src/components/ChatInterface.jsx`

**Step 1: Memoize PassionSparkline**

Replace lines 255-276 with:

```jsx
const PassionSparkline = React.memo(function PassionSparkline({ history, color }) {
  if (!history || history.length < 5) return null;

  const points = history.slice(-25);
  const width = 40;
  const height = 16;

  const pathData = points
    .map((val, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - (val / 100) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="opacity-60">
      <path d={pathData} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
});
```

Note: Now takes `history` as a prop instead of reading from `passionManager` directly.

**Step 2: Add momentum + streak + history as derived state**

After `const [passionLevel, setPassionLevel] = useState(0);` (line 287), the `previousTierRef` and `tierTransitioning` are already there. Find a good spot after state declarations (around line 292) and add:

```jsx
  const passionHistory = useMemo(() => {
    if (!sessionId) return [];
    return passionManager.getHistory(sessionId);
  }, [sessionId, passionLevel]);

  const passionMomentum = useMemo(() => {
    if (!sessionId) return 0;
    return passionManager.getMomentum(sessionId);
  }, [sessionId, passionLevel]);

  const currentStreak = useMemo(() => {
    if (!sessionId) return 0;
    return passionManager.getStreak(sessionId);
  }, [sessionId, passionLevel]);
```

**Step 3: Add Passion Resume Modal state**

After the existing modal states (around line 364), add:

```jsx
  const [showPassionResumeModal, setShowPassionResumeModal] = useState(false);
  const [passionResumeData, setPassionResumeData] = useState(null);
```

**Step 4: Save character passion memory on leave**

In `saveCurrentSession()` (around line 666), after the existing save logic, add:

```js
      if (character?.id && passionLevel > 0) {
        passionManager.saveCharacterMemory(character.id, passionLevel);
      }
```

**Step 5: Check for character memory on new chat**

In `initializeChat()`, in the "new session" branch (after line 627 `setPassionLevel(0)`), add:

```js
    if (character?.id) {
      const memory = passionManager.getCharacterMemory(character.id);
      if (memory && memory.lastLevel > 0) {
        setPassionResumeData(memory);
        setShowPassionResumeModal(true);
      }
    }
```

**Step 6: Add Passion Resume Modal to render**

Before the closing `</div>` of the main component return (find a good spot near other modals), add:

```jsx
      {showPassionResumeModal && passionResumeData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200]">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">{t.chat.passionResumeTitle}</h3>
            <p className="text-sm text-zinc-400 mb-4">
              {t.chat.passionResumeMessage.replace('{level}', passionResumeData.lastLevel)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPassionResumeModal(false);
                  setPassionResumeData(null);
                }}
                className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
              >
                {t.chat.passionResumeFresh}
              </button>
              <button
                onClick={() => {
                  if (sessionId) {
                    passionManager.setPassion(sessionId, passionResumeData.lastLevel);
                  }
                  setPassionLevel(passionResumeData.lastLevel);
                  setShowPassionResumeModal(false);
                  setPassionResumeData(null);
                }}
                className="flex-1 px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg text-sm transition-colors"
              >
                {t.chat.passionResumeResume.replace('{level}', passionResumeData.lastLevel)}
              </button>
            </div>
          </div>
        </div>
      )}
```

**Step 7: Replace streak IIFE + add momentum indicator in header**

Replace lines 1287-1298 (the sparkline + streak IIFE + primal dot block):

```jsx
                    <PassionSparkline history={passionHistory} color={getTierColor(passionLevel)} />
                    {passionMomentum > 1 && (
                      <span className="text-[10px] text-emerald-400 font-bold">↑</span>
                    )}
                    {passionMomentum < -1 && (
                      <span className="text-[10px] text-red-400 font-bold">↓</span>
                    )}
                    {passionMomentum >= -1 && passionMomentum <= 1 && passionHistory.length >= 5 && (
                      <span className="text-[10px] text-orange-400 font-bold">→</span>
                    )}
                    {currentStreak >= 3 && !isUnchainedMode && (
                      <span className="text-[10px] text-orange-400 font-bold animate-pulse">
                        x{currentStreak}
                      </span>
                    )}
                    {getTierKey(passionLevel) === 'primal' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    )}
```

**Step 8: Run `npm run dev` to verify UI**

Run: `npm run dev`
Expected: Passion badge shows correctly, sparkline renders, momentum arrows appear, preset modal works, resume modal shows for returning characters.

**Step 9: Commit Phase 3**

```bash
git add src/components/ChatInterface.jsx
git commit -m "Fix ChatInterface: memoize sparkline, add momentum, passion memory modal"
git push
```

---

## Phase 4: Settings.jsx — Passion Speed Slider

**Files:**
- Modify: `src/components/Settings.jsx`

**Step 1: Add Passion Speed Slider after the AI Passion Scoring toggle area**

Find the area around line 850 (after the `Passion System Toggle REMOVED` comment and the autoSave toggle). Add a new slider block:

```jsx
              <div className="p-3 bg-zinc-700/20 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-zinc-300">{t.settings.passionSpeed}</span>
                  <span className="text-xs text-zinc-500">
                    {settings.passionSpeedMultiplier === 1.0 ? '1.0x' :
                     settings.passionSpeedMultiplier < 1.0 ? `Slow (${settings.passionSpeedMultiplier}x)` :
                     `Fast (${settings.passionSpeedMultiplier}x)`}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.25"
                  max="3.0"
                  step="0.25"
                  value={settings.passionSpeedMultiplier || 1.0}
                  onChange={(e) => onSettingChange('passionSpeedMultiplier', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-rose-500"
                />
              </div>
```

**Step 2: Run `npm run dev` and check Settings**

Run: `npm run dev`
Expected: Slider appears in Settings, value persists.

**Step 3: Commit Phase 4**

```bash
git add src/components/Settings.jsx
git commit -m "Add passion speed slider to Settings"
git push
```

---

## Phase 5: Translations — New i18n Keys

**Files:**
- Modify: `src/lib/translations.js`

**Step 1: Add new keys to English (primary) `chat` section**

Find the English `chat:` object and add these keys (after the existing passion-related keys around line 91):

```js
      passionResumeTitle: "Continue where you left off?",
      passionResumeMessage: "Your last session with this character reached {level}% passion. Would you like to resume or start fresh?",
      passionResumeFresh: "Start Fresh",
      passionResumeResume: "Resume at {level}%",
```

Add to the English `settings:` section:
```js
      passionSpeed: "Passion Speed",
```

**Step 2: Add translations for German**

In the German `chat:` section (around line 674):
```js
      passionResumeTitle: "Dort weitermachen wo du aufgehört hast?",
      passionResumeMessage: "Deine letzte Sitzung mit diesem Charakter erreichte {level}% Leidenschaft. Fortsetzen oder neu starten?",
      passionResumeFresh: "Neu starten",
      passionResumeResume: "Bei {level}% fortsetzen",
```

In the German `settings:` section:
```js
      passionSpeed: "Leidenschafts-Tempo",
```

**Step 3: Add translations for the remaining 11 languages**

Add corresponding keys in ES, CN, FR, IT, PT, RU, JA, KO, AR, HI, TR sections. Use the same key names with translated values.

**Step 4: Run `npm run dev` and switch languages to verify**

Run: `npm run dev`
Expected: All new keys show translated text. No `undefined` in UI.

**Step 5: Commit Phase 5**

```bash
git add src/lib/translations.js
git commit -m "Add i18n keys for passion memory, speed slider, momentum"
git push
```

---

## Phase 6: Verification

**Step 1: Full app test**

Run: `npm run dev`

Verify:
- [ ] New chat starts at passion 0
- [ ] Keywords in multiple languages increment passion
- [ ] Passion presets trigger tier transitions
- [ ] Sparkline renders and updates
- [ ] Momentum arrows appear after 5+ messages
- [ ] Streak counter shows after 3+ romantic messages
- [ ] Speed slider in Settings changes passion gain rate
- [ ] Resume modal appears when starting new chat with known character
- [ ] Unchained mode bypasses gatekeeping
- [ ] LLM scoring (if enabled) doesn't reset streak

**Step 2: Production build test**

Run: `npm run build`
Expected: Build succeeds with no errors.

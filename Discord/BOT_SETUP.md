# 🤖 𝔸𝕣𝕚𝕒 Discord - 𝗕𝗼𝘁 𝗦𝗲𝘁𝘂𝗽 𝗚𝘂𝗶𝗱𝗲

## Empfohlene Bots

| Bot      | Hauptfunktion                       | Link             |
| -------- | ----------------------------------- | ---------------- |
| MEE6     | Welcome, Moderation, Reaction Roles | https://mee6.xyz |
| Carl-bot | Reaction Roles, Logging             | https://carl.gg  |
| Dyno     | Moderation, Auto-Mod                | https://dyno.gg  |

> **Empfehlung:** MEE6 ist am einfachsten für Anfänger.

---

## 🎉 MEE6 Setup

### Schritt 1: Bot hinzufügen

1. Gehe zu: **https://mee6.xyz/dashboard**
2. Klicke **"Add to Discord"**
3. Wähle deinen **𝔸𝕣𝕚𝕒** Server
4. Autorisiere den Bot

---

### Schritt 2: Welcome Plugin aktivieren

1. Im Dashboard links: **Welcome**
2. Toggle auf **ON**

**Welcome Channel:** `#ᴡᴇʟᴄᴏᴍᴇ`

**Welcome Message (Copy-Paste):**

```
🌹 𝓦𝓮𝓵𝓬𝓸𝓶𝓮 𝓽𝓸 𝔸𝕣𝕚𝕒, {user}!

We're happy to have you here! This is the official community for 𝔸𝕣𝕚𝕒 – your 100% local, offline AI companion.

📜 Please read #ʀᴜʟᴇꜱ before participating
💬 Say hi in #ɢᴇɴᴇʀᴀʟ-ᴄʜᴀᴛ
📥 Get 𝔸𝕣𝕚𝕒: https://github.com/Gakuseei/Aria

𝓔𝓷𝓳𝓸𝔂 𝔂𝓸𝓾𝓻 𝓼𝓽𝓪𝔂! ✨
```

---

### Schritt 3: Reaction Roles für 18+ Verifizierung

1. MEE6 Dashboard → **Reaction Roles**
2. Klicke **"Create new reaction role"**

**Schritt 3.1 - Message erstellen**

- Wähle Channel: `#ʀᴜʟᴇꜱ`
- Wähle: "Create a new message"

**Message Content (Copy-Paste):**

```
━━━━━━━━━━━━━━━━━━━━━━

## 🔞 𝗔𝗴𝗲 𝗩𝗲𝗿𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻

To access NSFW channels, you must be 18 or older.

**𝗕𝘆 𝗿𝗲𝗮𝗰𝘁𝗶𝗻𝗴 𝘄𝗶𝘁𝗵 ✅ 𝗯𝗲𝗹𝗼𝘄, 𝘆𝗼𝘂 𝗰𝗼𝗻𝗳𝗶𝗿𝗺 𝘁𝗵𝗮𝘁:**
- You are at least 18 years old
- You understand this gives access to adult content
- You agree to follow the NSFW rules

━━━━━━━━━━━━━━━━━━━━━━
```

**Schritt 3.2 - Reaction hinzufügen**

- Emoji: ✅
- Rolle: `🔞 【１８+】`
- Aktion: "Give role when reacted"

3. **Speichern**

---

### Schritt 4: Moderation Plugin (Optional)

1. Im Dashboard links: **Moderation**
2. Toggle auf **ON**

**Auto-Mod Regeln:**

- ✅ Anti-Spam (5 Nachrichten in 5 Sekunden)
- ✅ Anti-Link (Optional)
- ✅ Caps-Lock Filter (Optional)
- ✅ Banned Words

**Mod Log Channel:** Erstelle `ᴍᴏᴅ-ʟᴏɢꜱ` (nur für Mods sichtbar)

---

### Schritt 5: Auto-Rolle für neue Member

1. Im Dashboard links: **Auto-Roles**
2. Wähle: `👤 ᴍᴇᴍʙᴇʀ`

---

## 🔧 Carl-bot Setup (Alternative)

### Schritt 1: Bot hinzufügen

1. Gehe zu: **https://carl.gg**
2. Klicke **"Login with Discord"**
3. Wähle deinen Server

---

### Schritt 2: Reaction Roles

1. Dashboard: **Reaction Roles**
2. Klicke **"Create new reaction role"**

**Mode:** Post embed

**Channel:** `#ʀᴜʟᴇꜱ`

**Embed Content:**

```json
{
  "title": "🔞 𝗔𝗴𝗲 𝗩𝗲𝗿𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻",
  "description": "To access NSFW channels, you must be 18 or older.\n\n**𝗕𝘆 𝗿𝗲𝗮𝗰𝘁𝗶𝗻𝗴 𝘄𝗶𝘁𝗵 ✅ 𝗯𝗲𝗹𝗼𝘄, 𝘆𝗼𝘂 𝗰𝗼𝗻𝗳𝗶𝗿𝗺 𝘁𝗵𝗮𝘁:**\n• You are at least 18 years old\n• You understand this gives access to adult content\n• You agree to follow the NSFW rules",
  "color": 15277667
}
```

**Reactions:**

- ✅ → `🔞 【１８+】`

---

### Schritt 3: Welcome Message

1. Dashboard: **Welcome & Leave**
2. Channel: `#ᴡᴇʟᴄᴏᴍᴇ`

**Message:**

```
🌹 𝓦𝓮𝓵𝓬𝓸𝓶𝓮 𝓽𝓸 𝔸𝕣𝕚𝕒, {user}!

We're happy to have you here! This is the official community for 𝔸𝕣𝕚𝕒 – your 100% local, offline AI companion.

📜 Please read #ʀᴜʟᴇꜱ before participating
💬 Say hi in #ɢᴇɴᴇʀᴀʟ-ᴄʜᴀᴛ
📥 Get 𝔸𝕣𝕚𝕒: https://github.com/Gakuseei/Aria

𝓔𝓷𝓳𝓸𝔂 𝔂𝓸𝓾𝓻 𝓼𝓽𝓪𝔂! ✨
```

---

## 📊 Bot-Permissions Checkliste

Stelle sicher dass der Bot diese Berechtigungen hat:

```
✅ Administrator (einfachste Option)

ODER spezifisch:
✅ Kanäle anzeigen
✅ Nachrichten senden
✅ Nachrichten verwalten
✅ Nachrichten-Verlauf lesen
✅ Reaktionen hinzufügen
✅ Einbetten von Links
✅ Dateien anhängen
✅ Erwähnungen @everyone
✅ Externe Emojis verwenden
✅ Rollen verwalten (für Reaction Roles)
```

---

## 🔗 Bot-Commands

### MEE6

```
!rank - Zeigt Level
!levels - Leaderboard
!warn @user reason - Warnt User
!mute @user time - Mutet User
!kick @user - Kickt User
!ban @user - Bannt User
```

### Carl-bot

```
!roles - Zeigt Reaction Roles
!warn @user reason - Warnt User
!mute @user time - Mutet User
!clean 10 - Löscht 10 Nachrichten
```

---

## ⚠️ Wichtige Hinweise

1. **Bot-Rolle Position:**
   - Der Bot braucht eine Rolle die HÖHER ist als die Rollen die er verwalten soll
   - Ziehe MEE6/Carl-bot über `🔞 【１８+】` und `👤 ᴍᴇᴍʙᴇʀ`

2. **Channel IDs finden:**
   - Entwicklermodus: Einstellungen → Erweitert → Entwicklermodus ✅
   - Rechtsklick auf Channel → "ID kopieren"

---

_𝔸𝕣𝕚𝕒 Discord Bot Setup | Januar 2026_

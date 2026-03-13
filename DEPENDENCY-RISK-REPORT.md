# Dependency Risk Report

**Project:** AriaApp v0.2.5
**Date:** 2026-03-13
**Total transitive dependencies:** ~877

---

## Vulnerabilities (9 total)

### High Severity (5)

All in `tar@6.2.1` (transitive via `electron-builder@24.13.3 → app-builder-lib → tar`):

| CVE / Advisory | Description |
|---|---|
| [GHSA-r6q2-hw4h-h46w](https://github.com/advisories/GHSA-r6q2-hw4h-h46w) | Race condition in path reservations via Unicode ligature collisions (macOS APFS) |
| [GHSA-34x7-hfp2-rc4v](https://github.com/advisories/GHSA-34x7-hfp2-rc4v) | Arbitrary file creation/overwrite via hardlink path traversal |
| [GHSA-8qq5-rm4j-mr97](https://github.com/advisories/GHSA-8qq5-rm4j-mr97) | Arbitrary file overwrite and symlink poisoning via insufficient path sanitization |
| [GHSA-83g3-92jg-28cx](https://github.com/advisories/GHSA-83g3-92jg-28cx) | Arbitrary file read/write via hardlink target escape through symlink chain |
| [GHSA-qffp-2rhf-9h96](https://github.com/advisories/GHSA-qffp-2rhf-9h96) | Hardlink path traversal via drive-relative linkpath |

### Low Severity (4)

All in `@tootallnate/once@2.0.0` (transitive via `electron-builder → builder-util → http-proxy-agent → @tootallnate/once`):

| CVE / Advisory | Description |
|---|---|
| [GHSA-vpq2-c234-7xj6](https://github.com/advisories/GHSA-vpq2-c234-7xj6) | Incorrect control flow scoping (4 paths through dependency chain) |

### Risk Assessment

All 9 vulnerabilities are in **build-time** dependencies (electron-builder). They do not affect the shipped application binary directly. However, a compromised build pipeline could inject malicious code into the installer. Upgrading `electron-builder` from `24.13.3` to `26.8.1` resolves all 9 vulnerabilities.

---

## Deprecated Transitive Packages (5)

All rooted in `electron-builder@24.13.3`:

| Package | Version | Depended by | Replacement |
|---|---|---|---|
| `glob` | 7.2.3 | `@electron/asar`, `archiver-utils` | `glob@11+` (built into newer electron-builder) |
| `inflight` | 1.0.6 | `glob@7` | Removed in `glob@9+` |
| `tar` | 6.2.1 | `app-builder-lib` | `tar@7+` (used by electron-builder 26+) |
| `@tootallnate/once` | 2.0.0 | `http-proxy-agent@5` | Removed in `http-proxy-agent@6+` |
| `boolean` | 3.2.0 | `global-agent` (via `electron`) | `global-agent@4+` drops this |

---

## Outdated Packages (13)

### Direct Dependencies

| Package | Current | Latest | Bump | Risk |
|---|---|---|---|---|
| `electron-builder` | 24.13.3 | 26.8.1 | **major** | Fixes all 9 vulns + 5 deprecated deps |
| `electron` | 39.8.1 | 41.0.1 | **major** | Chromium/Node upgrade, test all IPC |
| `react` | 18.3.1 | 19.2.4 | **major** | Breaking: no defaultProps, new hooks API |
| `react-dom` | 18.3.1 | 19.2.4 | **major** | Must upgrade with react |
| `tailwindcss` | 3.4.19 | 4.2.1 | **major** | Config format changed, CSS-first |
| `vite` | 7.3.1 | 8.0.0 | **major** | Plugin API changes |
| `@vitejs/plugin-react` | 4.7.0 | 6.0.0 | **major** | Must match vite version |
| `@types/react` | 18.3.28 | 19.2.14 | **major** | Must match react version |
| `@types/react-dom` | 18.3.7 | 19.2.3 | **major** | Must match react-dom version |
| `lucide-react` | 0.562.0 | 0.577.0 | **minor** | Safe patch, icon updates only |
| `concurrently` | 8.2.2 | 9.2.1 | **major** | Dev tool, low risk |
| `dotenv` | 16.6.1 | 17.3.1 | **major** | Dev tool, low risk |
| `wait-on` | 7.2.0 | 9.0.4 | **major** | Dev tool, low risk |

---

## Recommendations (Prioritized)

### 1. URGENT: Upgrade electron-builder (24.13.3 → 26.8.1)

- **Impact:** Resolves all 9 vulnerabilities and removes 5 deprecated transitive dependencies
- **Risk:** Major version bump; may require changes to `electron-builder.yml` config
- **Action:** `npm install --save-dev electron-builder@26.8.1` then test `npm run build`

### 2. SAFE: Patch lucide-react (0.562.0 → 0.577.0)

- **Impact:** Updated icons, no breaking changes
- **Risk:** Minimal
- **Action:** `npm install lucide-react@0.577.0`

### 3. PLANNED: Major framework upgrades (separate PRs each)

Each requires its own migration effort and full testing:

| Upgrade | Effort | Notes |
|---|---|---|
| React 18 → 19 | High | New hooks, no defaultProps, concurrent features |
| Tailwind 3 → 4 | High | CSS-first config, utility renames |
| Vite 7 → 8 + plugin-react 6 | Medium | Plugin API changes |
| Electron 39 → 41 | Medium | Chromium/Node upgrade, test all IPC handlers |

### 4. LOW-PRIORITY: Dev tool upgrades

Can be batched together with minimal risk:
- `concurrently` 8 → 9
- `dotenv` 16 → 17
- `wait-on` 7 → 9

---

## Summary

| Category | Count | Single Fix |
|---|---|---|
| High vulnerabilities | 5 | electron-builder upgrade |
| Low vulnerabilities | 4 | electron-builder upgrade |
| Deprecated transitive deps | 5 | electron-builder upgrade |
| Outdated packages (major) | 10 | Individual migration PRs |
| Outdated packages (minor) | 1 | Safe to patch now |
| Total transitive deps | ~877 | — |

**Highest-impact single action:** Upgrade `electron-builder` from `24.13.3` to `26.8.1` — resolves all vulnerabilities and deprecated packages in one step.

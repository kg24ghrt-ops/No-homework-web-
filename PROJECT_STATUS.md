# No Homework Notebook — Project Status

Keeps track of what is built, what is broken/fixed, the work log, and the APIs
we rely on. Update this file as the project evolves.

---

## 1. What this app does

A realistic ISO 216 A4/A5 notebook page (paper texture, ruling lines, margin)
with a drawing layer and a type-on-the-page content area. The paper rendering
is GPU-accelerated via WebGL with a Canvas 2D fallback. The app ships as a web
app (PWA) and as an Android APK built with Capacitor via a GitHub Actions
workflow.

---

## 2. Architecture / file map

```
index.html                 Static page: paper CSS, controls, status bar,
                           content area. Inline styles + <style> for the UI.
src/
  main.ts                  Entry point. Creates the canvas, bootstraps the
                           renderer + controller on DOMContentLoaded.
                           Re-exports paper module for tests/external use.
  main.test.ts             Vitest tests for PAPER_STANDARDS / MM_TO_PX.
  style.css                (Legacy) CSS dup of the inline styles; not imported
                           by main.ts.
  notebook/
    paper.ts               Data contract: PAPER_STANDARDS, DPI, MM_TO_PX,
                           NotebookConfig, createDefaultConfig(), hexToRgb().
    shaders.ts             GLSL strings (VERTEX/FRAGMENT_SHADER_SOURCE) for
                           paper rendering.
    GPUNotebookRenderer.ts Rendering engine: WebGL + Canvas 2D fallback,
                           Atrament drawing layer, resize/clear/render/export.
  ui/
    notebookController.ts  DOM wiring: buttons, ink controls, persistence.
  engines/   (empty dir)   Reserved for future rendering engines.
  pages/     (empty dir)   Reserved for future page types.
scripts/
  set-android-version.mjs  Set android versionCode/versionName from
                           package.json (enables in-place APK updates).
.github/workflows/
  build-apk.yml            CI/CD: lint → build web → build APK → GitHub release.
capacitor.config.ts        Capacitor app config (appId com.nohomework.notebook).
```

---

## 3. What is already implemented

### Rendering (GPUNotebookRenderer)
- [x] Realistic paper texture (simplex noise, multi-octave fbm, domain warping,
      coarse + fine fiber, laid-paper effect, edge darkening, top shadow,
      specular highlight, film grain).
- [x] ISO 216 paper sizes A4 (210×297mm) and A5 (148×210mm).
- [x] German DIN ruling lines + red margin line/zone.
- [x] WebGL rendering; **fixed to render to the visible canvas directly**.
- [x] Canvas 2D fallback for when WebGL is unavailable.
- [x] HiDPI (devicePixelRatio) sizing.
- [x] Atrament drawing layer (pressure-sensitive strokes).

### Drawing (Atrament)
- [x] Draw mode toggle (`drawBtn`).
- [x] Clear page (`clearBtn`).
- [x] Export drawing as PNG (`exportBtn`).
- [x] **Ink color picker + pen thickness selector** (Fine/Medium/Bold/Marker).

### Persistence
- [x] **Auto-save/restore** to `localStorage`: typed text, drawing, ink color,
      ink weight, and paper size. Shows a "Saved" indicator.
- [x] Paper size choice remembered across reloads.

### CI/CD & Android
- [x] GitHub Actions workflow builds web + Android APK and publishes a GitHub
      release on every push to `main`.
- [x] **In-place APK updates**: `scripts/set-android-version.mjs` maps
      `package.json` version → a strictly-increasing Android `versionCode`
      so a new build installs over the old app without requiring an uninstall.

---

## 4. Work log (most recent first)

| Date | Change |
|------|--------|
| 2026-09-02 | Fixed broken WebGL rendering (was drawing to an offscreen framebuffer never shown). Added ink controls + auto-save/restore. Fixed drawing layer blocking text editing. Enabled in-place APK updates (versionCode from package.json) + bumped version to 2.1.0. Committed `05c1c39d`, pushed; CI green, release v13 published. |
| 2026-09-01 | Improved paper realism (multi-octave noise, domain warping, edge effects, better ruling lines); fixed WebGL uniform mm→px bugs; upgraded Canvas 2D fallback. |
| 2026-09-01 | Refactored monolithic `src/main.ts` into `src/notebook/` + `src/ui/` + `src/engines/` + `src/pages/`. |
| 2026-09-01 | Fixed CI: release job permissions, gh-release v2, APK paths, cap init/skip, config imports; immutable builds. |

---

## 5. APIs and libraries in use

| Library / API | Version | Where used | Notes |
|---------------|---------|------------|-------|
| `atrament` | ^5.1.0 | `GPUNotebookRenderer` | Drawing engine. Public props: `color`, `weight`, `mode` (`MODE_DRAW`), `clear()`, `destroy()`. Constructor takes canvas + options. |
| `simplex-noise` | ^4.0.3 | `GPUNotebookRenderer` | `createNoise2D()` → 2D simplex noise for paper fallback texture. |
| WebGL 1/2 | native | shaders + renderer | Full-screen triangle, `gl_FragColor`, uniforms: `resolution`, `time`, `lineSpacing`, `margin`, `lineColor`, `lineOpacity`, `paperColor`, `marginColor`; attribute `position`. |
| Canvas 2D | native | renderer (fallback) | `createImageData/putImageData` per-pixel texture; gradients for margin + top shadow; `toDataURL` for export. |
| Web Storage | native | `notebookController` | `localStorage` keys: `nohomework.notebook.v1` (whole state), `nohomework.papersize`. |
| Capacitor | ^8.5.0 | `capacitor.config.ts`, CI | Android APK build; `cap add/sync/android`; config puts `dist/` in native shell. |
| Vite | ^8.2.2 | build | `vite build` → `dist/`; `vite-plugin-pwa` for PWA manifest/service worker. |
| Tailwind | ^4.3.3 | vite | Installed; currently unused by markup. |
| TypeScript | ^7.0.2 | typecheck | `tsc --noEmit` runs in CI lint job. |
| Vitest | ^4.1.11 | tests | `pnpm test` (runs `main.test.ts`). |

### Public surface of `GPUNotebookRenderer`
- getters: `size` (`'a4' | 'a5'`), `isWebGL` (bool), `drawingCanvas` (`HTMLCanvasElement`).
- methods: `setPaperSize`, `setLineSpacing`, `setRulingStandard`, `setInkColor(color)`,
  `setInkWeight(weight)`, `resize()`, `clearAll()`, `render()`, `exportAsImage()`,
  `exportAsPDF()` (stub — not implemented), `destroy()`.

---

## 6. Known TODOs / known issues

- [ ] `exportAsPDF()` is a stub ("not yet implemented") — needs a PDF library
      (e.g. jsPDF) or manual PDF generation.
- [ ] `src/style.css` duplicates the inline `<style>` block in `index.html`;
      it is not imported anywhere. Inline styles are the source of truth.
- [ ] `src/engines/` and `src/pages/` are empty placeholders — no code yet.
- [ ] Only `assembleDebug` is reliably built; `assembleRelease` is skipped
      unless signing keystore secrets are configured.
- [ ] Inline styles live in the HTML blob; consider moving all to `src/style.css`
      and importing it in `main.ts`.
- [ ] Add a PWA service-worker cache-update strategy to match auto-update
      (`registerType: 'autoUpdate'` already set in vite config).

---

## 7. How to build / run / release

```
pnpm install
pnpm dev            # local dev server (:3000)
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest
pnpm build          # vite build -> dist/

# Android (native project not committed; generated by CI)
npx cap add android && npx cap sync android
cd android && ./gradlew assembleDebug

# Release: push to main -> GitHub Actions builds + creates GitHub release
```

Bump `version` in `package.json` to trigger a higher Android `versionCode`
(so updates install over the old APK without uninstall).
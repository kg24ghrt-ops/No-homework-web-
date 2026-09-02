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
index.html                 Static page: toolbar, status footer, notebook page.
                           Modern UI styled with Tailwind utility classes
                           (no inline <style> block).
src/
  main.ts                  Entry point. Imports ./style.css, creates the canvas,
                           bootstraps the renderer + controller on DOMContentLoaded.
                           Re-exports paper module for tests/external use.
  main.test.ts             Vitest tests for PAPER_STANDARDS / MM_TO_PX.
  style.css                Tailwind entry (`@import "tailwindcss"` + @layer
                           components: paper page, content-area, drawing-area,
                           icon-btn, size-btn) and paper design tokens + print
                           rules. Imported by main.ts.
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
- [x] WebGL rendering; renders to the on-screen canvas directly.
- [x] Canvas 2D fallback for when WebGL is unavailable; paper can be re-rendered
      at any resolution for crisp exports (`renderPaperAt`).
- [x] HiDPI (devicePixelRatio) sizing.
- [x] Atrament drawing layer (pressure-sensitive strokes).

### Drawing (Atrament)
- [x] Draw mode toggle (`drawBtn`).
- [x] Clear page (`clearBtn`).
- [x] **Ink color picker + pen thickness selector** (Fine/Medium/Bold/Marker).

### Export / Download
- [x] **Download the full page as a PNG** (`Download PNG` button): composites the
      paper surface + ruling lines + margin, the typed text, and the drawn ink
      into a single image — not just the sketch layer.
- [x] Quality selector in the toolbar (Screen / 150 / 300 / 600 DPI); the paper
      is re-rendered at that resolution so exports stay sharp.
- [x] Filename encodes paper size + DPI + timestamp.
- [x] **Save to device gallery on Android/iOS**: on a native build the button
      saves the PNG straight to the gallery (via `@capacitor-community/media`),
      with a web file-download fallback.

### Lighting / realism
- [x] Realistic lighting model (WebGL shader + matched Canvas 2D): directional
      key light from the top-left, ambient fill, vertical/horizontal falloff,
      page-bulge highlight, paper-curl occlusion at the borders, specular sheen
      + cool glint, warm bottom bounce light, and a subtle warm temperature
      lift.
- [x] A soft non-interactive CSS sheen overlay on the paper sheet reinforces the
      lighting on screen.

### Persistence
- [x] **Auto-save/restore** to `localStorage`: typed text, drawing, ink color,
      ink weight, and paper size. Shows a "Saved" indicator.
- [x] Paper size choice remembered across reloads.

### UI / Design
- [x] Tailwind CSS (v4 via `@tailwindcss/vite`) set up — `style.css` imports it.
- [x] Modern toolbar redesign: segmented A4/A5 control, icon buttons with inline
      SVG icons, ink color + thickness, actions grouped with dividers.
- [x] Brand row header with app icon + tagline, status footer with GPU / renderer
      / spacing / standard readouts and an Auto-save chip.
- [x] Responsive layout that stacks on small screens; print styles hide chrome.
- [x] Draw button shows an active/selected state while drawing mode is on.

### Notes / caveats
- WebGL and Canvas 2D contexts are requested on the same visible canvas during
  init; browsers only allow one context type per canvas, so the WebGL path
  currently falls back to the Canvas 2D renderer (GPU status shows "Not
  available"). The 2D path produces the same page and is reused for exports.

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
| 2026-09-02 | Native gallery save: on Android/iOS the Download button saves the PNG to the device gallery via `@capacitor-community/media` (creates a "No Homework" album), web falls back to file download. Added realistic lighting (directional key, ambient, falloff, curl occlusion, sheen/glint, bounce light) to both the WebGL shader and the Canvas 2D texture, plus a CSS sheen overlay on the page. |
| 2026-09-02 | "Download PNG" now exports the full finished page — paper + ruling lines + margin, typed text, and drawn ink composited into one image, re-rendered at the chosen DPI (Screen/150/300/600) for sharp output. Added `renderPaperAt`/`buildComposite` + renderer getters (`paperSizePx`, `marginPx`, `lineSpacingPx`); controller adds word-wrapped text overlay + quality selector. Documented the latent WebGL-vs-2D same-canvas context limitation. |
| 2026-09-02 | UI overhaul: moved to Tailwind CSS (v4), redesigned toolbar with inline SVG icons, segmented paper-size control, active draw-button state, brand header and status footer. `style.css` is now the Tailwind entry (imported by `main.ts`); removed the inline `<style>` block. |
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
| `@capacitor-community/media` | ^9.1.0 | `notebookController` | Native save-to-gallery. `getAlbums()`, `getAlbumsPath()`, `createAlbum()`, `savePhoto({path, albumIdentifier, fileName})`. Imported only in the controller. |
| Capacitor | ^8.5.0 | `capacitor.config.ts`, CI | Android APK build; `cap add/sync/android`; config puts `dist/` in native shell; `Capacitor.isNativePlatform()` used to pick gallery vs. download. |
| Vite | ^8.2.2 | build | `vite build` → `dist/`; `vite-plugin-pwa` for PWA manifest/service worker. |
| Tailwind | ^4.3.3 | `src/style.css`, dark-mode utilities | v4 via `@tailwindcss/vite`; UI styled with utility classes + `@apply`. |
| TypeScript | ^7.0.2 | typecheck | `tsc --noEmit` runs in CI lint job. |
| Vitest | ^4.1.11 | tests | `pnpm test` (runs `main.test.ts`). |

### Public surface of `GPUNotebookRenderer`
- getters: `size` (`'a4' | 'a5'`), `isWebGL` (bool), `drawingCanvas`, `paperSizePx`
  (`{width, height}` CSS px), `marginPx` (CSS px), `lineSpacingPx` (CSS px).
- methods: `setPaperSize`, `setLineSpacing`, `setRulingStandard`, `setInkColor(color)`,
  `setInkWeight(weight)`, `resize()`, `clearAll()`, `render()`, `exportAsImage()`
  (sketch layer only, used by auto-save), `renderPaperAt(ctx, w, h)` (re-render
  paper at any resolution), `buildComposite(factor)` (paper + ink canvas for
  export), `exportAsPDF()` (stub — not implemented), `destroy()`.

---

## 6. Known TODOs / known issues

- [ ] `exportAsPDF()` is a stub ("not yet implemented") — needs a PDF library
      (e.g. jsPDF) or manual PDF generation if PDF output is wanted.
- [ ] WebGL path is effectively unused because a Canvas 2D context is created on
      the same canvas before requesting the WebGL context (one context type per
      canvas). To actually use GPU, the WebGL surface would need a separate
      canvas/texture. The Canvas 2D renderer is used instead.
- [ ] Text overlay in the exported PNG re-implements word-wrapping to match the
      content area; if `#contentArea` styling changes, `drawContentText` must
      match (font, line height, margin).
- [ ] `src/engines/` and `src/pages/` are empty placeholders — no code yet.
- [ ] Only `assembleDebug` is reliably built; `assembleRelease` is skipped
      unless signing keystore secrets are configured.
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
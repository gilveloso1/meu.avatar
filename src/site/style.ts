/**
 * Visual do estúdio no Material Design 3 (m3.material.io), como o blog do
 * anb.bot: tokens de cor (paleta base do MD3, roxo #6750a4), tipografia,
 * forma e elevação, e os componentes feitos com eles: barra superior, cards,
 * campos, botões, chips e snackbar. Sem framework nem biblioteca de CSS.
 */
const LIGHT = `
  --md-sys-color-primary: #6750a4;
  --md-sys-color-on-primary: #ffffff;
  --md-sys-color-primary-container: #eaddff;
  --md-sys-color-on-primary-container: #21005d;
  --md-sys-color-secondary-container: #e8def8;
  --md-sys-color-on-secondary-container: #1d192b;
  --md-sys-color-tertiary-container: #ffd8e4;
  --md-sys-color-on-tertiary-container: #31111d;
  --md-sys-color-error: #b3261e;
  --md-sys-color-error-container: #f9dedc;
  --md-sys-color-on-error-container: #410e0b;
  --md-sys-color-surface: #fef7ff;
  --md-sys-color-surface-container-low: #f7f2fa;
  --md-sys-color-surface-container: #f3edf7;
  --md-sys-color-surface-container-high: #ece6f0;
  --md-sys-color-surface-container-highest: #e6e0e9;
  --md-sys-color-on-surface: #1d1b20;
  --md-sys-color-on-surface-variant: #49454f;
  --md-sys-color-outline: #79747e;
  --md-sys-color-outline-variant: #cac4d0;
  --md-sys-color-inverse-surface: #322f35;
  --md-sys-color-inverse-on-surface: #f5eff7;`;

const DARK = `
  --md-sys-color-primary: #d0bcff;
  --md-sys-color-on-primary: #381e72;
  --md-sys-color-primary-container: #4f378b;
  --md-sys-color-on-primary-container: #eaddff;
  --md-sys-color-secondary-container: #4a4458;
  --md-sys-color-on-secondary-container: #e8def8;
  --md-sys-color-tertiary-container: #633b48;
  --md-sys-color-on-tertiary-container: #ffd8e4;
  --md-sys-color-error: #f2b8b5;
  --md-sys-color-error-container: #8c1d18;
  --md-sys-color-on-error-container: #f9dedc;
  --md-sys-color-surface: #141218;
  --md-sys-color-surface-container-low: #1d1b20;
  --md-sys-color-surface-container: #211f26;
  --md-sys-color-surface-container-high: #2b2930;
  --md-sys-color-surface-container-highest: #36343b;
  --md-sys-color-on-surface: #e6e0e9;
  --md-sys-color-on-surface-variant: #cac4d0;
  --md-sys-color-outline: #938f99;
  --md-sys-color-outline-variant: #49454f;
  --md-sys-color-inverse-surface: #e6e0e9;
  --md-sys-color-inverse-on-surface: #322f35;`;

export const CSS = `
:root {
${LIGHT}
  color-scheme: light;
  --font: "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  --md-sys-typescale-headline-small: 400 1.5rem/2rem var(--font);
  --md-sys-typescale-title-large: 400 1.375rem/1.75rem var(--font);
  --md-sys-typescale-title-medium: 500 1rem/1.5rem var(--font);
  --md-sys-typescale-body-large: 400 1rem/1.5rem var(--font);
  --md-sys-typescale-body-medium: 400 0.875rem/1.25rem var(--font);
  --md-sys-typescale-body-small: 400 0.75rem/1rem var(--font);
  --md-sys-typescale-label-large: 500 0.875rem/1.25rem var(--font);
  --md-sys-typescale-label-medium: 500 0.75rem/1rem var(--font);
  --md-sys-shape-corner-small: 8px;
  --md-sys-shape-corner-medium: 12px;
  --md-sys-shape-corner-large: 16px;
  --md-sys-shape-corner-full: 9999px;
  --md-sys-elevation-level1: 0 1px 2px 0 rgb(0 0 0 / 0.3), 0 1px 3px 1px rgb(0 0 0 / 0.15);
  --md-sys-elevation-level3: 0 1px 3px 0 rgb(0 0 0 / 0.3), 0 4px 8px 3px rgb(0 0 0 / 0.15);
  --layout-main: 960px;
  --layout-margin: 16px;
}

@media (prefers-color-scheme: dark) {
  :root {
${DARK}
    color-scheme: dark;
  }
}

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--md-sys-color-surface);
  color: var(--md-sys-color-on-surface);
  font: var(--md-sys-typescale-body-large);
}
a { color: var(--md-sys-color-primary); }

.top-app-bar {
  position: sticky; top: 0; z-index: 2;
  display: flex; align-items: center; gap: 8px;
  min-height: 64px; padding: 8px var(--layout-margin);
  background: var(--md-sys-color-surface-container);
}
.top-app-bar h1 { flex: 1; margin: 0; font: var(--md-sys-typescale-title-large); }

main { max-width: var(--layout-main); margin: 0 auto; padding: 16px var(--layout-margin) 48px; }
h2 { font: var(--md-sys-typescale-title-medium); margin: 24px 0 12px; }

.card {
  background: var(--md-sys-color-surface-container-low);
  border-radius: var(--md-sys-shape-corner-medium);
  box-shadow: var(--md-sys-elevation-level1);
  padding: 16px;
}

.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
.field label { font: var(--md-sys-typescale-label-large); color: var(--md-sys-color-on-surface-variant); }
.field small { font: var(--md-sys-typescale-body-small); color: var(--md-sys-color-on-surface-variant); }
textarea, input, select {
  font: var(--md-sys-typescale-body-large);
  color: var(--md-sys-color-on-surface);
  background: transparent;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-small);
  padding: 12px;
  width: 100%;
}
textarea { min-height: 180px; resize: vertical; }
textarea:focus, input:focus, select:focus { outline: 2px solid var(--md-sys-color-primary); outline-offset: -1px; border-color: transparent; }
.row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }

.actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.button {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 40px; padding: 0 24px;
  border: 0; border-radius: var(--md-sys-shape-corner-full);
  font: var(--md-sys-typescale-label-large);
  cursor: pointer; text-decoration: none;
  background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary);
}
.button:hover { box-shadow: var(--md-sys-elevation-level1); }
.button:disabled { opacity: 0.38; cursor: default; box-shadow: none; }
.button.text { background: transparent; color: var(--md-sys-color-primary); padding: 0 12px; }
.estimate { font: var(--md-sys-typescale-body-medium); color: var(--md-sys-color-on-surface-variant); }

.videos { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.video { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.video video, .video .placeholder {
  width: 100%; aspect-ratio: 9 / 16; border-radius: var(--md-sys-shape-corner-small);
  background: var(--md-sys-color-surface-container-highest); object-fit: cover;
}
.video .placeholder { display: grid; place-items: center; text-align: center; padding: 16px; color: var(--md-sys-color-on-surface-variant); background-size: cover; background-position: center; }
.video .placeholder span { background: var(--md-sys-color-surface-container-high); border-radius: var(--md-sys-shape-corner-small); padding: 8px 12px; }
.video .meta { font: var(--md-sys-typescale-body-small); color: var(--md-sys-color-on-surface-variant); }
.video details { font: var(--md-sys-typescale-body-medium); }
.video summary { cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.video .error { font: var(--md-sys-typescale-body-small); color: var(--md-sys-color-error); overflow-wrap: anywhere; }

.chip {
  align-self: flex-start;
  font: var(--md-sys-typescale-label-medium);
  border-radius: var(--md-sys-shape-corner-small);
  padding: 4px 8px;
  background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container);
}
.chip.completed { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
.chip.failed, .chip.cancelled, .chip.expired { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); }

.snackbar {
  margin: 0 0 16px; padding: 14px 16px;
  border-radius: var(--md-sys-shape-corner-small);
  background: var(--md-sys-color-inverse-surface); color: var(--md-sys-color-inverse-on-surface);
  box-shadow: var(--md-sys-elevation-level3);
  font: var(--md-sys-typescale-body-medium);
}
.empty { color: var(--md-sys-color-on-surface-variant); }

.login { max-width: 360px; margin: 15vh auto 0; }
.login h1 { font: var(--md-sys-typescale-headline-small); margin: 0 0 16px; }
`;

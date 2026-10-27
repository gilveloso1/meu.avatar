/**
 * Visual do estúdio, todo no Material Design 3 (m3.material.io), no mesmo
 * molde do blog do anb.bot: os tokens do sistema (cor, tipografia, forma,
 * elevação, estados e movimento) e os componentes feitos com eles: barra
 * superior pequena, abas principais, barra de busca, botões, botões de ícone,
 * FAB estendido, botões segmentados, chips de filtro, campos de texto
 * contornados, cards, listas, indicador de progresso linear, diálogo, snackbar
 * e banner. As cores vêm de theme.ts (npm run tema).
 *
 * Layout pelos breakpoints do M3: compacto (< 600 px) com margens de 16 px e
 * um painel; médio (600 a 839 px) e maiores com margens e espaço entre
 * painéis de 24 px. Modelos e vídeos: grade de cards preenchidos, que ganha
 * colunas com a largura (ou lista, nos vídeos). Página do modelo: até 839 px,
 * um painel embaixo do outro; de 840 a 1199 px, a configuração e os vídeos à
 * esquerda e o vídeo escolhido no centro; a partir de 1200 px, três painéis:
 * configuração (360 px), vídeo escolhido e vídeos (320 px).
 */
import { DARK, LIGHT } from "./theme";

export const CSS = `
:root {
${LIGHT}
  color-scheme: light;

  /* Tipografia (escala base do MD3, fonte Roboto) */
  --md-ref-typeface-brand: "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  --md-ref-typeface-plain: "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  --md-sys-typescale-display-small: 400 2.25rem/2.75rem var(--md-ref-typeface-brand);
  --md-sys-typescale-headline-medium: 400 1.75rem/2.25rem var(--md-ref-typeface-brand);
  --md-sys-typescale-headline-small: 400 1.5rem/2rem var(--md-ref-typeface-brand);
  --md-sys-typescale-title-large: 400 1.375rem/1.75rem var(--md-ref-typeface-brand);
  --md-sys-typescale-title-medium: 500 1rem/1.5rem var(--md-ref-typeface-plain);
  --md-sys-typescale-title-small: 500 0.875rem/1.25rem var(--md-ref-typeface-plain);
  --md-sys-typescale-body-large: 400 1rem/1.5rem var(--md-ref-typeface-plain);
  --md-sys-typescale-body-medium: 400 0.875rem/1.25rem var(--md-ref-typeface-plain);
  --md-sys-typescale-body-small: 400 0.75rem/1rem var(--md-ref-typeface-plain);
  --md-sys-typescale-label-large: 500 0.875rem/1.25rem var(--md-ref-typeface-plain);
  --md-sys-typescale-label-medium: 500 0.75rem/1rem var(--md-ref-typeface-plain);
  --md-sys-typescale-label-small: 500 0.6875rem/1rem var(--md-ref-typeface-plain);

  /* Forma */
  --md-sys-shape-corner-extra-small: 4px;
  --md-sys-shape-corner-small: 8px;
  --md-sys-shape-corner-medium: 12px;
  --md-sys-shape-corner-large: 16px;
  --md-sys-shape-corner-extra-large: 28px;
  --md-sys-shape-corner-full: 9999px;

  /* Elevação */
  --md-sys-elevation-level1: 0 1px 2px 0 rgb(0 0 0 / 0.3), 0 1px 3px 1px rgb(0 0 0 / 0.15);
  --md-sys-elevation-level2: 0 1px 2px 0 rgb(0 0 0 / 0.3), 0 2px 6px 2px rgb(0 0 0 / 0.15);
  --md-sys-elevation-level3: 0 1px 3px 0 rgb(0 0 0 / 0.3), 0 4px 8px 3px rgb(0 0 0 / 0.15);
  --md-sys-elevation-level4: 0 2px 3px 0 rgb(0 0 0 / 0.3), 0 6px 10px 4px rgb(0 0 0 / 0.15);

  /* Estados (camada sobre o componente) */
  --md-sys-state-hover-state-layer-opacity: 0.08;
  --md-sys-state-focus-state-layer-opacity: 0.1;
  --md-sys-state-pressed-state-layer-opacity: 0.1;

  /* Movimento */
  --md-sys-motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --md-sys-motion-easing-emphasized-decelerate: cubic-bezier(0.05, 0.7, 0.1, 1);
  --md-sys-motion-duration-short4: 200ms;
  --md-sys-motion-duration-medium2: 300ms;

  /* Layout: painel fixo (supporting pane), largura máxima, espaço entre painéis e margem da janela. */
  --layout-pane: 360px;
  --layout-max: 1920px;
  --layout-gap: 24px;
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
  letter-spacing: 0.031rem;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

a { color: inherit; }
img, video { display: block; max-width: 100%; }
h1, h2, h3, p, dl, dd { margin: 0; }
fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }

.icon {
  font-family: "Material Symbols Rounded";
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  white-space: nowrap;
  direction: ltr;
  display: inline-block;
  width: 1em;
  overflow: hidden;
  font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24;
  -webkit-font-feature-settings: "liga";
  font-feature-settings: "liga";
  user-select: none;
  flex: none;
}
.icon--filled { font-variation-settings: "FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24; }

.visually-hidden {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* Camada de estado: um ::before na cor do conteúdo, com a opacidade do estado. */
.interactive { position: relative; isolation: isolate; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.interactive::before {
  content: ""; position: absolute; inset: 0; border-radius: inherit;
  background: currentColor; opacity: 0; z-index: -1; pointer-events: none;
  transition: opacity var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}
.interactive:hover::before { opacity: var(--md-sys-state-hover-state-layer-opacity); }
.interactive:focus-visible::before { opacity: var(--md-sys-state-focus-state-layer-opacity); }
.interactive:active::before { opacity: var(--md-sys-state-pressed-state-layer-opacity); }
.interactive:focus-visible { outline: 3px solid var(--md-sys-color-secondary); outline-offset: 2px; }

.skip-link {
  position: absolute; left: 16px; top: -64px; z-index: 10;
  background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary);
  font: var(--md-sys-typescale-label-large); padding: 10px 24px;
  border-radius: var(--md-sys-shape-corner-full); text-decoration: none;
}
.skip-link:focus { top: 8px; }

/* --- Barra superior (top app bar pequena), numa linha só --------------------------------- */
.top-app-bar {
  position: sticky; top: 0; z-index: 5;
  min-height: 68px; padding: 10px 16px;
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 24px;
  background: var(--md-sys-color-surface);
  color: var(--md-sys-color-on-surface);
  transition: background-color var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard);
}
.top-app-bar.is-scrolled { background: var(--md-sys-color-surface-container); }
.top-app-bar__brand {
  display: flex; align-items: center; gap: 12px; min-height: 48px; flex: none;
  text-decoration: none; color: inherit; border-radius: var(--md-sys-shape-corner-medium);
}
.top-app-bar__logo {
  width: 40px; height: 40px; flex: none; display: grid; place-items: center;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary);
}
.top-app-bar__title {
  min-width: 0; font: var(--md-sys-typescale-title-large);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.top-app-bar__title--page { flex: 1; }
.top-app-bar__actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
/* No celular: a marca e a conta em cima, as abas embaixo e a busca na largura toda. */
.top-app-bar__tools { order: 4; flex: 1 0 100%; display: flex; align-items: center; gap: 8px; }
.top-app-bar--home .top-app-bar__actions { order: 2; }
.top-app-bar--home .nav-pills { order: 3; flex-basis: 100%; }
.top-app-bar__tools .search-field { flex: 1; width: auto; }
.top-app-bar__action { display: contents; }

/* Abas em pílula: o destino atual no contêiner secundário. */
.nav-pills { display: flex; flex-wrap: wrap; gap: 4px; flex: 1 1 200px; }
.nav-pill {
  display: inline-flex; align-items: center; height: 40px; padding: 0 16px;
  border-radius: var(--md-sys-shape-corner-full); text-decoration: none; color: var(--md-sys-color-on-surface);
  font: var(--md-sys-typescale-label-large); letter-spacing: 0.006rem; white-space: nowrap;
}
.nav-pill[aria-current] { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }

/* Busca: campo de cantos inteiros, claro e com contorno fino. */
.search-field {
  display: flex; align-items: center; gap: 8px; height: 44px; width: 260px; max-width: 100%; padding: 0 16px;
  border: 1px solid var(--md-sys-color-surface-container-highest); border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-surface-container-lowest); color: var(--md-sys-color-on-surface-variant);
  transition: border-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}
.search-field .icon { font-size: 20px; }
.search-field:hover { border-color: var(--md-sys-color-outline-variant); }
.search-field:focus-within { border-color: var(--md-sys-color-primary); outline: 1px solid var(--md-sys-color-primary); }
.search-field__input {
  flex: 1; min-width: 0; height: 100%; border: 0; outline: none; background: transparent; appearance: none;
  font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface);
}
.search-field__input::placeholder { color: var(--md-sys-color-on-surface-variant); }

/* Grade ou lista: dois botões de ícone num grupo; o escolhido em destaque. */
.view-toggle { display: flex; padding: 2px; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-surface-container); }
.view-toggle__option {
  width: 44px; height: 40px; display: grid; place-items: center; text-decoration: none;
  border-radius: var(--md-sys-shape-corner-full); color: var(--md-sys-color-on-surface-variant);
}
.view-toggle__option .icon { font-size: 20px; }
.view-toggle__option[aria-current] { background: var(--md-sys-color-surface-container-lowest); color: var(--md-sys-color-on-surface); box-shadow: var(--md-sys-elevation-level1); }

/* A conta: avatar com a inicial, que abre o menu com o nome, o e-mail e Sair. */
.avatar {
  width: 44px; height: 44px; display: grid; place-items: center; list-style: none;
  border: 2px solid var(--md-sys-color-primary); border-radius: var(--md-sys-shape-corner-full);
  background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);
  font: var(--md-sys-typescale-title-medium);
}
.avatar::-webkit-details-marker { display: none; }

/* --- Menu vertical do M3 Expressive (tokens SegmentedMenu/StandardMenu do Compose): contêiner
   surface-container-low de cantos grandes (16 px) e elevação 2, 4 px de margem interna; itens de
   44 px com ícone de 20 px, 16 px nas laterais e 12 px entre ícone e rótulo (body-large); o item
   ganha cantos médios no hover e no foco; o divisor não ocupa a largura toda. ---------------------- */
.menu { position: relative; }
.menu > summary { list-style: none; }
.menu > summary::-webkit-details-marker { display: none; }
.menu__list {
  position: absolute; right: 0; top: calc(100% + 4px); z-index: 10; min-width: 224px; padding: 4px;
  border-radius: var(--md-sys-shape-corner-large);
  background: var(--md-sys-color-surface-container-low); color: var(--md-sys-color-on-surface);
  box-shadow: var(--md-sys-elevation-level2);
}
.menu__item {
  display: flex; align-items: center; gap: 12px; width: 100%; height: 44px; padding: 0 16px;
  border: 0; border-radius: var(--md-sys-shape-corner-medium); background: none;
  text-decoration: none; color: var(--md-sys-color-on-surface); text-align: left;
  font: var(--md-sys-typescale-body-large); letter-spacing: 0.031rem; white-space: nowrap;
}
.menu__item .icon { font-size: 20px; color: var(--md-sys-color-on-surface-variant); }
.menu__divider { height: 1px; margin: 4px 16px; border: 0; background: var(--md-sys-color-outline-variant); }
.menu__header { display: flex; flex-direction: column; gap: 2px; padding: 8px 16px; }
.menu__name { font: var(--md-sys-typescale-body-large); letter-spacing: 0.031rem; }
.menu__email { font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface-variant); }

/* --- Botões de ícone --------------------------------------------------------------- */
.icon-button {
  width: 48px; height: 48px; flex: none;
  display: inline-grid; place-items: center;
  border: 0; padding: 0; background: none;
  color: var(--md-sys-color-on-surface-variant);
  border-radius: var(--md-sys-shape-corner-full);
  text-decoration: none;
}
.icon-button::before { inset: 4px; }
.icon-button:disabled, .button:disabled { opacity: 0.38; cursor: default; pointer-events: none; }
/* --- FAB estendido ("Novo vídeo"): contêiner primário, cantos de 16 px ------------------ */
.fab {
  display: inline-flex; align-items: center; gap: 8px; height: 48px; padding: 0 20px 0 16px; flex: none;
  border-radius: var(--md-sys-shape-corner-large);
  background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);
  box-shadow: var(--md-sys-elevation-level1);
  font: var(--md-sys-typescale-label-large); letter-spacing: 0.006rem; text-decoration: none; white-space: nowrap;
  transition: box-shadow var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}
.fab .icon { font-size: 20px; }
.fab:hover { box-shadow: var(--md-sys-elevation-level2); }

/* --- Chips de filtro: cantos de 8 px; o escolhido ganha o check e a cor secundária -------- */
.chip-set { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.chip {
  display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 16px;
  border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-small);
  color: var(--md-sys-color-on-surface-variant); text-decoration: none;
  font: var(--md-sys-typescale-label-large); letter-spacing: 0.006rem; white-space: nowrap;
}
.chip[aria-current] { border-color: transparent; padding-left: 8px; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
.chip .icon { font-size: 18px; }

/* --- Botões ------------------------------------------------------------------------- */
.button {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 40px; padding: 0 24px; border: 0;
  border-radius: var(--md-sys-shape-corner-full);
  font: var(--md-sys-typescale-label-large); letter-spacing: 0.006rem;
  text-decoration: none; white-space: nowrap;
}
.button:has(.icon:first-child) { padding-left: 16px; }
.button:has(.icon:last-child) { padding-right: 16px; }
.button .icon { font-size: 18px; }
.button--filled { background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
.button--filled:hover { box-shadow: var(--md-sys-elevation-level1); }
.button--tonal { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
.button--outlined { background: none; color: var(--md-sys-color-primary); border: 1px solid var(--md-sys-color-outline); }
.button--text { background: none; color: var(--md-sys-color-primary); padding: 0 12px; }

/* --- Campos de texto contornados (outlined text field) ------------------------------ */
.text-field { position: relative; display: flex; flex-direction: column; gap: 4px; }
.text-field__input {
  width: 100%; margin: 0; min-height: 56px; padding: 16px;
  font: var(--md-sys-typescale-body-large); letter-spacing: 0.031rem;
  color: var(--md-sys-color-on-surface); caret-color: var(--md-sys-color-primary);
  background: transparent;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-extra-small);
  outline: none; appearance: none;
  transition: border-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}
.text-field__input:hover { border-color: var(--md-sys-color-on-surface); }
.text-field__input:focus { border: 2px solid var(--md-sys-color-primary); padding: 15px; }
textarea.text-field__input { min-height: 200px; resize: vertical; display: block; }
.text-field__input::placeholder { color: transparent; }
.text-field__input:focus::placeholder { color: var(--md-sys-color-on-surface-variant); }
/* Rótulo: dentro do campo enquanto vazio; sobe para a borda com foco ou com texto. */
.text-field__label {
  position: absolute; left: 12px; top: 16px; padding: 0 4px; max-width: calc(100% - 24px);
  font: var(--md-sys-typescale-body-large); letter-spacing: 0.031rem;
  color: var(--md-sys-color-on-surface-variant);
  background: var(--field-surface, var(--md-sys-color-surface));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  pointer-events: none; transform-origin: left top;
  transition: transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
    color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}
.text-field__input:focus + .text-field__label,
.text-field__input:not(:placeholder-shown) + .text-field__label,
.text-field--select .text-field__label { transform: translateY(-24px) scale(0.75); max-width: calc((100% - 24px) / 0.75); }
.text-field__input:focus + .text-field__label { color: var(--md-sys-color-primary); }
.text-field__supporting {
  display: flex; justify-content: space-between; gap: 16px; padding: 0 16px;
  font: var(--md-sys-typescale-body-small); letter-spacing: 0.025rem;
  color: var(--md-sys-color-on-surface-variant);
}
/* Campo de seleção (exposed dropdown menu): a seta é o ícone à direita. */
.text-field--select .text-field__input { padding-right: 48px; cursor: pointer; }
.text-field--select .text-field__input:focus { padding-right: 47px; }
.text-field__trailing { position: absolute; right: 12px; top: 16px; color: var(--md-sys-color-on-surface-variant); pointer-events: none; }
.text-field--select option { background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface); }
.text-field__supporting--error { color: var(--md-sys-color-error); }

/* --- Botão segmentado (escolha única) ----------------------------------------------- */
.segmented-field { display: flex; flex-direction: column; gap: 8px; }
.segmented-field__label { padding: 0; font: var(--md-sys-typescale-body-small); letter-spacing: 0.025rem; color: var(--md-sys-color-on-surface-variant); }
/* Segmentos da mesma largura; o conjunto cresce com os rótulos, sem ocupar a largura toda. */
.segmented-button {
  display: inline-grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); justify-self: start; align-self: flex-start; max-width: 100%;
  border: 1px solid var(--md-sys-color-outline); border-radius: var(--md-sys-shape-corner-full); overflow: hidden;
}
.segmented-button__segment {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  height: 38px; min-width: 48px; padding: 0 12px;
  color: var(--md-sys-color-on-surface);
  font: var(--md-sys-typescale-label-large); letter-spacing: 0.006rem; white-space: nowrap;
}
.segmented-button__segment + .segmented-button__segment { border-left: 1px solid var(--md-sys-color-outline); }
.segmented-button__segment input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
.segmented-button__check { display: none; font-size: 18px; }
.segmented-button__segment:has(input:checked), .segmented-button__segment[aria-current] { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
.segmented-button__segment:has(input:checked) .segmented-button__check { display: inline-block; }
.segmented-button__segment:has(input:focus-visible)::before { opacity: var(--md-sys-state-focus-state-layer-opacity); }
.segmented-button:has(input:focus-visible) { outline: 3px solid var(--md-sys-color-secondary); outline-offset: 2px; }

/* Foto do avatar: o input fica escondido; o botão (largura toda) e, embaixo, a prévia com o nome e uma linha de ajuda. */
.file-picker { display: flex; flex-direction: column; gap: 12px; }
.file-picker input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.file-picker__button {
  display: flex; align-items: center; justify-content: center; gap: 8px; height: 44px;
  border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface);
  font: var(--md-sys-typescale-label-large); letter-spacing: 0.006rem;
}
.file-picker__button .icon { font-size: 20px; }
.file-picker input:focus-visible + .file-picker__button { outline: 3px solid var(--md-sys-color-secondary); outline-offset: 2px; }
.file-picker__row { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 0 8px; }
.file-picker__preview {
  width: 56px; height: 56px; flex: none; display: grid; place-items: center; overflow: hidden;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);
}
.file-picker__preview img { width: 100%; height: 100%; object-fit: cover; }
.file-picker__text { min-width: 0; display: flex; flex-direction: column; }
.file-picker__label { font: var(--md-sys-typescale-label-medium); letter-spacing: 0.031rem; color: var(--md-sys-color-on-surface-variant); }
.file-picker__name { font: var(--md-sys-typescale-title-small); letter-spacing: 0.006rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-picker__hint { font: var(--md-sys-typescale-body-small); letter-spacing: 0.025rem; color: var(--md-sys-color-on-surface-variant); }

/* Status do vídeo (no diálogo): ícone e rótulo na cor do grupo. */
.status-line {
  display: flex; align-items: center; gap: 8px;
  font: var(--md-sys-typescale-label-large); letter-spacing: 0.006rem; color: var(--md-sys-color-on-surface-variant);
}
.status-line .icon { font-size: 18px; }
.status-line--done { color: var(--md-sys-color-primary); }
.status-line--error { color: var(--md-sys-color-error); }

/* --- Cards --------------------------------------------------------------------------- */
.card {
  display: block; border-radius: var(--md-sys-shape-corner-medium);
  padding: 16px; text-decoration: none; color: var(--md-sys-color-on-surface);
}
.card--outlined { background: var(--md-sys-color-surface); border: 1px solid var(--md-sys-color-outline-variant); }
.card--filled { background: var(--md-sys-color-surface-container-highest); }
.card--elevated { background: var(--md-sys-color-surface-container-low); box-shadow: var(--md-sys-elevation-level1); }
/* Card inteiro como área de ação: camada de estado e elevação 1 ao passar o mouse. */
.card--action { transition: box-shadow var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard); }
.card--action:hover { box-shadow: var(--md-sys-elevation-level1); }

/* Modelos e vídeos em grade: card preenchido de cantos grandes, com o ícone e o menu em
   cima e o título embaixo. O link cobre o card inteiro; o menu fica por cima dele. */
.tile-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.tile-card {
  position: relative; display: flex; flex-direction: column; min-height: 184px; padding: 28px 24px 24px 32px;
  border-radius: var(--md-sys-shape-corner-extra-large); background: var(--md-sys-color-surface-container);
  transition: background-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}
.tile-card:has(.tile-card__link:hover) { background: var(--md-sys-color-surface-container-high); }
.tile-card:has(.tile-card__link:focus-visible) { outline: 3px solid var(--md-sys-color-secondary); outline-offset: 2px; }
.tile-card__top { display: flex; align-items: flex-start; gap: 8px; }
.tile-card__top .menu { position: relative; z-index: 1; margin: -8px -12px 0 auto; }
.tile-card__link { margin-top: auto; padding-top: 40px; min-width: 0; text-decoration: none; color: var(--md-sys-color-on-surface); outline: none; }
.tile-card__link::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
.tile-card__headline { display: block; font: 500 1.25rem/1.75rem var(--md-ref-typeface-plain); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile-card__supporting { margin-top: 2px; font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface-variant); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.badge-chip {
  margin-left: auto; display: inline-flex; align-items: center; height: 28px; padding: 0 12px;
  border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-small);
  font: var(--md-sys-typescale-label-medium); letter-spacing: 0.031rem; color: var(--md-sys-color-on-surface-variant);
}
.badge-chip + .menu { margin-left: 0; }

/* Ícone num contêiner tonal (o "avatar" de ícone dos cards e das listas). */
.icon-tile { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border-radius: var(--md-sys-shape-corner-medium); }
.icon-tile .icon { font-size: 20px; }
.icon-tile--large { width: 48px; height: 48px; border-radius: 14px; }
.icon-tile--large .icon { font-size: 24px; }
.icon-tile--hero { width: 56px; height: 56px; border-radius: var(--md-sys-shape-corner-large); }
.icon-tile--hero .icon { font-size: 28px; }
.icon-tile--primary { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
.icon-tile--secondary { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
.icon-tile--tertiary { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
.icon-tile--error { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); }

/* Vídeos em lista: lista expressiva do M3 no estilo segmentado; itens separados por 2 px,
   cantos de 4 px por dentro e 16 px nas pontas do grupo. */
.list-box { display: flex; flex-direction: column; gap: 2px; }
.list-row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; min-height: 64px; padding: 12px 24px;
  border-radius: var(--md-sys-shape-corner-extra-small); background: var(--md-sys-color-surface-container);
  text-decoration: none; color: var(--md-sys-color-on-surface);
}
.list-row:first-child { border-top-left-radius: var(--md-sys-shape-corner-large); border-top-right-radius: var(--md-sys-shape-corner-large); }
.list-row:last-child { border-bottom-left-radius: var(--md-sys-shape-corner-large); border-bottom-right-radius: var(--md-sys-shape-corner-large); }
.list-row__headline { flex: 1 1 240px; min-width: 0; font: var(--md-sys-typescale-title-medium); letter-spacing: 0.009rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.list-row__supporting { font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface-variant); }

/* --- Diálogo: básico (até 560 px, cantos de 28 px) nas telas médias e maiores ----------- */
.dialog {
  border: 0; padding: 0; margin: auto;
  width: calc(100vw - 48px); max-width: 560px; max-height: calc(100vh - 112px);
  border-radius: var(--md-sys-shape-corner-extra-large);
  background: var(--md-sys-color-surface-container-high); color: var(--md-sys-color-on-surface);
  box-shadow: var(--md-sys-elevation-level3);
}
.dialog[open] { display: flex; flex-direction: column; }
.dialog::backdrop { background: rgb(0 0 0 / 0.32); }
.dialog__header { display: flex; align-items: center; gap: 4px; padding: 24px 24px 16px; }
.dialog__close { display: none; }
.dialog__headline { font: var(--md-sys-typescale-headline-small); min-width: 0; }
/* O título e as ações ficam parados; só o conteúdo rola. */
.dialog__content { flex: 1; min-height: 0; overflow-y: auto; padding: 0 24px; display: flex; flex-direction: column; gap: 24px; }
.dialog__video { width: 100%; aspect-ratio: var(--ratio, 9 / 16); max-height: 45vh; background: #000; border-radius: var(--md-sys-shape-corner-medium); flex: none; }
.dialog__error { font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-error); overflow-wrap: anywhere; margin-top: -16px; }
.dialog__section { display: flex; flex-direction: column; gap: 8px; }
.dialog__title { font: var(--md-sys-typescale-title-small); letter-spacing: 0.006rem; color: var(--md-sys-color-on-surface-variant); }
.dialog__text { font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; white-space: pre-wrap; overflow-wrap: anywhere; }
.dialog__prompt summary { cursor: pointer; border-radius: var(--md-sys-shape-corner-extra-small); }
.dialog__prompt[open] summary { margin-bottom: 8px; }
.dialog__files { display: flex; flex-wrap: wrap; gap: 8px; }
.dialog__actions { display: flex; justify-content: flex-end; gap: 8px; padding: 24px; }
/* Configurações: nome à esquerda, valor à direita. */
.details { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 16px; font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; }
.details__item { display: contents; }
.details dt { color: var(--md-sys-color-on-surface-variant); }
.details dd { overflow-wrap: anywhere; }
/* No celular, diálogo de tela cheia: o X no topo fecha. */
@media (max-width: 599px) {
  .dialog { width: 100%; max-width: none; height: 100%; max-height: none; border-radius: 0; background: var(--md-sys-color-surface); box-shadow: none; }
  .dialog__header { padding: 4px 16px 4px 4px; min-height: 56px; }
  .dialog__close { display: inline-grid; }
  .dialog__headline { font: var(--md-sys-typescale-title-large); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dialog__content { padding: 8px 16px 24px; }
  .dialog__actions { display: none; }
}

/* --- Página do modelo: três painéis --------------------------------------------------- */
.workspace {
  flex: 1; width: 100%; padding: 0 16px 16px;
  display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start;
}
/* O formulário abraça a configuração e o centro, mas quem entra na grade são os filhos dele. */
.workspace__form { display: contents; }
.pane {
  --field-surface: var(--md-sys-color-surface-container-lowest);
  min-width: 0; display: flex; flex-direction: column; gap: 20px; padding: 16px;
  border-radius: var(--md-sys-shape-corner-extra-large); background: var(--md-sys-color-surface-container-lowest);
}
.pane__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: -4px -4px -4px 0; }
.pane__headline { padding-left: 8px; font: var(--md-sys-typescale-title-medium); letter-spacing: 0.009rem; display: flex; align-items: baseline; gap: 8px; }
.pane__count { font: var(--md-sys-typescale-body-large); color: var(--md-sys-color-on-surface-variant); }
.pane__toggle { display: none; }
.pane__body { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.pane--videos { gap: 8px; padding: 16px 8px; }
.pane--videos .pane__head { padding: 0 8px; }
.form-section { display: flex; flex-direction: column; gap: 16px; padding: 0 8px; }
.form-section__title { font: var(--md-sys-typescale-title-small); letter-spacing: 0.006rem; color: var(--md-sys-color-primary); }
/* No painel, os botões segmentados ocupam a largura toda. */
.pane .segmented-button { display: grid; align-self: stretch; }

/* Lista de vídeos do painel: itens de cantos arredondados; o escolhido em cor secundária. */
.pane-list { display: flex; flex-direction: column; gap: 2px; }
.pane-list__item {
  display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 12px;
  border-radius: var(--md-sys-shape-corner-large); text-decoration: none; color: var(--md-sys-color-on-surface);
}
.pane-list__item .icon-tile { width: 36px; height: 36px; border-radius: 10px; }
/* Lista expressiva do M3: o item escolhido em primary-container, com cantos de 16 px. */
.pane-list__item[aria-current] { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
.pane-list__text { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.pane-list__headline, .pane-list__supporting { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pane-list__headline { font: var(--md-sys-typescale-title-small); letter-spacing: 0.006rem; }
.pane-list__supporting { font: var(--md-sys-typescale-body-small); letter-spacing: 0.025rem; color: var(--md-sys-color-on-surface-variant); }
.pane-list__item[aria-current] .pane-list__supporting { color: inherit; }
.pane-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 32px 24px; text-align: center; font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface-variant); }
.pane-empty .icon { font-size: 32px; color: var(--md-sys-color-primary); }
.pane-empty__title { font: var(--md-sys-typescale-title-small); letter-spacing: 0.006rem; color: var(--md-sys-color-primary); }

/* Centro: o vídeo escolhido (ou a apresentação do modelo) e a caixa da fala embaixo. */
.workspace__main { min-width: 0; width: 100%; max-width: 720px; justify-self: center; display: flex; flex-direction: column; gap: 16px; padding-top: 16px; }
.model-intro { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding-top: 32px; }
.model-intro__headline { margin-top: 12px; font: 400 2.5rem/3rem var(--md-ref-typeface-brand); }
.model-intro__supporting { font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface-variant); }
.model-intro__text { margin-top: 12px; font: 400 1rem/1.625rem var(--md-ref-typeface-plain); letter-spacing: 0.031rem; }
.ideas { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
.ideas__title { font: var(--md-sys-typescale-title-small); letter-spacing: 0.006rem; color: var(--md-sys-color-on-surface-variant); }
.ideas__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.idea {
  display: flex; flex-direction: column; gap: 8px; min-height: 140px; padding: 20px; border: 0; text-align: left;
  border-radius: var(--md-sys-shape-corner-extra-large); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface);
}
.idea__label { font: var(--md-sys-typescale-label-medium); letter-spacing: 0.031rem; color: var(--md-sys-color-primary); }
.idea__text { font: 400 0.875rem/1.375rem var(--md-ref-typeface-plain); letter-spacing: 0.016rem; }
.idea .icon { margin-top: auto; font-size: 18px; color: var(--md-sys-color-on-surface-variant); }

.selected { display: flex; flex-direction: column; gap: 16px; }
.player { display: flex; justify-content: center; padding: 16px 0; background: var(--md-sys-color-on-surface); border-radius: var(--md-sys-shape-corner-extra-large); }
.player__frame { position: relative; aspect-ratio: var(--ratio, 9 / 16); height: min(420px, 60vh); max-width: calc(100% - 32px); overflow: hidden; border-radius: var(--md-sys-shape-corner-large); background: #000; }
.player video { display: block; width: 100%; height: 100%; object-fit: contain; }
/* Prévia da edição rápida: o zoom de cada trecho é um scale no vídeo; os controles próprios ficam por cima. */
.player.is-previewing video { cursor: pointer; }
.player__controls {
  position: absolute; left: 8px; bottom: 8px; display: flex; align-items: center; gap: 4px; padding-right: 16px;
  border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-inverse-surface); color: var(--md-sys-color-inverse-on-surface);
}
.player__controls .icon-button { color: inherit; }
.player__time { font: var(--md-sys-typescale-label-large); letter-spacing: 0.006rem; font-variant-numeric: tabular-nums; }
.stage {
  min-height: 452px; padding: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center;
  border-radius: var(--md-sys-shape-corner-extra-large); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface-variant);
}
.stage > .icon { font-size: 40px; }
.stage .linear-progress { --progress-gap: var(--md-sys-color-surface-container); width: 240px; max-width: 100%; }
.stage__title { font: var(--md-sys-typescale-title-medium); letter-spacing: 0.009rem; color: var(--md-sys-color-on-surface); }
.stage__text { font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; overflow-wrap: anywhere; }
.stage--error { gap: 12px; background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); }
.stage--error .stage__title { color: inherit; }
.selected__body { display: flex; flex-direction: column; gap: 8px; }
.selected__meta { font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface-variant); }
.selected__text { font: 400 1.125rem/1.75rem var(--md-ref-typeface-plain); white-space: pre-wrap; overflow-wrap: anywhere; }
.selected__actions { display: flex; flex-wrap: wrap; gap: 4px; margin-left: -12px; }
/* O script esconde o botão "Edição rápida" e os controles da prévia; display dos componentes não ganha do hidden. */
.selected [hidden] { display: none; }
.quick-edit { display: flex; flex-direction: column; gap: 16px; padding: 24px; border-radius: var(--md-sys-shape-corner-extra-large); background: var(--md-sys-color-surface-container); }
.quick-edit__head { display: flex; flex-direction: column; gap: 4px; }
.quick-edit__title { font: var(--md-sys-typescale-title-medium); letter-spacing: 0.009rem; color: var(--md-sys-color-on-surface); }
.quick-edit__summary { font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface-variant); }
.quick-edit__fields { display: flex; flex-wrap: wrap; gap: 16px 24px; }
.quick-edit__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }

/* Caixa da fala: campo de cantos inteiros com a estimativa e o botão de gerar; nas telas largas, presa embaixo ao rolar. */
.composer-bar { margin-top: auto; padding: 16px 0 8px; display: flex; flex-direction: column; gap: 4px; background: var(--md-sys-color-surface); }
.composer-bar__box {
  display: flex; align-items: flex-end; gap: 12px; padding: 12px 12px 12px 24px;
  border: 1px solid var(--md-sys-color-surface-container-highest); border-radius: var(--md-sys-shape-corner-extra-large);
  background: var(--md-sys-color-surface-container-lowest); box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
  transition: border-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}
.composer-bar__box:hover { border-color: var(--md-sys-color-outline-variant); }
.composer-bar__box:focus-within { border-color: var(--md-sys-color-primary); box-shadow: 0 0 0 1px var(--md-sys-color-primary); }
.composer-bar__input {
  flex: 1; min-width: 0; min-height: 48px; max-height: 40vh; padding: 6px 0; margin: 0;
  border: 0; outline: none; resize: none; background: transparent; field-sizing: content;
  font: var(--md-sys-typescale-body-large); letter-spacing: 0.031rem; color: var(--md-sys-color-on-surface); caret-color: var(--md-sys-color-primary);
}
.composer-bar__input::placeholder { color: var(--md-sys-color-on-surface-variant); }
.composer-bar__meta { padding-bottom: 14px; font: var(--md-sys-typescale-body-small); letter-spacing: 0.025rem; color: var(--md-sys-color-on-surface-variant); white-space: nowrap; }
/* Botão de gerar: cinza enquanto a fala está vazia, na cor primária quando há texto. */
.composer-bar__send {
  width: 48px; height: 48px; flex: none; display: grid; place-items: center; border: 0; padding: 0;
  border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary);
}
.composer-bar__box:has(.composer-bar__input:placeholder-shown) .composer-bar__send { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface-variant); }
.composer-bar__send:disabled { opacity: 0.38; cursor: default; pointer-events: none; }
.composer-bar .text-field__supporting { padding: 0 24px; }
.composer-bar__note { text-align: center; font: var(--md-sys-typescale-body-small); letter-spacing: 0.025rem; color: var(--md-sys-color-on-surface-variant); }

/* --- Indicador de progresso linear (indeterminado), M3 Expressive: 4 px, pontas arredondadas e
   4 px de folga entre o indicador e a trilha. ------------------------------------------------------ */
.linear-progress { --progress-gap: var(--md-sys-color-surface); position: relative; height: 4px; overflow: hidden; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-secondary-container); }
/* A folga é uma borda na cor do fundo em volta do indicador. */
.linear-progress::before {
  content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 40%;
  border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-primary);
  box-shadow: 0 0 0 4px var(--progress-gap);
  animation: linear-progress 1.8s var(--md-sys-motion-easing-standard) infinite;
}
@keyframes linear-progress { from { transform: translateX(-100%); } to { transform: translateX(250%); } }

/* --- Snackbar ------------------------------------------------------------------------ */
.snackbar {
  position: fixed; z-index: 20; left: 16px; right: 16px; bottom: 16px;
  max-width: 560px; margin: 0 auto;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  min-height: 48px; padding: 6px 8px 6px 16px;
  background: var(--md-sys-color-inverse-surface); color: var(--md-sys-color-inverse-on-surface);
  border-radius: var(--md-sys-shape-corner-extra-small);
  box-shadow: var(--md-sys-elevation-level3);
  font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem;
  animation: snackbar-in var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-decelerate);
}
.snackbar[hidden] { display: none; }
.snackbar__text { flex: 1 1 220px; padding: 8px 0; overflow-wrap: anywhere; }
.snackbar .button--text { color: var(--md-sys-color-inverse-primary); margin-left: auto; }
@keyframes snackbar-in { from { transform: translateY(16px); opacity: 0; } }

/* Aviso fixo no topo do conteúdo (banner) */
.banner {
  display: flex; gap: 12px; align-items: center; padding: 12px 16px;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container);
  font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem;
}

/* --- Página ---------------------------------------------------------------------------- */
.page {
  flex: 1; width: 100%; max-width: calc(var(--layout-max) + 2 * var(--layout-margin)); margin: 0 auto;
  padding: 24px var(--layout-margin) 32px;
  display: flex; flex-direction: column; gap: 16px;
}
.page__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; }
.page__tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
.page__headline { font: var(--md-sys-typescale-headline-small); }
.page__intro { margin-top: 4px; font: var(--md-sys-typescale-body-large); letter-spacing: 0.031rem; color: var(--md-sys-color-on-surface-variant); }

.empty {
  display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px;
  padding: 48px 24px; color: var(--md-sys-color-on-surface-variant);
}
.empty .icon { font-size: 48px; color: var(--md-sys-color-primary); }
.empty__title { font: var(--md-sys-typescale-title-large); color: var(--md-sys-color-on-surface); }

/* Entrar */
.login { width: 100%; max-width: 400px; margin: 12vh auto 0; display: flex; flex-direction: column; gap: 24px; padding: 24px; }
.login__head { display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; }
.login__head .top-app-bar__logo { width: 56px; height: 56px; border-radius: var(--md-sys-shape-corner-large); }
.login__title { font: var(--md-sys-typescale-headline-small); }
.login__text { font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface-variant); }
.login .button { align-self: stretch; }
.login { --field-surface: var(--md-sys-color-surface); }

/* --- Rodapé: uma linha pequena, centralizada ---------------------------------------------- */
.footer { padding: 16px 24px 24px; color: var(--md-sys-color-on-surface-variant); text-align: center; }
.footer__inner { max-width: var(--layout-max); margin: 0 auto; }
.footer__text { font: var(--md-sys-typescale-body-small); letter-spacing: 0.025rem; }

/* --- Breakpoints médio, expandido e grande ------------------------------------------ */
@media (min-width: 600px) {
  :root { --layout-margin: 24px; }
  .top-app-bar { padding: 12px 24px; }
  .page { padding-top: 32px; padding-bottom: 48px; }
}
@media (min-width: 840px) {
  .page__headline { font: var(--md-sys-typescale-headline-medium); }
  /* Configuração e vídeos à esquerda; o vídeo escolhido no centro, com a caixa da fala presa embaixo. */
  .workspace { grid-template-columns: var(--layout-pane) minmax(0, 1fr); grid-template-areas: "config main" "videos main"; }
  .pane--config { grid-area: config; }
  .pane--videos { grid-area: videos; }
  .workspace__main { grid-area: main; align-self: stretch; min-height: calc(100vh - 84px); }
  .composer-bar { position: sticky; bottom: 0; }
  /* Tudo numa linha: marca, abas, busca e conta. */
  .top-app-bar--home { flex-wrap: nowrap; }
  .top-app-bar--home .nav-pills { order: 0; flex: 1 1 auto; }
  .top-app-bar__tools { order: 0; flex: none; }
  .top-app-bar__tools .search-field { flex: none; width: 260px; }
  .top-app-bar--home .top-app-bar__actions { order: 0; margin-left: 0; }
}
@media (min-width: 1200px) {
  .workspace { grid-template-columns: var(--layout-pane) minmax(0, 1fr) var(--layout-pane); grid-template-areas: "config main videos"; }
  .pane--config, .pane--videos { position: sticky; top: 84px; max-height: calc(100vh - 100px); overflow-y: auto; }
  /* Os painéis dos lados se recolhem até sobrar só o botão. */
  .pane__toggle { display: inline-grid; }
  .pane.is-collapsed { padding: 12px 4px; align-items: center; }
  .pane.is-collapsed .pane__head { margin: 0; }
  .pane.is-collapsed .pane__headline, .pane.is-collapsed .pane__body { display: none; }
  .workspace:has(.pane--config.is-collapsed) { --col-config: 56px; }
  .workspace:has(.pane--videos.is-collapsed) { --col-videos: 56px; }
  .workspace { grid-template-columns: var(--col-config, var(--layout-pane)) minmax(0, 1fr) var(--col-videos, var(--layout-pane)); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;

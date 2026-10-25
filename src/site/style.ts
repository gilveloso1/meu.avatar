/**
 * Visual do estúdio, todo no Material Design 3 (m3.material.io), no mesmo
 * molde do blog do anb.bot: os tokens do sistema (cor, tipografia, forma,
 * elevação, estados e movimento) e os componentes feitos com eles: barra
 * superior pequena, botões, botões de ícone, botões
 * segmentados, campos de texto contornados, cards, indicador de progresso
 * linear, diálogo, snackbar e banner. As cores vêm de theme.ts (npm run tema).
 *
 * Layout pelos breakpoints do M3: compacto (< 600 px) com margens de 16 px e
 * um painel; médio (600 a 839 px) e maiores com margens e espaço entre
 * painéis de 24 px. Tela inicial: grade de cards dos modelos, que ganha
 * colunas com a largura. Página do modelo: até 839 px, o formulário em cima e
 * os vídeos embaixo; a partir daí, painel fixo de 360 px com o formulário e
 * painel flexível com a grade de vídeos.
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
  --layout-max: 1240px;
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

/* --- Barra superior (top app bar pequena) --------------------------------------- */
.top-app-bar {
  position: sticky; top: 0; z-index: 5;
  height: 64px; padding: 0 4px 0 16px;
  display: flex; align-items: center; gap: 4px;
  background: var(--md-sys-color-surface);
  color: var(--md-sys-color-on-surface);
  transition: background-color var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard);
}
.top-app-bar.is-scrolled { background: var(--md-sys-color-surface-container); }
/* Com o botão de voltar à esquerda: 4 px até o botão, como no M3. */
.top-app-bar--leading { padding-left: 4px; }
.top-app-bar__brand {
  display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;
  text-decoration: none; color: inherit; border-radius: var(--md-sys-shape-corner-small);
}
.top-app-bar__logo {
  width: 40px; height: 40px; flex: none; display: grid; place-items: center;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);
}
.top-app-bar__title {
  flex: 1; min-width: 0;
  font: var(--md-sys-typescale-title-large);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.top-app-bar form { display: contents; }

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
.segmented-button__segment:has(input:checked) { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
.segmented-button__segment:has(input:checked) .segmented-button__check { display: inline-block; }
.segmented-button__segment:has(input:focus-visible)::before { opacity: var(--md-sys-state-focus-state-layer-opacity); }
.segmented-button:has(input:focus-visible) { outline: 3px solid var(--md-sys-color-secondary); outline-offset: 2px; }

/* Foto do avatar: o input fica escondido; o botão tonal e a prévia fazem o papel dele. */
.file-picker { display: flex; align-items: center; gap: 16px; }
.file-picker input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.file-picker input:focus-visible + .button { outline: 3px solid var(--md-sys-color-secondary); outline-offset: 2px; }
.file-picker__preview {
  width: 56px; height: 56px; flex: none; display: grid; place-items: center; overflow: hidden;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface-variant);
}
.file-picker__preview img { width: 100%; height: 100%; object-fit: cover; }
.file-picker__text { min-width: 0; display: flex; flex-direction: column; }
.file-picker__name { font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-picker__hint { font: var(--md-sys-typescale-body-small); letter-spacing: 0.025rem; color: var(--md-sys-color-on-surface-variant); }

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

/* Modelos na tela inicial: cards compactos, com ícone, nome, preço, resumo e contagem. */
.model-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.model-card { display: flex; align-items: flex-start; gap: 16px; }
.model-card__icon {
  width: 48px; height: 48px; flex: none; display: grid; place-items: center;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);
}
.model-card__content { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.model-card__headline { font: var(--md-sys-typescale-title-medium); letter-spacing: 0.009rem; }
.model-card__subhead { font: var(--md-sys-typescale-body-small); letter-spacing: 0.025rem; color: var(--md-sys-color-on-surface-variant); }
.model-card__text {
  margin-top: 6px; font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.model-card__footer { margin-top: 8px; font: var(--md-sys-typescale-label-medium); letter-spacing: 0.031rem; color: var(--md-sys-color-primary); }

/* Vídeo na grade: mídia em cima, status, data e fala, e as ações embaixo. */
.video-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
.video-card { display: flex; flex-direction: column; padding: 0; overflow: hidden; }
.video-card__media {
  position: relative; aspect-ratio: var(--ratio, 9 / 16); max-height: 360px; width: 100%;
  background: var(--md-sys-color-surface-container-highest) center / cover no-repeat;
  display: grid; place-items: center; color: var(--md-sys-color-on-surface-variant);
}
.video-card__media video { width: 100%; height: 100%; object-fit: contain; background: #000; }
.video-card__media > .icon { font-size: 48px; }
.video-card__media .linear-progress { position: absolute; left: 0; right: 0; bottom: 0; }
.video-card__body { display: flex; flex-direction: column; gap: 4px; padding: 16px 16px 8px; }
.video-card__status {
  display: flex; align-items: center; gap: 8px;
  font: var(--md-sys-typescale-label-large); letter-spacing: 0.006rem; color: var(--md-sys-color-on-surface-variant);
}
.video-card__status .icon { font-size: 18px; }
.video-card__status--done { color: var(--md-sys-color-primary); }
.video-card__status--error { color: var(--md-sys-color-error); }
.video-card__subhead { font: var(--md-sys-typescale-body-small); letter-spacing: 0.025rem; color: var(--md-sys-color-on-surface-variant); }
.video-card__text {
  font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.video-card__actions { display: flex; justify-content: flex-end; align-items: center; gap: 4px; padding: 0 8px 8px; margin-top: auto; }

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

/* --- Página do modelo: formulário no painel fixo, vídeos no painel flexível ----------- */
.page.page--panes { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--layout-gap); align-items: start; }
.pane { min-width: 0; display: flex; flex-direction: column; gap: 16px; }
/* O formulário fica num contêiner próprio, para se separar dos vídeos. */
.pane--fixed { background: var(--md-sys-color-surface-container-low); border-radius: var(--md-sys-shape-corner-large); padding: 16px; }
.pane__headline { font: var(--md-sys-typescale-title-large); display: flex; align-items: baseline; gap: 8px; }
.pane__count { font: var(--md-sys-typescale-label-large); letter-spacing: 0.006rem; color: var(--md-sys-color-on-surface-variant); }
.composer { --field-surface: var(--md-sys-color-surface-container-low); display: flex; flex-direction: column; gap: 24px; }
.form-section { display: flex; flex-direction: column; gap: 24px; }
.form-section__title { font: var(--md-sys-typescale-title-medium); letter-spacing: 0.009rem; }
.summary { display: flex; flex-direction: column; gap: 16px; }
.summary .button { align-self: flex-end; }
.summary__list { display: flex; flex-direction: column; gap: 8px; }
.summary__item { display: flex; justify-content: space-between; gap: 16px; font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; }
.summary__item dt { color: var(--md-sys-color-on-surface-variant); }
.summary__item dd { text-align: right; overflow-wrap: anywhere; }

/* --- Indicador de progresso linear (indeterminado) ----------------------------------- */
.linear-progress { height: 4px; overflow: hidden; background: var(--md-sys-color-secondary-container); }
.linear-progress::before {
  content: ""; display: block; height: 100%; width: 40%;
  background: var(--md-sys-color-primary); border-radius: var(--md-sys-shape-corner-full);
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
  padding: 8px var(--layout-margin) 32px;
  display: flex; flex-direction: column; gap: 16px;
}
/* A página do modelo é mais larga: o painel de 360 px mais a grade de vídeos. */
.page--panes { --layout-max: 1600px; }
.page__headline { font: var(--md-sys-typescale-headline-small); }
.page__intro { font: var(--md-sys-typescale-body-large); letter-spacing: 0.031rem; color: var(--md-sys-color-on-surface-variant); }

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

/* --- Rodapé ---------------------------------------------------------------------------- */
.footer {
  background: var(--md-sys-color-surface-container);
  color: var(--md-sys-color-on-surface-variant);
  padding: 24px 16px 32px;
}
.footer__inner { max-width: var(--layout-max); margin: 0 auto; }
.footer__text { font: var(--md-sys-typescale-body-small); letter-spacing: 0.025rem; }

/* --- Breakpoints médio, expandido e grande ------------------------------------------ */
@media (min-width: 600px) {
  :root { --layout-margin: 24px; }
  .top-app-bar { padding: 0 12px 0 24px; }
  .top-app-bar--leading { padding-left: 12px; }
  .page { padding-top: 16px; padding-bottom: 48px; }
  .model-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .video-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  .footer { padding: 32px 24px 40px; }
}
@media (min-width: 840px) {
  .page__headline { font: var(--md-sys-typescale-headline-medium); }
  .model-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  /* Painel fixo de 360 px com o formulário, parado ao rolar e com rolagem própria; vídeos no resto. */
  .page.page--panes { grid-template-columns: var(--layout-pane) minmax(0, 1fr); }
  .pane--fixed { position: sticky; top: 72px; max-height: calc(100vh - 88px); overflow-y: auto; }
}
@media (min-width: 1200px) {
  .model-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;

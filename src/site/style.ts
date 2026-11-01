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
  /* Configuração mais larga: 400 px, a largura máxima da folha lateral (side sheet) do M3. */
  --layout-config: 400px;
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
/* Barras de rolagem: o M3 não tem componente para elas; finas e discretas, na cor outline-variant. */
* { scrollbar-width: thin; scrollbar-color: var(--md-sys-color-outline-variant) transparent; }

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
.top-app-bar__brand:focus-visible { outline: 3px solid var(--md-sys-color-secondary); outline-offset: 4px; }
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
  border: 0; cursor: pointer;
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
button.chip { background: none; margin: 0; cursor: pointer; }
.chip__check { display: none; }
.chip[aria-pressed="true"] { border-color: transparent; padding-left: 8px; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
.chip[aria-pressed="true"] .chip__check { display: inline-block; }
.chip:has(> .icon:first-child:not(.chip__check)) { padding-left: 8px; }

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
textarea.text-field__input { min-height: 56px; resize: none; overflow: hidden; display: block; }
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
.text-field--select button.text-field__input { text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.text-field--select .text-field__input.is-open { border: 2px solid var(--md-sys-color-primary); padding: 15px 47px 15px 15px; }
.text-field--select .text-field__input.is-open + .text-field__label { color: var(--md-sys-color-primary); }
/* Menu das opções (menu vertical do M3 Expressive): surface-container-low, cantos de 16 px,
   elevação 2, 4 px por dentro, itens de 44 px; o escolhido em secondary-container. */
.select-menu {
  position: fixed; inset: auto; margin: 0; border: 0; padding: 4px; max-height: min(320px, calc(100vh - 16px)); overflow-y: auto;
  border-radius: var(--md-sys-shape-corner-large);
  background: var(--md-sys-color-surface-container-low); color: var(--md-sys-color-on-surface);
  box-shadow: var(--md-sys-elevation-level2);
}
.select-menu__item {
  display: flex; align-items: center; height: 44px; padding: 0 16px; border-radius: var(--md-sys-shape-corner-medium);
  font: var(--md-sys-typescale-body-large); letter-spacing: 0.031rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  outline-offset: -3px;
}
.select-menu__item::before { border-radius: inherit; }
.select-menu__item[aria-selected="true"] { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
.text-field__supporting--error { color: var(--md-sys-color-error); }

/* --- Botão segmentado (escolha única) ----------------------------------------------- */
.segmented-field { display: flex; flex-direction: column; gap: 8px; }
/* float: o legend vira item do flex e respeita o gap de 8 px. */
.segmented-field__label { float: left; padding: 0; font: var(--md-sys-typescale-body-small); letter-spacing: 0.025rem; color: var(--md-sys-color-on-surface-variant); }
/* Grupo de botões conectados do M3 Expressive, tamanho S: botões de 40 px com 2 px entre eles,
   pontas todas arredondadas e cantos internos de 8 px. O escolhido mantém a forma (o M3 o
   arredonda todo; o usuário preferiu assim).
   Cores de botão alternável: surface-container sem escolha, primary escolhido. */
.segmented-button {
  display: inline-grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 2px;
  justify-self: start; align-self: flex-start; max-width: 100%;
}
.segmented-button__segment {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  height: 40px; min-width: 48px; padding: 0 16px;
  border-radius: 8px; background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface-variant);
  font: var(--md-sys-typescale-label-large); letter-spacing: 0.006rem; white-space: nowrap;
}
.segmented-button__segment::before { border-radius: inherit; }
/* Pontas com metade da altura (20 px): com 9999 px, o navegador encolhe todos os cantos e os de 8 px somem. */
.segmented-button__segment:first-child { border-radius: 20px 8px 8px 20px; }
.segmented-button__segment:last-child { border-radius: 8px 20px 20px 8px; }
.segmented-button__segment input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
.segmented-button__check { display: none; }
.segmented-button__segment:has(input:checked), .segmented-button__segment[aria-current] {
  background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary);
}
.segmented-button__segment:has(input:focus-visible)::before { opacity: var(--md-sys-state-focus-state-layer-opacity); }
.segmented-button__segment:has(input:focus-visible) { outline: 3px solid var(--md-sys-color-secondary); outline-offset: 2px; }

/* Foto do avatar: item de lista de duas linhas (M3), todo clicável; o input fica escondido.
   Sem foto, o ícone de adicionar e a dica; com foto, a miniatura, o nome e "Trocar foto". */
.file-picker {
  display: flex; align-items: center; gap: 16px; min-height: 72px; padding: 8px 16px 8px 16px;
  border-radius: var(--md-sys-shape-corner-large); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface);
}
.file-picker::before { border-radius: inherit; }
.file-picker input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.file-picker:has(input:focus-visible) { outline: 3px solid var(--md-sys-color-secondary); outline-offset: 2px; }
.file-picker__preview {
  width: 56px; height: 56px; flex: none; display: grid; place-items: center; overflow: hidden;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);
}
.file-picker__preview img, .file-picker__preview video { width: 100%; height: 100%; object-fit: cover; }
.file-picker__text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.file-picker__name { font: var(--md-sys-typescale-body-large); letter-spacing: 0.031rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-picker__hint { font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface-variant); }
.file-picker__trailing { flex: none; font-size: 24px; color: var(--md-sys-color-on-surface-variant); }
/* Campo que só aparece com certas escolhas (data-show-if): some do fluxo quando escondido. */
.conditional { display: contents; }
.conditional[hidden] { display: none; }
/* Caixa de marcar (M3: 18 px, cor primary quando marcada), com o texto ao lado. */
.checkbox-field { display: flex; align-items: flex-start; gap: 12px; padding: 4px 0; cursor: pointer; font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface); }
.checkbox-field input { flex: none; width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--md-sys-color-primary); cursor: pointer; }
.file-picker__trailing[hidden] { display: none; }
.file-picker__hint:empty { display: none; }

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

.icon-tile--primary { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
.icon-tile--secondary { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
.icon-tile--tertiary { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
.icon-tile--error { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); }

.dialog__error { font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-error); overflow-wrap: anywhere; margin-top: -16px; }

/* --- Página do modelo: configuração e lista de vídeos --------------------------------------------------- */
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

.pane__body { display: flex; flex-direction: column; gap: 20px; min-width: 0; }

/* Fim do painel de configuração, depois dos campos: a estimativa e o botão na largura toda.
   Sobra espaço embaixo: na rolagem, o botão sobe além do fim da janela. */
.pane__footer { display: flex; flex-direction: column; gap: 8px; padding: 0 8px 96px; }
.pane__footer .button { width: 100%; }
/* Estimativa: duas linhas com ícone, rótulo e valor à direita (itens de lista compactos, 40 px). */
.estimate-list { display: flex; flex-direction: column; }
.estimate-list__item { display: flex; align-items: center; gap: 16px; height: 40px; padding: 0 8px; font: var(--md-sys-typescale-body-large); letter-spacing: 0.031rem; }
.estimate-list__item .icon { font-size: 24px; color: var(--md-sys-color-on-surface-variant); }
.estimate-list__label { flex: 1; }
.estimate-list__value { font: var(--md-sys-typescale-label-large); letter-spacing: 0.006rem; color: var(--md-sys-color-on-surface-variant); }
.form-section { display: flex; flex-direction: column; gap: 16px; padding: 0 8px; }
.form-section__title { font: var(--md-sys-typescale-title-small); letter-spacing: 0.006rem; color: var(--md-sys-color-primary); }
/* No painel, os botões segmentados ocupam a largura toda. */
.pane .segmented-button { display: grid; align-self: stretch; }

/* Centro: o vídeo escolhido (ou a apresentação do modelo) e a caixa da fala embaixo. */
.workspace__main { min-width: 0; width: 100%; justify-self: center; display: flex; flex-direction: column; gap: 16px; padding-top: 16px; }
/* Os vídeos no centro: cards quadrados só com a imagem, sem texto. */
.library { display: flex; flex-direction: column; gap: 16px; }
.library__title { font: var(--md-sys-typescale-title-large); display: flex; align-items: baseline; gap: 8px; padding: 0 4px; }
.library__head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.library__end { display: flex; align-items: center; gap: 16px; }
/* Na linha do título, o "Novo vídeo" tem a altura das vistas (40 px) e não flutua; no celular volta a ser FAB. */
@media (min-width: 600px) {
  .library__end .fab { height: 40px; padding: 0 24px 0 16px; border-radius: 20px; box-shadow: none; }
  .library__end .fab:hover { box-shadow: var(--md-sys-elevation-level1); }
}
.page .library__title { font: var(--md-sys-typescale-headline-small); }
.library__tools { margin: 0; align-items: center; }
.library__divider { width: 1px; height: 24px; margin: 0 4px; background: var(--md-sys-color-outline-variant); }
.library__sizes .segmented-button__segment { min-width: 52px; padding: 0 14px; border: 0; margin: 0; cursor: pointer; }
.library__sizes .icon { font-size: 20px; }
.library__empty { padding: 32px 4px; font: var(--md-sys-typescale-body-large); color: var(--md-sys-color-on-surface-variant); }
.frames { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.frame[hidden], .vrow[hidden], .vgroup[hidden] { display: none; }
.library[data-view="p"] .frames { grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 12px; }
.library[data-view="g"] .frames { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }
/* Grupos por data: subtítulo (title-small em primary, como os subtítulos de lista do M3). */
.library__groups { display: flex; flex-direction: column; gap: 24px; }
.vgroup { display: flex; flex-direction: column; gap: 12px; }
.vgroup__title { padding: 0 4px; font: var(--md-sys-typescale-title-small); letter-spacing: 0.006rem; color: var(--md-sys-color-primary); }
.library[data-view="d"] .library__groups { gap: 16px; }
/* Sem agrupar (o padrão): os grupos somem e os itens correm numa grade (ou lista) só. */
.library[data-grouped="false"] .vgroup:not([hidden]), .library[data-grouped="false"]:not([data-view="d"]) .vgroup .frames, .library[data-grouped="false"][data-view="d"] .vgroup .vrows { display: contents; }
.library[data-grouped="false"] .vgroup__title { display: none; }
.library[data-grouped="false"]:not([data-view="d"]) .library__groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.library[data-grouped="false"][data-view="p"] .library__groups { grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 12px; }
.library[data-grouped="false"][data-view="g"] .library__groups { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }
.library[data-grouped="false"][data-view="d"] .library__groups { gap: 2px; }
.library[data-grouped="false"][data-view="d"] .vrows > .vrow { border-radius: 4px; }
.library[data-grouped="false"][data-view="d"] .vgroup:first-child .vrow:first-child { border-top-left-radius: 16px; border-top-right-radius: 16px; }
.library[data-grouped="false"][data-view="d"] .vgroup:last-child .vrow:last-child { border-bottom-left-radius: 16px; border-bottom-right-radius: 16px; }
.library[data-view="d"] .vgroup { gap: 4px; }
/* Detalhes: uma linha por vídeo, em lista segmentada (2 px entre linhas, 16 px nas pontas). */
.library:not([data-view="d"]) .vrows, .library:not([data-view="d"]) .vrows__head, .library[data-view="d"] .frames { display: none; }
.vrows { display: flex; flex-direction: column; gap: 2px; }
.vrows__head, .vrow { display: grid; grid-template-columns: 48px minmax(0, 1fr) 128px 72px 112px 80px 104px; align-items: center; gap: 16px; padding: 0 16px; }
.vrows__head { height: 32px; font: var(--md-sys-typescale-label-medium); letter-spacing: 0.031rem; color: var(--md-sys-color-on-surface-variant); }
/* Cards e linhas são links: sem sublinhado; o card é bloco, a linha mantém a grade das colunas. */
a.frame, a.vrow { text-decoration: none; color: inherit; }
a.frame { display: block; }
.vrow, button.vrow { margin: 0; border: 0; font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface-variant); text-align: left; }
.vrow { min-height: 64px; padding-block: 8px; border-radius: 4px; background: var(--md-sys-color-surface-container-lowest); }
.vrow::before { border-radius: inherit; }
.vrows > .vrow:first-child { border-top-left-radius: 16px; border-top-right-radius: 16px; }
.vrows > .vrow:last-child { border-bottom-left-radius: 16px; border-bottom-right-radius: 16px; }
.vrow__thumb { width: 48px; height: 48px; border-radius: 12px; overflow: hidden; }
.vrow__thumb video { display: block; width: 100%; height: 100%; object-fit: cover; pointer-events: none; background: var(--md-sys-color-surface-container-highest); }
.vrow__thumb .frame__placeholder { width: 100%; height: 100%; display: grid; place-items: center; background: var(--md-sys-color-surface-container-highest); }
.vrow__thumb .icon-tile { width: 32px; height: 32px; }
.vrow__thumb .icon-tile .icon { font-size: 18px; }
.vrow__text { display: flex; flex-direction: column; min-width: 0; }
.vrow__headline, .vrow__support { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vrow__headline { font: var(--md-sys-typescale-body-large); letter-spacing: 0.031rem; color: var(--md-sys-color-on-surface); }
/* Linha de apoio (data, modelo e duração, ou o status): só no celular, onde não há as outras colunas. */
.vrow__support { display: none; font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface-variant); }
.vrow[data-kind="error"] .vrow__support { color: var(--md-sys-color-error); }
/* Sem vídeo para mostrar, os títulos das colunas somem junto. */
.library:has([data-library-empty]:not([hidden])) .vrows__head { display: none; }
.vrow__status { display: inline-flex; align-items: center; gap: 6px; }
.vrow__status .icon { font-size: 18px; }
.vrow__status--done .icon { color: var(--md-sys-color-primary); }
.vrow__status--busy { color: var(--md-sys-color-secondary); }
.vrow__status--error { color: var(--md-sys-color-error); }
@media (max-width: 1199px) {
  .vrows__head, .vrow { grid-template-columns: 48px minmax(0, 1fr) 112px 64px 96px; }
  .vrow__wide { display: none; }
}
/* Card de mídia: só a imagem, cantos de 16 px (large) e a sombra do elevated card (nível 1). */
.frame {
  position: relative; aspect-ratio: 1; margin: 0; padding: 0; border: 0; overflow: hidden;
  border-radius: var(--md-sys-shape-corner-large); box-shadow: var(--md-sys-elevation-level1);
}
.frame::before { z-index: 1; border-radius: inherit; }
/* Recorte preso às bordas: o Safari não aceita height:100% sobre a altura que vem do aspect-ratio. */
.frame__media { position: absolute; inset: 0; display: block; overflow: hidden; border-radius: inherit; }
.frame video, .frame__placeholder { width: 100%; height: 100%; }
.frame video { display: block; object-fit: cover; pointer-events: none; background: var(--md-sys-color-surface-container-highest); }
.frame__placeholder { display: grid; place-items: center; background: var(--md-sys-color-surface-container-highest); }
/* Mouse sobre o card: o vídeo aproxima de leve dentro do card (só onde há hover; com movimento reduzido, não). */
.frame video { transition: transform var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard); }
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .frame:hover video, .frame:focus-visible video { transform: scale(1.06); }
}
/* --- Página do vídeo: o vídeo centralizado sobre ele mesmo desfocado e a folha lateral (M3 side sheet) --- */
.viewer { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr); min-height: 0; }
.viewer__stage { position: relative; display: grid; grid-template: minmax(0, 1fr) / minmax(0, 1fr); place-items: center; min-height: 60vh; padding: 16px 72px; /* 8 px da borda + 48 px do botão + 16 px até o vídeo */ overflow: hidden; background: #2a2a2a; }
/* Fundo escuro liso atrás do vídeo: o surface-container-high do tema escuro (theme.ts), nos dois temas. */
.viewer__player .player__frame { box-shadow: var(--md-sys-elevation-level2); }
.player.viewer__player { padding: 0; background: none; border-radius: 0; }
.viewer__player [hidden] { display: none; }
.viewer__player { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; min-height: 0; container-type: size; }
/* A moldura tem o formato do vídeo e cabe inteira na área (pela altura ou pela largura, o que bater
   primeiro): sem faixas em cima e embaixo no 16:9 nem dos lados no 9:16. */
.viewer__player .player__frame { width: min(100cqw, 100cqh * var(--ratio, 9 / 16)); height: auto; max-width: none; aspect-ratio: var(--ratio, 9 / 16); }
/* O vídeo preenche a moldura por posição absoluta: o tamanho natural dele (1280 px de altura num 720p) não empurra a moldura. */
.viewer__player .player__frame { min-height: 0; }
.viewer__player .player__frame video { position: absolute; inset: 0; object-fit: cover; }
.viewer__stage .stage { position: relative; z-index: 1; width: min(420px, 100%); }
/* A barra abaixo do vídeo: barra de ferramentas flutuante do M3 (cantos inteiros, surface-container-high),
   tocar num botão de ícone cheio de 48 px, tempo em label-large e o slider do M3 Expressive. */
.viewer__stage { grid-template: minmax(0, 1fr) auto / minmax(0, 1fr); gap: 12px; }
.vbar {
  position: relative; z-index: 2; display: flex; align-items: center; gap: 4px; width: min(560px, 100%); padding: 4px 8px 4px 4px;
  border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-surface-container-high); color: var(--md-sys-color-on-surface); box-shadow: var(--md-sys-elevation-level2);
}
.vbar__play { width: 40px; height: 40px; flex: none; display: grid; place-items: center; margin: 0; border: 0; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
.vbar__play::before { border-radius: inherit; }
.vbar__play .icon { font-size: 20px; }
.vbar .icon-button { width: 36px; height: 36px; }
.vbar .icon-button .icon { font-size: 20px; }
.vbar__time { flex: none; min-width: 80px; text-align: center; font: var(--md-sys-typescale-label-medium); letter-spacing: 0.031rem; font-variant-numeric: tabular-nums; }
.vbar__seek {
  --p: 0%; flex: 1; min-width: 80px; height: 32px; margin: 0 8px; background: none; appearance: none; -webkit-appearance: none; cursor: pointer;
}
.vbar__seek::-webkit-slider-runnable-track { height: 8px; border-radius: 4px; background: linear-gradient(to right, var(--md-sys-color-primary) var(--p), var(--md-sys-color-secondary-container) var(--p)); }
.vbar__seek::-moz-range-track { height: 8px; border-radius: 4px; background: linear-gradient(to right, var(--md-sys-color-primary) var(--p), var(--md-sys-color-secondary-container) var(--p)); }
.vbar__seek::-webkit-slider-thumb { -webkit-appearance: none; width: 4px; height: 24px; margin-top: -8px; border-radius: 2px; background: var(--md-sys-color-primary); box-shadow: 0 0 0 4px var(--md-sys-color-surface-container-high); }
.vbar__seek::-moz-range-thumb { width: 4px; height: 24px; border: 0; border-radius: 2px; background: var(--md-sys-color-primary); box-shadow: 0 0 0 4px var(--md-sys-color-surface-container-high); }
.vbar__seek:focus-visible { outline: 3px solid var(--md-sys-color-secondary); outline-offset: 2px; border-radius: 8px; }
.vbar__seek:disabled { opacity: 0.38; cursor: default; }
/* Na prévia, os controles próprios dela ficam escondidos: a barra comanda. */
.viewer__player .player__controls { display: none; }
.viewer__player video { cursor: pointer; }
.viewer__nav { position: absolute; top: 50%; z-index: 2; transform: translateY(-50%); color: var(--md-sys-color-on-surface); background: var(--md-sys-color-surface-container-high); box-shadow: var(--md-sys-elevation-level1); }
.viewer__nav--prev { left: 8px; }
.viewer__nav--next { right: 8px; }
.viewer__nav[hidden] { display: none; }
.viewer__sheet { display: flex; flex-direction: column; min-height: 0; background: var(--md-sys-color-surface-container-low); }
/* Cabeçalho da folha: o status na mesma margem de 24 px do conteúdo; o X com o ícone a 24 px da borda (botão de 48 px). */
.viewer__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 64px; padding: 8px 12px 8px 24px; }
.viewer__body { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 24px; display: flex; flex-direction: column; gap: 24px; }
.viewer__panel { display: flex; flex-direction: column; gap: 24px; }
.viewer__panel[hidden] { display: none; }
.viewer__section { display: flex; flex-direction: column; gap: 8px; }
.viewer__section-head { display: flex; align-items: center; justify-content: space-between; margin-right: -12px; }
.viewer__title { font: var(--md-sys-typescale-title-small); letter-spacing: 0.006rem; color: var(--md-sys-color-on-surface-variant); }
.viewer__card { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: var(--md-sys-shape-corner-large); background: var(--md-sys-color-surface-container-highest); }
.viewer__avatar { width: 72px; height: 72px; object-fit: cover; border-radius: var(--md-sys-shape-corner-medium); }
.viewer__text { font: var(--md-sys-typescale-body-large); letter-spacing: 0.031rem; white-space: pre-wrap; overflow-wrap: anywhere; }
/* Detalhes no mesmo estilo do "Resultado da edição": título no card e uma linha por item (ícone, rótulo, valor). */
.viewer__details { gap: 0; }
.viewer__details dl { margin: 0; }
.viewer__details dd { margin: 0; min-width: 0; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.viewer__details dt { flex: 1; }
.viewer__actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 16px 24px 24px; border-top: 1px solid var(--md-sys-color-outline-variant); }
.viewer__actions > .button, .viewer__actions > .menu, .viewer__actions .menu > summary { width: 100%; justify-content: center; }
.viewer__actions:has(> :only-child) { grid-template-columns: 1fr; }
.viewer__save { width: 100%; justify-content: center; }
/* Edição rápida na folha: o resumo num card, cada opção numa seção com o grupo na largura toda
   e os botões presos no fim da folha (no lugar de Refazer e Baixar). */
.viewer .quick-edit { flex: 1; gap: 24px; padding: 0; border-radius: 0; background: none; }
.viewer .quick-edit__title { display: none; }
.viewer .quick-edit__summary { padding: 16px; border-radius: var(--md-sys-shape-corner-large); background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface); }
.qe-result__title { margin-bottom: 4px; font: var(--md-sys-typescale-title-small); letter-spacing: 0.006rem; }
.qe-result__row { display: flex; align-items: center; gap: 12px; height: 36px; font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; }
.qe-result__row .icon { font-size: 20px; color: var(--md-sys-color-on-surface-variant); }
.qe-result__note { margin-top: 8px; font: var(--md-sys-typescale-body-small); letter-spacing: 0.025rem; color: var(--md-sys-color-on-surface-variant); }
.qe-result__label { flex: 1; color: var(--md-sys-color-on-surface-variant); }
.qe-result__value { font: var(--md-sys-typescale-label-large); letter-spacing: 0.006rem; color: var(--md-sys-color-on-surface); }
.viewer .quick-edit__head { gap: 12px; }
.viewer .quick-edit__preview { width: 100%; justify-content: center; }
.quick-edit__hint { margin-top: -16px; font: var(--md-sys-typescale-body-small); letter-spacing: 0.025rem; color: var(--md-sys-color-on-surface-variant); text-align: center; }
.qe-busy .linear-progress { --progress-gap: var(--md-sys-color-surface-container-highest); }
.viewer .quick-edit__fields { flex-direction: column; flex-wrap: nowrap; gap: 24px; }
.viewer .quick-edit .segmented-field { flex: none; }
.viewer .quick-edit .segmented-field__label { font: var(--md-sys-typescale-title-small); letter-spacing: 0.006rem; color: var(--md-sys-color-on-surface-variant); }
.viewer .quick-edit .segmented-button { display: grid; align-self: stretch; }
/* Ajuda das opções: uma linha só (os textos são curtos; se não couber, corta com reticências). */
.viewer .quick-edit .segmented-field__help { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.viewer .quick-edit__actions {
  position: sticky; bottom: -16px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  margin: auto -24px -16px; padding: 16px 24px 24px;
  background: var(--md-sys-color-surface-container-low); border-top: 1px solid var(--md-sys-color-outline-variant);
}
.viewer .quick-edit__actions .button { width: 100%; justify-content: center; }
.viewer__sheet:has(.quick-edit:not([hidden])) .viewer__actions { display: none; }
.viewer .quick-edit[hidden] { display: none; }
/* Já editado: Original | Editado (troca o vídeo do player), o card de quando e como (linhas com ícone)
   e o "Editar de novo"; até ele, a aba mostra só isso; depois, os ajustes com o aviso. */
.qe-existing { display: flex; flex-direction: column; gap: 12px; }
.qe-versions { display: grid; align-self: stretch; }
.qe-versions .segmented-button__segment { border: 0; margin: 0; cursor: pointer; }
.qe-versions .icon { font-size: 18px; }
.qe-existing__card { gap: 0; }
.qe-existing__again { width: 100%; justify-content: center; }
.qe-existing__warn { display: flex; align-items: center; gap: 8px; font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface-variant); }
.qe-existing__warn .icon { font-size: 18px; }
.quick-edit[data-edited]:not(.is-again) > :not(.qe-existing), .quick-edit[data-edited]:not(.is-again) .qe-existing__warn { display: none; }
.quick-edit[data-edited].is-again .qe-existing__again { display: none; }
/* O botão que abre a edição rápida fica escondido: quem abre é a aba (a edição o mostra de novo ao fechar). */
.viewer [data-qe-open] { display: none; }
/* Abas principais do M3: 48 px, indicador de 3 px na cor primary embaixo do escolhido. */
/* Abas fixas do M3: de borda a borda da folha, cada uma com a mesma largura. */
.tabs { display: flex; padding: 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.tabs__tab {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 48px; margin: 0; padding: 0 16px;
  border: 0; background: none; color: var(--md-sys-color-on-surface-variant); font: var(--md-sys-typescale-title-small); letter-spacing: 0.006rem;
}
.tabs__tab .icon { font-size: 20px; }
/* Indicador das abas principais do M3: 3 px só sob o conteúdo (ícone e texto), cantos de cima arredondados. */
.tabs__content { position: relative; display: inline-flex; align-items: center; gap: 8px; height: 100%; }
.tabs__tab[aria-selected="true"] { color: var(--md-sys-color-primary); }
.tabs__tab[aria-selected="true"] .tabs__content::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 3px;
  border-radius: 3px 3px 0 0; background: var(--md-sys-color-primary);
}
/* Menu que abre para cima (o "Baixar" fica no fim da folha). */
.menu--up > summary { list-style: none; }
.menu--up .menu__list { top: auto; bottom: calc(100% + 4px); left: 0; right: auto; min-width: 100%; }
@media (min-width: 840px) {
  /* A página do vídeo tem a altura da janela, nem mais: o vídeo encolhe para caber e a folha rola por dentro.
     (flex: none, senão o flex do body ignora a altura e a página cresce com o conteúdo da folha.) */
  .viewer { flex: none; grid-template-columns: minmax(0, 1fr) var(--layout-config); grid-template-rows: minmax(0, 1fr); height: calc(100dvh - var(--bar-height, 72px)); overflow: hidden; }
  .viewer__stage { min-height: 0; }
  .viewer__sheet { border-left: 1px solid var(--md-sys-color-outline-variant); }
}

.player { display: flex; justify-content: center; padding: 16px 0; background: var(--md-sys-color-on-surface); border-radius: var(--md-sys-shape-corner-extra-large); }
.player__frame { position: relative; aspect-ratio: var(--ratio, 9 / 16); height: min(420px, 60vh); max-width: calc(100% - 32px); overflow: hidden; border-radius: var(--md-sys-shape-corner-large); background: #000; }
.player video { display: block; width: 100%; height: 100%; object-fit: contain; }
/* Prévia da edição rápida: o zoom de cada trecho é um scale no vídeo; os controles próprios ficam por cima. */
.player__canvas { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; background: #000; cursor: pointer; }
.player__controls {
  position: absolute; z-index: 2; left: 8px; bottom: 8px; display: flex; align-items: center; gap: 4px; padding-right: 16px;
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

.quick-edit { display: flex; flex-direction: column; gap: 16px; padding: 24px; border-radius: var(--md-sys-shape-corner-extra-large); background: var(--md-sys-color-surface-container); }
.quick-edit__head { display: flex; flex-direction: column; gap: 4px; }
.quick-edit__title { font: var(--md-sys-typescale-title-medium); letter-spacing: 0.009rem; color: var(--md-sys-color-on-surface); }
.quick-edit__summary { font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface-variant); }
.quick-edit__fields { display: flex; flex-wrap: wrap; gap: 16px 24px; }
.quick-edit .segmented-field { flex: 1 1 260px; }
.segmented-field__help { font: var(--md-sys-typescale-body-small); letter-spacing: 0.025rem; color: var(--md-sys-color-on-surface-variant); }
.quick-edit__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }

/* --- Indicador de progresso linear, M3 Expressive: 4 px, pontas arredondadas e 4 px de folga entre
   o indicador e a trilha. Indeterminado por padrão; com --determinate e --progress (0 a 1), mostra
   o andamento e o ponto de parada no fim da trilha. É o indicador padrão do site. ------------------ */
.linear-progress { --progress-gap: var(--md-sys-color-surface); position: relative; height: 4px; overflow: hidden; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-secondary-container); }
/* A folga é uma borda na cor do fundo em volta do indicador. */
.linear-progress::before {
  content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 40%;
  border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-primary);
  box-shadow: 0 0 0 4px var(--progress-gap);
  animation: linear-progress 1.8s var(--md-sys-motion-easing-standard) infinite;
}
.linear-progress[hidden] { display: none; }
.linear-progress--determinate::before { width: calc(var(--progress, 0) * 100%); min-width: 4px; animation: none; transition: width var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard); }
.linear-progress--determinate::after { content: ""; position: absolute; top: 0; right: 0; width: 4px; height: 4px; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-primary); }
/* --- Indicador circular no botão (M3): centralizado, na cor do texto, sem trilha. 40 px e traço
   de 4 px no padrão, na mesma proporção aqui. O botão ocupado mantém a largura e a cor cheia:
   a opacidade de desativado deixaria o indicador abaixo do contraste de 3:1. ------------- */
.is-busy { pointer-events: none; cursor: default; }
.button.is-busy, .fab.is-busy { -webkit-text-fill-color: transparent; }
.button.is-busy:disabled { opacity: 1; }
.spinner {
  position: absolute; inset: 0; width: 24px; height: 24px; margin: auto;
  fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round;
  animation: spinner-turn 1.4s linear infinite;
}
.spinner circle { stroke-dasharray: 46 22; animation: spinner-arc 1.4s ease-in-out infinite; }
/* Em lista, só o item tocado mostra o indicador, à direita, e o texto fica. */
/* Avatar e ativos no painel do modelo: lista segmentada (2 px entre itens, 4 px por dentro, 16 px nas pontas). */
.file-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.file-list .file-picker { width: 100%; padding-right: 8px; border: 0; border-radius: 4px; font: inherit; text-align: left; cursor: pointer; }
.file-list div.file-picker { cursor: default; }
.file-list li:first-child .file-picker { border-top-left-radius: 16px; border-top-right-radius: 16px; }
.file-list li:nth-last-child(1 of :not([hidden])) .file-picker { border-bottom-left-radius: 16px; border-bottom-right-radius: 16px; }
.file-list [aria-expanded="true"] { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
.file-list .icon-button { flex: none; color: var(--md-sys-color-on-surface-variant); }
.file-list [hidden] { display: none; }
.file-picker__preview--empty { border: 1px dashed var(--md-sys-color-outline); background: none; color: var(--md-sys-color-on-surface-variant); }
/* O menu que desdobra ao lado do painel: o mesmo painel, colado nele (2 px). */
.side-panel {
  position: fixed; inset: 0; z-index: 20; min-width: 0; display: flex; flex-direction: column; gap: 16px; padding: 16px;
  background: var(--md-sys-color-surface-container-lowest); overflow-y: auto;
}
.side-panel[hidden], .side-panel__body[hidden], .side-panel__kind[hidden], .side-panel__head [hidden] { display: none; }
.side-panel__head { display: flex; align-items: center; gap: 4px; min-height: 48px; }
.side-panel__title { flex: 1; min-width: 0; padding-left: 8px; font: var(--md-sys-typescale-title-medium); letter-spacing: 0.009rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.side-panel__body, .side-panel__kind { display: flex; flex-direction: column; gap: 16px; min-height: 0; }
.side-panel .search-field { width: 100%; max-width: none; flex: none; }
.side-panel .dialog__list { max-height: none; }
.side-panel .vrow__support { display: block; }
.side-panel .chip-set { margin: 0; }
.side-panel__new { align-self: flex-start; }
.voice-more { display: flex; justify-content: center; padding-top: 8px; }
[data-voice-list] .vgroup__title { padding-top: 16px; }
[data-voice-list] .side-panel__help { padding: 0 4px 4px; }
.side-panel .linear-progress[hidden], .side-panel .library__empty[hidden] { display: none; }
.voice-row { position: relative; border-radius: 16px; }
.voice-row .avatar-option { padding-left: 56px; }
.voice-row > .icon-button { position: absolute; z-index: 1; top: 50%; left: 8px; transform: translateY(-50%); }
.voice-row:has([aria-pressed="true"]) { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
.voice-row:has([aria-pressed="true"]) .vrow__support { color: inherit; }
.side-panel__help { font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface-variant); }
.asset-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.asset-grid .frame { padding: 0; border: 0; background: none; cursor: pointer; }
.asset-grid .frame[aria-pressed="true"] { outline: 3px solid var(--md-sys-color-primary); outline-offset: -3px; }
.frame__check { position: absolute; z-index: 2; top: 8px; right: 8px; display: none; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
.frame__check .icon { font-size: 18px; }
.frame[aria-pressed="true"] .frame__check { display: grid; }
.asset-upload {
  position: relative; aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  border: 1px dashed var(--md-sys-color-outline); border-radius: 16px; font: var(--md-sys-typescale-label-large); color: var(--md-sys-color-primary); cursor: pointer;
}
.asset-upload:has(input:focus-visible) { outline: 3px solid var(--md-sys-color-secondary); outline-offset: 2px; }
.avatar-option .spinner { position: static; flex: none; margin: 0 8px 0 auto; }
.xlist__item .spinner { position: static; flex: none; margin: 0; }
@keyframes spinner-turn { to { transform: rotate(360deg); } }
@keyframes spinner-arc { 0% { stroke-dasharray: 10 58; } 50% { stroke-dasharray: 46 22; } 100% { stroke-dasharray: 10 58; stroke-dashoffset: -68; } }
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
.snackbar .linear-progress { --progress-gap: var(--md-sys-color-inverse-surface); flex: 1 0 100%; margin: 0 8px 6px 0; background: var(--md-sys-color-secondary); }
.snackbar .linear-progress::before { background: var(--md-sys-color-inverse-primary); }
.snackbar .button--text { color: var(--md-sys-color-inverse-primary); margin-left: auto; }
@keyframes snackbar-in { from { transform: translateY(16px); opacity: 0; } }

/* Aviso fixo no topo do conteúdo (banner) */
.banner {
  display: flex; gap: 12px; align-items: center; padding: 12px 16px;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container);
  font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem;
}

/* Confirmação numa página (apagar um projeto): o diálogo básico do M3, no meio da página
   (surface-container-high, cantos de 28 px, 24 px de margem, até 560 px, ações à direita). */
/* Diálogo básico do M3: cantos de 28 px, 24 px de margem, de 280 a 560 px. */
.dialog { width: min(560px, calc(100vw - 32px)); min-width: 280px; max-height: calc(100vh - 48px); margin: auto; padding: 24px; border: 0; border-radius: 28px; background: var(--md-sys-color-surface-container-high); color: var(--md-sys-color-on-surface); box-shadow: var(--md-sys-elevation-level3, var(--md-sys-elevation-level2)); }
.dialog[open] { display: flex; flex-direction: column; gap: 16px; }
.dialog::backdrop { background: rgb(0 0 0 / 0.32); }
.dialog__title { font: var(--md-sys-typescale-headline-small); }
.dialog .search-field { width: 100%; max-width: none; background: var(--md-sys-color-surface-container-highest); }
.dialog__list { list-style: none; margin: 0; padding: 0; overflow-y: auto; min-height: 0; max-height: 320px; }
.dialog__list [hidden] { display: none; }
.dialog__actions { display: flex; justify-content: flex-end; gap: 8px; }
.dialog__start { margin-right: auto; }
.avatar-option { display: flex; align-items: center; gap: 16px; width: 100%; padding: 8px; border: 0; border-radius: 16px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.avatar-option:disabled { opacity: 0.38; cursor: default; }
.avatar-option.is-busy { opacity: 1; }
.avatar-option__text { display: flex; flex-direction: column; min-width: 0; }

/* Avatares: a capa do card tem o tamanho do ícone dos cards de Modelos. */
.avatar-cover { width: 48px; height: 48px; border-radius: 14px; object-fit: cover; }
.frame__media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.vrow__thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.viewer__stage--asset { display: flex; align-items: center; justify-content: center; }
.viewer__stage--asset img, .viewer__stage--asset video { max-width: 100%; max-height: 100%; border-radius: 16px; object-fit: contain; }
.confirm {
  width: min(560px, 100%); margin: 12vh auto 0; padding: 24px; display: flex; flex-direction: column; gap: 16px;
  border-radius: var(--md-sys-shape-corner-extra-large); background: var(--md-sys-color-surface-container-high);
}
.confirm__title { font: var(--md-sys-typescale-headline-small); overflow-wrap: anywhere; }
.confirm__text { font: var(--md-sys-typescale-body-medium); letter-spacing: 0.016rem; color: var(--md-sys-color-on-surface-variant); }
.confirm__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }

/* --- Página ---------------------------------------------------------------------------- */
.page {
  flex: 1; width: 100%; max-width: calc(var(--layout-max) + 2 * var(--layout-margin)); margin: 0 auto;
  padding: 24px var(--layout-margin) 32px;
  display: flex; flex-direction: column; gap: 16px;
}
.page__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; }

/* Título das páginas (Modelos e Vídeos): headline, a contagem ao lado e a frase embaixo. */
.page__headline { display: flex; align-items: baseline; gap: 8px; font: var(--md-sys-typescale-headline-small); }
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

/* --- Breakpoints médio, expandido e grande ------------------------------------------ */
@media (min-width: 600px) {
  :root { --layout-margin: 24px; }
  .top-app-bar { padding: 12px 24px; }
  .page { padding-top: 32px; padding-bottom: 48px; }
}
@media (min-width: 840px) {
  .page__headline { font: var(--md-sys-typescale-headline-medium); }
  /* A configuração à esquerda e a lista de vídeos no centro. */
  .workspace { grid-template-columns: var(--layout-config) minmax(0, 1fr); grid-template-areas: "config main"; }
  .pane--config { grid-area: config; }
  /* O menu de ativos desdobra entre o painel e a lista, que encolhe. */
  .workspace:has(.side-panel:not([hidden])) { grid-template-columns: var(--layout-config) 344px minmax(0, 1fr); grid-template-areas: "config panel main"; }
  .workspace:has(.side-panel:not([hidden])) .pane--config { border-top-right-radius: 4px; border-bottom-right-radius: 4px; }
  .side-panel { grid-area: panel; position: sticky; inset: auto; top: 72px; z-index: auto; height: calc(100vh - 88px); margin-left: -14px; padding: 16px; border-radius: 4px var(--md-sys-shape-corner-extra-large) var(--md-sys-shape-corner-extra-large) 4px; }
  .workspace__main { grid-area: main; align-self: stretch; }
  /* Tudo numa linha: marca, abas, busca e conta. */
  .top-app-bar--home { flex-wrap: nowrap; }
  .top-app-bar--home .nav-pills { order: 0; flex: 1 1 auto; }
  .top-app-bar__tools { order: 0; flex: none; }
  .top-app-bar__tools .search-field { flex: none; width: 260px; }
  .top-app-bar--home .top-app-bar__actions { order: 0; margin-left: 0; }
}
@media (min-width: 1200px) {
  /* A configuração fica presa ao rolar a lista e ocupa sempre a altura da janela; rola por dentro. */
  .pane--config { position: sticky; top: 84px; height: calc(100vh - 100px); overflow-y: auto; }
  .side-panel { top: 84px; height: calc(100vh - 100px); }
}

/* Celular: as setas vão por cima do vídeo (sem a margem dos lados), a barra ocupa a largura toda
   e os cards médios ficam dois por linha. */
@media (max-width: 599px) {
  /* Página do vídeo no celular (mídia do M3): o vídeo num contêiner de cantos arredondados sobre a
     superfície da página, no formato dele e com no máximo 56% da altura da tela (o resto da página
     aparece embaixo); a barra logo abaixo, na mesma superfície; sem faixa escura e sem as setas.
     Sem o vídeo pronto, o mesmo espaço mostra o status e o progresso. A folha continua na página,
     sem o cabeçalho (status e X repetiriam o que já está acima e a seta da barra superior). */
  .viewer__stage { display: flex; flex-direction: column; align-items: center; gap: 12px; min-height: 0; padding: 12px 16px 16px; background: none; }
  /* 16 px entre a barra do player e as abas (que já vão de borda a borda). */
  .viewer__nav { display: none; }
  .viewer__player { width: 100%; height: auto; container-type: normal; }
  .viewer__player .player__frame { width: min(100%, calc(56svh * var(--ratio, 9 / 16))); height: auto; aspect-ratio: var(--ratio, 9 / 16); border-radius: var(--md-sys-shape-corner-large); box-shadow: none; }
  /* Sem vídeo (na fila ou com falha): um card compacto, da altura do conteúdo. */
  .viewer__stage .stage { width: 100%; min-height: 0; padding: 24px 16px; gap: 12px; border-radius: var(--md-sys-shape-corner-large); }
  .viewer__stage .stage > .icon { font-size: 32px; }
  .vbar { width: 100%; margin: 0; box-shadow: none; }
  .viewer__sheet { background: none; }
  .viewer__head { display: none; }
  .vbar__time { min-width: 0; }
  .vbar__seek { min-width: 0; margin: 0 4px; }
  .frames, .library[data-grouped="false"]:not([data-view="d"]) .library__groups { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  /* Só duas vistas no celular: cards dois por linha e Detalhes (uma escolha P ou G guardada vira a de dois por linha). */
  .library__sizes [data-view="p"], .library__sizes [data-view="g"] { display: none; }
  .library[data-view="p"] .frames, .library[data-grouped="false"][data-view="p"] .library__groups,
  .library[data-view="g"] .frames, .library[data-grouped="false"][data-view="g"] .library__groups { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .library[data-view="p"] .library__sizes [data-view="m"], .library[data-view="g"] .library__sizes [data-view="m"] { background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
  /* Chips numa linha só, que rola para o lado (o grupo de chips do M3 no celular), até a borda da tela. */
  .library__tools { flex-wrap: nowrap; overflow-x: auto; margin: 0 -16px; padding: 0 16px; scrollbar-width: none; }
  .library__tools::-webkit-scrollbar { display: none; }
  .library__tools > * { flex: none; }
  /* Página do modelo: a configuração sem o card branco, os campos na largura toda. */
  .pane--config { --field-surface: var(--md-sys-color-surface); padding: 0; border-radius: 0; background: none; }
  .pane--config .form-section, .pane--config .pane__footer { padding-left: 0; padding-right: 0; }
  /* A sobra embaixo do botão só serve no painel que rola por dentro (tela larga). */
  .pane__footer { padding-bottom: 8px; }
  /* Celular: lista de duas linhas do M3, sem títulos de coluna; o status fica só no ícone à direita. */
  .library[data-view="d"] .vrows__head { display: none; }
  .vrow { grid-template-columns: 48px minmax(0, 1fr) 24px; min-height: 72px; }
  .vrow > :nth-child(n + 4) { display: none; }
  .vrow__support { display: block; }
  .vrow__status { font-size: 0; }
  .vrow__status .icon { font-size: 24px; }
  /* O FAB do M3 no celular: preso no canto de baixo, por cima da lista. */
  .library__end .fab { position: fixed; right: 16px; bottom: 16px; z-index: 5; box-shadow: var(--md-sys-elevation-level3, var(--md-sys-elevation-level2)); }
}

/* Tela cheia: sem cantos arredondados nem sombra, o vídeo inteiro no centro (faixas pretas, se o formato pedir). */
.viewer__player .player__frame:fullscreen { width: 100vw; height: 100vh; max-width: none; aspect-ratio: auto; border-radius: 0; box-shadow: none; background: #000; }
.viewer__player .player__frame:fullscreen video { object-fit: contain; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;

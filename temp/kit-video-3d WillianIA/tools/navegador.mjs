// Acha um Chrome/Edge/Brave instalado (o render usa o navegador que já existe no computador).
import fs from 'node:fs';
import path from 'node:path';

export function acharNavegador() {
  const env = process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return env;
  const L = process.env.LOCALAPPDATA || '';
  const lista = process.platform === 'win32'
    ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(L, 'Google\\Chrome\\Application\\chrome.exe'), 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ]
    : process.platform === 'darwin'
      ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ]
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/snap/bin/chromium'];
  return lista.find((p) => fs.existsSync(p));
}

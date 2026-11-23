import { emcText } from './emcLanguage.js';
import { getPref, setPref } from '../../systems/uiPrefs.js';
import { normalizeCosmeticsUrl } from '../../net/cosmetics/endpoint.js';

import { cosmeticPublishError, cosmeticPublishStatus } from '../../net/cosmetics/cosmeticPeers.js';

async function health(url) {
  const response = await fetch(url + '/health', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const status = await response.json();
  if (status.service !== 'dfo-cosmetics') throw new Error(emcText('Адрес не принадлежит серверу косметики.'));
  return status;
}

async function host(action, port) {
  const shell = globalThis.daggerShell;
  if (shell?.cosmeticsHost) return shell.cosmeticsHost(action, port);
  if (!import.meta.env?.DEV) throw new Error(emcText('Запуск сервера доступен в настольной сборке.'));
  const response = await fetch('/__cosmetics_host', {
    method: 'POST', headers: { 'X-DFO-Cosmetics': action, ...(port == null ? {} : { 'X-DFO-Cosmetics-Port': String(port) }) },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export function cosmeticsMenu(node) {
  const button = (label, run) => {
    const control = node('button', 'act', label);
    control.type = 'button';
    control.onclick = run;
    return control;
  };
  const card = node('section', 'card emc-group cosmetics-menu');
  const field = (text, value) => {
    const label = node('label', 'meta', text);
    const input = node('input');
    input.type = 'url';
    input.placeholder = 'https://cosmetics.example.com';
    input.value = value ?? '';
    input.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin:.55em 0 1em;padding:.65em;background:#15181d;color:inherit;border:1px solid #8b7954;font:inherit';
    label.append(input);
    return { label, input };
  };
  const status = () => {
    const box = node('div', 'cosmetics-status');
    const title = node('strong');
    const detail = node('span');
    box.setAttribute('role', 'status');
    box.append(title, detail);
    return { box, show(state, heading, value = '') {
      box.dataset.state = state;
      if (title.textContent !== heading) title.textContent = heading;
      if (detail.textContent !== value) detail.textContent = value;
      detail.title = value;
    } };
  };
  const localStatus = status();
  const publicStatus = status();
  const remoteStatus = status();
  const actions = (...buttons) => {
    const row = node('div', 'cosmetics-actions');
    row.append(...buttons);
    return row;
  };
  const publicField = field(emcText('Укажите ваш публичный адрес для локального сервера'), getPref('cosmeticsPublicUrl'));
  const clientField = field(emcText('Укажите публичный адрес сервера для синхронизации внешнего вида'), getPref('cosmeticsServerUrl'));
  const portLabel = node('label', 'meta cosmetics-port', emcText('Порт локального сервера'));
  const portInput = node('input');
  portInput.type = 'number';
  portInput.min = '1';
  portInput.max = '65535';
  portInput.step = '1';
  portInput.value = String(getPref('cosmeticsHostPort') ?? 8793);
  portInput.style.cssText = clientField.input.style.cssText;
  portLabel.append(portInput);
  const facts = node('dl', 'cosmetics-facts');
  const fact = (label) => {
    const cell = node('div');
    const value = node('dd');
    cell.append(node('dt', null, label), value);
    facts.append(cell);
    return value;
  };
  const livePort = fact(emcText('Порт локального сервера'));
  const liveAddress = fact(emcText('Локальный адрес'));
  const liveProfiles = fact(emcText('Активные профили'));
  let localUrl = null;
  let clientBusy = false;
  let busy = false;
  let hostError = '';
  let clientError = '';
  const start = button(emcText('Запустить публичный сервер'), () => control('start'));
  const stop = button(emcText('Остановить сервер'), () => control('stop'));
  const publicPanel = node('div');
  const hostPanel = node('div', 'card');
  const clientPanel = node('div', 'card');
  publicPanel.append(publicField.label, node('p', 'meta', emcText('Направьте HTTPS-туннель или прокси на локальный адрес выше.')), button(emcText('Проверить публичный адрес'), () => {
    const url = normalizeCosmeticsUrl(publicField.input.value);
    if (!url?.startsWith('https:')) { publicStatus.show('error', emcText('Укажите публичный HTTPS-адрес.')); return; }
    setPref('cosmeticsPublicUrl', url);
    void refresh(true);
  }));
  const connect = button(emcText('Подключиться'), async () => {
    if (localUrl || busy || clientBusy) return;
    clientError = '';
    const url = normalizeCosmeticsUrl(clientField.input.value);
    if (!url) { remoteStatus.show('error', emcText('Укажите HTTPS-адрес или локальный HTTP-адрес.')); return; }
    clientBusy = true;
    syncButtons();
    remoteStatus.show('waiting', emcText('Проверяем подключение…'), url);
    try { await health(url); setPref('cosmeticsServerUrl', url); }
    catch (error) { clientError = emcText(error.message); }
    finally { clientBusy = false; void refresh(true); }
  });
  const disconnect = button(emcText('Отключиться'), () => {
    if (localUrl || clientBusy) return;
    clientError = '';
    setPref('cosmeticsServerUrl', '');
    void refresh(true);
  });
  hostPanel.append(node('h4', null, emcText('Запуск сервера')), portLabel, facts, actions(start, stop), localStatus.box, publicPanel, publicStatus.box);
  const guestControls = node('div');
  guestControls.append(clientField.label);
  clientPanel.append(node('h4', null, emcText('Подключение')), guestControls, actions(connect, disconnect), remoteStatus.box);
  card.append(node('h3', null, emcText('Сервер синхронизации внешнего вида')), hostPanel, clientPanel);

  async function control(action) {
    if (busy || (action === 'start' && start.disabled) || (action === 'stop' && stop.disabled)) return;
    const port = portInput.valueAsNumber;
    if (action === 'start' && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      localStatus.show('error', emcText('Укажите порт от 1 до 65535.'));
      return;
    }
    busy = true;
    syncButtons();
    hostError = '';
    try {
      const previousUrl = localUrl;
      localUrl = (await host(action, action === 'start' ? port : undefined))?.url ?? null;
      if (action === 'start' && localUrl && !getPref('cosmeticsServerUrl')) {
        setPref('cosmeticsServerUrl', localUrl);
        clientField.input.value = localUrl;
      }
      if (action === 'stop' && !localUrl && previousUrl && getPref('cosmeticsServerUrl') === previousUrl) {
        setPref('cosmeticsServerUrl', '');
        clientField.input.value = '';
      }
      if (action === 'start' && localUrl) setPref('cosmeticsHostPort', port);
    }
    catch (error) { hostError = emcText(error.message); }
    finally { busy = false; void refresh(true); }
  }

  function syncButtons() {
    const connected = Boolean(getPref('cosmeticsServerUrl'));
    start.disabled = busy || clientBusy || Boolean(localUrl) || connected;
    stop.disabled = busy || !localUrl;
    disconnect.disabled = Boolean(localUrl) || clientBusy || !connected;
    connect.disabled = Boolean(localUrl) || busy || clientBusy || connected;
    portInput.disabled = start.disabled;
    portLabel.hidden = Boolean(localUrl);
    facts.hidden = !localUrl;
    guestControls.hidden = Boolean(localUrl) || connected;
    disconnect.hidden = Boolean(localUrl) || !connected;
    connect.hidden = Boolean(localUrl) || connected;

    if (localUrl) {
      livePort.textContent = new URL(localUrl).port;
      liveAddress.textContent = localUrl;
      if (!liveProfiles.textContent) liveProfiles.textContent = '—';
    } else liveProfiles.textContent = '—';
  }

  let revision = 0;
  async function refresh(interactive = false) {
    const current = ++revision;
    syncButtons();
    publicPanel.hidden = !localUrl;
    const url = getPref('cosmeticsServerUrl');
    const external = getPref('cosmeticsPublicUrl');
    const requestedLocal = localUrl;
    const count = (value) => emcText('Активных профилей: ') + value;
    if (hostError) localStatus.show('error', hostError, requestedLocal ?? '');
    else if (!requestedLocal) localStatus.show('idle', emcText('Сервер остановлен.'));
    else if (interactive) localStatus.show('waiting', emcText('Проверяем локальный сервер…'));
    if (!requestedLocal || !external) publicStatus.show('idle', emcText('Публичный адрес не проверен'), external ?? '');
    else if (interactive) publicStatus.show('waiting', emcText('Проверяем публичный адрес…'), external);
    if (!clientBusy) {
      if (clientError) remoteStatus.show('error', clientError, clientField.input.value);
      else if (!url) remoteStatus.show('idle', emcText('Синхронизация отключена.'));
    }
    if (requestedLocal && !url) remoteStatus.show('idle', emcText('Режим хоста'), requestedLocal);
    const refreshHost = async () => {
      if (!requestedLocal) return;
      try {
        const local = await health(requestedLocal);
        if (revision !== current) return;
        liveProfiles.textContent = String(local.players);
        localStatus.show('ready', emcText('Локальный сервер запущен'));
        if (!external) return;
        try {
          const published = await health(external);
          if (revision !== current) return;
          if (published.instance === local.instance) publicStatus.show('ready', emcText('Публичный адрес доступен'), external);
          else publicStatus.show('error', emcText('Публичный адрес ведёт на другой сервер'), external);
        } catch (error) {
          if (revision === current) publicStatus.show('error', emcText('Публичный адрес недоступен'), error.message + ' · ' + external);
        }
      } catch {
        if (revision === current) localStatus.show('error', emcText('Локальный сервер не отвечает.'), requestedLocal);
      }
    };
    const refreshClient = async () => {
      if (!url || clientError || clientBusy) return;
      try {
        const available = await health(url);
        if (revision !== current) return;
        const publishError = cosmeticPublishError(url);
        if (publishError) {
          remoteStatus.show('error', emcText('Публикация внешности не удалась'), publishError + ' · ' + url);
          return;
        }
        const published = cosmeticPublishStatus(url);
        remoteStatus.show(published ? 'ready' : 'waiting', published ? emcText('Внешность опубликована')
          : emcText('Сервер доступен · ожидаем публикацию в онлайне'), (requestedLocal ? emcText('Режим хоста') + ' · ' : '') + url + ' · ' + count(available.players));
      } catch (error) {
        if (revision === current) remoteStatus.show('error', emcText('Связь с сервером потеряна.'), error.message + ' · ' + url);
      }
    };
    await Promise.all([refreshHost(), refreshClient()]);
  }
  syncButtons();
  void host('status').then((state) => {
    localUrl = state?.url ?? null;
    const savedHostUrl = 'http://127.0.0.1:' + (getPref('cosmeticsHostPort') ?? 8793);
    if (!localUrl && getPref('cosmeticsServerUrl') === savedHostUrl) {
      setPref('cosmeticsServerUrl', '');
      clientField.input.value = '';
    }
  })
    .catch((error) => { hostError = emcText(error.message); }).finally(refresh);
  const timer = setInterval(() => {
    if (!card.isConnected) { clearInterval(timer); return; }
    if (!busy) void refresh();
  }, 5000);
  return card;
}

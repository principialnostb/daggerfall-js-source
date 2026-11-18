(() => {
  const call = window.daggerLauncher?.testAccess;
  if (!call) return;
  const get = (id) => document.getElementById('test-' + id);
  const admin = (profile) => ['owner', 'developer'].includes(profile?.role);
  let waitingForUpdate = true;
  document.addEventListener('launcher-update-gate', (event) => {
    waitingForUpdate = event.detail;
    get('emc-form').hidden = waitingForUpdate || !profile || admin(profile);
  });
  let profile, rows = [], confirming, issuedId, busy = false;
  let emcReport;
  document.addEventListener('launcher-emc-progress', ({ detail: transfer }) => {
    for (const bar of document.querySelectorAll('.emc-progress')) {
      bar.hidden = transfer?.stage !== 'downloading';
      if (bar.hidden) continue;
      bar.max = transfer.total;
      bar.value = transfer.received;
    }
    if (!transfer) return;
    const { stage, part, received, total } = transfer;
    const mb = (bytes) => (bytes / 1048576).toFixed(1);
    const label = stage === 'connecting' ? 'Connecting to GitHub for EMC ' + part + '…'
      : stage === 'verifying' ? 'Verifying EMC ' + part + '…'
        : 'Downloading EMC ' + part + ' · ' + mb(received) + ' / ' + mb(total) + ' MiB';
    if (emcReport) emcReport(label);
    else get('play-requirement').textContent = label;
  });
  const status = (message) => { get('status').textContent = message; };
  function display() {
    const search = get('search').value.trim().toLowerCase();
    const filter = get('filter').value;
    const visible = rows.filter((item) => item.label.toLowerCase().includes(search) &&
      (filter === 'all' || (filter === 'revoked') === item.revoked));
    const active = rows.filter((item) => !item.revoked).length;
    get('count').textContent = active + ' active · ' + (rows.length - active) + ' revoked';
    get('empty').hidden = visible.length > 0;
    get('invites').replaceChildren(...visible.map((item) => {
      const row = document.createElement('tr');
      row.insertCell().textContent = item.label;
      const state = row.insertCell();
      state.textContent = item.revoked ? 'Revoked' : 'Active';
      state.className = item.revoked ? 'test-state revoked' : 'test-state';
      const actions = document.createElement('div');
      actions.className = 'test-row-actions';
      row.insertCell().append(actions);
      if (item.revoked) return row;
      if (item.canCopy && confirming !== item.id) {
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'plaque small';
        copy.textContent = 'Copy code';
        copy.setAttribute('aria-label', 'Copy code · ' + item.label);
        copy.addEventListener('click', () => run(async () => {
          await call('copy-existing', item.id);
          status('Invitation copied.');
        }));
        actions.append(copy);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'plaque small test-danger';
      button.textContent = confirming === item.id ? 'Confirm revoke' : 'Revoke';
      button.setAttribute('aria-label', button.textContent + ' · ' + item.label);
      button.addEventListener('click', () => {
        if (confirming !== item.id) {
          confirming = item.id;
          display();
          get('invites').querySelector('[data-confirm]')?.focus();
          return;
        }
        run(async () => {
          await call('revoke', item.id);
          if (issuedId === item.id) clearIssued();
          status('Access revoked for ' + item.label + '.');
          await list();
        });
      });
      actions.append(button);
      if (confirming === item.id) {
        button.dataset.confirm = '';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'plaque small';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => { confirming = null; display(); });
        actions.append(cancel);
      }
      return row;
    }));
  }
  async function list() {
    rows = await call('list');
    confirming = null;
    if (issuedId && !rows.some((item) => item.id === issuedId && !item.revoked)) clearIssued();
    display();
  }
  function draw(value) {
    profile = value;
    const developer = admin(value);
    get('heading').textContent = developer ? 'Test channel' : 'Test access';
    get('button-label').textContent = developer ? 'Test channel' : value?.login ?? 'Test access';
    get('account').hidden = !value;
    for (const image of [get('avatar'), get('badge')]) {
      image.hidden = !value?.avatar;
      if (value?.avatar) image.src = value.avatar;
      else image.removeAttribute('src');
    }
    get('identity').textContent = value ? value.login + ' · ' + value.role : '';
    get('login').hidden = !!value;
    get('admin').hidden = !developer;
    get('emc-form').hidden = waitingForUpdate || !value || developer;
    get('sign-out').hidden = !value;
  }
  async function run(work) {
    if (busy) return;
    busy = true;
    try { await work(); }
    catch (error) { status(requestFailure(error)); }
    finally { busy = false; }
  }
  async function signIn() {
    status('Confirm your GitHub account in the browser if prompted.');
    draw(await call('github-login'));
    status('');
    await list();
  }
  function opened(target) {
    get('dialog').showModal();
    status('');
    run(async () => {
      draw(await call('profile'));
      if (target && !get(target === 'emc' ? 'emc-form' : 'login').hidden) get(target).focus();
      if (admin(profile)) await list();
    });
  }
  function clearIssued() {
    issuedId = null;
    get('issued').value = '';
    get('issued-row').hidden = true;
  }
  function formState(show) {
    get('create').hidden = !show;
    get('new').setAttribute('aria-expanded', String(show));
    if (show) get('label').focus();
  }
  function tab(testers) {
    get('tab-testers').setAttribute('aria-pressed', String(testers));
    get('tab-emc').setAttribute('aria-pressed', String(!testers));
    get('testers').hidden = !testers;
    get('package').hidden = testers;
    status('');
  }
  get('open').addEventListener('click', () => opened());
  get('dock-action').addEventListener('click', () => opened('code'));
  get('close').addEventListener('click', () => get('dialog').close());
  get('github').addEventListener('click', () => run(signIn));
  get('tab-testers').addEventListener('click', () => tab(true));
  get('tab-emc').addEventListener('click', () => tab(false));
  get('search').addEventListener('input', display);
  get('filter').addEventListener('change', display);
  get('refresh').addEventListener('click', () => run(async () => { await list(); status('List refreshed.'); }));
  get('new').addEventListener('click', () => formState(get('create').hidden));
  get('cancel-create').addEventListener('click', () => { formState(false); get('new').focus(); });
  get('redeem').addEventListener('submit', (event) => {
    event.preventDefault();
    run(async () => {
      draw(await call('invite', get('code').value.trim()));
      get('code').value = '';
      status(waitingForUpdate ? 'Invitation activated. Finish updating before installing EMC.' : 'Invitation activated. Paste your temporary EMC link if needed.');
      if (!waitingForUpdate) get('emc').focus();
    });
  });
  get('create').addEventListener('submit', (event) => {
    event.preventDefault();
    run(async () => {
      const label = get('label').value.trim();
      if (!label) { get('label').focus(); return; }
      const result = await call('create', label);
      get('label').value = '';
      formState(false);
      issuedId = result.id;
      get('issued').value = result.code;
      get('issued-row').hidden = false;
      get('copy').focus();
      status('Invitation created for ' + label + '.');
      await list();
    });
  });
  get('copy').addEventListener('click', () => run(async () => {
    await call('copy-existing', issuedId);
    status('Invitation copied.');
  }));
  get('sign-out').addEventListener('click', () => run(async () => {
    await call('sign-out');
    draw(null);
    rows = [];
    confirming = null;
    clearIssued();
    formState(false);
    tab(true);
    status('Signed out.');
  }));
  function requestFailure(error, emc = false) {
    const message = String(error?.message ?? '');
    const status = /GitHub request failed \((\d{3})\)/.exec(message);
    if (status) return 'GitHub access check failed (HTTP ' + status[1] + ').';
    if (/Update required before installing EMC/.test(message)) return 'Finish updating the launcher before installing EMC.';
    if (/Activate a test invitation first/.test(message)) return 'Test access is inactive. Activate your invitation.';
    if (/Invalid invitation/.test(message)) return 'The invitation code is invalid.';
    if (/Invitation unavailable/.test(message)) return 'This invitation is inactive. Contact the administrator.';
    if (/GitHub write access required/.test(message)) return 'Developer access check failed. Sign in again.';
    if (/JSON|Invalid EMC download offer|Invalid URL|Expected a temporary GitHub asset link|complete EMC offer/.test(message)) return 'Invalid EMC offer. Paste the full text copied by the administrator.';
    const refused = /EMC download refused \(HTTP (\d{3})\)/.exec(message);
    if (refused) return 'GitHub refused the EMC download (HTTP ' + refused[1] + '). Check the link and try again.';
    if (/EMC link expired or unavailable/.test(message)) return 'GitHub refused the EMC download. Request a fresh offer.';
    if (/checksum|too large|Invalid EMC|Incomplete EMC|incomplete|Unexpected data/.test(message)) return 'EMC package verification failed. Contact the administrator.';
    if (/ENOSPC/.test(message)) return 'Insufficient disk space for EMC.';
    if (/EACCES|EPERM|EBUSY/.test(message)) return 'Cannot write the EMC files. Check folder permissions and open files.';
    if (/in progress/.test(message)) return 'An EMC installation is already running.';
    const network = /\b(?:net::)?(ERR_[A-Z_]+)\b/.exec(message);
    if (network) return 'GitHub network request failed (' + network[1] + ').';
    if (/timeout|timed out/i.test(message)) return 'The EMC request timed out. Try again.';
    return emc
      ? 'The launcher could not complete the EMC request. Report this message and your launcher version.'
      : 'Test access request failed. Check your connection to GitHub and try again.';
  }
  function bindEmc(form, input, report) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (busy) return;
      run(async () => {
        const button = form.querySelector('button');
        button.disabled = true;
        emcReport = report;
        report('Checking your test access…');
        try {
          const installed = await call('emc', input.value.trim());
          input.value = '';
          report('Installed ' + installed.files + ' EMC files.');
        } catch (error) {
          report(requestFailure(error, true));
        } finally {
          emcReport = null;
          button.disabled = false;
        }
      });
    });
  }
  bindEmc(get('emc-form'), get('emc'), status);
  bindEmc(get('dock-emc'), get('dock-link'), (message) => {
    const feedback = get('dock-feedback');
    feedback.textContent = message;
    feedback.hidden = false;
  });
  get('dock-retry').addEventListener('click', () => run(() => call('emc-retry')));
  get('emc-link').addEventListener('click', () => run(async () => {
    const result = await call('emc-link');
    status(result.error ?? 'Temporary EMC offer copied.');
  }));
  call('enabled').then(async (enabled) => {
    get('open').hidden = !enabled;
    if (!enabled) return;
    if (await call('open-developer')) {
      get('dialog').showModal();
      await run(signIn);
    } else await run(async () => draw(await call('profile')));
  }).catch(() => {});
})();

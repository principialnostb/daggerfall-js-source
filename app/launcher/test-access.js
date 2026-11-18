(() => {
  const call = window.daggerLauncher?.testAccess;
  if (!call) return;
  const get = (id) => document.getElementById('test-' + id);
  const admin = (profile) => ['owner', 'developer'].includes(profile?.role);
  let mode, profile, rows = [], confirming, busy = false;
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
    get('redeem').hidden = mode !== 'public';
    get('admin').hidden = !developer;
    get('emc-form').hidden = mode !== 'public' || value?.role !== 'tester';
    get('sign-out').hidden = !value;
  }
  async function run(work) {
    if (busy) return;
    busy = true;
    try { await work(); }
    catch { status('Request failed. Check your connection and access, then try again.'); }
    finally { busy = false; }
  }
  async function signIn() {
    status('Confirm your GitHub account in the browser if prompted.');
    draw(await call('github-login'));
    status('');
    await list();
  }
  function opened() {
    get('dialog').showModal();
    status('');
    run(async () => {
      draw(await call('profile'));
      if (admin(profile)) await list();
    });
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
  get('open').addEventListener('click', opened);
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
      status('Invitation activated.');
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
      get('issued').value = result.code;
      get('issued-row').hidden = false;
      get('copy').focus();
      status('Invitation created for ' + label + '.');
      await list();
    });
  });
  get('copy').addEventListener('click', () => run(async () => {
    await call('copy-invite', get('issued').value);
    status('Invitation copied.');
  }));
  get('sign-out').addEventListener('click', () => run(async () => {
    await call('sign-out');
    draw(null);
    rows = [];
    confirming = null;
    get('issued').value = '';
    get('issued-row').hidden = true;
    formState(false);
    tab(true);
    status('Signed out.');
  }));
  get('emc-form').addEventListener('submit', (event) => {
    event.preventDefault();
    run(async () => {
      status('Downloading EMC…');
      const installed = await call('emc', get('emc').value.trim());
      get('emc').value = '';
      status('Installed ' + installed.files + ' EMC files. Restart the game to use them.');
    });
  });
  get('emc-link').addEventListener('click', () => run(async () => {
    await call('emc-link');
    status('Temporary EMC offer copied.');
  }));
  call('enabled').then(async (enabled) => {
    mode = enabled;
    get('open').hidden = !enabled;
    if (!enabled) return;
    if (await call('open-developer')) {
      get('dialog').showModal();
      await run(signIn);
    } else draw(await call('profile'));
  }).catch(() => {});
})();

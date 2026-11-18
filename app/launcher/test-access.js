(() => {
  const bridge = window.daggerLauncher;
  if (!bridge?.testAccess) return;
  const get = (id) => document.getElementById('test-' + id);
  const call = bridge.testAccess;
  let loginAttempt = 0;
  const status = (text) => { get('status').textContent = text; };
  async function list() {
    const invites = await call('list');
    get('invites').replaceChildren(...invites.map((invite) => {
      const row = document.createElement('li');
      const state = invite.active ? 'Active' : invite.revoked ? 'Revoked' : invite.activated ? 'Activated' : invite.expires * 1000 < Date.now() ? 'Expired' : 'Pending';
      row.textContent = invite.label + ' · ' + state + (invite.creator ? ' · ' + invite.creator : '') + ' ';
      if (invite.revoked) return row;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Revoke';
      button.addEventListener('click', () => run(async () => { await call('revoke', invite.id); await list(); }));
      row.append(button);
      return row;
    }));
  }
  function draw(value) {
    get('button-label').textContent = value?.login ?? 'Test access';
    get('badge').hidden = !value?.avatar;
    if (value?.avatar) get('badge').src = value.avatar;
    else get('badge').removeAttribute('src');
    get('identity').textContent = value ? value.login + ' · ' + value.role : '';
    get('avatar').hidden = !value?.avatar;
    if (value?.avatar) get('avatar').src = value.avatar;
    else get('avatar').removeAttribute('src');
    get('sign-out').hidden = !value;
    get('admin').hidden = !['owner', 'developer'].includes(value?.role);
  }
  async function run(work) {
    try { await work(); } catch { status('The request failed. Check your access and try again.'); }
  }
  function opened() {
    get('dialog').showModal();
    status('');
    run(async () => {
      draw(await call('profile'));
      if (!get('admin').hidden) await list();
    });
  }
  get('open').addEventListener('click', opened);
  get('dialog').addEventListener('close', () => { loginAttempt++; });
  get('close').addEventListener('click', () => get('dialog').close());
  get('github').addEventListener('click', () => run(async () => {
    const attempt = ++loginAttempt;
    const flow = await call('github');
    if (attempt !== loginAttempt) return;
    status('Enter this code on GitHub: ' + flow.code);
    let interval = flow.interval;
    while (attempt === loginAttempt) {
      await new Promise((resolve) => setTimeout(resolve, interval * 1000));
      if (attempt !== loginAttempt) return;
      const result = await call('poll');
      if (attempt !== loginAttempt || !result) return;
      if (result.pending) { interval = result.interval; continue; }
      draw(result);
      await list();
      status('Signed in.');
      break;
    }
  }));
  get('redeem').addEventListener('submit', (event) => {
    event.preventDefault();
    run(async () => {
      loginAttempt++;
      draw(await call('invite', get('code').value.trim()));
      get('code').value = '';
      status('Invitation activated.');
    });
  });
  get('create').addEventListener('submit', (event) => {
    event.preventDefault();
    run(async () => {
      const result = await call('create', get('label').value.trim());
      get('label').value = '';
      get('issued').value = result.code;
      get('issued').hidden = false;
      get('issued').select();
      await list();
    });
  });
  get('sign-out').addEventListener('click', () => run(async () => {
    loginAttempt++;
    await call('sign-out');
    draw(null);
    get('issued').value = '';
    get('issued').hidden = true;
    status('Signed out.');
  }));
  get('github-token-form').addEventListener('submit', (event) => {
    event.preventDefault();
    run(async () => {
      const token = get('github-token').value;
      get('github-token').value = '';
      draw(await call('github-token', token));
      await list();
    });
  });
  get('emc-form').addEventListener('submit', (event) => {
    event.preventDefault();
    run(async () => {
      const offer = get('emc').value;
      get('emc').value = '';
      status('Downloading EMC…');
      const installed = await call('emc', offer);
      status('Installed ' + installed.files + ' EMC files. Restart the game to use them.');
    });
  });
  get('emc-link').addEventListener('click', () => run(async () => {
    await call('emc-link');
    status('Temporary EMC offer copied.');
  }));
  call('enabled').then(async (enabled) => {
    const publicChannel = typeof enabled === 'string' && enabled.startsWith('public');
    get('github').hidden = enabled !== 'public-browser';
    get('github-token-form').hidden = !publicChannel;
    get('emc-form').hidden = !publicChannel;
    get('emc-link').hidden = !publicChannel;
    get('open').hidden = !enabled;
    if (enabled) draw(await call('profile'));
  }).catch(() => {});
})();

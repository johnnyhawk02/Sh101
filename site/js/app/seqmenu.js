// Shyoy: Sequencer Randomise and Tools menus and their key commands.
// ---------- Randomise and Tools menus, and their key commands (from the 303 app's seqmenu.js) ----------
// Johnny: the pattern buttons live in two menus at the right of the pattern row. Every item has a key, shown in the
// menu, and they are the TB-303 app's keys (v0.22.1): plain letters, Shift for the gentler Alter versions, I for
// Shyoy's Ties, E for the Gate menu. Letters play notes too, so the letter keys work on the Sequencer page (where they
// win over the note keys); elsewhere hold Option/Alt with them. Matched on e.code because Option+A types "å" on a Mac.
// Copy, Paste and Undo are Cmd on a Mac, Ctrl elsewhere.
(() => {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const MENUS = [['rm-btn', 'rm-menu'], ['tm-btn', 'tm-menu'], ['gm-btn', 'gm-menu']].map(([b, m]) => ({ btn: document.getElementById(b), menu: document.getElementById(m) }));
  const items = (M) => [...M.menu.querySelectorAll('button:not(:disabled)')];
  const open = (M, on) => {
    for (const o of MENUS) if (o !== M || !on) { o.menu.hidden = true; o.btn.setAttribute('aria-expanded', 'false'); }
    if (on) { M.menu.hidden = false; M.btn.setAttribute('aria-expanded', 'true'); items(M)[0]?.focus(); }
  };
  const closeAll = () => { for (const M of MENUS) if (!M.menu.hidden) open(M, false); };
  const toggle = (i) => () => open(MENUS[i], MENUS[i].menu.hidden);
  const click = (id) => () => { const b = document.getElementById(id); if (b && !b.disabled) b.click(); };
  // id: the element that runs (a real button with its own onclick) and shows the key; code, alt, shift, cmd: the key
  const ACTS = [
    ['rm-btn', 'KeyR', ''], ['tm-btn', 'KeyT', ''], ['gm-btn', 'KeyE', ''],
    ['r-acc', 'KeyA', ''], ['r-slide', 'KeyS', ''], ['r-oct', 'KeyO', ''], ['r-tie', 'KeyI', ''],
    ['a-acc', 'KeyA', 'shift'], ['a-slide', 'KeyS', 'shift'], ['a-oct', 'KeyO', 'shift'], ['a-tie', 'KeyI', 'shift'], ['a-all', 'KeyL', ''],
    ['p-shuf', 'KeyH', ''], ['p-rnd', 'KeyG', ''], ['p-refill', 'KeyG', 'shift'],
    ['p-copy', 'KeyC', 'cmd'], ['p-paste', 'KeyV', 'cmd'], ['p-dup', 'KeyD', ''], ['p-clr', 'Backspace', 'shift'], ['p-undo', 'KeyZ', 'cmd'],
    // move notes: plain keys, since ] [ , and . aren't note keys
    ['nu-up', 'BracketRight', ''], ['nu-dn', 'BracketLeft', ''], ['nu-oup', 'BracketRight', 'shift'], ['nu-odn', 'BracketLeft', 'shift'],
    ['rot-l', 'Comma', ''], ['rot-r', 'Period', ''],
    ['p-join', 'KeyJ', ''],
  ].map(([id, code, mods]) => ({ id, code, cmd: mods.includes('cmd'), shift: mods.includes('shift'), alt: mods.includes('alt'),
    run: id === 'rm-btn' ? toggle(0) : id === 'tm-btn' ? toggle(1) : id === 'gm-btn' ? toggle(2) : click(id) }));
  [['nu-up', 1], ['nu-dn', -1], ['nu-oup', 12], ['nu-odn', -12]].forEach(([id, d]) => { document.getElementById(id).onclick = () => nudgeNotes(d); });
  [['rot-l', -1], ['rot-r', 1]].forEach(([id, k]) => { document.getElementById(id).onclick = () => rotateSteps(k); });
  const keyName = (a) => {
    const k = a.code === 'Backspace' ? (mac ? '⌫' : 'Backspace') : { BracketRight: ']', BracketLeft: '[', Comma: ',', Period: '.' }[a.code] || a.code.slice(3);
    return mac ? (a.cmd ? '⌘' : '') + (a.shift ? '⇧' : '') + (a.alt ? '⌥' : '') + k
               : (a.cmd ? 'Ctrl+' : '') + (a.shift ? 'Shift+' : '') + (a.alt ? 'Alt+' : '') + k;
  };
  for (const a of ACTS) { const el = document.getElementById(a.id); if (el.closest('.fn-menu')) el.insertAdjacentHTML('beforeend', `<kbd>${keyName(a)}</kbd>`); }
  MENUS.forEach((M, i) => {
    M.btn.onclick = toggle(i);
    // capture: the menu closes before the item's own onclick runs it
    M.menu.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) open(M, false); }, true);
    M.menu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); open(M, false); M.btn.focus(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        const it = items(M); if (!it.length) return;
        const j = it.indexOf(document.activeElement), d = e.key === 'ArrowDown' ? 1 : -1;
        it[j < 0 ? (d > 0 ? 0 : it.length - 1) : (j + d + it.length) % it.length].focus();
      }
    });
  });
  // Gate menu: each choice sets the (hidden) Gate slider and fires its input, so the gate code path is the same as before
  for (const b of document.querySelectorAll('#gm-menu [data-gate]')) b.onclick = () => {
    const el = document.querySelector('input[data-a=gate]'); el.value = b.dataset.gate; el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.rmenu')) closeAll(); });
  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.isComposing || typing(e.target) || e.target.matches?.('input[type=number], select')) return;
    const c = mac ? e.metaKey : e.ctrlKey, other = mac ? e.ctrlKey : e.metaKey;
    if (other) return;
    if (document.querySelector('dialog[open]')) return;
    // letter keys: plain on the Sequencer page (and then no note sounds), or with Option/Alt on any page
    const letter = (a) => a.code.startsWith('Key') && !a.cmd;
    const seqPage = document.getElementById('unit').dataset.view === 'tab-seq';
    const a = ACTS.find((a) => a.code === e.code && a.cmd === c && a.shift === e.shiftKey && (letter(a) ? e.altKey || seqPage : !e.altKey));
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    if (!/^(rm|tm|gm)-btn$/.test(a.id)) closeAll();
    a.run();
  });
})();
renderBank();

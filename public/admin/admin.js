(function () {
  const $ = (s) => document.querySelector(s);
  const MAX_UPLOAD = 3 * 1024 * 1024;

  let posts = [];
  let state = null; // { isNew, originalSlug, slugTouched, data, blocks }

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    for (const k in (attrs || {})) {
      const v = attrs[k];
      if (v === undefined || v === null) continue;
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of [].concat(children == null ? [] : children)) {
      if (c == null) continue;
      n.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return n;
  }

  function toast(msg, ok = true) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast ' + (ok ? 'ok' : 'err');
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 2800);
  }

  // Path gambar dari server bisa berupa /api/media/... atau img/... (statis)
  function imgUrl(p) { return p.startsWith('/') ? p : '/' + p; }

  async function api(path, opts = {}) {
    const { method = 'GET', body, raw } = opts;
    const headers = { 'X-Requested-With': 'admin' };
    let payload;
    if (raw) { headers['Content-Type'] = raw.type; payload = raw; }
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch('/api/admin' + path, { method, headers, body: payload, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Gagal');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // Menjalankan aksi dengan penanganan error terpusat. Sesi habis → tampilkan login.
  async function run(fn, okMsg) {
    try {
      const r = await fn();
      if (okMsg) toast(okMsg);
      return r;
    } catch (err) {
      if (err.status === 401) { showLogin('Sesi habis, silakan masuk lagi.'); return undefined; }
      toast(err.message, false);
      return undefined;
    }
  }

  function showLogin(msg) {
    $('#app-view').hidden = true;
    $('#nav-links').hidden = true;
    $('#login-view').hidden = false;
    const p = $('#login-err');
    p.textContent = msg || '';
    p.hidden = !msg;
  }

  function showApp() {
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    $('#nav-links').hidden = false;
  }

  function slugify(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  }

  function newBlock(type) {
    if (type === 'ul') return { type, items: [] };
    if (type === 'img') return { type, src: '', alt: '', caption: '' };
    return { type, text: '' };
  }

  async function uploadImage(file) {
    if (file.size > MAX_UPLOAD) throw Object.assign(new Error('Ukuran maksimal 3 MB'), { status: 0 });
    const r = await api('/upload', { method: 'POST', raw: file });
    return r.path;
  }

  async function uploadAndReport(file) {
    if (file.size > MAX_UPLOAD) { toast('Ukuran maksimal 3 MB', false); return undefined; }
    return run(() => uploadImage(file), 'Gambar diunggah');
  }

  async function loadList() {
    const data = await api('/posts');
    posts = data.posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    renderList();
  }

  function renderList() {
    const items = posts.map((p) => {
      const active = state && !state.isNew && state.originalSlug === p.slug;
      return el('li', { class: active ? 'active' : '' }, [
        el('button', { class: 'linkish', type: 'button', onclick: () => openPost(p.slug) }, [
          el('span', { class: 't' }, p.title),
          el('span', { class: 'd' }, (p.date || '') + (p.draft ? ' · draft' : '')),
        ]),
      ]);
    });
    if (!items.length) items.push(el('li', { class: 'd' }, 'Belum ada tulisan.'));
    $('#post-list').replaceChildren(...items);
  }

  function newPost() {
    state = {
      isNew: true, originalSlug: null, slugTouched: false,
      data: { title: '', slug: '', date: new Date().toISOString().slice(0, 10), category: '', excerpt: '', cover: '', draft: false },
      blocks: [newBlock('p')],
    };
    renderEditor();
    renderList();
  }

  function openPost(slug) {
    const p = posts.find((x) => x.slug === slug);
    if (!p) return;
    state = {
      isNew: false, originalSlug: slug, slugTouched: true,
      data: {
        title: p.title || '', slug: p.slug || '', date: p.date || '', category: p.category || '',
        excerpt: p.excerpt || '', cover: p.cover || '', draft: !!p.draft,
      },
      blocks: JSON.parse(JSON.stringify(p.body || [])),
    };
    renderEditor();
    renderList();
  }

  function renderEditor() {
    const d = state.data;
    const field = (label, input) => el('label', { class: 'field' }, [el('span', null, label), input]);

    const slugInput = el('input', { type: 'text', value: d.slug, oninput: (e) => { d.slug = e.target.value; state.slugTouched = true; } });
    const titleInput = el('input', {
      type: 'text', value: d.title,
      oninput: (e) => {
        d.title = e.target.value;
        if (state.isNew && !state.slugTouched) { d.slug = slugify(d.title); slugInput.value = d.slug; }
      },
    });
    const dateInput = el('input', { type: 'date', value: d.date, oninput: (e) => (d.date = e.target.value) });
    const catInput = el('input', { type: 'text', value: d.category, oninput: (e) => (d.category = e.target.value) });
    const excerptInput = el('textarea', { rows: 2, oninput: (e) => (d.excerpt = e.target.value) }, d.excerpt);

    const coverPreview = el('div', { class: 'cover-preview' }, d.cover
      ? el('img', { src: imgUrl(d.cover), alt: '' })
      : el('span', { class: 'd' }, 'Belum ada sampul'));
    const coverFile = el('input', {
      type: 'file', accept: 'image/jpeg,image/png,image/webp',
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const path = await uploadAndReport(f);
        if (path) { d.cover = path; coverPreview.replaceChildren(el('img', { src: imgUrl(path), alt: '' })); }
      },
    });

    const draftInput = el('input', { type: 'checkbox', onchange: (e) => (d.draft = e.target.checked) });
    draftInput.checked = !!d.draft;

    const blocksBox = el('div', { class: 'blocks' });
    renderBlocks(blocksBox);

    const addBar = el('div', { class: 'add-bar' },
      [['p', '+ Paragraf'], ['h2', '+ Subjudul'], ['ul', '+ Daftar'], ['quote', '+ Kutipan'], ['img', '+ Gambar']]
        .map(([t, label]) => el('button', {
          class: 'btn btn-ghost small', type: 'button',
          onclick: () => { state.blocks.push(newBlock(t)); renderBlocks(blocksBox); },
        }, label)));

    const viewLink = !state.isNew && !d.draft
      ? el('a', { class: 'btn btn-ghost small', href: '/post.html?slug=' + encodeURIComponent(d.slug), target: '_blank' }, 'Lihat')
      : null;
    const delBtn = state.isNew ? null
      : el('button', { class: 'btn btn-ghost small danger', type: 'button', onclick: del }, 'Hapus');
    const saveBtn = el('button', { class: 'btn btn-primary', type: 'button', onclick: save }, 'Simpan');

    $('#editor').replaceChildren(
      el('div', { class: 'form-head' }, [
        el('h2', null, state.isNew ? 'Tulisan baru' : 'Edit tulisan'),
        el('div', { class: 'row' }, [viewLink, delBtn, saveBtn]),
      ]),
      el('div', { class: 'grid2' }, [field('Judul', titleInput), field('Slug (alamat URL)', slugInput)]),
      el('div', { class: 'grid2' }, [field('Tanggal', dateInput), field('Kategori', catInput)]),
      field('Ringkasan', excerptInput),
      el('div', { class: 'field' }, [el('span', null, 'Sampul'), coverPreview, coverFile]),
      el('label', { class: 'check' }, [draftInput, 'Simpan sebagai draft (tidak tampil di situs)']),
      el('h3', null, 'Isi tulisan'),
      blocksBox,
      addBar,
    );
  }

  function renderBlocks(box) {
    box.replaceChildren();
    state.blocks.forEach((b, i) => {
      const typeSel = el('select', {
        onchange: (e) => {
          const t = e.target.value;
          const textual = ['p', 'h2', 'quote'];
          const keep = textual.includes(t) && textual.includes(b.type) ? { text: b.text } : {};
          state.blocks[i] = { ...newBlock(t), ...keep };
          renderBlocks(box);
        },
      }, [['p', 'Paragraf'], ['h2', 'Subjudul'], ['ul', 'Daftar'], ['quote', 'Kutipan'], ['img', 'Gambar']]
        .map(([v, l]) => el('option', { value: v }, l)));
      typeSel.value = b.type;

      let body;
      if (b.type === 'ul') {
        body = el('textarea', {
          rows: 3, placeholder: 'Satu poin per baris',
          oninput: (e) => (b.items = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)),
        }, (b.items || []).join('\n'));
      } else if (b.type === 'img') {
        const preview = el('div', { class: 'img-preview' }, b.src
          ? el('img', { src: imgUrl(b.src), alt: '' })
          : el('span', { class: 'd' }, 'Belum ada gambar'));
        const file = el('input', {
          type: 'file', accept: 'image/jpeg,image/png,image/webp',
          onchange: async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            const path = await uploadAndReport(f);
            if (path) { b.src = path; preview.replaceChildren(el('img', { src: imgUrl(path), alt: '' })); }
          },
        });
        body = el('div', { class: 'block-body' }, [
          preview, file,
          el('input', { type: 'text', placeholder: 'Teks alternatif (alt)', value: b.alt || '', oninput: (e) => (b.alt = e.target.value) }),
          el('input', { type: 'text', placeholder: 'Keterangan gambar (opsional)', value: b.caption || '', oninput: (e) => (b.caption = e.target.value) }),
        ]);
      } else {
        body = el('textarea', {
          rows: b.type === 'p' || b.type === 'quote' ? 4 : 2,
          placeholder: b.type === 'h2' ? 'Judul subbagian' : 'Tulis di sini…',
          oninput: (e) => (b.text = e.target.value),
        }, b.text || '');
      }

      const move = (dir) => {
        const j = i + dir;
        if (j < 0 || j >= state.blocks.length) return;
        [state.blocks[i], state.blocks[j]] = [state.blocks[j], state.blocks[i]];
        renderBlocks(box);
      };

      box.append(el('div', { class: 'block' }, [
        el('div', { class: 'block-head' }, [
          typeSel,
          el('div', { class: 'row' }, [
            el('button', { class: 'icon', type: 'button', title: 'Naik', onclick: () => move(-1) }, '↑'),
            el('button', { class: 'icon', type: 'button', title: 'Turun', onclick: () => move(1) }, '↓'),
            el('button', { class: 'icon danger', type: 'button', title: 'Hapus', onclick: () => { state.blocks.splice(i, 1); renderBlocks(box); } }, '✕'),
          ]),
        ]),
        body,
      ]));
    });
  }

  function collect() {
    const d = state.data;
    const body = state.blocks.map((b) => {
      if (b.type === 'ul') return { type: 'ul', items: b.items || [] };
      if (b.type === 'img') {
        const o = { type: 'img', src: b.src || '', alt: b.alt || '' };
        if (b.caption) o.caption = b.caption;
        return o;
      }
      return { type: b.type, text: b.text || '' };
    });
    return {
      slug: (d.slug || '').trim(),
      title: (d.title || '').trim(),
      date: d.date,
      category: (d.category || '').trim(),
      excerpt: (d.excerpt || '').trim(),
      cover: d.cover || '',
      draft: !!d.draft,
      body,
    };
  }

  async function save() {
    const r = await run(() => api('/posts', {
      method: 'POST',
      body: { post: collect(), original_slug: state.isNew ? null : state.originalSlug },
    }), 'Tersimpan');
    if (!r) return;
    state.isNew = false;
    state.originalSlug = r.slug;
    state.data.slug = r.slug;
    await loadList();
    openPost(r.slug);
  }

  async function del() {
    if (!confirm('Hapus tulisan ini? Tindakan ini tidak bisa dibatalkan.')) return;
    const r = await run(() => api('/posts/delete', { method: 'POST', body: { slug: state.originalSlug } }), 'Tulisan dihapus');
    if (!r) return;
    state = null;
    $('#editor').replaceChildren(el('p', { class: 'empty' }, 'Pilih tulisan atau buat yang baru.'));
    await loadList();
  }

  $('#new-post').addEventListener('click', newPost);

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = e.target.password.value;
    try {
      await api('/login', { method: 'POST', body: { password } });
      e.target.password.value = '';
      showApp();
      await loadList();
    } catch (err) {
      showLogin(err.message);
    }
  });

  $('#logout').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/logout', { method: 'POST', body: {} }).catch(() => {});
    state = null;
    showLogin();
  });

  (async function boot() {
    try {
      await api('/session');
      showApp();
      await loadList();
    } catch (err) {
      showLogin();
    }
  })();
})();

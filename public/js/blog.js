// Blog engine: membaca data/posts.json dan merender daftar serta artikel.
(function () {
  const page = document.body.dataset.page;

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    return node;
  }

  function fmtDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function postCard(post) {
    const card = el('div', { class: 'card' });
    const link = el('a', { class: 'card-link', href: 'post.html?slug=' + encodeURIComponent(post.slug) });
    if (post.cover) {
      const cover = el('div', { class: 'cover' });
      cover.appendChild(el('img', { src: post.cover, alt: post.title, loading: 'lazy' }));
      link.appendChild(cover);
    }
    const body = el('div', { class: 'card-body' });
    body.appendChild(el('div', { class: 'meta' }, fmtDate(post.date) + (post.category ? ' · ' + post.category : '')));
    body.appendChild(el('h3', null, post.title));
    if (post.excerpt) body.appendChild(el('p', null, post.excerpt));
    link.appendChild(body);
    card.appendChild(link);
    return card;
  }

  function renderBlock(block) {
    switch (block.type) {
      case 'h2': return el('h2', null, block.text);
      case 'ul': {
        const ul = el('ul');
        (block.items || []).forEach(i => ul.appendChild(el('li', null, i)));
        return ul;
      }
      case 'img': {
        const fig = el('figure');
        fig.appendChild(el('img', { src: block.src, alt: block.alt || '', loading: 'lazy' }));
        if (block.caption) fig.appendChild(el('figcaption', null, block.caption));
        return fig;
      }
      case 'quote': return el('blockquote', null, block.text);
      default: return el('p', null, block.text);
    }
  }

  async function loadPosts() {
    const res = await fetch('/api/posts', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Gagal memuat /api/posts');
    const posts = await res.json();
    return posts.filter(p => !p.draft).sort((a, b) => b.date.localeCompare(a.date));
  }

  function empty(container, msg) {
    container.appendChild(el('p', { class: 'empty' }, msg));
  }

  loadPosts().then(posts => {
    if (page === 'home') {
      const box = document.getElementById('latest');
      if (!posts.length) return empty(box, 'Belum ada tulisan.');
      posts.slice(0, 3).forEach(p => box.appendChild(postCard(p)));
    }

    if (page === 'blog') {
      const box = document.getElementById('list');
      if (!posts.length) return empty(box, 'Belum ada tulisan.');
      posts.forEach(p => box.appendChild(postCard(p)));
    }

    if (page === 'post') {
      const slug = new URLSearchParams(location.search).get('slug');
      const post = posts.find(p => p.slug === slug);
      const box = document.getElementById('article');
      if (!post) {
        box.appendChild(el('h1', null, 'Tulisan tidak ditemukan'));
        return empty(box, 'Periksa kembali alamat tautannya.');
      }
      document.title = post.title + ' — Fandy';
      box.appendChild(el('a', { class: 'back', href: 'blog.html' }, '← kembali ke blog'));
      box.appendChild(el('h1', null, post.title));
      box.appendChild(el('div', { class: 'post-meta' }, fmtDate(post.date) + (post.category ? ' · ' + post.category : '')));
      if (post.cover) box.appendChild(el('img', { class: 'cover-img', src: post.cover, alt: post.title }));
      (post.body || []).forEach(b => box.appendChild(renderBlock(b)));
    }
  }).catch(err => {
    const box = document.getElementById('latest') || document.getElementById('list') || document.getElementById('article');
    if (box) empty(box, 'Konten belum bisa dimuat. Muat ulang halaman.');
    console.error(err);
  });
})();

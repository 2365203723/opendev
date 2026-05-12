const $ = (sel) => document.querySelector(sel);

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
    body: opts?.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status, data });
  return data;
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

async function loadMe() {
  const me = await api('/api/me');
  $('#me-name').textContent = me.name;
  $('#me-bio').textContent = me.bio;
  $('#avatar').textContent = me.name.charAt(0).toUpperCase();
  const nav = $('#social');
  nav.innerHTML = '';
  (me.social || []).forEach(s => {
    const a = document.createElement('a');
    a.href = s.url; a.textContent = s.label;
    if (!s.url.startsWith('mailto:')) a.target = '_blank';
    nav.appendChild(a);
  });
}

async function loadPosts() {
  const list = $('#posts-list');
  list.innerHTML = '';
  const posts = await api('/api/posts');
  for (const p of posts) {
    const li = document.createElement('li');
    li.className = 'post-card';
    li.dataset.id = p.id;
    const h3 = document.createElement('h3'); h3.textContent = p.title;
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.textContent = `${fmtDate(p.published_at)} · 阅读 ${p.views} · 点赞 ${p.likes} · 留言 ${p.comment_count}`;
    const exc = document.createElement('p'); exc.textContent = p.excerpt;
    li.append(h3, meta, exc);
    li.addEventListener('click', () => openPost(p.id));
    list.appendChild(li);
  }
}

let currentPostId = null;

async function openPost(id) {
  currentPostId = id;
  const post = await api(`/api/posts/${encodeURIComponent(id)}`);

  const body = $('#post-body');
  body.innerHTML = '';
  const h = document.createElement('h3'); h.textContent = post.title;
  const meta = document.createElement('div'); meta.className = 'meta';
  meta.textContent = `${fmtDate(post.published_at)} · 阅读 ${post.views}`;
  const bodyEl = document.createElement('div'); bodyEl.className = 'body'; bodyEl.textContent = post.body;
  body.append(h, meta, bodyEl);

  const actions = $('#post-actions');
  actions.innerHTML = '';
  const likeBtn = document.createElement('button');
  likeBtn.textContent = `❤ 点赞 (${post.likes})`;
  likeBtn.addEventListener('click', async () => {
    try {
      const r = await api(`/api/posts/${encodeURIComponent(id)}/like`, { method: 'POST' });
      likeBtn.textContent = `❤ 点赞 (${r.likes})`;
      if (r.alreadyLiked) likeBtn.disabled = true;
    } catch (e) { alert('点赞失败：' + e.message); }
  });
  actions.append(likeBtn);

  await loadComments(id);
  $('#posts').hidden = true;
  $('#contact').hidden = true;
  $('#about').hidden = true;
  $('#post-detail').hidden = false;
  window.scrollTo(0, 0);
}

async function loadComments(id) {
  const list = $('#comments-list');
  list.innerHTML = '';
  const rows = await api(`/api/posts/${encodeURIComponent(id)}/comments`);
  if (!rows.length) {
    const empty = document.createElement('li'); empty.className = 'muted'; empty.textContent = '还没有留言，来抢沙发？';
    list.appendChild(empty); return;
  }
  for (const c of rows) {
    const li = document.createElement('li');
    const head = document.createElement('div');
    const name = document.createElement('span'); name.className = 'author'; name.textContent = c.name;
    const time = document.createElement('span'); time.className = 'time'; time.textContent = fmtDate(c.created_at);
    head.append(name, time);
    const body = document.createElement('div'); body.className = 'content'; body.textContent = c.content;
    li.append(head, body);
    list.appendChild(li);
  }
}

$('#back-btn').addEventListener('click', () => {
  currentPostId = null;
  $('#post-detail').hidden = true;
  $('#posts').hidden = false;
  $('#contact').hidden = false;
  $('#about').hidden = false;
  loadPosts();
});

$('#comment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const hint = $('#comment-hint'); hint.className = 'hint'; hint.textContent = '';
  if (!currentPostId) return;
  const fd = new FormData(e.target);
  try {
    await api(`/api/posts/${encodeURIComponent(currentPostId)}/comments`, {
      method: 'POST',
      body: { name: fd.get('name'), content: fd.get('content') }
    });
    e.target.reset();
    hint.classList.add('ok'); hint.textContent = '留言已提交';
    await loadComments(currentPostId);
  } catch (err) {
    hint.classList.add('err');
    hint.textContent = err.status === 429 ? '留言过于频繁，请稍后再试' : ('提交失败：' + err.message);
  }
});

$('#contact-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const hint = $('#contact-hint'); hint.className = 'hint'; hint.textContent = '';
  const fd = new FormData(e.target);
  try {
    await api('/api/contact', {
      method: 'POST',
      body: { name: fd.get('name'), email: fd.get('email'), message: fd.get('message') }
    });
    e.target.reset();
    hint.classList.add('ok'); hint.textContent = '已发送，感谢留言';
  } catch (err) {
    hint.classList.add('err');
    hint.textContent = err.status === 429 ? '提交过于频繁，请稍后再试' : ('发送失败：' + err.message);
  }
});

loadMe().catch(e => console.error(e));
loadPosts().catch(e => console.error(e));

const tokenKey = 'shiz_access_token';
let currentUser = null;
let currentEventId = null;

function getToken() {
  return localStorage.getItem(tokenKey);
}

function setToken(token) {
  localStorage.setItem(tokenKey, token);
}

function clearToken() {
  localStorage.removeItem(tokenKey);
}

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

function show(element, visible) {
  if (element) {
    element.classList.toggle('hidden', !visible);
  }
}

function isAdmin() {
  return currentUser && ['admin', 'superadmin'].includes(currentUser.role);
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || 'Ошибка запроса');
  }
  return data;
}

async function checkHealth() {
  if (!document.getElementById('api-status')) {
    return;
  }
  try {
    const data = await apiRequest('/api/health', { headers: {} });
    setText('api-status', `Backend: ${data.status}`);
  } catch {
    setText('api-status', 'Backend: недоступен');
  }
}

async function checkAuth() {
  if (!document.getElementById('auth-status')) {
    return;
  }
  if (!getToken()) {
    currentUser = null;
    setText('auth-status', 'Вы не вошли.');
    updateAuthUi();
    return;
  }
  try {
    currentUser = await apiRequest('/api/auth/me');
    setText('auth-status', `Вы вошли как ${currentUser.username} (${currentUser.role}).`);
  } catch {
    currentUser = null;
    clearToken();
    setText('auth-status', 'Сессия недействительна. Войдите снова.');
  }
  updateAuthUi();
}

function updateAuthUi() {
  const isLoggedIn = Boolean(currentUser);
  show(document.getElementById('login-link'), !isLoggedIn);
  show(document.getElementById('register-link'), !isLoggedIn);
  show(document.getElementById('logout-button'), isLoggedIn);
  show(document.getElementById('user-panel'), isLoggedIn);
  show(document.getElementById('admin-panel'), isAdmin());
}

function bindLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) {
    return;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: formData.get('username'),
          password: formData.get('password'),
        }),
      });
      setToken(data.access_token);
      setText('form-status', `Вход выполнен: ${data.user.username}`);
      window.location.href = '/';
    } catch (error) {
      setText('form-status', error.message);
    }
  });
}

function bindRegisterForm() {
  const form = document.getElementById('register-form');
  if (!form) {
    return;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    try {
      const user = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: formData.get('username'),
          email: formData.get('email'),
          password: formData.get('password'),
        }),
      });
      setText('form-status', `Пользователь создан: ${user.username}. Теперь можно войти.`);
      form.reset();
    } catch (error) {
      setText('form-status', error.message);
    }
  });
}

function bindLogout() {
  const button = document.getElementById('logout-button');
  if (!button) {
    return;
  }
  button.addEventListener('click', async () => {
    try {
      if (getToken()) {
        await apiRequest('/api/auth/logout', { method: 'POST' });
      }
    } catch {
      // Logout is client-side for stateless JWT; stale server errors are ignored.
    } finally {
      currentUser = null;
      clearToken();
      setText('auth-status', 'Вы вышли.');
      updateAuthUi();
      renderEventDetail(null);
      loadFeed();
    }
  });
}

function statusLabel(status) {
  const labels = {
    proposed: 'предложено',
    voting: 'голосование',
    discussion: 'обсуждение',
    accepted: 'принято',
    rejected: 'отклонено',
    completed: 'завершено',
  };
  return labels[status] || status;
}

function renderFeedItem(item) {
  if (item.type === 'admin_post') {
    return `
      <article class="feed-card admin-post">
        <div class="card-meta">Пост администратора · ${escapeHtml(item.author?.username)}</div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.body)}</p>
      </article>
    `;
  }

  return `
    <article class="feed-card event-card" data-event-id="${escapeHtml(item.id)}">
      ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="">` : ''}
      <div class="card-meta">Мероприятие · ${statusLabel(item.status)} · голосов: ${item.vote_count}</div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.description)}</p>
      <button type="button" data-open-event="${escapeHtml(item.id)}">Открыть</button>
    </article>
  `;
}

async function loadFeed() {
  const list = document.getElementById('feed-list');
  if (!list) {
    return;
  }
  list.innerHTML = '<p>Загрузка ленты...</p>';
  try {
    const data = await apiRequest('/api/feed', { headers: {} });
    if (!data.items.length) {
      list.innerHTML = '<p>В ленте пока пусто.</p>';
      return;
    }
    list.innerHTML = data.items.map(renderFeedItem).join('');
  } catch (error) {
    list.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

function renderEventDetail(event, comments = []) {
  const detail = document.getElementById('event-detail');
  if (!detail) {
    return;
  }
  if (!event) {
    currentEventId = null;
    detail.innerHTML = '<p>Выберите мероприятие в ленте.</p>';
    return;
  }

  currentEventId = event.id;
  const authActions = currentUser
    ? `
      <div class="inline-actions">
        <button type="button" id="vote-button">Голосовать</button>
        <button type="button" id="unvote-button">Убрать голос</button>
      </div>
      <form id="comment-form" class="stack-form">
        <label>
          Комментарий
          <textarea name="body" maxlength="2000" required></textarea>
        </label>
        <button type="submit">Отправить комментарий</button>
      </form>
    `
    : '<p>Войдите, чтобы голосовать и комментировать.</p>';

  const adminActions = isAdmin()
    ? `
      <form id="status-form" class="stack-form compact-form">
        <label>
          Статус
          <select name="status">
            ${['proposed', 'voting', 'discussion', 'accepted', 'rejected', 'completed']
              .map((status) => `<option value="${status}" ${status === event.status ? 'selected' : ''}>${statusLabel(status)}</option>`)
              .join('')}
          </select>
        </label>
        <label class="checkbox-row">
          <input name="hidden" type="checkbox" ${event.hidden ? 'checked' : ''}>
          Скрыть мероприятие
        </label>
        <button type="submit">Сохранить статус</button>
      </form>
    `
    : '';

  detail.innerHTML = `
    ${event.image_url ? `<img class="detail-image" src="${escapeHtml(event.image_url)}" alt="">` : ''}
    <div class="card-meta">Статус: ${statusLabel(event.status)} · голосов: ${event.vote_count}</div>
    <h2>${escapeHtml(event.title)}</h2>
    <p>${escapeHtml(event.description)}</p>
    ${event.external_url ? `<p><a href="${escapeHtml(event.external_url)}" target="_blank" rel="noopener">Внешняя ссылка</a></p>` : ''}
    ${authActions}
    ${adminActions}
    <h3>Обсуждение</h3>
    <div id="comments-list" class="comments-list">
      ${comments.length ? comments.map((comment) => `
        <article class="comment">
          <div class="card-meta">${escapeHtml(comment.author?.username)}</div>
          <p>${escapeHtml(comment.body)}</p>
          ${isAdmin() ? `<button type="button" data-hide-comment="${escapeHtml(comment.id)}">Скрыть комментарий</button>` : ''}
        </article>
      `).join('') : '<p>Комментариев пока нет.</p>'}
    </div>
    <p id="detail-status"></p>
  `;
  bindEventDetailActions();
}

async function openEvent(eventId) {
  const detail = document.getElementById('event-detail');
  if (detail) {
    detail.innerHTML = '<p>Загрузка мероприятия...</p>';
  }
  try {
    const [event, comments] = await Promise.all([
      apiRequest(`/api/events/${eventId}`, { headers: {} }),
      apiRequest(`/api/events/${eventId}/comments`, { headers: {} }),
    ]);
    renderEventDetail(event, comments.items);
  } catch (error) {
    if (detail) {
      detail.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    }
  }
}

function bindFeedActions() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-open-event]');
    if (button) {
      openEvent(button.dataset.openEvent);
    }
  });
  const refresh = document.getElementById('refresh-feed');
  if (refresh) {
    refresh.addEventListener('click', loadFeed);
  }
}

function bindEventForms() {
  const form = document.getElementById('event-form');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      try {
        const created = await apiRequest('/api/events', {
          method: 'POST',
          body: JSON.stringify({
            title: formData.get('title'),
            external_url: formData.get('external_url') || null,
            image_url: formData.get('image_url') || null,
            description: formData.get('description'),
          }),
        });
        setText('event-form-status', 'Мероприятие отправлено.');
        form.reset();
        await loadFeed();
        openEvent(created.id);
      } catch (error) {
        setText('event-form-status', error.message);
      }
    });
  }

  const adminForm = document.getElementById('admin-post-form');
  if (adminForm) {
    adminForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(adminForm);
      try {
        await apiRequest('/api/admin/feed-posts', {
          method: 'POST',
          body: JSON.stringify({
            title: formData.get('title'),
            body: formData.get('body'),
          }),
        });
        setText('admin-form-status', 'Пост опубликован.');
        adminForm.reset();
        loadFeed();
      } catch (error) {
        setText('admin-form-status', error.message);
      }
    });
  }
}

function bindEventDetailActions() {
  const voteButton = document.getElementById('vote-button');
  if (voteButton) {
    voteButton.addEventListener('click', async () => {
      try {
        await apiRequest(`/api/events/${currentEventId}/vote`, { method: 'POST' });
        setText('detail-status', 'Голос учтен.');
        await loadFeed();
        openEvent(currentEventId);
      } catch (error) {
        setText('detail-status', error.message);
      }
    });
  }

  const unvoteButton = document.getElementById('unvote-button');
  if (unvoteButton) {
    unvoteButton.addEventListener('click', async () => {
      try {
        await apiRequest(`/api/events/${currentEventId}/unvote`, { method: 'POST' });
        setText('detail-status', 'Голос снят.');
        await loadFeed();
        openEvent(currentEventId);
      } catch (error) {
        setText('detail-status', error.message);
      }
    });
  }

  const commentForm = document.getElementById('comment-form');
  if (commentForm) {
    commentForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(commentForm);
      try {
        await apiRequest(`/api/events/${currentEventId}/comments`, {
          method: 'POST',
          body: JSON.stringify({ body: formData.get('body') }),
        });
        commentForm.reset();
        openEvent(currentEventId);
      } catch (error) {
        setText('detail-status', error.message);
      }
    });
  }

  const statusForm = document.getElementById('status-form');
  if (statusForm) {
    statusForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(statusForm);
      try {
        await apiRequest(`/api/admin/events/${currentEventId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: formData.get('status'),
            hidden: Boolean(formData.get('hidden')),
          }),
        });
        setText('detail-status', 'Статус обновлен.');
        await loadFeed();
        openEvent(currentEventId);
      } catch (error) {
        setText('detail-status', error.message);
      }
    });
  }

  document.querySelectorAll('[data-hide-comment]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await apiRequest(
          `/api/admin/events/${currentEventId}/comments/${button.dataset.hideComment}/hide`,
          { method: 'POST' },
        );
        openEvent(currentEventId);
      } catch (error) {
        setText('detail-status', error.message);
      }
    });
  });
}

async function initMainPage() {
  if (!document.getElementById('feed-list')) {
    return;
  }
  await checkAuth();
  await loadFeed();
  bindFeedActions();
  bindEventForms();
}

checkHealth();
if (document.getElementById('feed-list')) {
  initMainPage();
} else {
  checkAuth();
}
bindLoginForm();
bindRegisterForm();
bindLogout();

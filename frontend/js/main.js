import { api, clearToken, getToken, setToken } from './api.js?v=20260615-4';
import {
  isAdmin,
  isSuperadmin,
  qs,
  qsa,
  renderAccessDenied,
  renderAdminOverview,
  renderAuditLog,
  renderCreateCard,
  renderError,
  renderErrorLog,
  renderFeedEmpty,
  renderFeedItem,
  renderLoading,
  renderProfile,
  show,
  telegramStatusText,
} from './ui.js?v=20260615-4';

const routes = {
  '/': 'feed',
  '/new': 'new',
  '/profile': 'profile',
  '/admin': 'admin',
  '/history': 'history',
  '/errors': 'errors',
};

const state = {
  user: null,
  feed: [],
  expandedEventId: null,
  eventDetails: new Map(),
  votedIds: new Set(),
  page: 'feed',
  profileActivity: null,
  auditLog: null,
  errorLog: null,
};

let backdropPointer = null;

function setMessage(selector, message, isError = false) {
  const element = qs(selector);
  if (!element) {
    return;
  }
  element.textContent = message;
  element.classList.toggle('error', isError);
}

function setGlobalAlert(message = '') {
  const alert = qs('#global-alert');
  if (!alert) {
    return;
  }
  alert.textContent = message;
  alert.classList.toggle('hidden', !message);
}

function routeFromPath(pathname = window.location.pathname) {
  return routes[pathname] || 'feed';
}

function navigate(path) {
  window.history.pushState({}, '', path);
  renderRoute();
}

function mergeFeedEvent(event) {
  state.feed = state.feed.map((item) => (item.id === event.id ? { ...item, ...event } : item));
}

function renderShell() {
  const loggedIn = Boolean(state.user);
  const chip = qs('#current-user-chip');

  show(qs('#open-login'), !loggedIn);
  show(qs('#open-register'), !loggedIn);
  show(qs('#logout-button'), loggedIn);
  show(chip, loggedIn);
  show(qs('#nav-new'), loggedIn);
  show(qs('#nav-profile'), loggedIn);
  show(qs('#nav-admin'), isAdmin(state.user));
  show(qs('#nav-history'), isAdmin(state.user));
  show(qs('#nav-errors'), isSuperadmin(state.user));

  if (chip) {
    chip.textContent = state.user ? `@${state.user.username}` : '';
  }

  qsa('[data-route]').forEach((link) => {
    link.classList.toggle('active', routeFromPath(link.getAttribute('href')) === state.page);
  });
}

function renderRoute() {
  state.page = routeFromPath();
  qsa('[data-page]').forEach((page) => {
    page.classList.toggle('hidden', page.dataset.page !== state.page);
  });
  renderShell();

  if (state.page === 'feed') {
    loadFeed();
  }
  if (state.page === 'new') {
    renderCreatePage();
  }
  if (state.page === 'profile') {
    loadProfilePage();
  }
  if (state.page === 'admin') {
    loadAdminPage();
  }
  if (state.page === 'history') {
    loadHistoryPage();
  }
  if (state.page === 'errors') {
    loadErrorLogPage();
  }
}

function renderFeed() {
  const list = qs('#feed-list');
  if (!list) {
    return;
  }

  list.innerHTML = state.feed.length
    ? state.feed.map((item) => renderFeedItem(item, {
      user: state.user,
      votedIds: state.votedIds,
      expandedId: state.expandedEventId,
      eventDetails: state.eventDetails,
    })).join('')
    : renderFeedEmpty();
}

function renderCreatePage() {
  const card = qs('#create-card');
  if (card) {
    card.innerHTML = renderCreateCard(state.user);
  }
}

function renderProfilePage() {
  const card = qs('#profile-card');
  if (card) {
    card.innerHTML = renderProfile(state.user, state.profileActivity);
  }
}

async function loadProfilePage() {
  state.profileActivity = null;
  renderProfilePage();

  if (!state.user) {
    return;
  }

  try {
    state.profileActivity = await api.myActivity();
    renderProfilePage();
  } catch (error) {
    const card = qs('#profile-card');
    if (card) {
      card.innerHTML = renderError(error.message);
    }
  }
}

async function loadAdminPage() {
  const page = qs('#admin-page');
  if (!page) {
    return;
  }
  if (!state.user) {
    page.innerHTML = renderError('Войдите, чтобы открыть управление.');
    return;
  }
  if (!isAdmin(state.user)) {
    page.innerHTML = renderAccessDenied();
    return;
  }

  page.innerHTML = renderLoading('Загружаем пользователей...');
  try {
    const data = await api.adminOverview();
    page.innerHTML = renderAdminOverview(data, state.user);
  } catch (error) {
    page.innerHTML = renderError(error.message);
  }
}

async function loadHistoryPage() {
  const page = qs('#history-page');
  if (!page) {
    return;
  }
  if (!state.user) {
    page.innerHTML = renderError('Войдите, чтобы открыть историю.');
    return;
  }
  if (!isAdmin(state.user)) {
    page.innerHTML = renderAccessDenied();
    return;
  }

  page.innerHTML = renderLoading('Загружаем историю...');
  try {
    state.auditLog = await api.auditLog();
    page.innerHTML = renderAuditLog(state.auditLog, state.user);
  } catch (error) {
    page.innerHTML = renderError(error.message);
  }
}

async function loadErrorLogPage() {
  const page = qs('#error-log-page');
  if (!page) {
    return;
  }
  if (!state.user) {
    page.innerHTML = renderError('Войдите, чтобы открыть лог ошибок.');
    return;
  }
  if (!isSuperadmin(state.user)) {
    page.innerHTML = renderAccessDenied();
    return;
  }

  page.innerHTML = renderLoading('Загружаем лог ошибок...');
  try {
    state.errorLog = await api.errorLog();
    page.innerHTML = renderErrorLog(state.errorLog, state.user);
  } catch (error) {
    page.innerHTML = renderError('Не удалось загрузить лог ошибок.');
  }
}

async function loadCurrentUser() {
  if (!getToken()) {
    state.user = null;
    renderShell();
    return;
  }

  try {
    state.user = await api.me();
  } catch {
    state.user = null;
    clearToken();
  }
  renderShell();
}

async function loadFeed() {
  const list = qs('#feed-list');
  if (list) {
    list.innerHTML = renderLoading('Загружаем ленту...');
  }

  try {
    const data = await api.feed();
    state.feed = data.items || [];
    state.votedIds = new Set(
      state.feed
        .filter((item) => item.type === 'event' && item.voted_by_current_user)
        .map((item) => item.id),
    );
    setGlobalAlert('');
    renderFeed();
  } catch (error) {
    state.feed = [];
    setGlobalAlert('Backend сейчас недоступен. Чтение и действия временно не работают.');
    if (list) {
      list.innerHTML = renderError(error.message);
    }
  }
}

async function refreshExpandedEvent(eventId) {
  try {
    const [event, comments] = await Promise.all([
      api.event(eventId),
      api.comments(eventId),
    ]);
    mergeFeedEvent(event);
    if (event.voted_by_current_user) {
      state.votedIds.add(eventId);
    } else {
      state.votedIds.delete(eventId);
    }
    state.eventDetails.set(eventId, { event, comments: comments.items || [] });
  } catch (error) {
    state.eventDetails.set(eventId, { error: error.message });
  }
  renderFeed();
}

async function toggleEvent(eventId) {
  if (state.expandedEventId === eventId) {
    state.expandedEventId = null;
    renderFeed();
    return;
  }

  state.expandedEventId = eventId;
  state.eventDetails.set(eventId, { loading: true });
  renderFeed();
  await refreshExpandedEvent(eventId);
  qs(`[data-event-card="${eventId}"]`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(new Error('Не удалось прочитать файл.')));
    reader.readAsDataURL(file);
  });
}

function imagePickerStatusSelector(picker) {
  return picker?.dataset.statusSelector || '#event-form-status';
}

function setImagePickerValue(picker, value = '', { syncUrl = true } = {}) {
  if (!picker) {
    return;
  }
  const hiddenInput = qs('[data-image-value]', picker);
  const urlInput = qs('[data-image-url-input]', picker);
  const preview = qs('[data-image-upload]', picker);

  if (hiddenInput) {
    hiddenInput.value = value;
  }
  if (syncUrl && urlInput && urlInput.value !== value && !value.startsWith('data:image/')) {
    urlInput.value = value;
  }
  if (!preview) {
    return;
  }

  const isAvatarPicker = picker.hasAttribute('data-avatar-picker');
  const updateAvatarActions = () => {
    if (!isAvatarPicker) {
      return;
    }
    const actions = qs('.avatar-actions', picker);
    if (!actions) {
      return;
    }
    actions.innerHTML = value
      ? `
        <button class="avatar-link" data-image-upload type="button">Изменить</button>
        <button class="avatar-link muted-link" data-clear-image type="button">Удалить</button>
      `
      : '<button class="avatar-link" data-image-upload type="button">Выбрать фотографию</button>';
  };
  const addAvatarMark = () => {
    if (!isAvatarPicker) {
      return;
    }
    const mark = document.createElement('span');
    mark.className = 'avatar-camera-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = 'Фото';
    preview.append(mark);
  };

  if (value) {
    preview.textContent = '';
    const image = document.createElement('img');
    image.src = value;
    image.alt = '';
    preview.append(image);
    addAvatarMark();
    preview.classList.add('has-image');
  } else {
    preview.textContent = '';
    const placeholder = document.createElement('span');
    placeholder.className = 'image-placeholder';
    placeholder.textContent = picker.dataset.previewText || 'Фото';
    preview.append(placeholder);
    addAvatarMark();
    preview.classList.remove('has-image');
  }
  updateAvatarActions();
}

function clearImagePicker(picker) {
  if (!picker) {
    return;
  }
  const fileInput = qs('[data-image-file-input]', picker);
  const urlInput = qs('[data-image-url-input]', picker);
  if (fileInput) {
    fileInput.value = '';
  }
  if (urlInput) {
    urlInput.value = '';
  }
  setImagePickerValue(picker, '');
}

function resetAuthForms() {
  qsa('#auth-modal form').forEach((form) => form.reset());
  qsa('#auth-modal input').forEach((input) => {
    input.value = '';
    input.defaultValue = '';
  });
  setMessage('#auth-form-status', '');

  window.setTimeout(() => {
    qsa('#auth-modal input').forEach((input) => {
      input.value = '';
    });
  }, 0);
}

function openAuth(mode = 'login') {
  resetAuthForms();
  show(qs('#auth-modal'), true);
  document.body.classList.add('modal-open');
  switchAuthTab(mode);
}

function closeAuth() {
  show(qs('#auth-modal'), false);
  document.body.classList.remove('modal-open');
  resetAuthForms();
}

function switchAuthTab(mode) {
  const isLogin = mode === 'login';
  show(qs('#login-panel'), isLogin);
  show(qs('#register-panel'), !isLogin);
  qsa('[data-auth-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.authTab === mode);
  });
  setMessage('#auth-form-status', '');
}

async function handleVote(eventId) {
  if (!state.user) {
    openAuth('login');
    return;
  }

  try {
    const updated = await api.vote(eventId);
    state.votedIds.add(eventId);
    mergeFeedEvent(updated);
    if (state.expandedEventId === eventId) {
      await refreshExpandedEvent(eventId);
    } else {
      renderFeed();
    }
  } catch (error) {
    if (error.message.toLowerCase().includes('already')) {
      state.votedIds.add(eventId);
      await refreshExpandedEvent(eventId);
      return;
    }
    setMessage('#detail-status', error.message, true);
  }
}

async function handleUnvote(eventId) {
  if (!state.user) {
    openAuth('login');
    return;
  }

  try {
    const updated = await api.unvote(eventId);
    state.votedIds.delete(eventId);
    mergeFeedEvent(updated);
    if (state.expandedEventId === eventId) {
      await refreshExpandedEvent(eventId);
    } else {
      renderFeed();
    }
  } catch (error) {
    setMessage('#detail-status', error.message, true);
  }
}

function bindClicks() {
  document.addEventListener('click', async (event) => {
    const routeLink = event.target.closest('[data-route]');
    if (routeLink) {
      event.preventDefault();
      navigate(routeLink.getAttribute('href'));
      return;
    }

    const authButton = event.target.closest('[data-open-auth]');
    if (authButton) {
      openAuth(authButton.dataset.openAuth || 'login');
      return;
    }

    const voteButton = event.target.closest('[data-vote-event]');
    if (voteButton) {
      await handleVote(voteButton.dataset.voteEvent);
      return;
    }

    const unvoteButton = event.target.closest('[data-unvote-event]');
    if (unvoteButton) {
      await handleUnvote(unvoteButton.dataset.unvoteEvent);
      return;
    }

    const hideButton = event.target.closest('[data-hide-comment]');
    if (hideButton && state.expandedEventId) {
      try {
        await api.hideComment(state.expandedEventId, hideButton.dataset.hideComment);
        await refreshExpandedEvent(state.expandedEventId);
      } catch (error) {
        setMessage('#detail-status', error.message, true);
      }
      return;
    }

    const deleteButton = event.target.closest('[data-delete-event]');
    if (deleteButton) {
      const eventId = deleteButton.dataset.deleteEvent;
      const confirmed = window.confirm('Удалить мероприятие? Это действие нельзя отменить.');
      if (!confirmed) {
        return;
      }
      try {
        await api.deleteEvent(eventId);
        state.expandedEventId = null;
        state.eventDetails.delete(eventId);
        await loadFeed();
      } catch (error) {
        setMessage('#detail-status', error.message, true);
      }
      return;
    }

    const deleteAdminPostButton = event.target.closest('[data-delete-admin-post]');
    if (deleteAdminPostButton) {
      const confirmed = window.confirm('Удалить админский пост? Запись останется в истории.');
      if (!confirmed) {
        return;
      }
      try {
        await api.deleteAdminPost(deleteAdminPostButton.dataset.deleteAdminPost);
        await loadFeed();
      } catch (error) {
        setGlobalAlert(error.message);
      }
      return;
    }

    const uploadImageButton = event.target.closest('[data-image-upload]');
    if (uploadImageButton) {
      const picker = uploadImageButton.closest('[data-image-picker]');
      qs('[data-image-file-input]', picker)?.click();
      return;
    }

    const clearImageButton = event.target.closest('[data-clear-image]');
    if (clearImageButton) {
      clearImagePicker(clearImageButton.closest('[data-image-picker]'));
      return;
    }

    const makeAdminButton = event.target.closest('[data-make-admin]');
    if (makeAdminButton) {
      await api.makeAdmin(makeAdminButton.dataset.makeAdmin);
      await loadAdminPage();
      return;
    }

    const removeAdminButton = event.target.closest('[data-remove-admin]');
    if (removeAdminButton) {
      await api.removeAdmin(removeAdminButton.dataset.removeAdmin);
      await loadAdminPage();
      return;
    }

    const deleteErrorButton = event.target.closest('[data-delete-error]');
    if (deleteErrorButton) {
      try {
        await api.deleteErrorLog(deleteErrorButton.dataset.deleteError);
        await loadErrorLogPage();
      } catch {
        await loadErrorLogPage();
      }
      return;
    }

    if (event.target.closest('#clear-audit-log')) {
      const confirmed = window.confirm('Очистить историю действий? Останется запись об очистке.');
      if (!confirmed) {
        return;
      }
      try {
        await api.clearAuditLog();
        await loadHistoryPage();
      } catch (error) {
        setGlobalAlert(error.message);
      }
      return;
    }

    const eventCard = event.target.closest('[data-event-card]');
    const interactive = event.target.closest('a, button, input, textarea, select, label, form, .event-expanded');
    if (eventCard && !interactive) {
      await toggleEvent(eventCard.dataset.eventCard);
    }
  });

  const authModal = qs('#auth-modal');
  authModal?.addEventListener('pointerdown', (event) => {
    if (event.target !== authModal) {
      backdropPointer = null;
      return;
    }
    backdropPointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  });

  authModal?.addEventListener('pointerup', (event) => {
    if (!backdropPointer || event.pointerId !== backdropPointer.id) {
      backdropPointer = null;
      return;
    }
    const moved = Math.abs(event.clientX - backdropPointer.x) + Math.abs(event.clientY - backdropPointer.y);
    const isPlainBackdropClick = event.target === authModal && moved < 8;
    backdropPointer = null;
    if (isPlainBackdropClick) {
      closeAuth();
    }
  });

  authModal?.addEventListener('pointercancel', () => {
    backdropPointer = null;
  });
}

function bindForms() {
  qs('#login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const data = await api.login({
        username: formData.get('username'),
        password: formData.get('password'),
      });
      setToken(data.access_token);
      state.user = data.user;
      closeAuth();
      renderShell();
      renderRoute();
    } catch (error) {
      setMessage('#auth-form-status', 'Не удалось войти. Проверьте логин и пароль.', true);
    }
  });

  qs('#register-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const user = await api.register({
        username: formData.get('username'),
        email: formData.get('email'),
        password: formData.get('password'),
      });
      form.reset();
      switchAuthTab('login');
      setMessage('#auth-form-status', `Пользователь ${user.username} создан. Теперь можно войти.`);
    } catch (error) {
      setMessage('#auth-form-status', 'Регистрация не выполнена. Мы записали проблему в лог.', true);
    }
  });

  document.addEventListener('submit', async (event) => {
    if (event.target.id === 'event-form') {
      event.preventDefault();
      const formData = new FormData(event.target);
      try {
        const created = await api.createEvent({
          title: formData.get('title'),
          external_url: formData.get('external_url') || null,
          image_url: formData.get('image_url') || null,
          description: formData.get('description'),
        });
        state.expandedEventId = created.id;
        state.eventDetails.set(created.id, { event: created, comments: [] });
        event.target.reset();
        qsa('[data-image-picker]', event.target).forEach((picker) => clearImagePicker(picker));
        navigate('/');
      } catch (error) {
        setMessage('#event-form-status', error.message, true);
      }
    }

    if (event.target.id === 'admin-post-form') {
      event.preventDefault();
      const formData = new FormData(event.target);
      try {
        const created = await api.createAdminPost({
          title: formData.get('title'),
          text: formData.get('text'),
        });
        event.target.reset();
        setMessage('#admin-post-status', `Пост создан. ${telegramStatusText(created.telegram_status)}`);
        await loadFeed();
      } catch (error) {
        setMessage('#admin-post-status', 'Пост не создан. Проверьте поля и попробуйте еще раз.', true);
      }
    }

    if (event.target.id === 'comment-form') {
      event.preventDefault();
      const formData = new FormData(event.target);
      try {
        await api.createComment(state.expandedEventId, { body: formData.get('body') });
        event.target.reset();
        await refreshExpandedEvent(state.expandedEventId);
      } catch (error) {
        setMessage('#detail-status', error.message, true);
      }
    }

    if (event.target.id === 'status-form') {
      event.preventDefault();
      const formData = new FormData(event.target);
      try {
        const eventId = state.expandedEventId;
        const updated = await api.updateEventStatus(eventId, {
          status: formData.get('status'),
          hidden: formData.get('hidden') === 'true',
        });
        if (updated.hidden) {
          state.expandedEventId = null;
          state.eventDetails.delete(eventId);
          await loadFeed();
          return;
        }
        mergeFeedEvent(updated);
        await loadFeed();
        await refreshExpandedEvent(eventId);
        setMessage('#detail-status', 'Статус обновлен.');
      } catch (error) {
        setMessage('#detail-status', error.message, true);
      }
    }

    if (event.target.id === 'profile-form') {
      event.preventDefault();
      const formData = new FormData(event.target);
      try {
        state.user = await api.updateMe({
          first_name: formData.get('first_name') || null,
          last_name: formData.get('last_name') || null,
          email: formData.get('email') || null,
          avatar_url: formData.get('avatar_url') || null,
        });
        renderShell();
        renderProfilePage();
        setMessage('#profile-form-status', 'Профиль сохранен.');
      } catch (error) {
        setMessage('#profile-form-status', error.message, true);
      }
    }
  });

  document.addEventListener('change', async (event) => {
    if (event.target.matches('[data-image-file-input]')) {
      const picker = event.target.closest('[data-image-picker]');
      const statusSelector = imagePickerStatusSelector(picker);
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      if (!file.type.startsWith('image/')) {
        setMessage(statusSelector, 'Выберите файл изображения.', true);
        event.target.value = '';
        return;
      }
      if (file.size > 1_400_000) {
        setMessage(statusSelector, 'Файл изображения должен быть не больше 1.4 MB.', true);
        event.target.value = '';
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const urlInput = qs('[data-image-url-input]', picker);
        if (urlInput) {
          urlInput.value = '';
        }
        setImagePickerValue(picker, dataUrl, { syncUrl: false });
        setMessage(statusSelector, 'Изображение выбрано.');
      } catch (error) {
        setMessage(statusSelector, error.message, true);
      }
      return;
    }

    const errorStatusSelect = event.target.closest('[data-error-status]');
    if (errorStatusSelect) {
      try {
        await api.updateErrorLogStatus(errorStatusSelect.dataset.errorStatus, {
          status: errorStatusSelect.value,
        });
        await loadErrorLogPage();
      } catch {
        await loadErrorLogPage();
      }
      return;
    }

  });

  document.addEventListener('input', (event) => {
    if (!event.target.matches('[data-image-url-input]')) {
      return;
    }
    const value = event.target.value.trim();
    const picker = event.target.closest('[data-image-picker]');
    const fileInput = qs('[data-image-file-input]', picker);
    if (fileInput) {
      fileInput.value = '';
    }
    setImagePickerValue(picker, value, { syncUrl: false });
  });
}

function bindControls() {
  qs('#open-login')?.addEventListener('click', () => openAuth('login'));
  qs('#open-register')?.addEventListener('click', () => openAuth('register'));
  qsa('[data-auth-tab]').forEach((button) => {
    button.addEventListener('click', () => switchAuthTab(button.dataset.authTab));
  });
  qs('#refresh-feed')?.addEventListener('click', loadFeed);
  qs('#refresh-admin')?.addEventListener('click', loadAdminPage);
  qs('#refresh-history')?.addEventListener('click', loadHistoryPage);
  qs('#refresh-errors')?.addEventListener('click', loadErrorLogPage);
  qs('#logout-button')?.addEventListener('click', async () => {
    try {
      if (getToken()) {
        await api.logout();
      }
    } catch {
      // JWT logout is client-side; stale server errors should not block exit.
    } finally {
      clearToken();
      state.user = null;
      state.votedIds.clear();
      state.expandedEventId = null;
      state.eventDetails.clear();
      state.profileActivity = null;
      state.auditLog = null;
      state.errorLog = null;
      navigate('/');
    }
  });
  window.addEventListener('popstate', renderRoute);
}

async function init() {
  renderShell();
  bindControls();
  bindClicks();
  bindForms();
  await loadCurrentUser();
  renderRoute();
}

init();

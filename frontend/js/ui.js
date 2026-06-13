export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function show(element, visible) {
  if (element) {
    element.classList.toggle('hidden', !visible);
  }
}

export function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function isAdmin(user) {
  return Boolean(user && ['admin', 'superadmin'].includes(user.role));
}

export function isSuperadmin(user) {
  return Boolean(user && user.role === 'superadmin');
}

function canManageEvent(event, user) {
  return Boolean(event.can_manage_by_current_user || (user && event.author?.id === user.id) || isAdmin(user));
}

export function statusMeta(status) {
  const statuses = {
    proposed: { label: 'планируется', className: 'planned' },
    voting: { label: 'голосование', className: 'voting' },
    discussion: { label: 'обсуждение', className: 'discussion' },
    accepted: { label: 'планируется', className: 'planned' },
    rejected: { label: 'отклонено', className: 'rejected' },
    completed: { label: 'прошло', className: 'completed' },
  };
  return statuses[status] || { label: status || 'без статуса', className: 'planned' };
}

export function formatDate(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function shortText(value, limit = 210) {
  const text = String(value || '').trim();
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit - 1).trim()}...`;
}

function statusBadge(status) {
  const meta = statusMeta(status);
  return `<span class="status ${meta.className}">${meta.label}</span>`;
}

function cover(item) {
  if (item.image_url) {
    return `
      <div class="cover">
        <img src="${escapeHtml(item.image_url)}" alt="">
      </div>
    `;
  }

  const letter = escapeHtml((item.title || 's').trim().slice(0, 1).toUpperCase());
  return `<div class="cover placeholder" aria-hidden="true">${letter}</div>`;
}

function commentsHtml(comments, user) {
  if (!comments.length) {
    return '<div class="empty-state compact">Комментариев пока нет.</div>';
  }

  return comments.map((comment) => `
    <article class="comment">
      <div class="meta-row">
        <span class="card-meta">${escapeHtml(comment.author?.username || 'участник')}</span>
        <span class="card-meta">${formatDate(comment.created_at)}</span>
      </div>
      <p>${escapeHtml(comment.body)}</p>
      ${isAdmin(user) ? `<button class="btn danger small" data-hide-comment="${escapeHtml(comment.id)}" type="button">Скрыть</button>` : ''}
    </article>
  `).join('');
}

export function renderEventDetail(event, comments, { user, votedIds }) {
  const voted = Boolean(user) && (votedIds.has(event.id) || Boolean(event.voted_by_current_user));
  const canManage = canManageEvent(event, user);

  const authBlock = user
    ? `
      <div class="actions-row">
        <button class="btn ${voted ? 'secondary' : 'primary'}" data-${voted ? 'unvote' : 'vote'}-event="${escapeHtml(event.id)}" type="button">
          ${voted ? 'Убрать голос' : 'Голосовать'}
        </button>
        <span class="vote-count">${Number(event.vote_count || 0)} голосов</span>
      </div>
      <form class="form comment-form" id="comment-form">
        <label>
          Комментарий
          <textarea name="body" maxlength="2000" required></textarea>
        </label>
        <button class="btn primary full" type="submit">Отправить</button>
      </form>
    `
    : renderLoginRequired('Войдите, чтобы голосовать и комментировать.');

  const manageBlock = canManage
    ? `
      <hr class="divider">
      <form class="form" id="status-form">
        <label>
          Статус
          <select name="status">
            ${['proposed', 'voting', 'discussion', 'accepted', 'rejected', 'completed']
              .map((status) => {
                const meta = statusMeta(status);
                return `<option value="${status}" ${status === event.status ? 'selected' : ''}>${meta.label}</option>`;
              })
              .join('')}
          </select>
        </label>
        <label>
          Видимость
          <select name="hidden">
            <option value="false" ${event.hidden ? '' : 'selected'}>показывать</option>
            <option value="true" ${event.hidden ? 'selected' : ''}>скрыть</option>
          </select>
        </label>
        <button class="btn secondary full" type="submit">Сохранить</button>
      </form>
      <button class="btn danger full" data-delete-event="${escapeHtml(event.id)}" type="button">Удалить мероприятие</button>
    `
    : '';

  return `
    <div class="event-expanded">
      <div class="event-fulltext">
        <p>${escapeHtml(event.description)}</p>
        ${event.external_url ? `<a class="text-link" href="${escapeHtml(event.external_url)}" target="_blank" rel="noopener">Внешняя ссылка</a>` : ''}
      </div>
      ${authBlock}
      ${manageBlock}
      <hr class="divider">
      <h3>Обсуждение</h3>
      <div class="comments-list">
        ${commentsHtml(comments, user)}
      </div>
      <p class="detail-status" id="detail-status"></p>
    </div>
  `;
}

export function renderFeedItem(item, { user, votedIds, expandedId, eventDetails }) {
  if (item.type === 'admin_post') {
    return `
      <article class="feed-card admin-post">
        <div class="card-body">
          <div class="meta-row">
            <span class="status discussion">пост клуба</span>
            <span class="card-meta">${escapeHtml(item.author?.username || 'admin')}</span>
            <span class="card-meta">${formatDate(item.created_at)}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.body)}</p>
        </div>
      </article>
    `;
  }

  const voted = Boolean(user) && (votedIds.has(item.id) || Boolean(item.voted_by_current_user));
  const voteAction = voted ? 'unvote' : 'vote';
  const voteLabel = user ? (voted ? 'Голос учтен' : 'Голосовать') : 'Войти для голоса';
  const expanded = expandedId === item.id;
  const detailState = expanded ? eventDetails.get(item.id) : null;
  let detail = '';

  if (expanded) {
    if (!detailState || detailState.loading) {
      detail = `<div class="event-expanded">${renderLoading('Открываем обсуждение...')}</div>`;
    } else if (detailState.error) {
      detail = `<div class="event-expanded">${renderError(detailState.error)}</div>`;
    } else {
      detail = renderEventDetail(detailState.event, detailState.comments || [], { user, votedIds });
    }
  }

  return `
    <article class="feed-card ${expanded ? 'expanded' : ''}" data-event-card="${escapeHtml(item.id)}">
      ${cover(item)}
      <div class="card-body">
        <div class="meta-row">
          ${statusBadge(item.status)}
          <span class="card-meta">автор: ${escapeHtml(item.author?.username || 'участник')}</span>
          <span class="card-meta">${formatDate(item.created_at)}</span>
          <span class="card-meta">${Number(item.comment_count || 0)} комментариев</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(shortText(item.description))}</p>
        <div class="actions-row">
          <button class="btn ${voted ? 'secondary' : 'primary'}" data-${voteAction}-event="${escapeHtml(item.id)}" type="button">${voteLabel}</button>
          <span class="vote-count">${Number(item.vote_count || 0)} голосов</span>
          <span class="expand-hint">${expanded ? 'Свернуть' : 'Нажмите карточку для обсуждения'}</span>
        </div>
        ${detail}
      </div>
    </article>
  `;
}

export function renderFeedEmpty() {
  return `
    <div class="empty-state">
      <h3>В ленте пока пусто</h3>
      <p class="muted">Здесь появятся предложения встреч и посты клуба.</p>
    </div>
  `;
}

function profileAvatar(user) {
  if (user.avatar_url) {
    return `<img src="${escapeHtml(user.avatar_url)}" alt="">`;
  }
  const text = escapeHtml((user.username || 's').slice(0, 2).toUpperCase());
  return `<span>${text}</span>`;
}

function compactEventList(items) {
  if (!items || !items.length) {
    return '<p class="muted">Пока пусто.</p>';
  }
  return `
    <div class="compact-event-list">
      ${items.map((item) => `
        <article class="compact-event">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${statusMeta(item.status).label} · ${Number(item.vote_count || 0)} голосов</span>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

export function renderProfile(user, activity = null) {
  if (!user) {
    return renderLoginRequired('Войдите, чтобы открыть профиль.');
  }

  return `
    <div class="profile-grid">
      <form class="form profile-form" id="profile-form">
        <div class="profile-head">
          <div class="avatar-preview">${profileAvatar(user)}</div>
          <div>
            <p class="profile-name">${escapeHtml(user.username)}</p>
            <span class="role-badge">${escapeHtml(user.role)}</span>
          </div>
        </div>
        <label>
          Имя
          <input name="first_name" maxlength="80" value="${escapeHtml(user.first_name || '')}">
        </label>
        <label>
          Фамилия
          <input name="last_name" maxlength="80" value="${escapeHtml(user.last_name || '')}">
        </label>
        <label>
          Аватар
          <input class="file-input" id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
          <input name="avatar_url" type="hidden" value="${escapeHtml(user.avatar_url || '')}">
          <span class="file-note">PNG, JPG, WebP или GIF до 1.4 MB.</span>
        </label>
        <div class="settings-list">
          <span>Email: ${escapeHtml(user.email)}</span>
          <span>Статус: ${user.is_active ? 'активен' : 'заблокирован'}</span>
        </div>
        <button class="btn primary full" type="submit">Сохранить профиль</button>
        <p class="form-note" id="profile-form-status"></p>
      </form>

      <section class="profile-activity">
        <div>
          <h3>Предложенные мероприятия</h3>
          ${activity ? compactEventList(activity.proposed_events) : renderLoading('Загружаем активность...')}
        </div>
        <div>
          <h3>Голоса</h3>
          ${activity ? compactEventList(activity.voted_events) : renderLoading('Загружаем голоса...')}
        </div>
      </section>
    </div>
  `;
}

export function renderCreateCard(user) {
  if (!user) {
    return renderLoginRequired('Войдите, чтобы предложить мероприятие.');
  }

  return `
    <form class="form" id="event-form">
      <label>
        Название
        <input name="title" minlength="3" maxlength="160" required>
      </label>
      <label>
        Ссылка
        <input name="external_url" type="url" placeholder="https://example.com">
      </label>
      <label>
        Изображение
        <textarea name="image_url" placeholder="https://... или data:image/jpeg;base64,..."></textarea>
      </label>
      <label>
        Описание
        <textarea name="description" minlength="10" maxlength="5000" required></textarea>
      </label>
      <button class="btn primary full" type="submit">Отправить предложение</button>
      <p class="form-note" id="event-form-status"></p>
    </form>
  `;
}

export function renderLoginRequired(text) {
  return `
    <div class="empty-state">
      <h3>Нужен вход</h3>
      <p class="muted">${escapeHtml(text)}</p>
      <div class="actions-row">
        <button class="btn primary" data-open-auth="login" type="button">Войти</button>
        <button class="btn secondary" data-open-auth="register" type="button">Регистрация</button>
      </div>
    </div>
  `;
}

export function renderAccessDenied() {
  return `
    <div class="error-state">
      <h3>Нет доступа</h3>
      <p>Эта страница доступна только администраторам.</p>
    </div>
  `;
}

export function renderAdminOverview(data, currentUser) {
  const canManage = Boolean(data.can_manage_roles && isSuperadmin(currentUser));
  const rows = (data.items || []).map((user) => {
    const stats = user.stats || {};
    const votedEvents = stats.voted_events || [];
    const roleAction = canManage ? roleActionHtml(user) : '<span class="muted">только просмотр</span>';
    return `
      <tr>
        <td>
          <strong>${escapeHtml(user.username)}</strong><br>
          <span class="muted">${escapeHtml(user.email)}</span>
        </td>
        <td><span class="role-badge">${escapeHtml(user.role)}</span></td>
        <td>${user.is_active ? 'активен' : 'заблокирован'}</td>
        <td>
          <span class="muted">регистрация:</span> ${escapeHtml(user.registered_ip || 'нет данных')}<br>
          <span class="muted">последний вход:</span> ${escapeHtml(user.last_login_ip || 'нет данных')}
        </td>
        <td>
          предложено: ${Number(stats.events_proposed || 0)}<br>
          голосов: ${Number(stats.votes_cast || 0)}<br>
          комментариев: ${Number(stats.comments_written || 0)}
        </td>
        <td>
          ${votedEvents.length ? `
            <ul class="voted-list">
              ${votedEvents.slice(0, 5).map((event) => `<li>${escapeHtml(event.title)}</li>`).join('')}
            </ul>
          ` : '<span class="muted">нет голосов</span>'}
        </td>
        <td>${roleAction}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Пользователь</th>
            <th>Роль</th>
            <th>Статус</th>
            <th>IP</th>
            <th>Статистика</th>
            <th>Голосовал за</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="7">Пользователей пока нет.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function roleActionHtml(user) {
  if (user.role === 'superadmin') {
    return '<span class="muted">superadmin</span>';
  }
  if (user.role === 'admin') {
    return `<button class="btn danger small" data-remove-admin="${user.id}" type="button">Сделать user</button>`;
  }
  return `<button class="btn secondary small" data-make-admin="${user.id}" type="button">Сделать admin</button>`;
}

export function renderLoading(text = 'Загрузка...') {
  return `<div class="loading-state">${escapeHtml(text)}</div>`;
}

export function renderError(message) {
  return `
    <div class="error-state">
      <h3>Не удалось загрузить данные</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

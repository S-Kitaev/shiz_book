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

function renderGuestEventNotice() {
  return `
    <div class="guest-notice">
      Войдите, чтобы создавать мероприятия, голосовать и комментировать.
    </div>
  `;
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
    : renderGuestEventNotice();

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
    const deleteButton = isSuperadmin(user)
      ? `<button class="btn danger small" data-delete-admin-post="${escapeHtml(item.id)}" type="button">Удалить</button>`
      : '';
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
          ${deleteButton ? `<div class="actions-row">${deleteButton}</div>` : ''}
        </div>
      </article>
    `;
  }

  const voted = Boolean(user) && (votedIds.has(item.id) || Boolean(item.voted_by_current_user));
  const voteAction = voted ? 'unvote' : 'vote';
  const voteLabel = user ? (voted ? 'Голос учтен' : 'Голосовать') : 'Войти для голоса';
  const authorMeta = user
    ? `<span class="card-meta">автор: ${escapeHtml(item.author?.username || 'участник')}</span>`
    : '';
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
          ${authorMeta}
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

function renderImagePicker({
  name,
  value = '',
  label = '',
  help,
  placeholder,
  statusSelector,
  previewText = 'Фото',
}) {
  const safeValue = String(value || '');
  const urlValue = safeValue.startsWith('data:image/') ? '' : safeValue;
  const preview = safeValue
    ? `<img src="${escapeHtml(safeValue)}" alt="">`
    : `<span class="image-placeholder">${escapeHtml(previewText)}</span>`;
  const labelHtml = label ? `<span class="form-label">${escapeHtml(label)}</span>` : '';

  return `
    <div class="image-picker" data-image-picker data-status-selector="${escapeHtml(statusSelector)}" data-preview-text="${escapeHtml(previewText)}">
      ${labelHtml}
      <div class="image-picker-row">
        <div class="image-picker-preview-col">
          <button class="image-preview ${safeValue ? 'has-image' : ''}" data-image-upload type="button" aria-label="Загрузить изображение">
            ${preview}
          </button>
          <button class="text-button" data-clear-image type="button">Удалить</button>
        </div>
        <div class="image-picker-fields">
          <p class="image-help">${escapeHtml(help)}</p>
          <div class="image-url-control">
            <input data-image-url-input type="url" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(urlValue)}">
            <button class="image-clear" data-clear-image type="button" aria-label="Удалить изображение">×</button>
          </div>
        </div>
      </div>
      <input data-image-file-input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
      <input data-image-value name="${escapeHtml(name)}" type="hidden" value="${escapeHtml(safeValue)}">
    </div>
  `;
}

function renderAvatarEditor(user) {
  const safeValue = String(user.avatar_url || '');
  const initials = (user.username || 'sb').slice(0, 2).toUpperCase();
  const preview = safeValue
    ? `<img src="${escapeHtml(safeValue)}" alt="">`
    : `<span class="image-placeholder">${escapeHtml(initials)}</span>`;
  const actions = safeValue
    ? `
      <button class="avatar-link" data-image-upload type="button">Изменить</button>
      <button class="avatar-link muted-link" data-clear-image type="button">Удалить</button>
    `
    : '<button class="avatar-link" data-image-upload type="button">Выбрать фотографию</button>';

  return `
    <div class="avatar-editor" data-image-picker data-avatar-picker data-status-selector="#profile-form-status" data-preview-text="${escapeHtml(initials)}">
      <button class="profile-avatar-button ${safeValue ? 'has-image' : ''}" data-image-upload type="button" aria-label="Загрузить аватар">
        ${preview}
        <span class="avatar-camera-mark" aria-hidden="true">Фото</span>
      </button>
      <div class="avatar-actions">${actions}</div>
      <input data-image-file-input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
      <input data-image-value name="avatar_url" type="hidden" value="${escapeHtml(safeValue)}">
    </div>
  `;
}

function compactEventList(items) {
  if (!items || !items.length) {
    return '<div class="activity-scroll"><p class="muted">Пока пусто.</p></div>';
  }
  return `
    <div class="compact-event-list activity-scroll">
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

  const superadmin = isSuperadmin(user);

  return `
    <div class="profile-grid">
      <form class="form profile-form" id="profile-form">
        <div class="profile-head">
          ${renderAvatarEditor(user)}
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
          Email
          <input name="email" type="email" maxlength="255" required value="${escapeHtml(user.email || '')}" ${superadmin ? 'readonly aria-readonly="true"' : ''}>
          ${superadmin ? '<span class="file-note">Email superadmin задан системой и не меняется.</span>' : ''}
        </label>
        <div class="settings-list">
          <span>Статус: ${user.is_active ? 'активен' : 'заблокирован'}</span>
        </div>
        <button class="btn primary full" type="submit">Сохранить профиль</button>
        <p class="form-note" id="profile-form-status"></p>
      </form>

      <section class="profile-activity">
        <details class="activity-panel" open>
          <summary>Предложенные мероприятия</summary>
          ${activity ? compactEventList(activity.proposed_events) : renderLoading('Загружаем активность...')}
        </details>
        <details class="activity-panel" open>
          <summary>Голоса</summary>
          ${activity ? compactEventList(activity.voted_events) : renderLoading('Загружаем голоса...')}
        </details>
      </section>
    </div>
  `;
}

function renderAdminPostForm(user) {
  if (!isAdmin(user)) {
    return '';
  }

  return `
    <section class="admin-post-box form-block">
      <h2>Админский пост</h2>
      <form class="form" id="admin-post-form">
        <label>
          Заголовок
          <input name="title" minlength="3" maxlength="160" required>
        </label>
        <label>
          Текст
          <textarea name="text" minlength="1" maxlength="5000" required></textarea>
        </label>
        <button class="btn primary full" type="submit">Опубликовать пост</button>
        <p class="form-note" id="admin-post-status"></p>
      </form>
    </section>
  `;
}

export function renderCreateCard(user) {
  if (!user) {
    return renderLoginRequired('Войдите, чтобы предложить мероприятие.');
  }

  return `
    <div class="create-stack">
      <form class="form form-block" id="event-form">
        <h2>Предложить мероприятие</h2>
        <label>
          Название
          <input name="title" minlength="3" maxlength="160" required>
        </label>
        <label>
          Ссылка
          <input name="external_url" type="url" placeholder="https://example.com">
        </label>
        ${renderImagePicker({
          name: 'image_url',
          label: 'Изображение мероприятия',
          help: 'Нажмите на превью, чтобы загрузить файл, или вставьте ссылку на изображение.',
          placeholder: 'https://example.com/image.jpg',
          statusSelector: '#event-form-status',
          previewText: 'Фото',
        })}
        <label>
          Описание
          <textarea name="description" minlength="10" maxlength="5000" required></textarea>
        </label>
        <button class="btn primary full" type="submit">Отправить предложение</button>
        <p class="form-note" id="event-form-status"></p>
      </form>
      ${renderAdminPostForm(user)}
    </div>
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

const auditActionLabels = {
  'event.create': 'мероприятие создано',
  'event.vote': 'голос добавлен',
  'event.unvote': 'голос снят',
  'event.status_update': 'статус изменен',
  'event.delete': 'мероприятие удалено',
  'comment.create': 'комментарий создан',
  'comment.hide': 'комментарий скрыт',
  'admin_post.create': 'админский пост создан',
  'admin_post.delete': 'админский пост удален',
  'admin.make_admin': 'роль admin выдана',
  'superadmin.remove_admin': 'роль admin снята',
  'superadmin.block_user': 'пользователь заблокирован',
  'audit.clear': 'история очищена',
};

export function renderAuditLog(data, currentUser) {
  if (!isAdmin(currentUser)) {
    return renderAccessDenied();
  }

  const items = data.items || [];
  const clearButton = isSuperadmin(currentUser)
    ? '<button class="btn danger" id="clear-audit-log" type="button">Очистить историю</button>'
    : '';

  if (!items.length) {
    return `
      <div class="history-actions">${clearButton}</div>
      <div class="empty-state">
        <h3>История пуста</h3>
        <p class="muted">Новые действия появятся здесь.</p>
      </div>
    `;
  }

  return `
    <div class="history-actions">${clearButton}</div>
    <div class="audit-log-list">
      ${items.map((item) => `
        <article class="audit-log-card">
          <div class="meta-row">
            <span class="status discussion">${escapeHtml(auditActionLabels[item.action] || item.action)}</span>
            <span class="card-meta">${formatDate(item.created_at)}</span>
            <span class="card-meta">${escapeHtml(item.actor?.username || 'system')}</span>
          </div>
          <h3>${escapeHtml(item.entity_type)} #${escapeHtml(item.entity_id)}</h3>
          <pre class="audit-detail">${escapeHtml(JSON.stringify(item.details || {}, null, 2))}</pre>
        </article>
      `).join('')}
    </div>
  `;
}

export function telegramStatusText(result) {
  if (!result) {
    return 'Telegram не проверялся.';
  }
  const labels = {
    disabled: 'Telegram выключен.',
    dry_run: 'Telegram dry-run: сообщение не отправлялось.',
    sent: 'Telegram: сообщение отправлено.',
    error: 'Telegram: ошибка отправки.',
  };
  return labels[result.status] || `Telegram: ${result.status || 'неизвестный статус'}.`;
}

const errorStatusLabels = {
  new: 'новое',
  in_progress: 'в работе',
  resolved: 'решено',
};

export function renderErrorLog(data, currentUser) {
  if (!isSuperadmin(currentUser)) {
    return renderAccessDenied();
  }

  const items = data.items || [];
  if (!items.length) {
    return `
      <div class="empty-state">
        <h3>Ошибок нет</h3>
        <p class="muted">Когда появятся системные проблемы, они будут здесь.</p>
      </div>
    `;
  }

  return items.map((item) => `
    <article class="error-log-card">
      <div class="error-log-head">
        <div>
          <div class="meta-row">
            <span class="status ${item.status === 'resolved' ? 'completed' : 'rejected'}">
              ${escapeHtml(errorStatusLabels[item.status] || item.status)}
            </span>
            <span class="card-meta">${formatDate(item.created_at)}</span>
          </div>
          <h3>${escapeHtml(item.source)}</h3>
          <p>${escapeHtml(item.message)}</p>
        </div>
        <select data-error-status="${item.id}" aria-label="Статус ошибки">
          ${Object.entries(errorStatusLabels).map(([value, label]) => `
            <option value="${value}" ${item.status === value ? 'selected' : ''}>${label}</option>
          `).join('')}
        </select>
      </div>
      ${item.detail ? `<pre class="error-detail">${escapeHtml(item.detail)}</pre>` : ''}
      ${item.context && Object.keys(item.context).length
        ? `<pre class="error-detail">${escapeHtml(JSON.stringify(item.context, null, 2))}</pre>`
        : ''}
      <div class="actions-row">
        ${item.status === 'resolved'
          ? `<button class="btn danger" data-delete-error="${item.id}" type="button">Удалить</button>`
          : '<span class="muted">Удаление доступно после статуса «решено».</span>'}
      </div>
    </article>
  `).join('');
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

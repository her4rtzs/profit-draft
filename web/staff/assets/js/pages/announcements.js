/* Staff Announcements page — connected to /api/staff/announcements/ */
PF.ready(() => {
  const { $, $$, esc, fmtDate, timeAgo } = PF;

  const AUD_LABELS = {
    everyone: 'Members and trainers',
    all: 'Members and trainers',
    members: 'Members only',
    trainers: 'Trainers only',
    selected: 'Selected members'
  };

  let state = {
    filter: 'all',
    q: '',
    items: [],
    stats: {
      total: 0,
      published_this_month: 0,
      drafts: 0,
      live_now: 0,
      people_count: 0
    },
    counts: {
      all: 0,
      draft: 0,
      published: 0,
      archived: 0
    },
    loading: true,
    error: null
  };

  function getCsrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function apiRequest(method, path, body) {
    const url = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? '' : '/'}${path}`;
    const headers = { Accept: 'application/json' };
    const opts = { method, headers, credentials: 'same-origin' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      const csrf = getCsrfToken();
      if (csrf) headers['X-CSRFToken'] = csrf;
      opts.body = JSON.stringify(body);
    } else if (method !== 'GET' && method !== 'HEAD') {
      const csrf = getCsrfToken();
      if (csrf) headers['X-CSRFToken'] = csrf;
    }

    const res = await fetch(url, opts);
    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = { detail: text }; }
    }
    if (!res.ok) {
      const err = new Error(extractErrorMessage(data, res.status));
      err.status = res.status;
      err.data = data || {};
      throw err;
    }
    return data;
  }

  function extractErrorMessage(data, status) {
    if (!data) return status === 403 ? 'You do not have permission to manage announcements.' : `Request failed (${status}).`;
    if (typeof data.detail === 'string' && data.detail) return data.detail;
    if (typeof data.error === 'string' && data.error) return data.error;
    for (const k of ['title', 'body', 'message', 'audience', 'event_date', 'status', 'non_field_errors']) {
      if (Array.isArray(data[k]) && data[k].length) return String(data[k][0]);
      if (typeof data[k] === 'string' && data[k]) return data[k];
    }
    return status === 403 ? 'You do not have permission to manage announcements.' : 'Something went wrong. Please try again.';
  }

  const c = $('#content');
  c.insertAdjacentHTML('beforeend', `
    <div class="grid g4" id="aStats"></div>
    <div class="card toolbar ann-toolbar">
      <div class="chips" id="aChips" role="group" aria-label="Filter announcements">
        <button type="button" class="chip active" data-f="all"><span>All</span><span class="chip-count" data-count="all">0</span></button>
        <button type="button" class="chip" data-f="draft"><span>Drafts</span><span class="chip-count" data-count="draft">0</span></button>
        <button type="button" class="chip" data-f="published"><span>Published</span><span class="chip-count" data-count="published">0</span></button>
        <button type="button" class="chip" data-f="archived"><span>Archived</span><span class="chip-count" data-count="archived">0</span></button>
      </div>
      <label class="ann-search" for="aSearch">
        ${PF.icon('search')}
        <input id="aSearch" type="search" placeholder="Search announcements" autocomplete="off" aria-label="Search announcements">
      </label>
      <div class="grow"></div>
      <button class="btn btn-gold" id="newBtn" type="button">${PF.icon('plus')}New announcement</button>
    </div>
    <div id="aList" class="grid" style="gap:12px" aria-live="polite"></div>
  `);

  function renderStatsAndCounts() {
    const s = state.stats || {};
    const cnt = state.counts || {};
    $('#aStats').innerHTML = [
      PF.statTile({
        label: 'Total announcements',
        value: s.total ?? 0,
        sub: 'all statuses',
        icon: 'megaphone',
        tone: 'blue'
      }),
      PF.statTile({
        label: 'Published this month',
        value: s.published_this_month ?? 0,
        sub: `${s.live_now ?? 0} live now`,
        icon: 'calendar-check',
        tone: 'green'
      }),
      PF.statTile({
        label: 'People who can see them',
        value: s.people_count ?? 0,
        sub: 'members + trainers',
        icon: 'users',
        tone: 'purple'
      }),
      PF.statTile({
        label: 'Drafts',
        value: s.drafts ?? 0,
        sub: 'need your attention',
        icon: 'file-text',
        tone: 'gold'
      })
    ].join('');

    const map = {
      all: cnt.all ?? 0,
      draft: cnt.draft ?? 0,
      published: cnt.published ?? 0,
      archived: cnt.archived ?? 0
    };
    Object.keys(map).forEach(k => {
      const el = $(`[data-count="${k}"]`, $('#aChips'));
      if (el) el.textContent = String(map[k]);
    });
  }

  function renderSkeletons() {
    $('#aList').innerHTML = [0, 1].map(() => `
      <div class="ann-skel" aria-hidden="true">
        <div class="ann-skel-ico"></div>
        <div class="ann-skel-body">
          <div class="ann-skel-line" style="width:38%;height:15px"></div>
          <div class="ann-skel-line" style="width:82%"></div>
          <div class="ann-skel-line" style="width:55%"></div>
        </div>
      </div>
    `).join('');
  }

  function renderList() {
    renderStatsAndCounts();

    if (state.loading) {
      renderSkeletons();
      return;
    }

    if (state.error) {
      const isForbidden = state.status === 403 || String(state.error).toLowerCase().includes('permission') || String(state.error).toLowerCase().includes('owner');
      $('#aList').innerHTML = `
        <div class="card"><div class="empty">
          ${PF.icon(isForbidden ? 'lock' : 'alert-circle')}
          <h3>${isForbidden ? 'Owner Access Required' : 'Could not load announcements'}</h3>
          <p style="max-width:420px">${esc(isForbidden ? 'Announcements are managed exclusively by gym owners. Please sign in with an owner account.' : state.error)}</p>
          ${isForbidden ? '<a class="btn btn-gold" href="index.html">Back to dashboard</a>' : `<button class="btn btn-gold" type="button" id="aRetryBtn">${PF.icon('refresh')}Retry</button>`}
        </div></div>
      `;
      const retryBtn = $('#aRetryBtn');
      if (retryBtn) retryBtn.onclick = () => loadAnnouncements({ showSkeleton: true });
      return;
    }

    const list = state.items || [];
    const totalAll = Number(state.counts?.all ?? 0);
    const hasFilterOrSearch = state.filter !== 'all' || Boolean(state.q.trim());

    if (!list.length) {
      if (totalAll === 0 && !hasFilterOrSearch) {
        $('#aList').innerHTML = `
          <div class="card"><div class="empty">
            ${PF.art.megaphone()}
            <h3>No announcements yet</h3>
            <p style="max-width:400px">Stay connected with your members and trainers. Create your first announcement to get started.</p>
            <button class="btn btn-gold" type="button" id="emptyCreateBtn">${PF.icon('plus')}Create your first announcement</button>
          </div></div>
        `;
        const btn = $('#emptyCreateBtn');
        if (btn) btn.onclick = () => openEditor(null, btn);
      } else {
        $('#aList').innerHTML = `
          <div class="card"><div class="empty">
            ${PF.icon('search')}
            <h3>Nothing matches</h3>
            <p style="max-width:400px">No announcements match your current filter or search query.</p>
            <button class="btn btn-sm" type="button" id="clearFilterBtn">Clear filters</button>
          </div></div>
        `;
        const clr = $('#clearFilterBtn');
        if (clr) clr.onclick = () => {
          state.filter = 'all';
          state.q = '';
          const sInput = $('#aSearch');
          if (sInput) sInput.value = '';
          $$('#aChips .chip').forEach(b => b.classList.toggle('active', b.dataset.f === 'all'));
          loadAnnouncements({ showSkeleton: true });
        };
      }
      return;
    }

    $('#aList').innerHTML = list.map(a => {
      const st = String(a.status || 'draft').toLowerCase();
      const audKey = String(a.audience || 'everyone').toLowerCase();
      const audLabel = AUD_LABELS[audKey] || AUD_LABELS.everyone;
      const bodyText = a.body != null ? a.body : (a.message || '');
      const tone = st === 'published' ? 'green' : st === 'draft' ? 'amber' : 'gold';
      const eventBadge = a.event_date
        ? `<span>·</span><span class="pill gold plain">${PF.icon('calendar')}Event: ${esc(fmtDate(a.event_date))}</span>`
        : '';
      const timeMeta = st === 'published' && a.published_at
        ? `Published ${fmtDate(a.published_at.slice(0, 10))}`
        : `Updated ${timeAgo(a.updated_at || a.created_at)}`;

      return `<article class="ann" data-ann-id="${esc(a.id)}">
        <span class="stat-ico tone-${tone}" style="width:46px;height:46px;border-radius:14px">${PF.icon('megaphone')}</span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <h3>${esc(a.title)}</h3>
            ${PF.pill(st)}
          </div>
          ${bodyText ? `<p>${esc(bodyText)}</p>` : ''}
          <div class="meta">
            <span>${PF.icon('users')} ${esc(audLabel)}</span>
            ${eventBadge}
            <span>·</span>
            <span>${esc(timeMeta)}</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap">
          ${st === 'draft' ? `<button class="btn btn-sm btn-gold" type="button" data-pub="${esc(a.id)}">${PF.icon('send')}Publish</button>` : ''}
          <button class="btn btn-sm" type="button" data-edit="${esc(a.id)}">${PF.icon('edit')}Edit</button>
          ${st !== 'archived' ? `<button class="btn btn-sm" type="button" data-arch="${esc(a.id)}" title="Archive announcement">${PF.icon('archive')}Archive</button>` : ''}
          <button class="btn btn-sm btn-danger" type="button" data-del="${esc(a.id)}" aria-label="Delete ${esc(a.title)}">${PF.icon('trash')}</button>
        </div>
      </article>`;
    }).join('');

    $$('[data-edit]', $('#aList')).forEach(b => {
      b.onclick = () => {
        const item = state.items.find(x => String(x.id) === String(b.dataset.edit));
        if (item) openEditor(item, b);
      };
    });
    $$('[data-pub]', $('#aList')).forEach(b => {
      b.onclick = () => publishAnnouncement(b.dataset.pub, b);
    });
    $$('[data-arch]', $('#aList')).forEach(b => {
      b.onclick = () => archiveAnnouncement(b.dataset.arch, b);
    });
    $$('[data-del]', $('#aList')).forEach(b => {
      b.onclick = () => deleteAnnouncement(b.dataset.del, b);
    });
  }

  let fetchSeq = 0;
  async function loadAnnouncements(opts = {}) {
    const seq = ++fetchSeq;
    if (opts.showSkeleton) {
      state.loading = true;
      state.error = null;
      renderList();
    }
    try {
      const params = new URLSearchParams();
      params.set('status', state.filter || 'all');
      if (state.q.trim()) params.set('q', state.q.trim());
      const res = await apiRequest('GET', `/api/staff/announcements/?${params.toString()}`);
      if (seq !== fetchSeq) return;
      state.items = Array.isArray(res.items) ? res.items : (Array.isArray(res) ? res : []);
      if (res.stats) state.stats = res.stats;
      if (res.counts) state.counts = res.counts;
      state.loading = false;
      state.error = null;
      renderList();
    } catch (err) {
      if (seq !== fetchSeq) return;
      state.loading = false;
      state.error = err.message || 'Unable to load announcements.';
      renderList();
    }
  }

  async function publishAnnouncement(id, btn) {
    if (btn) btn.disabled = true;
    try {
      const res = await apiRequest('PATCH', `/api/staff/announcements/${encodeURIComponent(id)}/`, {
        status: 'published'
      });
      if (res.stats) state.stats = res.stats;
      if (res.counts) state.counts = res.counts;
      await loadAnnouncements({ showSkeleton: false });
      PF.toast('Announcement published');
    } catch (err) {
      if (btn) btn.disabled = false;
      PF.toast(err.message || 'Could not publish announcement.', 'err');
    }
  }

  async function archiveAnnouncement(id, btn) {
    if (btn) btn.disabled = true;
    try {
      const res = await apiRequest('PATCH', `/api/staff/announcements/${encodeURIComponent(id)}/`, {
        status: 'archived'
      });
      if (res.stats) state.stats = res.stats;
      if (res.counts) state.counts = res.counts;
      await loadAnnouncements({ showSkeleton: false });
      PF.toast('Moved to Archived');
    } catch (err) {
      if (btn) btn.disabled = false;
      PF.toast(err.message || 'Could not archive announcement.', 'err');
    }
  }

  async function deleteAnnouncement(id, triggerBtn) {
    const target = state.items.find(x => String(x.id) === String(id));
    const confirmed = await PF.confirm({
      title: 'Delete announcement?',
      message: target ? `Delete "${target.title}"? This cannot be undone.` : 'This cannot be undone.',
      confirm: 'Delete',
      danger: true,
      trigger: triggerBtn
    });
    if (!confirmed) return;

    // Optimistic delete with rollback on failure
    const prevItems = state.items.slice();
    const prevStats = { ...state.stats };
    const prevCounts = { ...state.counts };

    state.items = state.items.filter(x => String(x.id) !== String(id));
    renderList();

    try {
      const res = await apiRequest('DELETE', `/api/staff/announcements/${encodeURIComponent(id)}/`);
      if (res && res.stats) state.stats = res.stats;
      if (res && res.counts) state.counts = res.counts;
      await loadAnnouncements({ showSkeleton: false });
      PF.toast('Announcement deleted');
    } catch (err) {
      state.items = prevItems;
      state.stats = prevStats;
      state.counts = prevCounts;
      renderList();
      PF.toast(err.message || 'Could not delete announcement.', 'err');
    }
  }

  function openEditor(existing, triggerEl) {
    const isEdit = Boolean(existing && existing.id != null);
    const a = existing ? {
      id: existing.id,
      title: existing.title || '',
      body: existing.body != null ? existing.body : (existing.message || ''),
      audience: ['everyone', 'members', 'trainers'].includes(String(existing.audience || '').toLowerCase())
        ? String(existing.audience).toLowerCase()
        : 'everyone',
      event_date: existing.event_date || '',
      status: String(existing.status || 'draft').toLowerCase() === 'published' ? 'published' : 'draft'
    } : {
      title: '',
      body: '',
      audience: 'everyone',
      event_date: '',
      status: 'draft'
    };

    let submitting = false;

    const submitWithStatus = async (chosenStatus, close, back) => {
      if (submitting) return false;

      const titleInput = $('#fTitle', back);
      const bodyInput = $('#fBody', back);
      const audSelect = $('#fAud', back);
      const dateInput = $('#fEventDate', back);
      const statusSelect = $('#fStatus', back);

      const titleErr = $('#fTitleErr', back);
      const bodyErr = $('#fBodyErr', back);
      const audErr = $('#fAudErr', back);
      const dateErr = $('#fEventDateErr', back);

      // Clear previous errors
      [titleInput, bodyInput, audSelect, dateInput].forEach(el => el && el.classList.remove('is-invalid'));
      [titleErr, bodyErr, audErr, dateErr].forEach(el => { if (el) { el.hidden = true; el.textContent = ''; } });

      const rawTitle = (titleInput.value || '').trim();
      const rawBody = bodyInput.value || '';
      const rawAud = audSelect.value || 'everyone';
      const rawDate = (dateInput.value || '').trim();
      const finalStatus = chosenStatus || (statusSelect ? statusSelect.value : 'draft');

      if (!rawTitle) {
        titleInput.classList.add('is-invalid');
        titleErr.textContent = 'Please add a title.';
        titleErr.hidden = false;
        titleInput.focus();
        return false;
      }
      if (rawTitle.length > 80) {
        titleInput.classList.add('is-invalid');
        titleErr.textContent = 'Title must be 80 characters or fewer.';
        titleErr.hidden = false;
        titleInput.focus();
        return false;
      }
      if (rawBody.length > 600) {
        bodyInput.classList.add('is-invalid');
        bodyErr.textContent = 'Body must be 600 characters or fewer.';
        bodyErr.hidden = false;
        bodyInput.focus();
        return false;
      }

      submitting = true;
      const footBtns = $$('.modal-foot .btn', back);
      footBtns.forEach(b => { b.disabled = true; });

      try {
        const payload = {
          title: rawTitle,
          body: rawBody,
          audience: rawAud,
          event_date: rawDate || null,
          status: finalStatus
        };
        const res = isEdit
          ? await apiRequest('PATCH', `/api/staff/announcements/${encodeURIComponent(a.id)}/`, payload)
          : await apiRequest('POST', '/api/staff/announcements/', payload);

        if (res && res.stats) state.stats = res.stats;
        if (res && res.counts) state.counts = res.counts;
        await loadAnnouncements({ showSkeleton: false });
        PF.toast(finalStatus === 'published' ? 'Announcement published' : (isEdit ? 'Announcement updated' : 'Draft saved'));
        return true;
      } catch (err) {
        submitting = false;
        footBtns.forEach(b => { b.disabled = false; });
        const d = err.data || {};
        if (d.title) {
          titleInput.classList.add('is-invalid');
          titleErr.textContent = Array.isArray(d.title) ? d.title[0] : String(d.title);
          titleErr.hidden = false;
          titleInput.focus();
        }
        if (d.body || d.message) {
          const msg = d.body || d.message;
          bodyInput.classList.add('is-invalid');
          bodyErr.textContent = Array.isArray(msg) ? msg[0] : String(msg);
          bodyErr.hidden = false;
          if (!d.title) bodyInput.focus();
        }
        if (d.audience) {
          audSelect.classList.add('is-invalid');
          audErr.textContent = Array.isArray(d.audience) ? d.audience[0] : String(d.audience);
          audErr.hidden = false;
        }
        if (d.event_date) {
          dateInput.classList.add('is-invalid');
          dateErr.textContent = Array.isArray(d.event_date) ? d.event_date[0] : String(d.event_date);
          dateErr.hidden = false;
        }
        PF.toast(err.message || 'Could not save announcement.', 'err');
        return false;
      }
    };

    PF.modal({
      title: isEdit ? 'Edit announcement' : 'New announcement',
      trigger: triggerEl || $('#newBtn'),
      html: `<form class="grid" style="gap:14px" id="annModalForm" novalidate>
        <div class="field">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <label for="fTitle">Title <span class="req">*</span></label>
            <span class="hint" id="fTitleCount">${a.title.length}/80</span>
          </div>
          <input class="input" id="fTitle" maxlength="80" required value="${esc(a.title)}" placeholder="e.g. Holiday hours for Christmas week">
          <div class="err" id="fTitleErr" hidden>Please add a title.</div>
        </div>
        <div class="field">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <label for="fBody">Message</label>
            <span class="hint" id="fBodyCount">${a.body.length}/600</span>
          </div>
          <textarea class="textarea" id="fBody" maxlength="600" placeholder="Write the details members or trainers need to know…">${esc(a.body)}</textarea>
          <div class="err" id="fBodyErr" hidden></div>
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="fAud">Audience</label>
            <select class="select" id="fAud">
              ${PF.opts([
                { value: 'everyone', label: 'Members and trainers' },
                { value: 'members', label: 'Members only' },
                { value: 'trainers', label: 'Trainers only' }
              ], a.audience)}
            </select>
            <div class="err" id="fAudErr" hidden></div>
          </div>
          <div class="field">
            <label for="fEventDate">Event date <span class="hint">(optional)</span></label>
            <input class="input" id="fEventDate" type="date" value="${esc(a.event_date)}">
            <div class="err" id="fEventDateErr" hidden></div>
          </div>
        </div>
        <div class="field">
          <label for="fStatus">Status</label>
          <select class="select" id="fStatus">
            ${PF.opts([
              { value: 'draft', label: 'Save as draft' },
              { value: 'published', label: 'Publish now' }
            ], a.status)}
          </select>
        </div>
      </form>`,
      foot: [
        { label: 'Cancel' },
        {
          label: 'Save as draft',
          onClick: (close, back) => submitWithStatus('draft', close, back)
        },
        {
          label: 'Publish now',
          cls: 'btn-gold',
          icon: 'send',
          onClick: (close, back) => submitWithStatus('published', close, back)
        }
      ],
      onOpen: (back, close) => {
        const tIn = $('#fTitle', back);
        const bIn = $('#fBody', back);
        const tCnt = $('#fTitleCount', back);
        const bCnt = $('#fBodyCount', back);
        const tErr = $('#fTitleErr', back);
        const form = $('#annModalForm', back);

        if (tIn) {
          tIn.addEventListener('input', () => {
            if (tCnt) tCnt.textContent = `${tIn.value.length}/80`;
            if (tIn.value.trim()) {
              tIn.classList.remove('is-invalid');
              if (tErr) tErr.hidden = true;
            }
          });
        }
        if (bIn && bCnt) {
          bIn.addEventListener('input', () => {
            bCnt.textContent = `${bIn.value.length}/600`;
          });
        }
        if (form) {
          form.addEventListener('submit', async e => {
            e.preventDefault();
            const st = $('#fStatus', back)?.value || 'draft';
            const ok = await submitWithStatus(st, close, back);
            if (ok !== false) close();
          });
        }
      }
    });
  }

  $$('#aChips .chip').forEach(b => {
    b.onclick = () => {
      $$('#aChips .chip').forEach(x => x.classList.toggle('active', x === b));
      state.filter = b.dataset.f || 'all';
      loadAnnouncements({ showSkeleton: true });
    };
  });

  const searchInput = $('#aSearch');
  if (searchInput) {
    const onSearch = PF.debounce(() => {
      state.q = searchInput.value || '';
      loadAnnouncements({ showSkeleton: false });
    }, 300);
    searchInput.addEventListener('input', onSearch);
  }

  $('#newBtn').onclick = () => openEditor(null, $('#newBtn'));

  loadAnnouncements({ showSkeleton: true });
});

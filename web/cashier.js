(function () {
  'use strict';

  var PLAN_CENTAVOS = {
    daily: 8000,
    monthly: 80000,
    quarterly: 210000,
    annual: 750000,
  };

  var PLAN_LABELS = {
    daily: 'Daily Pass',
    monthly: 'Monthly Membership',
    quarterly: 'Quarterly Membership',
    annual: 'Annual Membership',
    other: 'Other',
  };

  var METHOD_LABELS = {
    CASH: 'Cash (Desk)',
    GCASH: 'GCash (Desk)',
    ONLINE: 'paymongo (old)',
  };

  var RECEIPT_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:20px;height:20px;"><path d="M4 2v20l3-2 3 2 3-2 3 2 4-2V2l-4 2-3-2-3 2-3-2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/></svg>';

  var state = {
    cashierName: 'Front Desk Cashier',
    today: '',
    members: [],
    payments: [],
    paymentMap: new Map(),
    activeMethodFilter: '',
    activeLookupFilter: 'all',
    isSubmitting: false,
    inFlightLoad: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initials(name) {
    var parts = String(name || 'M').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'M';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function fmtPeso(centavos) {
    var num = Number(centavos || 0) / 100;
    return '₱' + num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPesoWhole(centavos) {
    var num = Number(centavos || 0) / 100;
    var hasFraction = Math.round(Number(centavos || 0)) % 100 !== 0;
    return '₱' + num.toLocaleString('en-PH', {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: hasFraction ? 2 : 0,
    });
  }

  function planLabel(planKey) {
    var key = String(planKey || '').toLowerCase();
    return PLAN_LABELS[key] || (planKey ? String(planKey) : 'Unassigned');
  }

  function planPill(planKey) {
    var key = String(planKey || '').toLowerCase();
    var cls = ['daily', 'monthly', 'quarterly', 'annual'].indexOf(key) !== -1 ? key : 'unassigned';
    return '<span class="fn-plan-pill plan-' + cls + '">' + esc(planLabel(planKey)) + '</span>';
  }

  function methodLabel(method, isDesk) {
    var key = String(method || '').toUpperCase();
    if (!key && isDesk === false) return METHOD_LABELS.ONLINE;
    return METHOD_LABELS[key] || (method ? String(method) : '—');
  }

  function isOnlinePayment(p) {
    var m = String((p && p.method) || '').toUpperCase();
    return p && (p.desk === false || m === 'ONLINE');
  }

  function paymentKey(p, fallbackIndex) {
    if (!p) return String(fallbackIndex || 0);
    if (p.ref) return String(p.ref);
    return (p.desk === false ? 'o-' : 'd-') + String(p.id != null ? p.id : fallbackIndex || 0);
  }

  function statusBadge(status) {
    var s = String(status || 'PENDING').toUpperCase();
    var cls = s === 'ACTIVE' ? 'active' : s === 'EXPIRED' ? 'expired' : s === 'PENDING' ? 'expiring' : 'muted';
    var label = s === 'ACTIVE' ? 'Active' : s === 'EXPIRED' ? 'Expired' : s === 'PENDING' ? 'Pending' : 'Inactive';
    return '<span class="badge ' + cls + '">' + label + '</span>';
  }

  function emptyState(text) {
    return '<div class="empty-state"><span class="fn-empty-icon">' + RECEIPT_ICON + '</span><p>' + esc(text) + '</p></div>';
  }

  function setKpiLoading(loading) {
    ['kpiCollectedCard', 'kpiCashCard', 'kpiDigitalCard', 'kpiDueCard'].forEach(function (id) {
      var el = $(id);
      if (el) el.classList.toggle('is-loading', Boolean(loading));
    });
  }

  function showFormStatus(type, message) {
    var el = $('cashierFormStatus');
    if (!el) return;
    el.className = 'fn-status-msg';
    if (!message) {
      el.textContent = '';
      el.hidden = true;
      return;
    }
    if (type === 'error') el.classList.add('is-error');
    el.textContent = message;
    el.hidden = false;
  }

  function setTab(tabName, updateHash) {
    var valid = { terminal: true, history: true, lookup: true };
    var target = valid[tabName] ? tabName : 'terminal';

    document.querySelectorAll('.fn-tabs .tab[data-tab]').forEach(function (btn) {
      var active = btn.getAttribute('data-tab') === target;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    document.querySelectorAll('.pane[data-pane]').forEach(function (pane) {
      var active = pane.getAttribute('data-pane') === target;
      pane.classList.toggle('active', active);
    });

    if (updateHash && window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#' + target);
    }
  }

  function syncAmountFromPlan() {
    var planSelect = $('cashierPlan');
    var amountInput = $('cashierAmount');
    if (!planSelect || !amountInput) return;
    var centavos = PLAN_CENTAVOS[planSelect.value];
    amountInput.value = centavos != null ? fmtPeso(centavos) : '—';
  }

  function findMemberById(memberId) {
    var idNum = Number(memberId);
    if (!idNum) return null;
    for (var i = 0; i < state.members.length; i += 1) {
      if (Number(state.members[i].id) === idNum) return state.members[i];
    }
    return null;
  }

  function renderMemberSelect(preferredId) {
    var select = $('cashierMember');
    var searchInput = $('cashierMemberSearch');
    var countNote = $('cashierMemberCount');
    if (!select) return;

    var query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    var currentValue = preferredId != null ? String(preferredId) : select.value;

    var eligible = state.members.filter(function (m) {
      return String(m.membership_status || '').toUpperCase() !== 'INACTIVE';
    });

    var filtered = eligible.filter(function (m) {
      if (!query) return true;
      var haystack = [m.name, m.email, m.phone, m.membership_status, m.plan]
        .join(' ')
        .toLowerCase();
      return haystack.indexOf(query) !== -1;
    });

    if (countNote) {
      countNote.textContent = query
        ? filtered.length + ' of ' + eligible.length + ' eligible'
        : eligible.length + (eligible.length === 1 ? ' member' : ' members');
    }

    if (!filtered.length) {
      select.innerHTML = '<option value="">No matching members found</option>';
      renderMemberPreview(null);
      return;
    }

    var optionsHtml = ['<option value="">— Select member —</option>'];
    var hasCurrent = false;
    filtered.forEach(function (m) {
      var idStr = String(m.id);
      if (idStr === currentValue) hasCurrent = true;
      var st = String(m.membership_status || 'PENDING').toUpperCase();
      var expText = m.expiry_date ? ' · Exp ' + m.expiry_date : '';
      optionsHtml.push(
        '<option value="' + esc(idStr) + '">' +
          esc(m.name || 'Member') + ' (' + esc(st) + esc(expText) + ')' +
        '</option>'
      );
    });

    select.innerHTML = optionsHtml.join('');
    if (hasCurrent && currentValue) {
      select.value = currentValue;
      renderMemberPreview(findMemberById(currentValue));
    } else if (filtered.length === 1 && query) {
      select.value = String(filtered[0].id);
      renderMemberPreview(filtered[0]);
    } else {
      select.value = '';
      renderMemberPreview(null);
    }
  }

  function renderMemberPreview(member) {
    var box = $('cashierMemberPreview');
    if (!box) return;

    if (!member) {
      box.innerHTML =
        '<div class="cashier-member-meta">' +
          '<strong>No member selected</strong>' +
          '<small>Choose a member above to inspect current plan and expiry date.</small>' +
        '</div>';
      return;
    }

    var st = String(member.membership_status || 'PENDING').toUpperCase();
    var expiry = member.expiry_date || 'No expiry set';
    var contact = [member.email, member.phone].filter(Boolean).join(' · ') || 'No contact on file';

    box.innerHTML =
      '<div class="cashier-member-meta">' +
        '<strong>' + esc(member.name || 'Member') + '</strong>' +
        '<small>' + esc(planLabel(member.plan)) + ' &middot; Exp: ' + esc(expiry) + ' &middot; ' + esc(contact) + '</small>' +
      '</div>' +
      statusBadge(st);
  }

  function renderKpis(overview) {
    var byMethod = (overview && overview.by_method_centavos) || {};
    var collected = Number((overview && overview.collected_today_centavos) || 0);
    var countToday = Number((overview && overview.payments_today_count) || 0);
    var cashToday = Number(byMethod.CASH || 0);
    var digitalToday = Number(byMethod.GCASH || 0) + Number(byMethod.ONLINE || 0);
    var renewalsDue = Number((overview && overview.renewals_due_count) || 0);

    var el;
    if ((el = $('kpiCollectedVal'))) el.textContent = fmtPesoWhole(collected);
    if ((el = $('kpiCollectedSub'))) {
      el.textContent = countToday === 1 ? '1 payment recorded today' : countToday + ' payments recorded today';
    }

    if ((el = $('kpiCashVal'))) el.textContent = fmtPesoWhole(cashToday);
    if ((el = $('kpiCashSub'))) el.textContent = cashToday > 0 ? 'Cash received at desk' : 'No cash payments yet today';

    if ((el = $('kpiDigitalVal'))) el.textContent = fmtPesoWhole(digitalToday);
    if ((el = $('kpiDigitalSub'))) el.textContent = 'GCash and old online payments';

    if ((el = $('kpiDueVal'))) el.textContent = String(renewalsDue);
    if ((el = $('kpiDueSub'))) {
      el.textContent = renewalsDue === 1
        ? '1 expired or expiring within 7 days'
        : renewalsDue + ' expired or expiring within 7 days';
    }
  }

  function renderTodayFeed(overview) {
    var feed = $('cashierTodayFeed');
    var shiftDate = $('cashierShiftDate');
    var countBadge = $('cashierTodayCount');
    if (!feed) return;

    var today = (overview && overview.today) || state.today || '';
    if (shiftDate) {
      shiftDate.textContent = today ? 'Shift date: ' + today : 'Desk payments and approved claims for today.';
    }

    var todays = state.payments.filter(function (p) {
      return !today || p.paid_on === today;
    });

    if (countBadge) {
      countBadge.textContent = todays.length + ' today';
    }

    if (!todays.length) {
      feed.innerHTML = '<li>' + emptyState('No payments recorded yet for ' + (today || 'today') + '.') + '</li>';
      return;
    }

    feed.innerHTML = todays.slice(0, 12).map(function (p, idx) {
      var key = paymentKey(p, idx);
      var memberName = p.name || 'Member';
      var avaSrc = window.ProFitAvatar ? window.ProFitAvatar.dataUrl(p.email || memberName) : '';
      return (
        '<li>' +
          '<div class="mini-avatar">' + (avaSrc ? '<img src="' + avaSrc + '" alt="">' : esc(initials(memberName))) + '</div>' +
          '<div class="grow">' +
            '<strong>' + esc(memberName) + '</strong>' +
            '<small>' + esc(planLabel(p.plan)) + ', ' + esc(methodLabel(p.method, p.desk)) + '</small>' +
          '</div>' +
          '<span class="amt">' + esc(fmtPeso(p.amount_centavos)) + '</span>' +
          '<button type="button" class="fn-btn-dark fn-btn-sm fn-feed-action" data-receipt-key="' + esc(key) + '">Receipt</button>' +
        '</li>'
      );
    }).join('');
  }

  function renderHistoryTable() {
    var tbody = $('cashierHistRows');
    var searchEl = $('cashierHistSearch');
    var countEl = $('cashierHistCount');
    if (!tbody) return;

    var query = searchEl ? searchEl.value.trim().toLowerCase() : '';
    var methodFilter = state.activeMethodFilter;

    var rows = state.payments.filter(function (p) {
      if (methodFilter) {
        if (methodFilter === 'ONLINE') {
          if (!isOnlinePayment(p)) return false;
        } else if (String(p.method || '').toUpperCase() !== methodFilter || p.desk === false) {
          return false;
        }
      }
      if (!query) return true;
      var hay = [
        p.ref,
        p.name,
        p.member_code,
        p.plan,
        planLabel(p.plan),
        p.method,
        methodLabel(p.method, p.desk),
        p.paid_on,
      ].join(' ').toLowerCase();
      return hay.indexOf(query) !== -1;
    });

    if (countEl) {
      countEl.textContent = rows.length + (rows.length === 1 ? ' payment' : ' payments');
    }

    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="7">' +
          emptyState(query ? 'No payment matches "' + query + '".' : 'No matching transactions found.') +
        '</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (p, idx) {
      var key = paymentKey(p, idx);
      var memberName = p.name || 'Member';
      var avaSrc = window.ProFitAvatar ? window.ProFitAvatar.dataUrl(p.email || memberName) : '';
      return (
        '<tr>' +
          '<td><span class="fn-ref">' + esc(p.ref || '—') + '</span></td>' +
          '<td>' +
            '<div class="member">' +
              '<div class="mini-avatar">' + (avaSrc ? '<img src="' + avaSrc + '" alt="">' : esc(initials(memberName))) + '</div>' +
              '<div><strong>' + esc(memberName) + '</strong><small>' + esc(p.member_code || '') + '</small></div>' +
            '</div>' +
          '</td>' +
          '<td class="fn-center">' + planPill(p.plan) + '</td>' +
          '<td>' + esc(methodLabel(p.method, p.desk)) + '</td>' +
          '<td>' + esc(p.paid_on || '—') + '</td>' +
          '<td class="num"><span class="fn-amt">' + esc(fmtPeso(p.amount_centavos)) + '</span></td>' +
          '<td class="fn-right">' +
            '<button type="button" class="fn-btn-dark fn-btn-sm fn-feed-action" data-receipt-key="' + esc(key) + '">Receipt</button>' +
          '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function lookupSortRank(status) {
    var s = String(status || '').toUpperCase();
    if (s === 'EXPIRED') return 0;
    if (s === 'PENDING') return 1;
    if (s === 'ACTIVE') return 2;
    return 3;
  }

  function renderLookupTable() {
    var tbody = $('cashierLookupRows');
    var searchEl = $('cashierLookupSearch');
    var countEl = $('cashierLookupCount');
    if (!tbody) return;

    var query = searchEl ? searchEl.value.trim().toLowerCase() : '';
    var stFilter = state.activeLookupFilter;

    var rows = state.members.filter(function (m) {
      var st = String(m.membership_status || 'PENDING').toUpperCase();
      if (stFilter === 'due' && st !== 'EXPIRED' && st !== 'PENDING') return false;
      if (stFilter === 'active' && st !== 'ACTIVE') return false;
      if (stFilter === 'pending' && st !== 'PENDING') return false;

      if (!query) return true;
      var hay = [m.name, m.email, m.phone, m.plan, st, m.expiry_date].join(' ').toLowerCase();
      return hay.indexOf(query) !== -1;
    }).slice().sort(function (a, b) {
      var rankDiff = lookupSortRank(a.membership_status) - lookupSortRank(b.membership_status);
      if (rankDiff !== 0) return rankDiff;
      return String(a.expiry_date || '9999-99-99').localeCompare(String(b.expiry_date || '9999-99-99'));
    });

    if (countEl) {
      countEl.textContent = rows.length + (rows.length === 1 ? ' member' : ' members');
    }

    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="5">' +
          emptyState(query ? 'No member matches "' + query + '".' : 'No members in this group.') +
        '</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (m) {
      var st = String(m.membership_status || 'PENDING').toUpperCase();
      var memberName = m.name || 'Member';
      var contact = [m.email, m.phone].filter(Boolean).join(' · ') || '—';
      var actionCell = st === 'INACTIVE'
        ? '<span class="fn-locked-pill">Inactive</span>'
        : '<button type="button" class="fn-btn-dark fn-btn-sm fn-feed-action" data-select-member="' + esc(m.id) + '">Take payment</button>';

      var avaSrc = window.ProFitAvatar ? window.ProFitAvatar.dataUrl(m.email || memberName) : '';
      return (
        '<tr>' +
          '<td>' +
            '<div class="member">' +
              '<div class="mini-avatar">' + (avaSrc ? '<img src="' + avaSrc + '" alt="">' : esc(initials(memberName))) + '</div>' +
              '<div><strong>' + esc(memberName) + '</strong><small>' + esc(planLabel(m.plan)) + '</small></div>' +
            '</div>' +
          '</td>' +
          '<td>' + esc(m.expiry_date || '—') + '</td>' +
          '<td>' + esc(contact) + '</td>' +
          '<td class="fn-center">' + statusBadge(st) + '</td>' +
          '<td class="fn-right">' + actionCell + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function openReceiptModal(payment) {
    var modal = $('cashierReceiptModal');
    if (!modal || !payment) return;

    var memberObj = findMemberById(payment.member_id);
    var memberCode = payment.member_code || (payment.member_id ? 'MEM-' + String(payment.member_id).padStart(4, '0') : '—');
    var expiry = payment.expiry_date || (memberObj && memberObj.expiry_date) || 'Updated on account';
    var recordedBy = payment.recorded_by || (payment.desk === false ? 'paymongo (old)' : state.cashierName);

    var fields = {
      recRef: payment.ref || '—',
      recDate: payment.paid_on || state.today || '—',
      recMember: payment.name || (memberObj && memberObj.name) || 'Member',
      recMemberCode: memberCode,
      recPlan: planLabel(payment.plan),
      recMethod: methodLabel(payment.method, payment.desk),
      recCashier: recordedBy,
      recExpiry: expiry,
      recAmount: fmtPeso(payment.amount_centavos),
    };

    Object.keys(fields).forEach(function (id) {
      var el = $(id);
      if (el) el.textContent = fields[id];
    });

    modal.hidden = false;
    var closeBtn = $('receiptCloseBtn');
    if (closeBtn) closeBtn.focus();
  }

  function closeReceiptModal() {
    var modal = $('cashierReceiptModal');
    if (modal) modal.hidden = true;
  }

  function printReceipt() {
    var printArea = $('receiptPrintArea');
    if (!printArea) {
      window.print();
      return;
    }

    var values = {
      ref: $('recRef') ? $('recRef').textContent : '—',
      date: $('recDate') ? $('recDate').textContent : '—',
      member: $('recMember') ? $('recMember').textContent : '—',
      code: $('recMemberCode') ? $('recMemberCode').textContent : '—',
      plan: $('recPlan') ? $('recPlan').textContent : '—',
      method: $('recMethod') ? $('recMethod').textContent : '—',
      cashier: $('recCashier') ? $('recCashier').textContent : '—',
      expiry: $('recExpiry') ? $('recExpiry').textContent : '—',
      amount: $('recAmount') ? $('recAmount').textContent : '₱0.00',
    };

    var docHtml =
      '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<title>ProFit Official Receipt - ' + esc(values.ref) + '</title>' +
      '<style>' +
        'body{font-family:Inter,Arial,sans-serif;color:#111;padding:24px;max-width:420px;margin:0 auto}' +
        '.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px dashed #ccc;padding-bottom:12px;margin-bottom:14px}' +
        '.hdr h1{font-size:16px;margin:0 0 2px}.hdr p{font-size:12px;color:#555;margin:0}' +
        '.stamp{border:2px solid #16a34a;color:#16a34a;font-weight:800;font-size:12px;padding:3px 8px;border-radius:4px}' +
        '.row{display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:5px 0;border-bottom:1px solid #eee}' +
        '.row span{color:#555}.row strong{text-align:right}' +
        '.tot{display:flex;justify-content:space-between;font-size:16px;font-weight:800;padding:12px 0;border-top:2px solid #111;margin-top:10px}' +
        '.foot{font-size:11px;color:#666;text-align:center;margin-top:16px}' +
      '</style></head><body>' +
        '<div class="hdr"><div><h1>ProFit &middot; Functional Fitness Gym</h1><p>Official Front Desk Receipt</p></div><span class="stamp">PAID</span></div>' +
        '<div class="row"><span>Reference No.</span><strong>' + esc(values.ref) + '</strong></div>' +
        '<div class="row"><span>Payment Date</span><strong>' + esc(values.date) + '</strong></div>' +
        '<div class="row"><span>Member</span><strong>' + esc(values.member) + '</strong></div>' +
        '<div class="row"><span>Member Code</span><strong>' + esc(values.code) + '</strong></div>' +
        '<div class="row"><span>Subscription Plan</span><strong>' + esc(values.plan) + '</strong></div>' +
        '<div class="row"><span>Method / Channel</span><strong>' + esc(values.method) + '</strong></div>' +
        '<div class="row"><span>Recorded By</span><strong>' + esc(values.cashier) + '</strong></div>' +
        '<div class="row"><span>Membership Expiry</span><strong>' + esc(values.expiry) + '</strong></div>' +
        '<div class="tot"><span>Total Paid</span><span>' + esc(values.amount) + '</span></div>' +
        '<p class="foot">Thank you for training with Functional Fitness Gym.</p>' +
      '</body></html>';

    try {
      var frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      frame.setAttribute('aria-hidden', 'true');
      document.body.appendChild(frame);

      var win = frame.contentWindow;
      var doc = win.document;
      doc.open();
      doc.write(docHtml);
      doc.close();

      var cleanup = function () {
        if (frame.parentNode) frame.parentNode.removeChild(frame);
      };
      win.addEventListener('afterprint', cleanup, { once: true });
      setTimeout(function () {
        win.focus();
        win.print();
        setTimeout(cleanup, 1500);
      }, 60);
    } catch (_err) {
      window.print();
    }
  }

  function loadShiftData(opts) {
    if (state.inFlightLoad) return state.inFlightLoad;

    var silent = opts && opts.silent;
    var preferredMemberId = opts && opts.preferredMemberId;
    if (!silent) setKpiLoading(true);

    var api = window.ProFitAPI;
    if (!api) {
      setKpiLoading(false);
      showFormStatus('error', 'API client is not loaded.');
      return Promise.resolve();
    }

    state.inFlightLoad = Promise.all([
      api.get('/staff/cashier/overview/'),
      api.get('/staff/members/'),
    ])
      .then(function (results) {
        var overview = results[0] || {};
        var membersPayload = results[1];
        var membersList = Array.isArray(membersPayload)
          ? membersPayload
          : (membersPayload && Array.isArray(membersPayload.results) ? membersPayload.results : []);

        state.members = membersList;
        state.today = overview.today || '';
        if (overview.cashier && overview.cashier.name) {
          state.cashierName = overview.cashier.name;
        } else if (window.ProFitAuth && window.ProFitAuth.user && window.ProFitAuth.user.name) {
          state.cashierName = window.ProFitAuth.user.name;
        }

        state.payments = Array.isArray(overview.recent_payments) ? overview.recent_payments : [];
        state.paymentMap = new Map();
        state.payments.forEach(function (p, idx) {
          state.paymentMap.set(paymentKey(p, idx), p);
        });

        renderKpis(overview);
        renderMemberSelect(preferredMemberId);
        renderTodayFeed(overview);
        renderHistoryTable();
        renderLookupTable();
      })
      .catch(function (err) {
        var msg = (err && (err.detail || err.message)) || 'Unable to load cashier shift data.';
        showFormStatus('error', msg);
        var feed = $('cashierTodayFeed');
        if (feed && !state.payments.length) {
          feed.innerHTML = '<li>' + emptyState(msg) + '</li>';
        }
        var histRows = $('cashierHistRows');
        if (histRows && !state.payments.length) {
          histRows.innerHTML = '<tr><td colspan="7">' + emptyState(msg) + '</td></tr>';
        }
        var lookupRows = $('cashierLookupRows');
        if (lookupRows && !state.members.length) {
          lookupRows.innerHTML = '<tr><td colspan="5">' + emptyState(msg) + '</td></tr>';
        }
      })
      .finally(function () {
        setKpiLoading(false);
        state.inFlightLoad = null;
      });

    return state.inFlightLoad;
  }

  function handlePaymentSubmit(event) {
    event.preventDefault();
    if (state.isSubmitting) return;

    var memberSelect = $('cashierMember');
    var planSelect = $('cashierPlan');
    var methodSelect = $('cashierMethod');
    var submitBtn = $('cashierSubmitBtn');

    var memberId = memberSelect ? Number(memberSelect.value) : 0;
    var plan = planSelect ? planSelect.value : '';
    var method = methodSelect ? methodSelect.value : '';

    if (!Number.isInteger(memberId) || memberId <= 0) {
      showFormStatus('error', 'Select a member before recording a payment.');
      if (memberSelect) memberSelect.focus();
      return;
    }

    var memberObj = findMemberById(memberId);
    if (!memberObj || String(memberObj.membership_status || '').toUpperCase() === 'INACTIVE') {
      showFormStatus('error', 'This member account is inactive and cannot accept payments.');
      return;
    }

    if (!plan || !PLAN_CENTAVOS[plan]) {
      showFormStatus('error', 'Choose a valid subscription plan.');
      if (planSelect) planSelect.focus();
      return;
    }

    if (!method) {
      showFormStatus('error', 'Choose a payment method.');
      if (methodSelect) methodSelect.focus();
      return;
    }
    var reference = $('cashierReference') ? $('cashierReference').value.trim() : '';
    if (method === 'GCASH' && !reference) {
      showFormStatus('error', 'Enter the GCash reference number.');
      if ($('cashierReference')) $('cashierReference').focus();
      return;
    }

    state.isSubmitting = true;
    var originalHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Recording payment...</span>';
    }
    showFormStatus('', '');

    window.ProFitAPI.post('/staff/payments/', {
      member_id: memberId,
      plan: plan,
      method: method,
      reference_number: reference,
    })
      .then(function (res) {
        var payment = (res && res.payment) || {};
        var updatedMember = (res && res.member) || memberObj;
        var enriched = Object.assign({}, payment, {
          desk: true,
          recorded_by: state.cashierName,
          member_code: payment.member_id ? 'MEM-' + String(payment.member_id).padStart(4, '0') : '',
          expiry_date: updatedMember && updatedMember.expiry_date,
        });

        showFormStatus(
          'success',
          'Payment ' + (enriched.ref || '') + ' recorded for ' + (enriched.name || 'member') + '.'
        );

        openReceiptModal(enriched);
        return loadShiftData({ silent: true, preferredMemberId: memberId });
      })
      .catch(function (err) {
        var msg = (err && (err.detail || err.message)) || 'Could not record payment. Please check details and try again.';
        showFormStatus('error', msg);
      })
      .finally(function () {
        state.isSubmitting = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalHtml;
        }
      });
  }

  function handleTakePaymentClick(memberId) {
    var memberObj = findMemberById(memberId);
    if (!memberObj) return;

    var searchBox = $('cashierMemberSearch');
    if (searchBox) searchBox.value = '';

    renderMemberSelect(memberObj.id);
    if (memberObj.plan && PLAN_CENTAVOS[memberObj.plan]) {
      var planEl = $('cashierPlan');
      if (planEl) {
        planEl.value = memberObj.plan;
        syncAmountFromPlan();
      }
    }

    setTab('terminal', true);
    showFormStatus('', '');
    var formEl = $('cashierPayForm');
    if (formEl && formEl.scrollIntoView) {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    var methodEl = $('cashierMethod');
    if (methodEl) methodEl.focus();
  }

  function wireEvents() {
    var syncHash = function () {
      var h = (window.location.hash || '').replace(/^#/, '').toLowerCase();
      if (h === 'history' || h === 'lookup' || h === 'terminal') {
        setTab(h, false);
      }
    };
    window.addEventListener('hashchange', syncHash);
    syncHash();

    document.querySelectorAll('.fn-tabs .tab[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTab(btn.getAttribute('data-tab'), true);
      });
    });

    var refreshBtn = $('cashierRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        loadShiftData({ preferredMemberId: ($('cashierMember') || {}).value });
      });
    }

    var memberSearch = $('cashierMemberSearch');
    if (memberSearch) {
      memberSearch.addEventListener('input', function () {
        renderMemberSelect();
      });
    }

    var memberSelect = $('cashierMember');
    if (memberSelect) {
      memberSelect.addEventListener('change', function () {
        showFormStatus('', '');
        renderMemberPreview(findMemberById(memberSelect.value));
      });
    }

    var planSelect = $('cashierPlan');
    if (planSelect) {
      planSelect.addEventListener('change', syncAmountFromPlan);
    }

    var payForm = $('cashierPayForm');
    if (payForm) {
      payForm.addEventListener('submit', handlePaymentSubmit);
    }

    var histSearch = $('cashierHistSearch');
    if (histSearch) {
      histSearch.addEventListener('input', renderHistoryTable);
    }

    var methodChips = $('cashierMethodChips');
    if (methodChips) {
      methodChips.addEventListener('click', function (event) {
        var btn = event.target.closest('button.chip[data-method]');
        if (!btn) return;
        state.activeMethodFilter = btn.getAttribute('data-method') || '';
        methodChips.querySelectorAll('.chip').forEach(function (chip) {
          chip.classList.toggle('active', chip === btn);
        });
        renderHistoryTable();
      });
    }

    var lookupSearch = $('cashierLookupSearch');
    if (lookupSearch) {
      lookupSearch.addEventListener('input', renderLookupTable);
    }

    var lookupChips = $('cashierLookupChips');
    if (lookupChips) {
      lookupChips.addEventListener('click', function (event) {
        var btn = event.target.closest('button.chip[data-status]');
        if (!btn) return;
        state.activeLookupFilter = btn.getAttribute('data-status') || 'all';
        lookupChips.querySelectorAll('.chip').forEach(function (chip) {
          chip.classList.toggle('active', chip === btn);
        });
        renderLookupTable();
      });
    }

    document.addEventListener('click', function (event) {
      var receiptBtn = event.target.closest('[data-receipt-key]');
      if (receiptBtn) {
        var key = receiptBtn.getAttribute('data-receipt-key');
        var record = state.paymentMap.get(key);
        if (record) openReceiptModal(record);
        return;
      }

      var selectMemberBtn = event.target.closest('[data-select-member]');
      if (selectMemberBtn) {
        handleTakePaymentClick(selectMemberBtn.getAttribute('data-select-member'));
      }
    });

    var closeBtn = $('receiptCloseBtn');
    var printBtn = $('receiptPrintBtn');
    var modal = $('cashierReceiptModal');

    if (closeBtn) closeBtn.addEventListener('click', closeReceiptModal);
    if (printBtn) printBtn.addEventListener('click', printReceipt);
    if (modal) {
      modal.addEventListener('click', function (event) {
        if (event.target === modal) closeReceiptModal();
      });
    }

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && modal && !modal.hidden) {
        closeReceiptModal();
      }
    });

    window.addEventListener('profit-auth-ready', function (event) {
      var detailUser = event && event.detail && event.detail.user;
      if (detailUser && detailUser.name) {
        state.cashierName = detailUser.name;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    syncAmountFromPlan();
    wireEvents();
    loadShiftData();
  });
})();

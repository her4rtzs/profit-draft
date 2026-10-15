// =====================================================
// pages.js — logic for Members, Attendance, Payments, Reports
// (needs data.js loaded first)
// =====================================================

(() => {
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const params = new URLSearchParams(location.search);

    // ---------- shared bits ----------
    let toastTimer;
    function toast(msg, isError = false) {
        let t = $(".toast");
        if (!t) {
            t = document.createElement("div");
            t.className = "toast";
            t.setAttribute("role", "status");
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.classList.toggle("error", isError);
        t.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
    }

    function showTab(name) {
        $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
        $$(".pane").forEach(p => p.classList.toggle("active", p.dataset.pane === name));
    }

    function initTabs() {
        $$(".tab").forEach(t => t.addEventListener("click", () => {
            showTab(t.dataset.tab);
            history.replaceState(null, "", "#" + t.dataset.tab);
        }));
        const h = location.hash.slice(1);
        if (h && $(`.tab[data-tab="${h}"]`)) showTab(h);
    }

    function initChips(container, onChange) {
        container.addEventListener("click", e => {
            const chip = e.target.closest(".chip");
            if (!chip) return;
            $$(".chip", container).forEach(c => c.classList.toggle("active", c === chip));
            onChange(chip.dataset.filter);
        });
    }

    const planOptions = () => Object.entries(PLANS)
        .map(([k, p]) => `<option value="${k}">${p.label} - ${peso(p.price)}</option>`).join("");
    const methodOptions = () => METHODS.map(m => `<option>${m}</option>`).join("");

    const memberCell = m => `
        <div class="member">
            <div class="mini-avatar">${initials(m.name)}</div>
            <div><strong>${esc(m.name)}</strong><small>${esc(PLANS[m.plan].label)}</small></div>
        </div>`;

    const badge = m => { const s = statusOf(m); return `<span class="badge ${s.cls}">${s.label}</span>`; };
    const todays = () => DB.checkins.filter(c => toISO(c.date) === toISO(TODAY));
    const newest = (a, b) => (b.date - a.date) || b.ref.localeCompare(a.ref);

    function renew(m, planKey) {
        const base = m.end > TODAY ? m.end : TODAY;
        m.plan = planKey;
        m.start = base;
        m.end = addDays(base, PLANS[planKey].days);
    }

    function recordPayment(m, planKey, method) {
        const p = { ref: DB.nextRef(), date: TODAY, memberId: m.id, plan: planKey, method, amount: PLANS[planKey].price };
        DB.payments.push(p);
        return p;
    }

    const empty = (icon, text) => `<div class="empty-state"><i class="fa-solid ${icon}"></i><p>${text}</p></div>`;

    // =====================================================
    // MEMBERS
    // =====================================================
    function pageMembers() {
        let filter = "all";
        let current = DB.members.length ? DB.members[DB.members.length - 1].id : null;
        const search = $("#memberSearch");
        const rows = $("#memberRows");
        const view = $("#profileView");
        const form = $("#enrollForm");

        search.value = params.get("q") || "";

        const draw = () => {
            const q = search.value.trim().toLowerCase();
            const list = [...DB.members].reverse().filter(m =>
                (filter === "all" || statusOf(m).key === filter) &&
                (!q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)));

            rows.innerHTML = list.length ? list.map(m => `
                <tr data-id="${m.id}">
                    <td><span class="member-id">${m.id}</span></td>
                    <td>${memberCell(m)}</td>
                    <td>${fmtShort(m.end)}</td>
                    <td>${badge(m)}</td>
                    <td><button class="action-btn" type="button" aria-label="View profile of ${esc(m.name)}"><i class="fa-solid fa-chevron-right"></i></button></td>
                </tr>`).join("")
                : `<tr><td colspan="5">${empty("fa-user-slash", "No members found.")}</td></tr>`;

            $("#memberCount").textContent = `${list.length} member${list.length === 1 ? "" : "s"}`;
        };

        const drawProfile = () => {
            const m = DB.member(current);
            if (!m) { view.innerHTML = empty("fa-id-card", "Pick a member from the list to see their profile."); return; }

            const dl = daysLeft(m);
            const mine = DB.payments.filter(p => p.memberId === m.id).sort(newest);
            const total = mine.reduce((s, p) => s + p.amount, 0);

            view.innerHTML = `
                <div class="profile-head">
                    <div class="ring lg"><div class="face">${initials(m.name)}</div></div>
                    <div class="profile-main">
                        <h2>${esc(m.name)} ${badge(m)}</h2>
                        <p class="muted">Member ID ${m.id}</p>
                        <div class="profile-actions">
                            <a class="btn btn-primary btn-sm" href="payments.html?member=${m.id}#daily">Renew membership</a>
                            <a class="btn btn-soft btn-sm" href="attendance.html?member=${m.id}">Check in today</a>
                        </div>
                        <div class="profile-stats">
                            <div><strong>${m.checkins}</strong><span>Check-ins</span></div>
                            <div><strong>${Math.max(dl, 0)}</strong><span>Days left</span></div>
                            <div><strong>${esc(PLANS[m.plan].label)}</strong><span>Plan</span></div>
                        </div>
                    </div>
                </div>
                <div class="details">
                    <div><small>Contact number</small><strong>${esc(m.phone || "Not provided")}</strong></div>
                    <div><small>Membership started</small><strong>${fmtDate(m.start)}</strong></div>
                    <div><small>Membership ends</small><strong>${fmtDate(m.end)}</strong></div>
                    <div><small>Last payment</small><strong>${mine[0] ? `${peso(mine[0].amount)} on ${fmtShort(mine[0].date)}` : "No payments yet"}</strong></div>
                    <div><small>Total paid</small><strong>${peso(total)}</strong></div>
                    <div><small>Payments made</small><strong>${mine.length}</strong></div>
                </div>`;
        };

        initChips($("#memberChips"), f => { filter = f; draw(); });
        search.addEventListener("input", draw);

        rows.addEventListener("click", e => {
            const tr = e.target.closest("tr[data-id]");
            if (!tr) return;
            current = tr.dataset.id;
            drawProfile();
            showTab("profile");
            history.replaceState(null, "", "#profile");
        });

        $("#addMember").addEventListener("click", () => { showTab("enroll"); history.replaceState(null, "", "#enroll"); });

        // enrollment form
        const ePlan = $("#ePlan");
        const eAmount = $("#eAmount");
        ePlan.innerHTML = planOptions();
        $("#eMethod").innerHTML = methodOptions();
        const resetForm = () => { form.reset(); $("#eStart").value = toISO(TODAY); eAmount.value = peso(PLANS[ePlan.value].price); };
        ePlan.addEventListener("change", () => { eAmount.value = peso(PLANS[ePlan.value].price); });
        resetForm();

        form.addEventListener("submit", e => {
            e.preventDefault();
            const f = new FormData(form);
            const plan = f.get("plan");
            const start = fromISO(f.get("start"));
            const m = {
                id: DB.nextMemberId(),
                name: f.get("name").trim(),
                phone: f.get("phone").trim(),
                plan, start,
                end: addDays(start, PLANS[plan].days),
                checkins: 0
            };
            DB.members.push(m);
            recordPayment(m, plan, f.get("method"));
            DB.save();
            current = m.id;
            resetForm();
            draw();
            drawProfile();
            showTab("profile");
            history.replaceState(null, "", "#profile");
            toast(`${m.name} is enrolled`);
        });

        draw();
        drawProfile();
        initTabs();
        if (params.get("q")) showTab("all");
    }

    // =====================================================
    // ATTENDANCE
    // =====================================================
    function pageAttendance() {
        const input = $("#ciInput");

        $("#ciList").innerHTML = DB.members
            .map(m => `<option value="${m.id} - ${esc(m.name)}"></option>`).join("");

        if (params.get("member")) {
            const m = DB.member(params.get("member"));
            if (m) input.value = `${m.id} - ${m.name}`;
        }

        const draw = () => {
            const list = todays().slice().reverse();

            // The period chart and its three summary numbers are owned by
            // chart-periods.js, which buckets real check-ins for whichever
            // window (Days / Week / Month / Year) is selected. Drawing the
            // old hard-coded series here would just overwrite it.

            // today's table
            $("#ciRows").innerHTML = list.length ? list.map(c => {
                const m = DB.member(c.memberId);
                return m ? `
                <tr>
                    <td>${c.time}</td>
                    <td>${memberCell(m)}</td>
                    <td>${fmtShort(m.end)}</td>
                    <td>${badge(m)}</td>
                </tr>` : "";
            }).join("") : `<tr><td colspan="4">${empty("fa-door-open", "No one has checked in yet today.")}</td></tr>`;
        };

        const checkIn = async () => {
            const raw = input.value.trim();
            if (!raw) return toast("Type a member name or ID first");

            const idMatch = raw.match(/^m\d+/i);
            const m = idMatch
                ? DB.member(idMatch[0].toUpperCase())
                : DB.members.find(x => x.name.toLowerCase().includes(raw.toLowerCase()));

            if (!m) return toast("No member found with that name or ID");
            if (statusOf(m).key === "expired") return toast(`${m.name}'s membership has expired. Renew it first.`);
            if (todays().some(c => c.memberId === m.id)) return toast(`${m.name} already checked in today`);

            try {
                await window.ProFitAPI.post("/staff/attendance/check-in/", { member_id: m.serverId });
            } catch (err) {
                return toast(err.message || "Check-in failed");
            }
            DB.checkins.push({ date: TODAY, time: nowTime(), memberId: m.id });
            m.checkins++;
            DB.save();
            input.value = "";
            draw();
            toast(`${m.name} checked in`);
        };

        $("#ciBtn").addEventListener("click", checkIn);
        input.addEventListener("keydown", e => { if (e.key === "Enter") checkIn(); });
        draw();
    }

    // =====================================================
    // PAYMENTS
    // =====================================================
    function pagePayments() {
        const sel = $("#payMember");
        const planSel = $("#payPlan");
        const amount = $("#payAmount");
        let filter = "all";

        sel.innerHTML = DB.members.map(m => `<option value="${m.id}">${esc(m.name)} (${m.id})</option>`).join("");
        planSel.innerHTML = planOptions();
        $("#payMethod").innerHTML = methodOptions();

        const syncAmount = () => { amount.value = peso(PLANS[planSel.value].price); };
        const syncFromMember = () => {
            const m = DB.member(sel.value);
            if (m) planSel.value = m.plan;
            syncAmount();
        };

        if (params.get("member") && DB.member(params.get("member"))) sel.value = params.get("member");
        syncFromMember();
        sel.addEventListener("change", syncFromMember);
        planSel.addEventListener("change", syncAmount);

        const drawToday = () => {
            const list = DB.payments.filter(p => toISO(p.date) === toISO(TODAY)).sort(newest);
            const total = list.reduce((s, p) => s + p.amount, 0);
            $("#todayTotal").textContent = peso(total);
            $("#todayCount").textContent = `${list.length} payment${list.length === 1 ? "" : "s"} received today`;
            $("#todayFeed").innerHTML = list.length ? list.map(p => {
                const m = DB.member(p.memberId);
                const name = m ? m.name : p.memberId;
                return `
                <li>
                    <div class="mini-avatar">${initials(name)}</div>
                    <div class="grow"><strong>${esc(name)}</strong><small>${PLANS[p.plan].label}, ${p.method}</small></div>
                    <span class="amt">${peso(p.amount)}</span>
                </li>`;
            }).join("") : `<li>${empty("fa-receipt", "No payments recorded today.")}</li>`;
        };

        const drawSubs = () => {
            const q = ($("#subSearch")?.value || "").trim().toLowerCase();
            const all = DB.members.filter(m => filter === "all" || statusOf(m).key === filter)
                .sort((a, b) => daysLeft(a) - daysLeft(b));
            // Search narrows the same list the chips already filtered, so the two
            // controls compose instead of one overriding the other.
            const list = q
                ? all.filter(m => `${m.name} ${m.id}`.toLowerCase().includes(q))
                : all;

            const count = $("#subCount");
            if (count) count.textContent = `${list.length} of ${DB.members.length} member${DB.members.length === 1 ? "" : "s"}`;

            $("#subRows").innerHTML = list.length ? list.map(m => {
                const st = statusOf(m), dl = daysLeft(m);
                const pct = Math.max(0, Math.min(100, (dl / PLANS[m.plan].days) * 100));
                const label = dl < 0 ? `Expired ${-dl} day${dl === -1 ? "" : "s"} ago`
                            : dl === 0 ? "Expires today"
                            : `${dl} day${dl === 1 ? "" : "s"} left`;
                const tone = st.key === "active" ? "" : st.key === "expiring" ? "warning" : "expired";
                return `
                <tr>
                    <td>${memberCell(m)}</td>
                    <td>${fmtShort(m.end)}</td>
                    <td><div class="timeleft"><div class="progress ${tone}"><i style="width:${pct}%"></i></div><small>${label}</small></div></td>
                    <td>${badge(m)}</td>
                    <td><a class="btn btn-soft btn-sm" href="payments.html?member=${m.id}#daily">Renew</a></td>
                </tr>`;
            }).join("") : `<tr><td colspan="5">${empty("fa-hourglass-half", q ? `No member matches “${esc(q)}”.` : "No members in this group.")}</td></tr>`;
        };

        $("#payForm").addEventListener("submit", async e => {
            e.preventDefault();
            const m = DB.member(sel.value);
            if (!m) return toast("Pick a member first");
            if (!m.serverId) return toast("This member is not on the server yet.");
            try {
                // The server records the payment and renews the membership in one step.
                await window.ProFitAPI.post("/staff/payments/", {
                    member_id: m.serverId, plan: planSel.value, method: METHOD_CODE[$("#payMethod").value] || "CASH"
                });
                if (!(await DB.sync(false))) throw new Error("Saved, but the list could not be refreshed. Reload the page.");
            } catch (err) {
                return toast(err.message || "The payment could not be recorded.", true);
            }
            const fresh = DB.member(m.id) || m;
            drawToday();
            drawSubs();
            toast(`Payment recorded. ${fresh.name} is covered until ${fmtShort(fresh.end)}`);
        });

        // ---- Payment history (Owner can correct method / date of desk payments) ----
        const toDay = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
        let editing = null;
        const drawHist = () => {
            const q = ($("#histSearch")?.value || "").trim().toLowerCase();
            const all = DB.payments.slice().sort((a, b) => b.date - a.date);
            const list = q ? all.filter(p => {
                const m = DB.member(p.memberId);
                return `${m ? m.name : ""} ${p.ref} ${p.method}`.toLowerCase().includes(q);
            }) : all;
            $("#histCount").textContent = `${list.length} of ${all.length} payment${all.length === 1 ? "" : "s"}`;
            $("#histRows").innerHTML = list.length ? list.map(p => {
                const m = DB.member(p.memberId);
                const edit = p.desk ? `<div class="pay-actions"><button type="button" class="pay-edit-btn" data-edit="${esc(p.id)}" aria-label="Edit payment ${esc(p.ref)}"><i class="fa-solid fa-pen"></i></button><button type="button" class="pay-edit-btn pay-del-btn" data-del="${esc(p.id)}" aria-label="Delete payment ${esc(p.ref)}"><i class="fa-solid fa-trash"></i></button></div>` : `<small class="muted">Online</small>`;
                return `<tr><td>${esc(p.ref)}</td><td>${m ? memberCell(m) : esc(p.memberId)}</td><td>${PLANS[p.plan] ? PLANS[p.plan].label : esc(p.plan)}</td><td>${esc(p.method)}</td><td>${fmtShort(p.date)}</td><td>${peso(p.amount)}</td><td>${edit}</td></tr>`;
            }).join("") : `<tr><td colspan="7">${empty("fa-receipt", q ? `No payment matches “${esc(q)}”.` : "No payments recorded yet.")}</td></tr>`;
        };
        const modal = $("#payEditModal");
        const closeEdit = () => { modal.hidden = true; editing = null; };
        $("#histRows").addEventListener("click", e => {
            const btn = e.target.closest("[data-edit]");
            if (!btn) return;
            editing = DB.payments.find(p => String(p.id) === btn.dataset.edit);
            if (!editing) return;
            const m = DB.member(editing.memberId);
            $("#payEditInfo").textContent = `${editing.ref} · ${m ? m.name : ""} · ${peso(editing.amount)}`;
            $("#payEditMethod").innerHTML = methodOptions();
            $("#payEditMethod").value = editing.method;
            $("#payEditDate").value = toDay(editing.date);
            $("#payEditDate").max = toDay(new Date());
            modal.hidden = false;
            $("#payEditMethod").focus();
        });
        $("#payEditCancel").addEventListener("click", closeEdit);
        modal.addEventListener("click", e => { if (e.target === modal) closeEdit(); });
        document.addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) closeEdit(); });
        $("#payEditForm").addEventListener("submit", async e => {
            e.preventDefault();
            if (!editing) return;
            try {
                await window.ProFitAPI.patch(`/staff/payments/${editing.id}/`, {
                    method: METHOD_CODE[$("#payEditMethod").value] || editing.methodCode,
                    paid_on: $("#payEditDate").value
                });
                if (!(await DB.sync(false))) throw new Error("Saved, but the list could not be refreshed. Reload the page.");
            } catch (err) {
                return toast(err.message || "The payment could not be updated.", true);
            }
            closeEdit(); drawHist(); drawToday(); toast("Payment updated.");
        });
        $("#histSearch")?.addEventListener("input", drawHist);

        // ---- Delete a desk payment ----
        const delModal = $("#payDelModal");
        let deleting = null;
        const closeDel = () => { delModal.hidden = true; deleting = null; };
        $("#histRows").addEventListener("click", e => {
            const btn = e.target.closest("[data-del]");
            if (!btn) return;
            deleting = DB.payments.find(p => String(p.id) === btn.dataset.del);
            if (!deleting) return;
            const m = DB.member(deleting.memberId);
            $("#payDelInfo").textContent = `${deleting.ref} · ${m ? m.name : ""} · ${peso(deleting.amount)} · ${fmtShort(deleting.date)}`;
            delModal.hidden = false;
            $("#payDelCancel").focus();
        });
        $("#payDelCancel").addEventListener("click", closeDel);
        delModal.addEventListener("click", e => { if (e.target === delModal) closeDel(); });
        document.addEventListener("keydown", e => { if (e.key === "Escape" && !delModal.hidden) closeDel(); });
        $("#payDelConfirm").addEventListener("click", async () => {
            if (!deleting) return;
            const target = deleting;
            try {
                await window.ProFitAPI.request(`/staff/payments/${target.id}/`, { method: "DELETE" });
                if (!(await DB.sync(false))) throw new Error("Deleted, but the list could not be refreshed. Reload the page.");
            } catch (err) {
                return toast(err.message || "The payment could not be deleted.", true);
            }
            closeDel(); drawHist(); drawToday(); toast("Payment deleted.");
        });

        initChips($("#subChips"), f => { filter = f; drawSubs(); });
        // Typing narrows as you go, same as the reports search.
        $("#subSearch")?.addEventListener("input", drawSubs);
        drawToday();
        drawSubs();
        drawHist();
        initTabs();
    }

    // =====================================================
    // REPORTS
    // =====================================================
    function pageReports() {
        let method = "all";
        const search = $("#txSearch");
        const methodSel = $("#txMethod");
        methodSel.innerHTML = `<option value="all">All methods</option>` + methodOptions();

        const nameOf = id => (DB.member(id) || { name: id }).name;
        const filtered = () => {
            const q = search.value.trim().toLowerCase();
            return DB.payments.filter(p =>
                (method === "all" || p.method === method) &&
                (!q || nameOf(p.memberId).toLowerCase().includes(q) || p.ref.toLowerCase().includes(q)))
                .sort(newest);
        };

        const drawTx = () => {
            const list = filtered();
            $("#txRows").innerHTML = list.length ? list.map(p => `
                <tr>
                    <td>${fmtShort(p.date)}</td>
                    <td><span class="member-id">${p.ref}</span></td>
                    <td><strong class="plain">${esc(nameOf(p.memberId))}</strong></td>
                    <td>${PLANS[p.plan].label}</td>
                    <td>${p.method}</td>
                    <td class="num"><strong class="plain">${peso(p.amount)}</strong></td>
                </tr>`).join("")
                : `<tr><td colspan="6">${empty("fa-receipt", "No transactions match your search.")}</td></tr>`;
            $("#txTotal").textContent = peso(list.reduce((s, p) => s + p.amount, 0));
            $("#txCount").textContent = `${list.length} transaction${list.length === 1 ? "" : "s"}`;
        };

        const bars = (target, groups, total) => {
            target.innerHTML = groups.map(([label, value]) => `
                <div class="break-row">
                    <div class="top"><span>${label}</span><strong>${peso(value)}</strong></div>
                    <div class="progress gold"><i style="width:${total ? (value / total) * 100 : 0}%"></i></div>
                </div>`).join("");
        };

        const drawSummary = () => {
            const all = DB.payments;
            const total = all.reduce((s, p) => s + p.amount, 0);
            $("#sumTotal").textContent = peso(total);
            $("#sumCount").textContent = all.length;
            $("#sumAvg").textContent = peso(all.length ? Math.round(total / all.length) : 0);
            bars($("#byPlan"), Object.entries(PLANS).map(([k, p]) =>
                [p.label, all.filter(x => x.plan === k).reduce((s, x) => s + x.amount, 0)]), total);
            bars($("#byMethod"), METHODS.map(m =>
                [m, all.filter(x => x.method === m).reduce((s, x) => s + x.amount, 0)]), total);
        };

        search.addEventListener("input", drawTx);
        methodSel.addEventListener("change", () => { method = methodSel.value; drawTx(); });

        $("#exportCsv").addEventListener("click", () => {
            const q = v => `"${String(v).replace(/"/g, '""')}"`;
            const lines = [["Date", "Reference", "Member ID", "Member", "Plan", "Method", "Amount"].join(",")]
                .concat(filtered().map(p => [toISO(p.date), p.ref, p.memberId, nameOf(p.memberId), PLANS[p.plan].label, p.method, p.amount].map(q).join(",")));
            const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "profit-transactions.csv";
            a.click();
            URL.revokeObjectURL(a.href);
            toast("Transactions exported");
        });

        // PDF: a print-perfect A4 sheet of whatever is currently filtered.
        // Rendered into a hidden frame so Ctrl+P on the app itself stays intact,
        // and no third-party library is needed to open it offline.
        $("#exportPdf")?.addEventListener("click", () => {
            const rows = filtered();
            if (!rows.length) return toast("There is nothing to export yet.", true);
            const total = rows.reduce((s, p) => s + p.amount, 0);
            const gyml = document.getElementById("gymNameTxt")?.textContent || "ProFit";
            const esc = v => String(v ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
            const scope = `${methodSel.options[methodSel.selectedIndex]?.text || "All methods"}${search.value.trim() ? ` · “${esc(search.value.trim())}”` : ""}`;
            const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Financial report</title><style>
                @page { size: A4; margin: 18mm 14mm; }
                * { box-sizing: border-box; }
                body { margin: 0; font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #14181f; font-size: 11px; }
                header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; border-bottom: 2px solid #b8891c; padding-bottom: 10px; margin-bottom: 16px; }
                h1 { margin: 0 0 3px; font-size: 20px; letter-spacing: -.02em; }
                .meta { color: #5b6472; font-size: 10px; }
                .scope { text-align: right; }
                .chips { display: flex; gap: 26px; margin-bottom: 18px; }
                .chip b { display: block; font-size: 16px; }
                .chip span { color: #5b6472; font-size: 9px; text-transform: uppercase; letter-spacing: .07em; }
                table { width: 100%; border-collapse: collapse; }
                th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #5b6472; border-bottom: 1px solid #c9ced6; padding: 6px 8px; }
                td { padding: 7px 8px; border-bottom: 1px solid #eceef1; }
                th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
                tfoot td { font-weight: 700; border-top: 2px solid #14181f; border-bottom: 0; padding-top: 10px; }
                footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #eceef1; color: #8a919d; font-size: 9px; }
                tr { page-break-inside: avoid; }
            </style></head><body>
                <header>
                    <div><h1>${esc(gyml)} — Financial report</h1>
                    <div class="meta">Payments &amp; billing · generated ${new Date().toLocaleString()}</div></div>
                    <div class="meta scope">${scope}<br>${rows.length} transaction${rows.length === 1 ? "" : "s"}</div>
                </header>
                <div class="chips">
                    <div class="chip"><b>${peso(total)}</b><span>Total collected</span></div>
                    <div class="chip"><b>${rows.length}</b><span>Transactions</span></div>
                    <div class="chip"><b>${peso(rows.length ? Math.round(total / rows.length) : 0)}</b><span>Average</span></div>
                </div>
                <table>
                    <thead><tr><th>Date</th><th>Reference</th><th>Member</th><th>Plan</th><th>Method</th><th class="num">Amount</th></tr></thead>
                    <tbody>${rows.map(p => `<tr><td>${esc(toISO(p.date))}</td><td>${esc(p.ref)}</td><td>${esc(nameOf(p.memberId))}</td><td>${esc(PLANS[p.plan].label)}</td><td>${esc(p.method)}</td><td class="num">${peso(p.amount)}</td></tr>`).join("")}</tbody>
                    <tfoot><tr><td colspan="5">Total</td><td class="num">${peso(total)}</td></tr></tfoot>
                </table>
                <footer>Generated by ProFit. This report reflects the transactions currently filtered in the app.</footer>
            </body></html>`;

            const frame = document.createElement("iframe");
            frame.setAttribute("aria-hidden", "true");
            frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0";
            document.body.appendChild(frame);
            const fdoc = frame.contentDocument || frame.contentWindow.document;
            fdoc.open(); fdoc.write(doc); fdoc.close();
            setTimeout(() => {
                frame.contentWindow.focus();
                frame.contentWindow.print();
                toast("Choose “Save as PDF” in the print dialog");
                setTimeout(() => frame.remove(), 60000);
            }, 350);
        });

        drawTx();
        drawSummary();
        initTabs();
    }

    // ---------- start ----------
    const page = document.body.dataset.page;
    ({ members: pageMembers, attendance: pageAttendance, payments: pagePayments, reports: pageReports })[page]?.();
})();

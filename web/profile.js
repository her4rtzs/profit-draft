// My profile: staff photo and details, kept in this browser and mirrored into
// the rail and header avatar the moment anything is saved.
(() => {
  const $ = id => document.getElementById(id);
  const notice = $("profileNotice");
  const flash = (msg, bad) => {
    if (!notice) return;
    notice.hidden = false;
    notice.textContent = msg;
    notice.classList.toggle("error", !!bad);
    if (!bad) notice.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  let profile = window.ProFitProfile.get();

  function validFullName(raw) {
    const parts = String(raw || "").trim().split(/\s+/).filter(Boolean);
    return parts.length >= 2 && /[A-Za-z]/.test(parts[0]) && /[A-Za-z]/.test(parts[parts.length - 1]);
  }

  function syncFromAuth() {
    profile = window.ProFitProfile.get();
    paint();
  }

  function paint() {
    const cleanName = (profile.name || "").trim();
    const hasName = Boolean(cleanName) && !cleanName.includes("@");
    $("identityName").textContent = hasName ? cleanName : "Name not set";
    $("identityRole").textContent = profile.role || "Gym administrator";
    $("profileName").value = hasName ? cleanName : "";
    $("profileRole").value = profile.role || "";
    $("profileEmail").value = profile.email || "";
    $("profilePhone").value = profile.phone || "";
    $("profileBio").value = profile.bio || "";

    const box = $("profilePhotoBox");
    if (!box) return;
    const authUser = window.ProFitAuth && window.ProFitAuth.user;
    const seed = (authUser && (authUser.email || authUser.id || authUser.name)) || profile.email || cleanName || "profit-staff";
    if (window.ProFitAvatar) {
      window.ProFitAvatar.paint(box, { photo: profile.photo || "", seed, alt: hasName ? cleanName : "Profile avatar" });
    } else {
      const img = box.querySelector("img");
      if (profile.photo) {
        if (!img) { const el = document.createElement("img"); el.alt = ""; box.prepend(el); }
        box.querySelector("img").src = profile.photo;
        box.classList.add("has-photo");
      } else {
        if (img) img.remove();
        box.classList.remove("has-photo");
      }
    }
    const clear = $("profilePhotoClear");
    if (clear) clear.disabled = !profile.photo;

    // Live completeness ring & checklist
    const checks = {
      name: hasName,
      photo: Boolean(profile.photo),
      phone: Boolean((profile.phone || "").trim()),
      bio: Boolean((profile.bio || "").trim()),
    };
    const doneCount = Object.values(checks).filter(Boolean).length;
    const pct = Math.round((doneCount / 4) * 100);
    const pctEl = $("pfCompPct");
    if (pctEl) pctEl.textContent = pct + "%";
    const arc = $("pfCompArc");
    if (arc) {
      const circ = 219.91;
      arc.setAttribute("stroke-dashoffset", String(circ - (circ * pct) / 100));
    }
    document.querySelectorAll("#pfCompList li[data-chk]").forEach(li => {
      const ok = !!checks[li.dataset.chk];
      li.classList.toggle("done", ok);
      const ico = li.querySelector("i");
      if (ico) ico.className = ok ? "fa-solid fa-check" : "fa-regular fa-clock";
    });
    const joinedEl = $("identityJoined");
    if (joinedEl && authUser && authUser.date_joined) {
      const dt = new Date(authUser.date_joined);
      if (!isNaN(dt.getTime())) {
        joinedEl.textContent = "Joined " + dt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      }
    }
    const lastEl = $("identityLastSign");
    if (lastEl) {
      const now = new Date();
      lastEl.textContent = "Last sign-in today, " + now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }

    // Live "How you appear" preview + character count
    const updatePreview = (liveName, liveRole) => {
      const n = (liveName || "").trim() || (hasName ? cleanName : "Administrator");
      const r = (liveRole || "").trim() || profile.role || "Gym administrator";
      if ($("pvSideName")) $("pvSideName").textContent = n;
      if ($("pvSideRole")) $("pvSideRole").textContent = r;
      if ($("pvReceiptName")) $("pvReceiptName").textContent = n;
      if ($("pvReceiptPrice") && window.PLANS?.monthly) {
        $("pvReceiptPrice").textContent = "₱" + Number(window.PLANS.monthly.price).toLocaleString("en-PH");
      }
      ["pvSideAva", "pvHeadAva"].forEach(id => {
        const el = $(id);
        if (el && window.ProFitAvatar) {
          window.ProFitAvatar.paint(el, { photo: profile.photo || "", seed, alt: n });
        }
      });
      if ($("profileBioCount")) {
        const bioVal = ($("profileBio")?.value || "");
        $("profileBioCount").textContent = `${bioVal.length} / 140`;
      }
    };
    updatePreview($("profileName")?.value, $("profileRole")?.value);
    const avaGrid = $("staffQuickAvaGrid");
    if (avaGrid && window.ProFitAvatar) {
      avaGrid.innerHTML = ["av-1", "av-2", "av-3", "av-4", "av-5", "av-6"].map(pid => {
        const src = window.ProFitAvatar.resolve(pid, pid);
        const sel = String(profile.photo || "") === pid;
        return `<button type="button" class="pf-ava-opt${sel ? " sel" : ""}" data-pick-avatar="${pid}" aria-pressed="${sel}" title="Use avatar ${pid.slice(-1)}"><img src="${src}" alt="Avatar ${pid.slice(-1)}"></button>`;
      }).join("");
    }
    $("pfDirtyBar")?.classList.remove("on");
  }

  // Live preview + floating unsaved-changes bar while editing
  const checkDirty = () => {
    const dirty = ($("profileName")?.value.trim() || "") !== ((profile.name || "").trim())
      || ($("profileRole")?.value.trim() || "") !== ((profile.role || "").trim())
      || ($("profileEmail")?.value.trim() || "") !== ((profile.email || "").trim())
      || ($("profilePhone")?.value.trim() || "") !== ((profile.phone || "").trim())
      || ($("profileBio")?.value.trim() || "") !== ((profile.bio || "").trim());
    $("pfDirtyBar")?.classList.toggle("on", dirty);
    if ($("pvSideName")) $("pvSideName").textContent = $("profileName")?.value.trim() || "Administrator";
    if ($("pvSideRole")) $("pvSideRole").textContent = $("profileRole")?.value.trim() || "Gym administrator";
    if ($("pvReceiptName")) $("pvReceiptName").textContent = $("profileName")?.value.trim() || "Administrator";
    if ($("profileBioCount")) $("profileBioCount").textContent = `${($("profileBio")?.value || "").length} / 140`;
  };
  ["profileName", "profileRole", "profileEmail", "profilePhone", "profileBio"].forEach(id => {
    $(id)?.addEventListener("input", checkDirty);
  });
  $("pfDiscardBtn")?.addEventListener("click", () => paint());
  $("profileDiscardInline")?.addEventListener("click", () => paint());
  $("staffQuickAvaGrid")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-pick-avatar]");
    if (!btn) return;
    savePhotoToServer(btn.dataset.pickAvatar, "Avatar updated.");
  });
  $("pfQuickSaveBtn")?.addEventListener("click", () => $("profileForm")?.requestSubmit());
  window.addEventListener("profit:plans-updated", () => {
    if ($("pvReceiptPrice") && window.PLANS?.monthly) {
      $("pvReceiptPrice").textContent = "₱" + Number(window.PLANS.monthly.price).toLocaleString("en-PH");
    }
  });

  function updateSessionUser(user) {
    if (!user) return;
    if (window.ProFitAuth) window.ProFitAuth.user = user;
    try { sessionStorage.setItem("profit-verified-session", JSON.stringify(user)); } catch (_) {}
  }

  function commit(patch, message) {
    profile = { ...profile, ...patch };
    const saved = window.ProFitProfile.save(patch);
    if (!saved) return flash("Browser storage is full — try a smaller photo.", true);
    profile = saved;
    paint();
    // Repaints the rail avatar, the header avatar and the account menu name.
    window.dispatchEvent(new CustomEvent("profit-account-changed"));
    if (message) flash(message);
    return saved;
  }

  async function savePhotoToServer(photoData, successMsg) {
    try {
      if (window.ProFitAPI) {
        const res = await window.ProFitAPI.patch("/auth/profile", { photo: photoData });
        if (res && res.user) updateSessionUser(res.user);
      }
      commit({ photo: photoData }, successMsg);
    } catch (err) {
      flash(err.message || "Could not save your photo.", true);
    }
  }

  $("profilePhoto")?.addEventListener("change", e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\//.test(file.type)) return flash("Choose an image file for your photo.", true);
    if (file.size > 900 * 1024) return flash("That photo is over 900 KB. Please pick a smaller one.", true);
    const reader = new FileReader();
    reader.onload = () => { savePhotoToServer(String(reader.result), "Photo updated."); };
    reader.onerror = () => flash("That photo could not be read. Try another one.", true);
    reader.readAsDataURL(file);
  });

  // Clickable avatar menu (Upload photo / Remove photo)
  const avaTrigger = $("profileAvaTrigger");
  const avaMenu = $("profileAvaMenu");
  const closeAvaMenu = () => {
    if (avaMenu) avaMenu.hidden = true;
    avaTrigger?.setAttribute("aria-expanded", "false");
  };
  avaTrigger?.addEventListener("click", e => {
    e.stopPropagation();
    if (!avaMenu) return $("profilePhoto")?.click();
    const open = avaMenu.hidden;
    avaMenu.hidden = !open;
    avaTrigger.setAttribute("aria-expanded", String(open));
  });
  $("profilePhotoPick")?.addEventListener("click", () => {
    closeAvaMenu();
    $("profilePhoto")?.click();
  });
  document.addEventListener("click", e => {
    if (avaMenu && !avaMenu.hidden && !e.target.closest(".pf-ava-trigger-wrap")) closeAvaMenu();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeAvaMenu(); });

  $("profilePhotoClear")?.addEventListener("click", () => {
    closeAvaMenu();
    savePhotoToServer("", "Photo removed.");
  });

  window.addEventListener("profit-auth-ready", syncFromAuth);

  $("profileForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("profileName").value.trim();
    if (!validFullName(name)) return flash("Enter your first and last name.", true);
    const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      if (window.ProFitAPI) {
        const res = await window.ProFitAPI.patch("/auth/profile", { name });
        if (res && res.user) {
          if (window.ProFitAuth) window.ProFitAuth.user = res.user;
          try { sessionStorage.setItem("profit-verified-session", JSON.stringify(res.user)); } catch (_) {}
        }
      }
      commit({
        name,
        role: $("profileRole").value.trim() || "Gym administrator",
        email: $("profileEmail").value.trim(),
        phone: $("profilePhone").value.trim(),
        bio: $("profileBio").value.trim()
      }, "Profile saved.");
    } catch (err) {
      flash(err.message || "Could not save your profile.", true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // Two steps: verify the current password on the server, then set a new one.
  let pwVerified = false;
  const pwReset = () => { pwVerified = false; $("pwStep2").hidden = true; $("pwCurrent").readOnly = false; $("pwBtn").innerHTML = '<i class="fa-solid fa-shield-halved"></i> Verify password'; $("pwState").textContent = "Step 1: confirm it is really you."; };
  $("passwordForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("pwBtn"), current = $("pwCurrent").value;
    btn.disabled = true;
    try {
      if (!pwVerified) {
        if (!current) return flash("Enter your current password.", true);
        await window.ProFitAPI.post("/auth/verify-password", { current_password: current });
        pwVerified = true; $("pwCurrent").readOnly = true; $("pwStep2").hidden = false;
        btn.innerHTML = '<i class="fa-solid fa-key"></i> Update password'; $("pwState").textContent = "Verified. Now choose a new password.";
        $("pwNext").focus();
      } else {
        const next = $("pwNext").value;
        if (next.length < 8) return flash("Use at least 8 characters for the new password.", true);
        if (next !== $("pwConfirm").value) return flash("The new passwords do not match.", true);
        await window.ProFitAPI.post("/auth/change-password", { current_password: current, new_password: next });
        e.target.reset(); pwReset(); flash("Password updated.");
      }
    } catch (err) { flash(err.message || "Could not update the password.", true); }
    finally { btn.disabled = false; }
  });

  paint();
})();

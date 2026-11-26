"""Aggregated per-user Activity Log built from existing ORM audit/event tables."""

from django.db import DatabaseError
from django.utils import timezone


def _iso(dt):
    if dt is None:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    local = timezone.localtime(dt)
    return local.isoformat(), local.date().isoformat()


def _person_label(user, fallback="Member"):
    if user is None:
        return fallback
    full = f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
    if full:
        return full
    email = getattr(user, "email", "") or ""
    if "@" in email:
        return email.split("@", 1)[0]
    return fallback


def _add_item(items, *, item_id, category, icon, tone, title, detail, at, link=""):
    formatted = _iso(at)
    if formatted is None:
        return
    iso_ts, local_day = formatted
    items.append({
        "id": item_id,
        "category": category,
        "icon": icon,
        "tone": tone,
        "title": title,
        "detail": detail,
        "at": iso_ts,
        "day": local_day,
        "link": link,
        "_sort_dt": at if timezone.is_aware(at) else timezone.make_aware(at, timezone.get_current_timezone()),
    })


def get_user_activity(user, *, limit=60):
    """Return newest-first activity timeline and category counts strictly scoped to ``user``."""
    from apps.announcements.models import Announcement
    from apps.billing.models import PaymentClaim
    from apps.membership.models import Attendance, Enrollment
    from apps.notifications.models import Notification
    from apps.trainers.models import TrainerRequest, TrainerSession
    from apps.trainers.services import has_trainer_session_table

    items = []

    # 1. Account & security milestones on User
    _add_item(
        items,
        item_id=f"sec-login-{user.pk}",
        category="security",
        icon="fa-right-to-bracket",
        tone="gold",
        title="Signed in to ProFit",
        detail="Active portal session authenticated.",
        at=getattr(user, "last_login", None),
    )
    _add_item(
        items,
        item_id=f"sec-google-{user.pk}",
        category="security",
        icon="fa-brands fa-google",
        tone="sky",
        title="Connected Google account",
        detail="Linked Google Sign-In to this account.",
        at=getattr(user, "google_linked_at", None),
    )
    _add_item(
        items,
        item_id=f"sec-otp-{user.pk}",
        category="security",
        icon="fa-envelope-circle-check",
        tone="emerald",
        title="Verified account email",
        detail="First-login verification code confirmed.",
        at=getattr(user, "first_login_otp_verified_at", None),
    )
    _add_item(
        items,
        item_id=f"sec-tos-{user.pk}",
        category="security",
        icon="fa-file-shield",
        tone="slate",
        title="Accepted Terms & Privacy Policy",
        detail="Portal usage terms confirmed.",
        at=getattr(user, "tos_accepted_at", None),
    )
    _add_item(
        items,
        item_id=f"sec-joined-{user.pk}",
        category="security",
        icon="fa-user-plus",
        tone="slate",
        title="Created ProFit account",
        detail=f"Account role: {user.get_role_display() if hasattr(user, 'get_role_display') else user.role}.",
        at=getattr(user, "date_joined", None),
    )

    role = (getattr(user, "role", "") or "").upper()

    # 2. Role-scoped user actions
    if role in ("OWNER", "CASHIER"):
        try:
            enrolls = (
                Enrollment.objects.filter(created_by=user)
                .select_related("member__user")
                .order_by("-created_at")[:20]
            )
            for enr in enrolls:
                who = _person_label(getattr(enr.member, "user", None), "Member")
                _add_item(
                    items,
                    item_id=f"act-enroll-{enr.pk}",
                    category="actions",
                    icon="fa-id-card",
                    tone="emerald",
                    title=f"Enrolled {who}",
                    detail=f"Membership active from {enr.start_date} to {enr.end_date}.",
                    at=enr.created_at,
                    link="/members",
                )
        except DatabaseError:
            pass

        try:
            claims = (
                PaymentClaim.objects.filter(reviewed_by=user, reviewed_at__isnull=False)
                .select_related("member__user")
                .order_by("-reviewed_at")[:20]
            )
            for cl in claims:
                who = _person_label(getattr(cl.member, "user", None), "Member")
                verb = "Confirmed" if cl.status == PaymentClaim.Status.APPROVED else "Rejected"
                tone = "emerald" if cl.status == PaymentClaim.Status.APPROVED else "rose"
                plan_txt = cl.plan.title() if cl.plan else "Membership"
                _add_item(
                    items,
                    item_id=f"act-claim-rev-{cl.pk}",
                    category="actions",
                    icon="fa-wallet",
                    tone=tone,
                    title=f"{verb} GCash payment for {who}",
                    detail=f"{plan_txt} plan · Ref {cl.reference_number}",
                    at=cl.reviewed_at,
                    link="/payments",
                )
        except DatabaseError:
            pass

        try:
            att_rows = (
                Attendance.objects.filter(recorded_by=user)
                .select_related("member__user")
                .order_by("-check_in_at")[:20]
            )
            for att in att_rows:
                who = _person_label(getattr(att.member, "user", None), "Member")
                _add_item(
                    items,
                    item_id=f"act-att-staff-{att.pk}",
                    category="actions",
                    icon="fa-clipboard-check",
                    tone="sky",
                    title=f"Checked in {who}",
                    detail="Front-desk attendance logged.",
                    at=att.check_in_at,
                    link="/attendance",
                )
        except DatabaseError:
            pass

        try:
            anns = Announcement.objects.filter(created_by=user).order_by("-created_at")[:15]
            for ann in anns:
                _add_item(
                    items,
                    item_id=f"act-ann-{ann.pk}",
                    category="actions",
                    icon="fa-bullhorn",
                    tone="gold",
                    title=f"Created announcement: {ann.title[:60]}",
                    detail=f"Status: {ann.status.title()} · Audience: {ann.audience}.",
                    at=ann.created_at,
                    link="/announcements",
                )
        except DatabaseError:
            pass

    elif role == "TRAINER":
        try:
            att_rows = (
                Attendance.objects.filter(recorded_by=user)
                .select_related("member__user")
                .order_by("-check_in_at")[:20]
            )
            for att in att_rows:
                who = _person_label(getattr(att.member, "user", None), "Member")
                _add_item(
                    items,
                    item_id=f"act-att-tr-{att.pk}",
                    category="actions",
                    icon="fa-clipboard-check",
                    tone="sky",
                    title=f"Checked in {who}",
                    detail="Session attendance recorded.",
                    at=att.check_in_at,
                    link="/trainer/attendance",
                )
        except DatabaseError:
            pass

        if has_trainer_session_table():
            try:
                day_names = dict(TrainerSession.DAY_CHOICES)
                sessions = TrainerSession.objects.filter(trainer__user=user).order_by("-created_at")[:15]
                for sess in sessions:
                    day_lbl = day_names.get(sess.day_of_week, "")
                    _add_item(
                        items,
                        item_id=f"act-sess-{sess.pk}",
                        category="actions",
                        icon="fa-calendar-plus",
                        tone="gold",
                        title=f"Scheduled class: {sess.name[:60]}",
                        detail=f"{day_lbl} at {sess.start_time} · {sess.room}",
                        at=sess.created_at,
                        link="/trainer/schedule",
                    )
            except DatabaseError:
                pass

    else:  # MEMBER
        try:
            att_rows = Attendance.objects.filter(member__user=user).order_by("-check_in_at")[:20]
            for att in att_rows:
                _add_item(
                    items,
                    item_id=f"act-att-mem-{att.pk}",
                    category="actions",
                    icon="fa-dumbbell",
                    tone="emerald",
                    title="Checked in at the gym",
                    detail=f"Attendance recorded for {att.check_in_date}.",
                    at=att.check_in_at,
                )
        except DatabaseError:
            pass

        try:
            claims = PaymentClaim.objects.filter(member__user=user).order_by("-created_at")[:20]
            status_map = {
                PaymentClaim.Status.PENDING_REVIEW: ("Pending staff review", "gold"),
                PaymentClaim.Status.APPROVED: ("Confirmed", "emerald"),
                PaymentClaim.Status.REJECTED: ("Rejected", "rose"),
            }
            for cl in claims:
                st_label, st_tone = status_map.get(cl.status, (cl.status, "slate"))
                plan_txt = cl.plan.title() if cl.plan else "Membership"
                _add_item(
                    items,
                    item_id=f"act-claim-mem-{cl.pk}",
                    category="actions",
                    icon="fa-receipt",
                    tone=st_tone,
                    title=f"Submitted {plan_txt} GCash payment",
                    detail=f"Ref {cl.reference_number} · {st_label}",
                    at=cl.created_at,
                )
        except DatabaseError:
            pass

        try:
            enrolls = Enrollment.objects.filter(member__user=user).order_by("-created_at")[:15]
            for enr in enrolls:
                _add_item(
                    items,
                    item_id=f"act-enr-mem-{enr.pk}",
                    category="actions",
                    icon="fa-id-badge",
                    tone="emerald",
                    title="Membership activated",
                    detail=f"Valid from {enr.start_date} through {enr.end_date}.",
                    at=enr.created_at,
                )
        except DatabaseError:
            pass

        try:
            reqs = (
                TrainerRequest.objects.filter(member__user=user)
                .select_related("trainer__user")
                .order_by("-created_at")[:15]
            )
            for req in reqs:
                coach = _person_label(getattr(req.trainer, "user", None), "a trainer") if req.trainer else "any available trainer"
                _add_item(
                    items,
                    item_id=f"act-treq-{req.pk}",
                    category="actions",
                    icon="fa-user-group",
                    tone="sky",
                    title=f"Requested trainer ({coach})",
                    detail=f"Request status: {req.status.title()}.",
                    at=req.created_at,
                )
        except DatabaseError:
            pass

    # 3. Notifications & updates received by this user
    try:
        notifs = Notification.objects.filter(recipient=user).order_by("-created_at")[:25]
        for notif in notifs:
            _add_item(
                items,
                item_id=f"upd-notif-{notif.pk}",
                category="updates",
                icon="fa-bell",
                tone="gold",
                title=notif.title[:100],
                detail=(notif.body or "Notification update")[:140],
                at=notif.created_at,
                link=notif.link or "",
            )
    except DatabaseError:
        pass

    items.sort(key=lambda item: item["_sort_dt"], reverse=True)
    trimmed = items[:limit]
    for item in trimmed:
        item.pop("_sort_dt", None)

    counts = {
        "all": len(trimmed),
        "security": sum(1 for x in trimmed if x["category"] == "security"),
        "actions": sum(1 for x in trimmed if x["category"] == "actions"),
        "updates": sum(1 for x in trimmed if x["category"] == "updates"),
    }
    return {
        "counts": counts,
        "today": timezone.localdate().isoformat(),
        "items": trimmed,
    }

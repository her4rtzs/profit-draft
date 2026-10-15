// Mobile API client implementing the BINDING four-step session-auth sequence.
// SessionAuthentication only; the login POST is CSRF-protected (NOT exempt), so
// the client must echo the csrftoken cookie in the X-CSRFToken header. No
// business logic lives here — this just performs the HTTP sequence.
//
//   1. GET  /api/auth/csrf/        -> receive the csrftoken cookie
//   2. POST /api/auth/login/       -> echo X-CSRFToken (credentials:'include')
//   3. GET  /api/membership/me/    -> the caller's membership status
//   4. GET  /api/attendance/       -> the caller's attendance records
//
// `credentials: 'include'` makes fetch send/receive the session + csrf cookies.

import { API_BASE_URL } from "../config";

function url(path) {
  return `${API_BASE_URL}${path}`;
}

// Read a cookie value from the document (web) — on native, the cookie is held
// by the platform cookie store and sent automatically with credentials:
// 'include'. We still parse it when available so the X-CSRFToken header can be
// echoed explicitly, which Django's CSRF middleware requires.
function readCookie(name) {
  if (typeof document === "undefined" || !document.cookie) {
    return null;
  }
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

// Step 1: prime the csrftoken cookie and return the token when readable.
export async function fetchCsrfToken() {
  const resp = await fetch(url("/api/auth/csrf/"), {
    method: "GET",
    credentials: "include",
  });
  if (!resp.ok) {
    throw new Error(`CSRF priming failed (${resp.status})`);
  }
  return readCookie("csrftoken");
}

// Step 2: session login, echoing the CSRF token in the X-CSRFToken header.
export async function login(username, password) {
  const csrfToken = await fetchCsrfToken();
  const resp = await fetch(url("/api/auth/login/"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
    },
    body: JSON.stringify({ username, password }),
  });
  if (!resp.ok) {
    throw new Error(`Login failed (${resp.status})`);
  }
  return resp.json();
}

// Step 3: the caller's own membership profile.
export async function getMembership() {
  const resp = await fetch(url("/api/membership/me/"), {
    method: "GET",
    credentials: "include",
  });
  if (!resp.ok) {
    throw new Error(`Membership fetch failed (${resp.status})`);
  }
  return resp.json();
}

// Step 4: the caller's own attendance records.
export async function getAttendance() {
  const resp = await fetch(url("/api/attendance/"), {
    method: "GET",
    credentials: "include",
  });
  if (!resp.ok) {
    throw new Error(`Attendance fetch failed (${resp.status})`);
  }
  return resp.json();
}

# ProFit Mobile (member app skeleton)

React Native (Expo) client for gym members. This is a first-build skeleton: one
screen, the auth sequence, and the styling/icon toolchain wired up. There is no
business logic in the app — the Django backend owns all of it.

## Stack

- **Expo** (React Native)
- **NativeWind** for styling (Tailwind classes compiled at **build time** via
  the Metro + Babel plugins — no runtime CDN, per `AGENTS.md`)
- **react-native-reusables** for UI primitives (the `Card` family here)
- **lucide-react-native** for icons

## Setup

The `npm` PowerShell shim is blocked by the system execution policy on the dev
machine; invoke `npm.cmd` (or run from a shell that permits scripts).

```
cd mobile
npm.cmd install
npm.cmd start
```

Then open the project in Expo Go or a simulator.

## API base URL (not hard-coded)

The backend base URL is read from Expo config at
`app.json -> expo.extra.apiBaseUrl` (see `config.js`), defaulting to
`http://localhost:8000` for the dev server. Override it per environment rather
than editing the screens.

## Authentication sequence (BINDING)

The app authenticates with Django's **session + CSRF** machinery. It uses
`SessionAuthentication` only — there is **no CSRF-exempt login endpoint**. The
login POST is CSRF-protected, so the client must echo the `csrftoken` cookie in
the `X-CSRFToken` header. Every request uses `credentials: 'include'` so the
session and CSRF cookies travel with it.

The exact four steps (implemented in `api/client.js`, driven by
`screens/MembershipScreen.js`):

1. **GET `/api/auth/csrf/`** — an `ensure_csrf_cookie`-decorated endpoint that
   sets the `csrftoken` cookie on the response.
2. **POST `/api/auth/login/`** — send the credentials with
   `credentials: 'include'` and the `X-CSRFToken` header echoing the token from
   step 1. Django's CSRF middleware validates the header against the cookie,
   then the session is established.
3. **GET `/api/membership/me/`** — fetch the signed-in member's own membership
   status (`credentials: 'include'`).
4. **GET `/api/attendance/`** — fetch the signed-in member's own attendance
   records (`credentials: 'include'`).

The screen renders the membership status and attendance list in a
react-native-reusables `Card` with `lucide-react-native` icons.

## Files

- `App.js` — entry; imports the compiled Tailwind stylesheet and renders the
  one screen.
- `screens/MembershipScreen.js` — runs the auth sequence and renders the result.
- `api/client.js` — the four-step HTTP sequence (no business logic).
- `config.js` — resolves the API base URL from Expo config.
- `babel.config.js`, `metro.config.js`, `tailwind.config.js`, `global.css` —
  NativeWind build-time styling setup.

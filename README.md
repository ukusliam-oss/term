# Term

A school planner that runs as a website and installs to the Home Screen: an A/B-week timetable,
homework and assessments with countdowns, term dates, results and a focus timer. Signed in, it
syncs between devices through Supabase; signed out, it keeps everything in the browser. It works
offline.

- No build step and no framework: ES modules, with three.js (Home's 3D render) and supabase-js
  vendored under `vendor/`.
- Sync: one `docs` table with row-level security, so every row belongs to the signed-in user.
  Put the project URL and anon/publishable key in `js/config.js`.
- Quick add understands plain English: `bio test next fri p3`, `maths hw next lesson`.

Run locally with `python3 serve.py` and open http://127.0.0.1:5174.

// POST /api/waitlist  — marketing-site proxy to the app's waitlist endpoint.
//
// Why a proxy: the form lives on the static marketing site, but the waitlist
// table lives in the app's Supabase. Proxying server-side keeps the form clean,
// avoids browser-to-app CORS, keeps the app shell hidden from users, and lets
// the app own the single source of truth for signups.
//
// Upstream is configurable via APP_WAITLIST_URL (set on the marketing project).
// Default points at the app deployment's stable URL. NOTE: this must point at
// the APP project, not protocomp.app (which now serves this marketing site).
// If the app project gets Deployment Protection, set APP_WAITLIST_URL to a
// reachable endpoint (or add a protection-bypass token).

const UPSTREAM =
  process.env.APP_WAITLIST_URL ||
  'https://protocompwebsite.vercel.app/api/waitlist';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const email = body && typeof body.email === 'string' ? body.email.trim() : '';
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
  }

  try {
    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, source: 'marketing_site_waitlist' }),
    });
    if (!upstream.ok) {
      return res.status(502).json({ ok: false, error: 'Waitlist is temporarily unavailable. Please try again.' });
    }
    const data = await upstream.json().catch(() => ({}));
    return res.status(200).json({ ok: true, alreadyOnList: !!data.alreadyOnList });
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'Waitlist is temporarily unavailable. Please try again.' });
  }
};

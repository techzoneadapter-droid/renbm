const allowedRoles = new Set(['admin', 'staff']);

export function requireStaff(req, res) {
  const expected = process.env.STAFF_API_KEY;
  const supplied = req.headers['x-staff-key'];
  const role = String(req.headers['x-staff-role'] || 'staff').toLowerCase();
  if (!expected || supplied !== expected || !allowedRoles.has(role)) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return { id: String(req.headers['x-staff-id'] || 'staff'), role };
}

export function requireAdmin(actor, res) {
  if (actor?.role !== 'admin') {
    res.status(403).json({ error: 'admin_required' });
    return false;
  }
  return true;
}

export function requireBmScope(req, res, bmId) {
  const configured = String(process.env.STAFF_ALLOWED_BM_IDS || '').split(',').map(v => v.trim()).filter(Boolean);
  if (!configured.length || !configured.includes(String(bmId))) {
    res.status(403).json({ error: 'bm_scope_denied' });
    return false;
  }
  return true;
}

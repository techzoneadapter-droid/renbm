import { createClient } from '@supabase/supabase-js';

let client;
export function db() {
  if (!client) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('database_not_configured');
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }
  return client;
}

export async function audit(actor, action, resourceType, resourceId, result, errorClass = null, metadata = {}) {
  const safe = { ...metadata };
  for (const key of Object.keys(safe)) if (/token|cookie|password|secret/i.test(key)) delete safe[key];
  await db().from('audit_events').insert({ actor_id: actor.id, actor_role: actor.role, action, resource_type: resourceType, resource_id: String(resourceId || ''), result, error_class: errorClass, metadata: safe });
}

export function idempotencyKey(req) {
  return String(req.headers['idempotency-key'] || '').trim();
}

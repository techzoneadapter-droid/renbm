export const mutationCapabilities = Object.freeze({
  createBusiness: 'needs_verification',
  inviteAdmin: 'needs_verification',
  shareAdAccountToPartner: 'needs_verification'
});

export function mutationsEnabled() {
  return String(process.env.META_MUTATIONS_ENABLED || 'false').toLowerCase() === 'true';
}

function unavailable(capability) {
  const state = mutationCapabilities[capability] || 'unsupported';
  const error = new Error(`provider_${state}`);
  error.code = state;
  error.transient = false;
  throw error;
}

export async function createBusiness() {
  if (!mutationsEnabled()) unavailable('createBusiness');
  // Intentionally fail closed until an official Meta endpoint + required permissions are verified.
  unavailable('createBusiness');
}

export async function inviteAdmin() {
  if (!mutationsEnabled()) unavailable('inviteAdmin');
  unavailable('inviteAdmin');
}

export async function shareAdAccountToPartner() {
  if (!mutationsEnabled()) unavailable('shareAdAccountToPartner');
  unavailable('shareAdAccountToPartner');
}

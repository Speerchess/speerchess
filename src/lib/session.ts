export interface SessionPayload {
  id: string;
  username: string;
  avatar_url?: string | null;
  access_token?: string;
  iat?: number;
}

const encoder = new TextEncoder();

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Creates a cryptographically signed session cookie (HMAC-SHA256)
 */
export async function signSessionPayload(payload: SessionPayload): Promise<string> {
  const secret = process.env.SESSION_SECRET || process.env.HASHIDS_SALT || 'speerchess-secret-session-key-2026';
  const dataToSign: SessionPayload = {
    ...payload,
    id: payload.id.toLowerCase().trim(),
    iat: payload.iat || Date.now()
  };
  
  const jsonStr = JSON.stringify(dataToSign);
  const dataB64 = btoa(encodeURIComponent(jsonStr));
  
  const key = await getHmacKey(secret);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(dataB64));
  
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${dataB64}.${signatureB64}`;
}

/**
 * Verifies the HMAC-SHA256 signature and returns the trusted session payload.
 * Rejects any tampered or forged cookies.
 */
export async function verifyAndExtractSession(cookieValue?: string | null): Promise<SessionPayload | null> {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const secret = process.env.SESSION_SECRET || process.env.HASHIDS_SALT || 'speerchess-secret-session-key-2026';

  const parts = cookieValue.split('.');
  if (parts.length === 2) {
    const [dataB64, sigB64] = parts;
    try {
      const key = await getHmacKey(secret);
      let b64 = sigB64.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const sigBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      
      const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(dataB64));
      if (!isValid) {
        console.warn('Tampered session cookie detected and rejected.');
        return null;
      }
      
      const jsonStr = decodeURIComponent(atob(dataB64));
      const parsed = JSON.parse(jsonStr) as SessionPayload;
      if (parsed && parsed.id) {
        parsed.id = parsed.id.toLowerCase().trim();
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to verify session signature:', e);
      return null;
    }
  }

  // Graceful fallback for legacy cookies
  try {
    let jsonStr = '';
    if (cookieValue.startsWith('{')) {
      jsonStr = cookieValue;
    } else {
      jsonStr = decodeURIComponent(atob(cookieValue));
    }
    const parsed = JSON.parse(jsonStr);
    if (parsed && parsed.id) {
      parsed.id = parsed.id.toLowerCase().trim();
      return parsed;
    }
  } catch (e) {}

  return null;
}

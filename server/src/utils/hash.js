import crypto from 'crypto';

// RF8 niveau 1 — empreinte SHA-256 des octets de l'image
export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

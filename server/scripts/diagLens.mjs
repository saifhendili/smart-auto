import 'dotenv/config';

const providerName = process.env.LENS_API_PROVIDER || 'serpapi';

function peek(key) {
  if (!key) return '<empty>';
  const k = String(key).trim();
  if (k.length <= 8) return `len=${k.length}`;
  return `len=${k.length} ${k.slice(0, 4)}...${k.slice(-4)}`;
}

function getKeys() {
  const keys = [];
  const rawKeys = process.env.LENS_API_KEYS;
  const rawKey = process.env.LENS_API_KEY;

  if (rawKeys !== undefined) {
    const parts = rawKeys.split(',').map((k) => k.trim()).filter(Boolean);
    keys.push(...parts);
  }
  if (rawKey !== undefined) {
    keys.push(rawKey.trim());
  }
  return [...new Set(keys)];
}

console.log('Provider:', providerName);
console.log('LENS_API_KEYS defined:', process.env.LENS_API_KEYS !== undefined);
console.log('LENS_API_KEY defined:', process.env.LENS_API_KEY !== undefined);

const keys = getKeys();
console.log('Total unique keys loaded:', keys.length);
keys.forEach((k, i) => console.log(`  key ${i + 1}: ${peek(k)}`));

if (!keys.length) {
  console.log('No keys loaded. Check server/.env');
  process.exit(1);
}

const testImage = 'https://i.imgur.com/HBrB8p0.jpeg';
const baseUrl =
  providerName === 'searchapi'
    ? 'https://www.searchapi.io/api/v1/search'
    : 'https://serpapi.com/search.json';

const url = `${baseUrl}?engine=google_lens&url=${encodeURIComponent(testImage)}&api_key=${encodeURIComponent(keys[0])}`;

console.log('\nTesting first key against public image...');
console.log('Request:', url.replace(keys[0], '***KEY***'));

try {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  console.log('HTTP status:', res.status);
  // Show first 300 chars of response
  console.log('Response snippet:', text.slice(0, 300));
} catch (err) {
  console.log('Fetch error:', err.message);
}

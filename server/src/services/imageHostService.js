// Uploads an image buffer to a free, no-key temporary/permanent host and returns
// a public direct URL. Needed because third-party Google Lens APIs fetch images by URL,
// and local uploads (http://localhost) are not reachable from the internet.
//
// Primary  : catbox.moe        — permanent, anonymous, direct URLs (max 200 MB).
// Fallback : litterbox.catbox.moe — temporary (auto-expires in 1h), direct URLs.

const CATBOX_API    = 'https://catbox.moe/user/api.php';
const LITTERBOX_API = 'https://litterbox.catbox.moe/resources/internals/api.php';

function extFromMime(mediaType) {
  if (mediaType?.includes('png'))  return 'png';
  if (mediaType?.includes('webp')) return 'webp';
  return 'jpg';
}

async function uploadCatbox(buffer, mediaType) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload',
    new Blob([buffer], { type: mediaType || 'image/jpeg' }),
    `part.${extFromMime(mediaType)}`);

  const res = await fetch(CATBOX_API, { method: 'POST', body: form });
  const text = (await res.text()).trim();
  if (!res.ok || !text.startsWith('http')) throw new Error(`catbox: ${text.slice(0, 120)}`);
  return text;
}

async function uploadLitterbox(buffer, mediaType) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('time', '1h');
  form.append('fileToUpload',
    new Blob([buffer], { type: mediaType || 'image/jpeg' }),
    `part.${extFromMime(mediaType)}`);

  const res = await fetch(LITTERBOX_API, { method: 'POST', body: form });
  const text = (await res.text()).trim();
  if (!res.ok || !text.startsWith('http')) throw new Error(`litterbox: ${text.slice(0, 120)}`);
  return text;
}

/**
 * Upload an image buffer and return a public direct URL (or null on total failure).
 */
export async function uploadTemp(buffer, mediaType) {
  try {
    return await uploadCatbox(buffer, mediaType);
  } catch (err) {
    console.warn('[imageHost] catbox failed, trying litterbox:', err.message);
  }
  try {
    return await uploadLitterbox(buffer, mediaType);
  } catch (err) {
    console.warn('[imageHost] litterbox failed:', err.message);
    return null;
  }
}

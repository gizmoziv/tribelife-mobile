import { getToken } from './api';
import { API_URL } from '@/constants';

// ── Voice Upload Flow ────────────────────────────────────────────────────────
// Mirrors services/upload.ts (avatar/media) blob-via-fetch pattern. Sequence:
//   1. POST /api/upload/voice-url   → { uploadUrl, key, cdnUrl }
//   2. PUT  uploadUrl (audio/m4a)   → DO Spaces
//   3. POST /api/upload/voice-confirm { key } → { cdnUrl }   (gates public-read)
// Then the caller emits room:voice/globe:voice/dm:voice with cdnUrl.

/** Message surfaced when the shared 30/hr upload limiter rejects the request
 *  (Pitfall 6). The record path shows this verbatim in its retry text so the
 *  user knows to wait rather than retry-spam. */
export const VOICE_UPLOAD_RATE_LIMIT_MESSAGE =
  'Upload rate limit exceeded. Try again later.';

/** Step 1: Request a pre-signed upload URL for a voice clip. */
export async function requestVoiceUploadUrl(): Promise<{
  uploadUrl: string;
  key: string;
  cdnUrl: string;
}> {
  const token = await getToken();

  const res = await fetch(`${API_URL}/api/upload/voice-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(VOICE_UPLOAD_RATE_LIMIT_MESSAGE);
    }
    throw new Error(`Failed to get voice upload URL: ${res.statusText}`);
  }

  return res.json();
}

/** Step 2: Upload the recorded m4a directly to DO Spaces via the pre-signed URL. */
export async function uploadVoiceToSpaces(uploadUrl: string, fileUri: string): Promise<void> {
  // Read the local recording as a blob via fetch (works reliably in RN for
  // local file URIs — same approach as the image upload path).
  const response = await fetch(fileUri);
  const blob = await response.blob();

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: {
      'Content-Type': 'audio/m4a',
    },
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => '');
    throw new Error(`Voice upload failed: ${uploadRes.status} ${text}`);
  }
}

/** Step 3: Confirm the upload — backend HeadObject-validates ownership/size/type
 *  and flips the object to public-read, returning the final CDN URL. */
export async function confirmVoiceUpload(key: string): Promise<{ cdnUrl: string }> {
  const token = await getToken();

  const res = await fetch(`${API_URL}/api/upload/voice-confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ key }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({} as { error?: string }));
    throw new Error(data.error ?? `Voice confirm failed: ${res.statusText}`);
  }

  return res.json();
}

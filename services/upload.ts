import { getToken } from './api';
import { API_URL } from '@/constants';

// ── Avatar Upload Flow ──────────────────────────────────────────────────────

/** Step 1: Request a pre-signed upload URL from the backend */
export async function requestAvatarUploadUrl(): Promise<{
  uploadUrl: string;
  key: string;
  cdnUrl: string;
}> {
  const token = await getToken();

  const res = await fetch(`${API_URL}/api/upload/avatar-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('Upload rate limit exceeded. Try again later.');
    }
    throw new Error(`Failed to get upload URL: ${res.statusText}`);
  }

  return res.json();
}

/** Step 2: Upload the processed image directly to DO Spaces via pre-signed URL */
export async function uploadToSpaces(uploadUrl: string, fileUri: string): Promise<void> {
  // Read file as blob via fetch (works reliably in RN for local file URIs)
  const response = await fetch(fileUri);
  const blob = await response.blob();

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: {
      'Content-Type': 'image/jpeg',
    },
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => '');
    throw new Error(`Upload failed: ${uploadRes.status} ${text}`);
  }
}

/** Step 3: Confirm the upload so the backend updates the user's avatarUrl */
export async function confirmAvatarUpload(key: string): Promise<{ avatarUrl: string }> {
  const token = await getToken();

  const res = await fetch(`${API_URL}/api/upload/avatar-confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ key }),
  });

  if (!res.ok) {
    throw new Error(`Upload confirmation failed: ${res.statusText}`);
  }

  return res.json();
}

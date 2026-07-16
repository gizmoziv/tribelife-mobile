// ── Phase 31: Document attachment file-size formatter ───────────────────────
// Single source of truth for rendering a byte count as a short human string on
// the DocumentCard (e.g. "1.2 MB", "840 KB"). Pure function, no React.
//
// Under 1 MB   → rounded whole KB (e.g. "840 KB").
// 1 MB or more → one-decimal MB (e.g. "1.2 MB").

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

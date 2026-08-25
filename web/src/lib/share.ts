/** Helpers for sharing a verse outside the app. */

export function buildShareText(ref: string, text: string): string {
  return `“${text}”\n— ${ref}`;
}

/** Native share sheet if available; returns false when unsupported. */
export async function nativeShare(ref: string, text: string): Promise<boolean> {
  const body = buildShareText(ref, text);
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text: body, title: ref });
      return true;
    } catch {
      return true; // user cancelled — still "handled"
    }
  }
  return false;
}

export function whatsappUrl(ref: string, text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(buildShareText(ref, text))}`;
}

export function telegramUrl(ref: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(
    "https://amharic-bible.app",
  )}&text=${encodeURIComponent(buildShareText(ref, text))}`;
}

export async function copyText(ref: string, text: string): Promise<void> {
  await navigator.clipboard.writeText(buildShareText(ref, text));
}

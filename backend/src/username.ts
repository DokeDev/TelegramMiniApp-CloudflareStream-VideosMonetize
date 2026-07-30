export function normalizeTelegramUsername(username: string | null | undefined) {
  const normalized = username?.trim().replace(/^@+/, '').toLowerCase();
  return normalized || null;
}

export function cleanTelegramUsername(username: string | null | undefined) {
  const cleaned = username?.trim().replace(/^@+/, '');
  return cleaned || null;
}

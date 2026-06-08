export function sanitizeSimpleAuthRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/';
  }

  try {
    const parsed = new URL(value, 'https://jaba.local');
    return parsed.origin === 'https://jaba.local' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : '/';
  } catch {
    return '/';
  }
}

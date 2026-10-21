/** Remove bearer capabilities embedded in paths before logging or telemetry. */
export function redactCapabilityPath(path: string): string {
  return path.split(/[?#]/)[0].replace(
    /((?:\/api)?\/public\/waiver|\/waiver)\/[^/]+/g,
    '$1/[redacted]',
  );
}

/** Conservative allowlist for telemetry: business data and auth URLs must stay local. */
export function sanitizeSentryEvent<T>(event: T): T {
  const value = event as Record<string, any>;
  const safeUrl = (url: unknown) => {
    if (typeof url !== 'string') return undefined;
    try { const parsed = new URL(url); return parsed.origin + redactCapabilityPath(parsed.pathname); }
    catch { return redactCapabilityPath(url); }
  };
  if (value.request) value.request = { method: value.request.method, url: safeUrl(value.request.url) };
  if (value.user) value.user = value.user.id ? { id: value.user.id } : undefined;
  delete value.extra;
  delete value.message;
  delete value.logentry;
  // Custom contexts/tags can contain arbitrary form values or captured credentials.
  if (value.contexts) value.contexts = value.contexts.trace ? { trace: {
    trace_id: value.contexts.trace.trace_id, span_id: value.contexts.trace.span_id,
    op: value.contexts.trace.op,
  } } : {};
  if (value.tags) value.tags = Object.fromEntries(Object.entries(value.tags)
    .filter(([key, entry]) => ['tenant.org_id', 'user.role'].includes(key)
      || (key === 'operation.area' && ['api', 'finance'].includes(String(entry)))
      || (key === 'http.status_code' && /^5\d\d$/.test(String(entry)))));
  if (value.transaction) value.transaction = safeUrl(value.transaction);
  if (value.breadcrumbs) value.breadcrumbs = value.breadcrumbs.map((breadcrumb: Record<string, unknown>) => ({
    category: breadcrumb.category, level: breadcrumb.level, timestamp: breadcrumb.timestamp,
  }));
  for (const exception of value.exception?.values || []) {
    // SDK errors may embed request payloads or provider responses in their message.
    exception.value = 'Details withheld; inspect the exception type and stack trace';
    for (const frame of exception.stacktrace?.frames || []) {
      delete frame.vars;
      frame.filename = safeUrl(frame.filename);
      frame.abs_path = safeUrl(frame.abs_path);
    }
  }
  return event;
}

export function isValidSentryDsn(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.username) && !url.password
      && !url.search && !url.hash && /\/\d+$/.test(url.pathname);
  } catch { return false; }
}

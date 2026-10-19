// Browser-only contract fixture. No real API, Auth, database or production access.
async function request(method: string, path: string, data?: unknown) {
  const response = await fetch('/__form-test-api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = response.headers.get('content-type')?.includes('text/csv') ? await response.blob() : await response.json();
  if (!response.ok) throw new Error(result.error || 'Isolated request failed');
  return { data: result };
}
export const get = (path: string, query?: Record<string, unknown>) => {
  const params = query?.params as Record<string, string> | undefined;
  const search = new URLSearchParams(Object.entries(params || {}).filter(([, value]) => value != null).map(([key,value]) => [key, String(value)]));
  return request('GET', path + (search.size ? `?${search}` : ''));
};
export const post = (path: string, data: unknown) => request('POST', path, data);
export const patch = (path: string, data: unknown) => request('PATCH', path, data);
export const del = (path: string) => request('DELETE', path);
export const put = (path: string, data: unknown) => request('PUT', path, data);
export default { get, post, patch, delete: del, put };

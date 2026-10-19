// Browser-only contract fixture. No real API, Auth, database or production access.
async function request(method: string, path: string, data?: unknown) {
  const response = await fetch('/__form-test-api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Isolated request failed');
  return { data: result };
}
export const get = (path: string, _params?: unknown) => request('GET', path);
export const post = (path: string, data: unknown) => request('POST', path, data);
export const patch = (path: string, data: unknown) => request('PATCH', path, data);
export const del = (path: string) => request('DELETE', path);
export const put = (path: string, data: unknown) => request('PUT', path, data);
export default { get, post, patch, delete: del, put };

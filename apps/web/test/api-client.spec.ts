import { apiFetch, ApiClientError } from '@/lib/api-client';
import { getAccessToken, setAccessToken } from '@/lib/api/token';

/**
 * Guards the API client's behaviour that has real bug surface: bearer attach + credentials,
 * error-envelope → typed error, and the single-flight 401 → refresh → retry path.
 */

type FetchMock = jest.MockedFunction<typeof fetch>;

const makeResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
    json: async () => body,
  }) as unknown as Response;

describe('apiFetch', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = jest.fn() as FetchMock;
    global.fetch = fetchMock;
    setAccessToken(null);
  });

  it('attaches the bearer token and always includes credentials', async () => {
    setAccessToken('tok123');
    fetchMock.mockResolvedValueOnce(makeResponse(200, { ok: true }));

    await apiFetch('/v1/thing');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1];
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok123');
    expect(init?.credentials).toBe('include');
  });

  it('returns the parsed JSON body on success', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(200, { value: 42 }));
    const data = await apiFetch<{ value: number }>('/v1/thing');
    expect(data).toEqual({ value: 42 });
  });

  it('maps the { error } envelope to a typed ApiClientError', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(400, { error: { code: 'BAD_INPUT', message: 'Nope' } }));
    await expect(apiFetch('/v1/thing')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 400,
      code: 'BAD_INPUT',
      message: 'Nope',
    });
  });

  it('on 401 performs ONE silent refresh then retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(401, { error: { message: 'expired' } })) // initial
      .mockResolvedValueOnce(makeResponse(200, { accessToken: 'newtok' })) // /auth/refresh
      .mockResolvedValueOnce(makeResponse(200, { value: 'ok' })); // retry

    const data = await apiFetch<{ value: string }>('/v1/secure');

    expect(data).toEqual({ value: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/v1/auth/refresh');
    const retryHeaders = fetchMock.mock.calls[2]?.[1]?.headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe('Bearer newtok');
    expect(getAccessToken()).toBe('newtok');
  });

  it('clears the token and throws (no retry) when refresh fails', async () => {
    setAccessToken('stale');
    fetchMock
      .mockResolvedValueOnce(makeResponse(401, { error: { message: 'expired' } })) // initial
      .mockResolvedValueOnce(makeResponse(401, { error: { message: 'no session' } })); // refresh fails

    await expect(apiFetch('/v1/secure')).rejects.toBeInstanceOf(ApiClientError);
    expect(getAccessToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not try to refresh the refresh endpoint itself', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(401, { error: { message: 'no session' } }));
    await expect(apiFetch('/v1/auth/refresh', { method: 'POST', body: '{}' })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

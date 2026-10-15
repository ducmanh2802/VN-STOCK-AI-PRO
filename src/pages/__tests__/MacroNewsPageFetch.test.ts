import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchJson } from '../MacroNewsPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchJson', () => {
  it('200 with a JSON object body resolves to that object', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      };
    });
    const result = await fetchJson<{ success: true }>('http://example.com');
    expect(result).toEqual({ success: true });
  });

  it('200 whose json() rejects (invalid JSON) rejects with an Error whose message contains the URL', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      return {
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Invalid JSON')),
      };
    });
    await expect(fetchJson('http://example.com')).rejects.toThrow(
      'Phản hồi không hợp lệ (không phải JSON) từ'
    );
  });

  it('200 whose json() resolves to null rejects', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(null),
      };
    });
    await expect(fetchJson('http://example.com')).rejects.toThrow(
      'Phản hồi không hợp lệ (không phải JSON) từ'
    );
  });

  it('500 with { error: "boom" } rejects with message "boom", keeping existing !res.ok handling', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      return {
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'boom' }),
      };
    });
    await expect(fetchJson('http://example.com')).rejects.toThrow('boom');
  });

  it('404 with { error: { code: "X", message: "nope" } } rejects with message "nope", keeping existing !res.ok handling', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      return {
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: { code: 'X', message: 'nope' } }),
      };
    });
    await expect(fetchJson('http://example.com')).rejects.toThrow('nope');
  });
});
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PipelineConfig } from '../src/types';

function makeMockEnv(baseUrl = 'https://test.intuiflow.com', apiKey = 'test-key') {
  const mockFirst = vi.fn().mockResolvedValue({ base_url: baseUrl });
  return {
    env: {
      DB: {
        prepare: vi.fn().mockReturnValue({ first: mockFirst }),
      },
      INTUIFLOW_API_KEY: apiKey,
    } as any,
    mockFirst,
  };
}

function makeConfig(location = 'DD Tech'): Partial<PipelineConfig> {
  return { location } as any;
}

describe('runScheduler', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('calls GET /api/v2/job/schedule with locationName query param', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue('') });
    globalThis.fetch = mockFetch;

    const { runScheduler } = await import('../src/pipeline/upload-intuiflow');
    await runScheduler(makeMockEnv().env, makeConfig('DD Tech') as PipelineConfig);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v2/job/schedule');
    expect(url).toMatch(/locationName=DD[\s+%20]?Tech/);
    expect(init?.method ?? 'GET').toBe('GET');
    expect(init?.body).toBeUndefined();
  });

  it('sends API_Key (correct casing) as query param', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue('') });
    globalThis.fetch = mockFetch;

    const { runScheduler } = await import('../src/pipeline/upload-intuiflow');
    await runScheduler(makeMockEnv().env, makeConfig() as PipelineConfig);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('API_Key=test-key');
    expect(url).not.toContain('api_key=');
  });

  it('sends doRunPacketBuilder=true and doRunExecutionPriorityIfEnabled=false', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue('') });
    globalThis.fetch = mockFetch;

    const { runScheduler } = await import('../src/pipeline/upload-intuiflow');
    await runScheduler(makeMockEnv().env, makeConfig() as PipelineConfig);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('doRunPacketBuilder=false');
    expect(url).toContain('doRunExecutionPriorityIfEnabled=false');
  });

  it('uses the Intuiflow base URL from the connector', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue('') });
    globalThis.fetch = mockFetch;

    const { env } = makeMockEnv('https://acme.intuiflow.com');
    const { runScheduler } = await import('../src/pipeline/upload-intuiflow');
    await runScheduler(env, makeConfig() as PipelineConfig);

    expect(mockFetch.mock.calls[0][0]).toContain('https://acme.intuiflow.com');
  });

  it('throws on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('Internal Server Error'),
    });

    const { runScheduler } = await import('../src/pipeline/upload-intuiflow');
    await expect(runScheduler(makeMockEnv().env, makeConfig() as PipelineConfig))
      .rejects.toThrow('Scheduler call failed: 500');
  });

  it('throws if INTUIFLOW_API_KEY is missing', async () => {
    const { env } = makeMockEnv('https://test.intuiflow.com', '');
    env.INTUIFLOW_API_KEY = undefined;

    const { runScheduler } = await import('../src/pipeline/upload-intuiflow');
    await expect(runScheduler(env, makeConfig() as PipelineConfig))
      .rejects.toThrow('Missing INTUIFLOW_API_KEY');
  });
});

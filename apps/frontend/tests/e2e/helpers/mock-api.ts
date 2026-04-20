import type { Page, Route } from '@playwright/test';

/**
 * Phase 18 — API mocking helper for E2E specs.
 *
 * Each spec registers handlers for the backend routes it cares about
 * before navigating the browser. Unmatched `/api/v1/**` requests return
 * 404 so tests don't silently pass on missing handlers.
 */
export type Handler = (route: Route) => Promise<void> | void;

export function json(status: number, body: unknown): Handler {
  return async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(body),
    });
  };
}

export interface MockApi {
  on(method: string, urlGlob: string, handler: Handler): void;
  attach(): Promise<void>;
}

export function mockApi(page: Page): MockApi {
  const handlers: Array<{ method: string; urlGlob: RegExp; handler: Handler }> = [];

  return {
    on(method, urlGlob, handler) {
      handlers.push({ method: method.toUpperCase(), urlGlob: toRegex(urlGlob), handler });
    },
    async attach() {
      await page.route('**/api/v1/**', async (route) => {
        const req = route.request();
        const url = req.url();
        const method = req.method();
        const match = handlers.find((h) => h.method === method && h.urlGlob.test(url));
        if (match) {
          await match.handler(route);
          return;
        }
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 404,
            message: `mock-api: no handler for ${method} ${url}`,
          }),
        });
      });
    },
  };
}

function toRegex(glob: string): RegExp {
  // Trivial glob → regex: * becomes [^/?]*, ** becomes .*
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const replaced = escaped
    .replace(/\*\*/g, '__DOUBLESTAR__')
    .replace(/\*/g, '[^/?]*')
    .replace(/__DOUBLESTAR__/g, '.*');
  return new RegExp(replaced);
}

// ============================================================
// Test fixtures — reusable payloads
// ============================================================

export const studentUser = {
  id: 'student-1',
  email: 'student@lms.local',
  name: 'Nguyễn Văn Sinh',
  role: 'STUDENT',
  avatar: null,
  emailVerified: true,
  is2FAEnabled: false,
};

export const adminUser = {
  id: 'admin-1',
  email: 'admin@lms.local',
  name: 'Quản Trị Viên',
  role: 'ADMIN',
  avatar: null,
  emailVerified: true,
  is2FAEnabled: false,
};

export const instructorUser = {
  id: 'inst-1',
  email: 'instructor@lms.local',
  name: 'Giảng Viên',
  role: 'INSTRUCTOR',
  avatar: null,
  emailVerified: true,
  is2FAEnabled: false,
};

export const fakeAccessToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ0ZXN0In0.';
export const fakeRefreshToken = 'fake-refresh-token';

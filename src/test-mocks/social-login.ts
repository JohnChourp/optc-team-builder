import { vi } from 'vitest';

export const socialLogin = {
  getAuthorizationCode: vi.fn(),
  initialize: vi.fn(),
  isLoggedIn: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
};

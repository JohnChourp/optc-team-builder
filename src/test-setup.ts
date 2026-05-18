import { vi } from 'vitest';

vi.mock('@capgo/capacitor-social-login', () => ({
  SocialLogin: {
    getAuthorizationCode: vi.fn(),
    initialize: vi.fn(),
    isLoggedIn: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

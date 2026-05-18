import { vi } from 'vitest';

import { socialLogin } from './test-mocks/social-login';

vi.mock('@capgo/capacitor-social-login', () => ({
  SocialLogin: socialLogin,
}));

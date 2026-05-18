import '@angular/compiler';
import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Capacitor } from '@capacitor/core';

import { GoogleAnalyticsService } from './google-analytics.service';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(() => 'web'),
    isNativePlatform: vi.fn(() => false),
  },
  WebPlugin: class WebPluginStub {
    addListener() {
      return { remove: () => undefined };
    }
    notifyListeners() {}
    removeAllListeners() {}
  },
  registerPlugin: vi.fn(() => ({})),
}));

describe('GoogleAnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not inject the GA script when the measurement id is missing', () => {
    const { document } = createDom();
    const service = new GoogleAnalyticsService(document, {
      ga4MeasurementId: '',
    });

    expect(service.enable()).toBe(false);
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(document.defaultView?.dataLayer).toBeUndefined();
  });

  it('injects the GA script and initializes gtag once after enable', () => {
    const { document } = createDom();
    const service = new GoogleAnalyticsService(document, {
      ga4MeasurementId: 'G-TEST123',
    });

    expect(service.enable()).toBe(true);
    expect(service.enable()).toBe(true);

    expect(document.querySelectorAll('script[src*="googletagmanager"]').length).toBe(1);
    expect(document.defaultView?.dataLayer).toEqual(
      expect.arrayContaining([
        ['js', expect.any(Date)],
        [
          'config',
          'G-TEST123',
          {
            send_page_view: false,
          },
        ],
        [
          'consent',
          'update',
          {
            analytics_storage: 'granted',
          },
        ],
      ]),
    );
  });

  it('tracks page views only while analytics is enabled', () => {
    const { document } = createDom();
    const service = new GoogleAnalyticsService(document, {
      ga4MeasurementId: 'G-TRACK1',
    });

    service.enable();
    service.trackPageView('/tabs/settings');

    expect(document.defaultView?.dataLayer?.at(-1)).toEqual([
      'event',
      'page_view',
      {
        page_location: 'https://example.com/tabs/characters',
        page_path: '/tabs/settings',
        page_title: 'OPTC Team Builder',
      },
    ]);

    service.disable();
    const callCountAfterDisable = document.defaultView?.dataLayer?.length ?? 0;

    service.trackPageView('/tabs/auto-team-builder');

    expect(document.defaultView?.dataLayer).toHaveLength(callCountAfterDisable);
    expect((document.defaultView as Record<string, unknown>)['ga-disable-G-TRACK1']).toBe(true);
  });

  it('stays disabled on native platforms', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const { document } = createDom();
    const service = new GoogleAnalyticsService(document, {
      ga4MeasurementId: 'G-NATIVE1',
    });

    expect(service.enable()).toBe(false);
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });
});

function createDom() {
  const dom = new JSDOM(
    '<!doctype html><html><head><title>OPTC Team Builder</title></head><body></body></html>',
    {
      url: 'https://example.com/tabs/characters',
    },
  );

  return {
    document: dom.window.document,
  };
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { type TranslateFn } from './failure-message.utils';
import { describePlayerFileNotice } from './player-file-notice.utils';

/*
 * 869f63gqg. In the Android app an export opens the share sheet, and the app shell's toast says
 * what the sheet is for - or that the export failed. These pin the words the reader reads,
 * translated from the REAL bundles, so a missing or misnamed key fails here rather than showing
 * its own name on a phone.
 */
describe('what the app shell says about an export on a phone', () => {
  function translateFrom(language: 'el' | 'en'): TranslateFn {
    const read = (file: string) => JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'));
    const bundles: Record<string, unknown> = {
      root: read(`public/i18n/${language}.json`),
      failures: read(`public/i18n/failures/${language}.json`),
    };

    return (key, _params, scope) => {
      const value = key
        .split('.')
        .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundles[scope ?? 'root']);

      if (typeof value !== 'string') {
        throw new Error(`${language} has no ${scope ?? 'root'} string ${key}`);
      }

      return value;
    };
  }

  it.each(['en', 'el'] as const)('says, in %s, what the open share sheet is for', (language) => {
    const translate = translateFrom(language);

    expect(describePlayerFileNotice('choose-destination', translate)).toBe(
      translate('playerFile.chooseDestination'),
    );
  });

  it.each(['en', 'el'] as const)(
    'says, in %s, that an export failed in the failure vocabulary: what, that nothing changed, what to do',
    (language) => {
      const translate = translateFrom(language);

      expect(describePlayerFileNotice('failed', translate)).toBe(
        [
          translate('what.unexpected', undefined, 'failures'),
          translate('safety.safe', undefined, 'failures'),
          translate('action.unexpected', undefined, 'failures'),
        ].join(' '),
      );
    },
  );

  it('says nothing when there is nothing to say', () => {
    expect(describePlayerFileNotice(null, translateFrom('en'))).toBe('');
  });

  it('is what the app shell shows, and dismissing it clears the notice', () => {
    const shell = readFileSync(resolve(process.cwd(), 'src/app/app.component.ts'), 'utf8');

    expect(shell).toContain('[isOpen]="playerFileNotice() !== null"');
    expect(shell).toContain('[message]="playerFileNoticeMessage()"');
    expect(shell).toContain('(didDismiss)="dismissPlayerFileNotice()"');
    expect(shell).toContain('describePlayerFileNotice(this.playerFileNotice(),');
  });
});

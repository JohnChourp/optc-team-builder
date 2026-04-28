import { describe, expect, it } from 'vitest';

import { normalizeHtmlToText } from './html-text.utils';

describe('normalizeHtmlToText', () => {
  it('normalizes block and list HTML into readable text', () => {
    expect(
      normalizeHtmlToText(
        '<div><p><b>Always Active: </b>Boosts HP by 1.3x.</p><ul><li><b>Standard Captain: </b>Boosts ATK by 3.5x.</li></ul></div>',
      ),
    ).toBe('Always Active: Boosts HP by 1.3x. Standard Captain: Boosts ATK by 3.5x.');
  });

  it('decodes entities once and ignores executable metadata nodes', () => {
    expect(
      normalizeHtmlToText(
        'Keeps escaped text &amp;lt;script&amp;gt; visible.<script>Boosts ATK by 99x.</script><style>Boosts HP by 99x.</style>',
      ),
    ).toBe('Keeps escaped text &lt;script&gt; visible.');
  });
});

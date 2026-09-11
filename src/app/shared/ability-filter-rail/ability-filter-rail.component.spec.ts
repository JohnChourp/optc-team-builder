import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  resolve(process.cwd(), 'src/app/shared/ability-filter-rail/ability-filter-rail.component.scss'),
  'utf8',
);

describe('ability filter rail styles', () => {
  /*
   * 869exmkdh. The rail sits in hosts from a full-width page down to the Auto Team Builder
   * required-character card. A forced two columns below 640px left that card 15px per label at
   * 320px; auto-fit with a min(100%, 140px) floor lets each host decide, down to one column.
   */
  it('sizes its columns from the space it has, down to a single column', () => {
    expect(styles).toContain(
      'grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr));',
    );
    expect(styles).not.toMatch(/grid-template-columns: repeat\(2,/u);
  });

  it('wraps a long label instead of cutting it off', () => {
    expect(styles).toContain('overflow-wrap: anywhere;');
    expect(styles).not.toContain('text-overflow: ellipsis;');
  });
});

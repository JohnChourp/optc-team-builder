import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectPublicMembers,
  compareWithRegister,
  findUnusedMembers,
  loadRegister,
  stripComments,
} from './check-unused-public-members.mjs';

/**
 * 869f135rm. The lane this guards exists because a check that runs green is a
 * claim everyone downstream builds on, so these tests are mostly about the ways
 * this one could run green while seeing nothing.
 *
 * The register itself is asserted against the real tree by the check, not here -
 * a test that re-derives the register from the register proves nothing.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

function maps(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries));
}

const EMPTY = new Map<string, string>();

describe('findUnusedMembers', () => {
  const member = {
    file: 'src/app/thing.ts',
    className: 'Thing',
    member: 'lonely',
    line: 1,
  };

  it('reports a member nothing reads', () => {
    const findings = findUnusedMembers([member], {
      productionText: maps({ 'src/app/thing.ts': 'class Thing { lonely = 1; }' }),
      specText: EMPTY,
      templateText: EMPTY,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('orphan');
  });

  it('separates a member only its own spec reads', () => {
    const findings = findUnusedMembers([member], {
      productionText: maps({ 'src/app/thing.ts': 'class Thing { lonely = 1; }' }),
      specText: maps({ 'src/app/thing.spec.ts': 'expect(thing.lonely).toBe(1);' }),
      templateText: EMPTY,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('spec-only');
  });

  it('does not report a member used only by a template', () => {
    const findings = findUnusedMembers([member], {
      productionText: maps({ 'src/app/thing.ts': 'class Thing { lonely = 1; }' }),
      specText: EMPTY,
      templateText: maps({ 'src/app/thing.html': '<p>{{ lonely }}</p>' }),
    });

    expect(findings).toEqual([]);
  });

  it('does not report a member another source file reads', () => {
    const findings = findUnusedMembers([member], {
      productionText: maps({
        'src/app/thing.ts': 'class Thing { lonely = 1; }',
        'src/app/other.ts': 'thing.lonely;',
      }),
      specText: EMPTY,
      templateText: EMPTY,
    });

    expect(findings).toEqual([]);
  });

  it('does not report a member its own file reads a second time', () => {
    const findings = findUnusedMembers([member], {
      productionText: maps({
        'src/app/thing.ts': 'class Thing { lonely = 1; read() { return this.lonely; } }',
      }),
      specText: EMPTY,
      templateText: EMPTY,
    });

    expect(findings).toEqual([]);
  });

  it('matches on a word boundary, so a longer name is not a reader', () => {
    const findings = findUnusedMembers([member], {
      productionText: maps({
        'src/app/thing.ts': 'class Thing { lonely = 1; }',
        'src/app/other.ts': 'thing.lonelyHearts;',
      }),
      specText: EMPTY,
      templateText: EMPTY,
    });

    expect(findings).toHaveLength(1);
  });
});


describe('stripComments', () => {
  /*
   * 869f135r6. A comment is not a reader, and this counted one. Writing
   * "`downloadError` was captured here and rendered nowhere" in the same file as
   * the declaration made the member look alive - the guard read its own
   * explanation of why it was dead as evidence that it was not. Stripping
   * comments immediately revealed a real finding it had been masking.
   */
  it('removes a block comment, so a member named only there is not a reader', () => {
    expect(stripComments('/* mentions lonely */ const x = 1;')).not.toContain('lonely');
  });

  it('removes a line comment', () => {
    expect(stripComments('const x = 1; // mentions lonely')).not.toContain('lonely');
  });

  it('keeps code on the same line as a line comment', () => {
    expect(stripComments('const keepMe = 1; // gone')).toContain('keepMe');
  });

  it('leaves a URL alone, because `://` is not a comment', () => {
    expect(stripComments("const u = 'https://example.com/lonely';")).toContain('lonely');
  });

  it('leaves strings alone - a member named in a string is usually a real lookup', () => {
    expect(stripComments("obj['lonely']")).toContain('lonely');
  });
});

describe('compareWithRegister', () => {
  const finding = {
    file: 'src/app/thing.ts',
    className: 'Thing',
    member: 'lonely',
    line: 1,
    kind: 'orphan' as const,
  };
  const entry = { file: 'src/app/thing.ts', member: 'Thing.lonely', kind: 'orphan' };

  it('passes when every finding is registered', () => {
    const result = compareWithRegister([finding], { entries: [entry] });

    expect(result.unregistered).toEqual([]);
    expect(result.stale).toEqual([]);
    expect(result.kindDrift).toEqual([]);
  });

  it('reports a finding with no register entry', () => {
    const result = compareWithRegister([finding], { entries: [] });

    expect(result.unregistered).toHaveLength(1);
  });

  it('reports a register entry that is no longer a finding, so the register can only shrink', () => {
    const result = compareWithRegister([], { entries: [entry] });

    expect(result.stale).toHaveLength(1);
  });

  it('reports an entry whose declared kind no longer matches the measurement', () => {
    const result = compareWithRegister([finding], {
      entries: [{ ...entry, kind: 'spec-only' }],
    });

    expect(result.kindDrift).toHaveLength(1);
    expect(result.kindDrift[0].declaredKind).toBe('spec-only');
  });

  it('exempts an intentional entry from the kind check, because its reason is authored not measured', () => {
    const result = compareWithRegister([finding], {
      entries: [{ ...entry, kind: 'intentional' }],
    });

    expect(result.kindDrift).toEqual([]);
    expect(result.unregistered).toEqual([]);
  });
});

describe('collectPublicMembers', () => {
  /*
   * A member the framework calls has no caller here and is not dead. These are
   * the exclusions that keep the lane from crying wolf, and each one was a real
   * false positive before it was added.
   */
  it('excludes the exclusions the check depends on', async () => {
    const source = readFileSync(
      path.join(REPO_ROOT, 'scripts/check-unused-public-members.mjs'),
      'utf8',
    );

    expect(source).toContain('ngOnInit');
    expect(source).toContain('ionViewWillEnter');
    expect(source).toContain('HostListener');
    expect(source).toContain('collectHeritageMemberNames');
  });

  it('is exported for the lane to use', () => {
    expect(typeof collectPublicMembers).toBe('function');
  });
});

describe('the register', () => {
  it('records when its baseline was measured, so a stale count is visible', () => {
    const register = loadRegister();

    expect(register.measuredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(register.baselineCount).toBe(register.entries.length);
  });

  it('gives every entry a reason and a removal condition', () => {
    const register = loadRegister();

    for (const entry of register.entries) {
      expect(entry.file, `${entry.member} has no file`).toBeTruthy();
      expect(entry.member, `${entry.file} has an entry with no member`).toContain('.');
      expect(['orphan', 'spec-only', 'intentional']).toContain(entry.kind);
      expect(entry.reason.length, `${entry.member} has no reason`).toBeGreaterThan(20);
      expect(entry.removeWhen.length, `${entry.member} has no removal condition`).toBeGreaterThan(
        20,
      );
    }
  });

  it('holds no duplicate entries, which would let one hide a real finding', () => {
    const register = loadRegister();
    const keys = register.entries.map((entry) => `${entry.file}::${entry.member}`);

    expect(new Set(keys).size).toBe(keys.length);
  });
});

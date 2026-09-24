/**
 * Renders the CONTROL FLOW of an Angular template against a component, and nothing else.
 *
 * 869f63gqt. Pages here are specced without a TestBed - they are built with stub services and
 * their templates read as text - so "does this template offer sign-in when sign-in cannot work?"
 * had no honest answer: a text search finds the button whichever branch it sits in. This decides
 * every `@if` / `@else if` / `@else` chain by evaluating its condition against the component, and
 * returns the markup that would render. A spec can then ask what the reader actually gets in each
 * state, from the real template and the real component.
 *
 * What it does, deliberately and no more:
 *
 *   - `@if (cond; as name)` chains are decided; the alias is bound for the chosen branch;
 *   - `@for`, `@empty`, `@defer`, `@placeholder`, `@loading` and `@error` bodies are all kept,
 *     unevaluated, so the result is a superset of any one render of them;
 *   - HTML comments are dropped, because a comment that describes a control is not one;
 *   - interpolations, tags and attribute values are copied through untouched, braces and `@`
 *     inside them included.
 *
 * A condition that cannot be evaluated throws, naming it, rather than counting as false - a
 * render that quietly skipped a branch would pass every "is not offered" assertion.
 */
export function renderTemplateControlFlow(template: string, component: object): string {
  return render(template, 0, template.length, component);
}

const BLOCKS_KEPT_WHOLE = new Set(['for', 'empty', 'defer', 'placeholder', 'loading', 'error']);

function render(source: string, from: number, to: number, scope: object): string {
  let output = '';
  let index = from;

  while (index < to) {
    const next = scanToken(source, index, to);

    if (next.kind === 'if') {
      const chain = readIfChain(source, next.start, to);

      output += renderIfChain(source, chain, scope);
      index = chain.end;
      continue;
    }

    if (next.kind === 'block') {
      output += render(source, next.bodyStart, next.bodyEnd, scope);
      index = next.end;
      continue;
    }

    if (next.kind !== 'comment') {
      output += source.slice(index, next.end);
    }

    index = next.end;
  }

  return output;
}

type Token =
  | { kind: 'text' | 'comment'; end: number }
  | { kind: 'if'; start: number; end: number }
  | { kind: 'block'; bodyStart: number; bodyEnd: number; end: number };

function scanToken(source: string, index: number, to: number): Token {
  if (source.startsWith('<!--', index)) {
    const close = source.indexOf('-->', index + 4);

    return { kind: 'comment', end: close === -1 ? to : close + 3 };
  }

  if (source.startsWith('{{', index)) {
    const close = source.indexOf('}}', index + 2);

    return { kind: 'text', end: close === -1 ? to : close + 2 };
  }

  if (source[index] === '<' && /[A-Za-z/]/u.test(source[index + 1] ?? '')) {
    return { kind: 'text', end: findTagEnd(source, index, to) };
  }

  if (source[index] === '@') {
    const keyword = /^@([a-z]+)\b/u.exec(source.slice(index, index + 20))?.[1];

    if (keyword === 'if') {
      return { kind: 'if', start: index, end: index };
    }

    if (keyword !== undefined && BLOCKS_KEPT_WHOLE.has(keyword)) {
      let cursor = index + 1 + keyword.length;

      cursor = skipWhitespace(source, cursor);

      if (source[cursor] === '(') {
        cursor = skipWhitespace(source, readParenthesised(source, cursor).end);
      }

      if (source[cursor] !== '{') {
        throw new Error(`@${keyword} at ${index} has no body`);
      }

      const bodyEnd = findBlockEnd(source, cursor);

      return { kind: 'block', bodyStart: cursor + 1, bodyEnd, end: bodyEnd + 1 };
    }

    if (keyword !== undefined) {
      // `@switch`, `@let` and a stray `@else` are not modelled. Refusing is safer than
      // guessing: a block misread here would end its parent early and hide real markup.
      throw new Error(`@${keyword} at ${index} is not supported by renderTemplateControlFlow`);
    }
  }

  return { kind: 'text', end: index + 1 };
}

interface IfBranch {
  condition: string | null;
  bodyStart: number;
  bodyEnd: number;
}

function readIfChain(source: string, start: number, to: number): { branches: IfBranch[]; end: number } {
  const branches: IfBranch[] = [];
  let cursor = start + '@if'.length;

  for (;;) {
    let condition: string | null = null;

    cursor = skipWhitespace(source, cursor);

    if (source[cursor] === '(') {
      const group = readParenthesised(source, cursor);

      condition = group.content;
      cursor = skipWhitespace(source, group.end);
    }

    if (source[cursor] !== '{') {
      throw new Error(`@if branch at ${cursor} has no body`);
    }

    const bodyEnd = findBlockEnd(source, cursor);

    branches.push({ condition, bodyStart: cursor + 1, bodyEnd });
    cursor = bodyEnd + 1;

    const after = skipWhitespace(source, cursor);

    if (condition !== null && after < to && /^@else\s+if\b/u.test(source.slice(after, after + 12))) {
      cursor = after + source.slice(after).match(/^@else\s+if/u)![0].length;
      continue;
    }

    if (condition !== null && after < to && /^@else\b/u.test(source.slice(after, after + 6))) {
      cursor = after + '@else'.length;
      continue;
    }

    return { branches, end: cursor };
  }
}

function renderIfChain(source: string, chain: { branches: IfBranch[] }, scope: object): string {
  for (const branch of chain.branches) {
    if (branch.condition === null) {
      return render(source, branch.bodyStart, branch.bodyEnd, scope);
    }

    const [expression = '', alias] = branch.condition.split(/;\s*as\s+/u);
    const value = evaluate(expression, scope);

    if (value) {
      const branchScope = alias ? Object.assign(Object.create(scope) as object, { [alias.trim()]: value }) : scope;

      return render(source, branch.bodyStart, branch.bodyEnd, branchScope);
    }
  }

  return '';
}

function evaluate(expression: string, scope: object): unknown {
  try {
    // `with` resolves every name against the component, prototype methods included, exactly the
    // way a template expression does. Function bodies are sloppy mode, where `with` is legal.
    return new Function('scope', `with (scope) { return (${expression}); }`)(scope) as unknown;
  } catch (error) {
    throw new Error(`cannot evaluate @if (${expression.trim()}): ${(error as Error).message}`);
  }
}

function skipWhitespace(source: string, index: number): number {
  let cursor = index;

  while (cursor < source.length && /\s/u.test(source[cursor]!)) {
    cursor += 1;
  }

  return cursor;
}

/** `(`...`)` with nesting and quoted strings, returning what is inside and the index after `)`. */
function readParenthesised(source: string, open: number): { content: string; end: number } {
  let depth = 0;

  for (let cursor = open; cursor < source.length; cursor += 1) {
    const character = source[cursor]!;

    if (character === '"' || character === "'" || character === '`') {
      cursor = source.indexOf(character, cursor + 1);
      if (cursor === -1) break;
      continue;
    }

    if (character === '(') depth += 1;

    if (character === ')') {
      depth -= 1;

      if (depth === 0) {
        return { content: source.slice(open + 1, cursor), end: cursor + 1 };
      }
    }
  }

  throw new Error(`unclosed ( at ${open}`);
}

/** The index of the `}` closing the block whose `{` is at `open`. */
function findBlockEnd(source: string, open: number): number {
  let cursor = open + 1;

  while (cursor < source.length) {
    if (source[cursor] === '}') {
      return cursor;
    }

    const token = scanToken(source, cursor, source.length);

    if (token.kind === 'if') {
      cursor = readIfChain(source, cursor, source.length).end;
    } else {
      cursor = token.end;
    }
  }

  throw new Error(`unclosed { at ${open}`);
}

/** The index after the `>` that closes the tag at `start`, skipping quoted attribute values. */
function findTagEnd(source: string, start: number, to: number): number {
  for (let cursor = start + 1; cursor < to; cursor += 1) {
    const character = source[cursor]!;

    if (character === '"' || character === "'") {
      const close = source.indexOf(character, cursor + 1);

      cursor = close === -1 ? to : close;
      continue;
    }

    if (character === '>') {
      return cursor + 1;
    }
  }

  return to;
}

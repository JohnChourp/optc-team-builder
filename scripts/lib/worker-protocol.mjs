import { readFileSync } from 'node:fs';

/**
 * 869f138qx. The three workers' protocols, read out of their models instead of out of three heads.
 *
 * Each worker has a models file, a bundling guard and a handler spec, and between them they say
 * everything except the thing a reader needs: what messages exist, which way they go, what carries
 * a correlation id, and how a failure comes back. That lives in types and call sites, per worker,
 * three times - so a divergence between them is invisible until somebody trips over it.
 *
 * It matters now rather than in the abstract: two proposals from earlier waves send more traffic
 * across these boundaries - streamed first results, and a Friend Captain sweep that runs the engine
 * repeatedly - and neither can be designed against a protocol nobody has written down.
 *
 * The direction is not guessed. Each models file declares exactly two exported unions, named
 * `…WorkerRequest` and `…WorkerResponse`, and that naming IS the protocol: a request goes page to
 * worker, a response goes worker to page. A union that does not end in one of those two words has
 * no direction, and the check fails rather than inventing one.
 */

export const DIRECTIONS = Object.freeze({
  Request: 'page-to-worker',
  Response: 'worker-to-page',
});

/** The `{ … }` that starts at `open`, respecting nesting. */
function readBraces(source, open) {
  let depth = 0;

  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;

      if (depth === 0) {
        return source.slice(open + 1, index);
      }
    }
  }

  return null;
}

/** An `interface Name { … }` body, whether or not it is exported. */
export function readInterfaceBody(source, name) {
  const declaration = new RegExp(`\\binterface\\s+${name}\\s*\\{`, 'u').exec(source);

  return declaration ? readBraces(source, declaration.index + declaration[0].length - 1) : null;
}

/** The `type: 'x'` a message body declares, or null when it declares none. */
export function readMessageKind(body) {
  return /\btype:\s*'([^']+)'/u.exec(body ?? '')?.[1] ?? null;
}

/**
 * Field names a message body declares, in source order.
 *
 * `type` is dropped: it is the discriminant, not a payload, and listing it on every message would
 * make the document longer without making it say more.
 */
export function readMessageFields(body) {
  /*
   * Split on both separators a member can use. An interface writes one field per line; an inline
   * shape in a union writes `{ type: 'result'; requestId: number }` on one line, and a line-anchored
   * match finds only the first of those - which read the Captain Coverage `result` message as
   * carrying no fields and no correlation id, when it carries both.
   */
  return (body ?? '')
    .split(/[;\n]/u)
    .map((fragment) => /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:/u.exec(fragment)?.[1])
    .filter((name) => Boolean(name) && name !== 'type');
}

/** The union members of `export type <name> = …`, as raw text. */
export function readUnionMembers(source, unionName) {
  const declaration = new RegExp(`export type ${unionName}\\s*=`, 'u').exec(source);

  if (!declaration) {
    return [];
  }

  let index = declaration.index + declaration[0].length;
  let depth = 0;
  let text = '';

  for (; index < source.length; index += 1) {
    const character = source[index];

    if (character === '{' || character === '(') {
      depth += 1;
    } else if (character === '}' || character === ')') {
      depth -= 1;
    } else if (character === ';' && depth === 0) {
      break;
    }

    text += character;
  }

  /* Split on the `|` that separates members, never on one inside a member. */
  const members = [];
  let current = '';

  depth = 0;

  for (const character of text) {
    if (character === '{' || character === '(') {
      depth += 1;
    } else if (character === '}' || character === ')') {
      depth -= 1;
    }

    if (character === '|' && depth === 0) {
      members.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  members.push(current);

  return members.map((member) => member.trim()).filter(Boolean);
}

/** One message: its kind, its fields, and how it is correlated to a request. */
export function describeMessage(source, member) {
  const inline = member.indexOf('{');
  const body =
    inline >= 0 ? readBraces(member, inline) : readInterfaceBody(source, member.replace(/\W/gu, ''));
  const fields = readMessageFields(body);

  return {
    kind: readMessageKind(body),
    fields,
    correlationField: fields.find((name) => name === 'requestId' || name === 'runId') ?? null,
  };
}

/**
 * A worker's protocol, both directions.
 *
 * `undocumented` collects every member whose kind could not be read - an inline shape with no
 * `type`, or a named interface the file does not declare. That is the failure the subtask asked for:
 * *a message kind with no documented direction fails*.
 */
export function readWorkerProtocol({ id, modelsPath, requestUnion, responseUnion }) {
  const source = readFileSync(modelsPath, 'utf8');
  const undocumented = [];

  const read = (unionName, direction) =>
    readUnionMembers(source, unionName).map((member) => {
      const message = describeMessage(source, member);

      if (!message.kind) {
        undocumented.push({ union: unionName, member: member.slice(0, 60) });
      }

      return { ...message, direction };
    });

  const requests = read(requestUnion, DIRECTIONS.Request);
  const responses = read(responseUnion, DIRECTIONS.Response);

  return {
    id,
    modelsPath,
    requestUnion,
    responseUnion,
    correlationFields: [
      ...new Set(
        [...requests, ...responses].map((message) => message.correlationField).filter(Boolean),
      ),
    ].sort(),
    messages: [...requests, ...responses],
    undocumented,
  };
}

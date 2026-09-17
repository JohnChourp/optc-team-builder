import { describe, expect, it } from 'vitest';

import { buildWorkerProtocolDocument } from './generate-worker-protocols.mjs';
import {
  DIRECTIONS,
  describeMessage,
  readInterfaceBody,
  readMessageFields,
  readMessageKind,
  readUnionMembers,
} from './lib/worker-protocol.mjs';

/**
 * 869f138qx. The parser has to read three genuinely different ways of declaring a message.
 *
 * Captain Coverage writes its union inline, Auto Team Builder names an interface per member, and one
 * Captain Coverage member is an intersection on a single line. That last one is not a hypothetical:
 * a line-anchored field match read it as carrying no fields and no correlation id when it carries
 * both, and the fix is why `readMessageFields` splits on `;` as well as on newlines.
 */

const INLINE = `
export type ThingWorkerRequest =
  | { type: 'init'; dataset: Dataset }
  | {
      type: 'filter';
      requestId: number;
      params: Params;
    };

export type ThingWorkerResponse =
  | { type: 'ready' }
  | ({ type: 'result'; requestId: number } & Outcome)
  | { type: 'error'; requestId: number | null; message: string };
`;

const NAMED = `
interface ThingInitRequest {
  type: 'init';
  records: Record[];
}

interface ThingResultResponse {
  type: 'result';
  runId: string;
  result: Result | null;
}

export type ThingWorkerRequest = ThingInitRequest;
export type ThingWorkerResponse = ThingResultResponse;
`;

describe('reading a union', () => {
  it('splits members without splitting inside one', () => {
    expect(readUnionMembers(INLINE, 'ThingWorkerRequest')).toHaveLength(2);
    expect(readUnionMembers(INLINE, 'ThingWorkerResponse')).toHaveLength(3);
  });

  it('reads a union with a single member', () => {
    expect(readUnionMembers(NAMED, 'ThingWorkerRequest')).toEqual(['ThingInitRequest']);
  });

  it('returns nothing for a union that is not there', () => {
    expect(readUnionMembers(INLINE, 'MissingWorkerRequest')).toEqual([]);
  });
});

describe('reading a message', () => {
  it('reads an inline member', () => {
    const [, filter] = readUnionMembers(INLINE, 'ThingWorkerRequest');

    expect(describeMessage(INLINE, filter)).toEqual({
      kind: 'filter',
      fields: ['requestId', 'params'],
      correlationField: 'requestId',
    });
  });

  it('reads an intersection member written on one line', () => {
    const [, result] = readUnionMembers(INLINE, 'ThingWorkerResponse');

    /* The case a line-anchored match got wrong: both fields are on the same line as `type`. */
    expect(describeMessage(INLINE, result)).toEqual({
      kind: 'result',
      fields: ['requestId'],
      correlationField: 'requestId',
    });
  });

  it('follows a named interface member', () => {
    const [init] = readUnionMembers(NAMED, 'ThingWorkerRequest');

    expect(describeMessage(NAMED, init)).toEqual({
      kind: 'init',
      fields: ['records'],
      correlationField: null,
    });
  });

  it('reads a message with no payload at all', () => {
    const [ready] = readUnionMembers(INLINE, 'ThingWorkerResponse');

    expect(describeMessage(INLINE, ready)).toEqual({
      kind: 'ready',
      fields: [],
      correlationField: null,
    });
  });

  it('drops the discriminant from the field list', () => {
    expect(readMessageFields("type: 'init'; dataset: Dataset")).toEqual(['dataset']);
  });

  it('reports no kind for a shape that declares none', () => {
    expect(readMessageKind('records: Record[]')).toBeNull();
  });

  it('reads an interface body past its own nesting', () => {
    const body = readInterfaceBody('interface A { a: { b: number }; c: string }', 'A');

    expect(readMessageFields(body)).toEqual(['a', 'c']);
  });
});

describe('the three real protocols', () => {
  it('reads every message in all three, both directions', () => {
    const document = buildWorkerProtocolDocument();

    expect(document.workerCount).toBe(3);
    expect(document.messageCount).toBe(17);
    expect(document.workers.every((worker) => worker.undocumented.length === 0)).toBe(true);
  });

  it('gives every message a direction taken from its union', () => {
    const document = buildWorkerProtocolDocument();
    const directions = new Set(
      document.workers.flatMap((worker) => worker.messages.map((message) => message.direction)),
    );

    expect([...directions].sort()).toEqual([DIRECTIONS.Request, DIRECTIONS.Response].sort());
  });

  it('surfaces the divergence the document exists to make visible', () => {
    const document = buildWorkerProtocolDocument();

    /*
     * Two workers correlate a reply with `runId`, the third with `requestId`. Neither is wrong; the
     * point is that nobody could see it while each protocol lived only in its own file.
     */
    expect(document.correlationFieldsByWorker).toEqual({
      'auto-team-builder': ['runId'],
      'auto-team-builder-rumble': ['runId'],
      'captain-coverage-filter': ['requestId'],
    });
  });

  it('matches the committed document', async () => {
    const { readFile } = await import('node:fs/promises');
    const committed = JSON.parse(await readFile('docs/worker-protocols.json', 'utf8'));

    expect(committed).toEqual(JSON.parse(JSON.stringify(buildWorkerProtocolDocument())));
  });

  it('names a models file that exists for every worker', async () => {
    const { readFile } = await import('node:fs/promises');
    const document = JSON.parse(await readFile('docs/worker-protocols.json', 'utf8'));

    /*
     * Not cross-checked against check-worker-bundling.mjs, which was the first idea: that guard
     * DISCOVERS its workers from the build rather than naming them, so there is no list there to
     * agree with. Reading each models file is the check that can actually fail.
     */
    for (const worker of document.workers) {
      const source = await readFile(worker.modelsPath, 'utf8');

      expect(source).toContain(`export type ${worker.requestUnion}`);
      expect(source).toContain(`export type ${worker.responseUnion}`);
    }
  });
});

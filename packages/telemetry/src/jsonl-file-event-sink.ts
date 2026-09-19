import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  parseEvent,
  serializeEvent,
  type EngineeringEvent,
  type EventSink,
} from './index.js';

export interface JsonlFileEventSinkOptions {
  readonly durable?: boolean;
  readonly mode?: number;
}

export class JsonlFileEventSink implements EventSink {
  readonly #durable: boolean;
  readonly #mode: number;
  #queue: Promise<void> = Promise.resolve();

  constructor(
    readonly filePath: string,
    options: JsonlFileEventSinkOptions = {},
  ) {
    if (!filePath.trim()) throw new Error('filePath is required');

    this.#durable = options.durable ?? true;
    this.#mode = options.mode ?? 0o600;
  }

  append(event: EngineeringEvent): Promise<void> {
    const operation = this.#queue.then(() => this.#appendUnsafe(event));
    this.#queue = operation.catch(() => undefined);
    return operation;
  }

  async #appendUnsafe(event: EngineeringEvent): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });

    const handle = await open(this.filePath, 'a', this.#mode);
    try {
      await handle.appendFile(`${serializeEvent(event)}\n`, 'utf8');
      if (this.#durable) await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

export async function readJsonlEvents(filePath: string): Promise<EngineeringEvent[]> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }

  const events: EngineeringEvent[] = [];
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) continue;

    try {
      events.push(parseEvent(line));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown parse failure';
      throw new Error(`invalid telemetry JSONL at line ${index + 1}: ${message}`);
    }
  }

  return events;
}

function isNotFound(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { readonly code?: string }).code === 'ENOENT'
  );
}

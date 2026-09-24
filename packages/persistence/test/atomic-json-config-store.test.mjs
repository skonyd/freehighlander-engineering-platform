import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AtomicJsonConfigStore,
  atomicConfigCanBypassGenerationCas,
  atomicConfigCanGrantAuthority,
  inFlightConfigSnapshotCanMutate,
} from '../dist/index.js';

function validateCatalog(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('catalog payload must be an object');
  }
  if (value.kind !== 'catalog') throw new Error('catalog kind is required');
  if (!Array.isArray(value.models) || !value.models.every((model) => typeof model === 'string')) {
    throw new Error('catalog models must be strings');
  }
  return {
    kind: value.kind,
    models: [...value.models],
  };
}

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-atomic-config-'));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    filePath: path.join(root, 'runtime-config.json'),
  };
}

test('atomic config store creates updates and preserves immutable in-flight snapshots', async (t) => {
  const { root, filePath } = await fixture(t);
  const store = new AtomicJsonConfigStore(filePath, validateCatalog);

  assert.equal(store.read(), null);

  const first = store.write(0, {
    kind: 'catalog',
    models: ['model-a'],
  });
  assert.equal(first.status, 'WRITTEN');
  assert.equal(first.actualGeneration, 1);
  assert.equal(first.snapshot?.generation, 1);
  assert.match(first.snapshot?.contentHash ?? '', /^[a-f0-9]{64}$/);
  assert.match(first.snapshot?.snapshotHash ?? '', /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(first.snapshot), true);
  assert.equal(Object.isFrozen(first.snapshot?.payload), true);
  assert.equal(Object.isFrozen(first.snapshot?.payload.models), true);

  const firstSnapshot = first.snapshot;
  assert.throws(() => {
    firstSnapshot.payload.models.push('forbidden');
  }, TypeError);

  const second = store.write(1, {
    kind: 'catalog',
    models: ['model-a', 'model-b'],
  });
  assert.equal(second.status, 'WRITTEN');
  assert.equal(second.actualGeneration, 2);
  assert.equal(second.snapshot?.generation, 2);
  assert.deepEqual(second.snapshot?.payload, {
    kind: 'catalog',
    models: ['model-a', 'model-b'],
  });

  assert.equal(firstSnapshot.generation, 1);
  assert.deepEqual(firstSnapshot.payload, {
    kind: 'catalog',
    models: ['model-a'],
  });

  const reread = store.read();
  assert.equal(reread?.generation, 2);
  assert.equal(reread?.snapshotHash, second.snapshot?.snapshotHash);

  const entries = await readdir(root);
  assert.equal(entries.some((entry) => entry.startsWith('.fh-config-')), false);
  assert.equal(entries.includes('runtime-config.json.lock'), false);
});

test('stale generation produces explicit conflict without changing persisted config', async (t) => {
  const { filePath } = await fixture(t);
  const store = new AtomicJsonConfigStore(filePath, validateCatalog);

  const first = store.write(0, {
    kind: 'catalog',
    models: ['model-a'],
  });
  assert.equal(first.status, 'WRITTEN');

  const stale = store.write(0, {
    kind: 'catalog',
    models: ['stale-model'],
  });
  assert.equal(stale.status, 'GENERATION_CONFLICT');
  assert.equal(stale.expectedGeneration, 0);
  assert.equal(stale.actualGeneration, 1);
  assert.equal(stale.snapshot?.generation, 1);
  assert.deepEqual(stale.snapshot?.payload, {
    kind: 'catalog',
    models: ['model-a'],
  });
  assert.deepEqual(store.read()?.payload, {
    kind: 'catalog',
    models: ['model-a'],
  });
});

test('active writer lock produces explicit writer conflict without overwrite', async (t) => {
  const { filePath } = await fixture(t);
  const store = new AtomicJsonConfigStore(filePath, validateCatalog);

  await writeFile(filePath + '.lock', 'held', 'utf8');
  const result = store.write(0, {
    kind: 'catalog',
    models: ['model-a'],
  });

  assert.deepEqual(result, {
    status: 'WRITER_CONFLICT',
    expectedGeneration: 0,
    actualGeneration: null,
    snapshot: null,
    authority: 'NONE',
  });
  assert.equal(store.read(), null);
});

test('validator failure leaves no partial file and always releases write lock', async (t) => {
  const { root, filePath } = await fixture(t);
  const store = new AtomicJsonConfigStore(filePath, validateCatalog);

  assert.throws(
    () =>
      store.write(0, {
        kind: 'wrong',
        models: [],
      }),
    /catalog kind/,
  );

  const entries = await readdir(root);
  assert.equal(entries.includes('runtime-config.json'), false);
  assert.equal(entries.includes('runtime-config.json.lock'), false);
  assert.equal(entries.some((entry) => entry.startsWith('.fh-config-')), false);
});

test('invalid expected generation and constructor inputs fail closed', async (t) => {
  const { filePath } = await fixture(t);
  const store = new AtomicJsonConfigStore(filePath, validateCatalog);

  assert.throws(() => new AtomicJsonConfigStore('', validateCatalog), /filePath/);
  assert.throws(() => new AtomicJsonConfigStore(filePath, null), /validatePayload/);
  assert.throws(() => store.write(-1, { kind: 'catalog', models: [] }), /non-negative integer/);
  assert.throws(() => store.write(1.5, { kind: 'catalog', models: [] }), /non-negative integer/);
});

test('corrupt JSON schema generation and hashes fail closed on read', async (t) => {
  const { filePath } = await fixture(t);
  const store = new AtomicJsonConfigStore(filePath, validateCatalog);

  await writeFile(filePath, '{broken', 'utf8');
  assert.throws(() => store.read(), /invalid atomic config JSON/);

  await writeFile(filePath, '[]\n', 'utf8');
  assert.throws(() => store.read(), /root must be an object/);

  const valid = store.write(0, {
    kind: 'catalog',
    models: ['model-a'],
  });
  assert.equal(valid.status, 'WRITTEN');

  const persisted = JSON.parse(await readFile(filePath, 'utf8'));

  await writeFile(
    filePath,
    JSON.stringify({ ...persisted, schemaVersion: 2 }, null, 2) + '\n',
    'utf8',
  );
  assert.throws(() => store.read(), /schemaVersion/);

  await writeFile(
    filePath,
    JSON.stringify({ ...persisted, generation: 0 }, null, 2) + '\n',
    'utf8',
  );
  assert.throws(() => store.read(), /positive integer/);

  await writeFile(
    filePath,
    JSON.stringify({ ...persisted, contentHash: 'bad' }, null, 2) + '\n',
    'utf8',
  );
  assert.throws(() => store.read(), /contentHash/);

  await writeFile(
    filePath,
    JSON.stringify({ ...persisted, snapshotHash: 'bad' }, null, 2) + '\n',
    'utf8',
  );
  assert.throws(() => store.read(), /snapshotHash/);

  const withoutPayload = { ...persisted };
  delete withoutPayload.payload;
  await writeFile(filePath, JSON.stringify(withoutPayload, null, 2) + '\n', 'utf8');
  assert.throws(() => store.read(), /payload is required/);
});

test('valid-shape tampering is detected by content and snapshot hashes', async (t) => {
  const { filePath } = await fixture(t);
  const store = new AtomicJsonConfigStore(filePath, validateCatalog);

  const written = store.write(0, {
    kind: 'catalog',
    models: ['model-a'],
  });
  assert.equal(written.status, 'WRITTEN');

  const persisted = JSON.parse(await readFile(filePath, 'utf8'));
  await writeFile(
    filePath,
    JSON.stringify(
      {
        ...persisted,
        payload: {
          kind: 'catalog',
          models: ['model-tampered'],
        },
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  assert.throws(() => store.read(), /content hash mismatch/);

  await writeFile(
    filePath,
    JSON.stringify(
      {
        ...persisted,
        snapshotHash: '0'.repeat(64),
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  assert.throws(() => store.read(), /snapshot hash mismatch/);
});

test('persisted payload must remain validator-canonical', async (t) => {
  const { filePath } = await fixture(t);
  const sortingValidator = (value) => {
    const validated = validateCatalog(value);
    return {
      kind: validated.kind,
      models: [...validated.models].sort(),
    };
  };
  const store = new AtomicJsonConfigStore(filePath, sortingValidator);

  const written = store.write(0, {
    kind: 'catalog',
    models: ['model-b', 'model-a'],
  });
  assert.equal(written.status, 'WRITTEN');
  assert.deepEqual(store.read()?.payload, {
    kind: 'catalog',
    models: ['model-a', 'model-b'],
  });

  const persisted = JSON.parse(await readFile(filePath, 'utf8'));
  persisted.payload.models = ['model-b', 'model-a'];
  await writeFile(filePath, JSON.stringify(persisted, null, 2) + '\n', 'utf8');
  assert.throws(() => store.read(), /not validator-canonical/);
});

test('atomic config infrastructure remains authority-neutral', () => {
  assert.equal(atomicConfigCanGrantAuthority(), false);
  assert.equal(atomicConfigCanBypassGenerationCas(), false);
  assert.equal(inFlightConfigSnapshotCanMutate(), false);
});

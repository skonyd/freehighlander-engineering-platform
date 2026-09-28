import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  buildV3CutoverApprovalPacket,
  evaluateV3CutoverApprovalPreview,
} from '../../../packages/governance/dist/index.js';

const COMMANDS = new Set(['packet', 'preview']);

export function parseCutoverPreviewArgs(argv) {
  if (!Array.isArray(argv)) throw new Error('argv must be an array');

  if (argv.length === 0 || argv[0] === 'help' || argv.includes('--help')) {
    return { command: 'help', inputPath: null };
  }

  const command = argv[0];
  if (!COMMANDS.has(command)) {
    throw new Error(`unknown cutover preview command: ${command}`);
  }

  let inputPath = null;
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token !== '--input') {
      throw new Error(`unknown cutover preview option: ${token}`);
    }
    if (inputPath !== null) throw new Error('--input may be provided only once');

    const value = argv[index + 1];
    if (typeof value !== 'string' || !value.trim() || value.startsWith('--')) {
      throw new Error('--input requires a file path');
    }
    inputPath = value.trim();
    index += 1;
  }

  if (inputPath === null) throw new Error('--input is required');

  return { command, inputPath };
}

export function readCutoverPreviewDocument(inputPath, options = {}) {
  if (typeof inputPath !== 'string' || !inputPath.trim()) {
    throw new Error('inputPath is required');
  }

  const readText = options.readText ?? ((filePath) => readFileSync(filePath, 'utf8'));
  const resolvePath = options.resolvePath ?? ((value) => path.resolve(value));
  const resolvedPath = resolvePath(inputPath.trim());

  let raw;
  try {
    raw = readText(resolvedPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown read failure';
    throw new Error(`unable to read cutover preview input: ${message}`);
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('root JSON value must be an object');
    }
    return { resolvedPath, document: parsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown JSON parse failure';
    throw new Error(`invalid cutover preview JSON: ${message}`);
  }
}

export function executeCutoverPreviewDocument(command, document) {
  if (command === 'packet') {
    const packetInput = requireObject(document, 'packet input');
    const packet = buildV3CutoverApprovalPacket(packetInput);
    return {
      schemaVersion: 1,
      status: 'OK',
      mode: 'PACKET',
      packet,
      humanApprovalRequest: packet.humanApprovalRequest,
      notes: [
        'This packet is an exact-bound approval request, not an approval.',
        'No cutover or authority change was applied.',
      ],
      cutoverApplied: false,
      authorityEnabled: false,
      authority: 'NONE',
    };
  }

  if (command === 'preview') {
    const root = requireObject(document, 'preview input');
    const packet = requireObject(root.packet, 'packet');
    const observed = requireObject(root.observed, 'observed');
    const systemPolicyDecision = requireObject(
      root.systemPolicyDecision,
      'systemPolicyDecision',
    );

    if (!Object.prototype.hasOwnProperty.call(root, 'humanDecision')) {
      throw new Error('preview input must explicitly include humanDecision (object or null)');
    }
    if (root.humanDecision !== null) {
      requireObject(root.humanDecision, 'humanDecision');
    }

    const preview = evaluateV3CutoverApprovalPreview({
      packet,
      observed,
      humanDecision: root.humanDecision,
      systemPolicyDecision,
      deltaReviewed: requireBoolean(root.deltaReviewed, 'deltaReviewed'),
      paritySuitePassed: requireBoolean(root.paritySuitePassed, 'paritySuitePassed'),
      postPortSmokePassed: requireBoolean(root.postPortSmokePassed, 'postPortSmokePassed'),
      authorityPromotionReviewed: requireBoolean(
        root.authorityPromotionReviewed,
        'authorityPromotionReviewed',
      ),
      parityStatus: requireParityStatus(root.parityStatus),
    });

    return {
      schemaVersion: 1,
      status: 'OK',
      mode: 'PREVIEW',
      preview,
      notes: [
        'READY means the supplied exact-bound evidence passes readiness checks.',
        'READY does not apply the cutover or enable V3 authority.',
      ],
      cutoverApplied: false,
      authorityEnabled: false,
      authority: 'NONE',
    };
  }

  if (command === 'help') return cutoverPreviewHelp();
  throw new Error(`unknown cutover preview command: ${command}`);
}

export function runCutoverPreviewCommand(argv, options = {}) {
  const parsed = parseCutoverPreviewArgs(argv);
  if (parsed.command === 'help') return cutoverPreviewHelp();

  const { resolvedPath, document } = readCutoverPreviewDocument(parsed.inputPath, options);
  return {
    inputPath: resolvedPath,
    ...executeCutoverPreviewDocument(parsed.command, document),
  };
}

export function cutoverPreviewHelp() {
  return {
    schemaVersion: 1,
    status: 'OK',
    mode: 'HELP',
    commands: [
      'packet --input FILE',
      'preview --input FILE',
    ],
    packetInput:
      'FILE contains V3CutoverApprovalPacketInput. Output includes the exact humanApprovalRequest.',
    previewInput:
      'FILE contains packet, observed, explicit humanDecision (object or null), systemPolicyDecision and readiness evidence flags.',
    forbiddenCommands: ['approve', 'apply', 'enable'],
    notes: [
      'The CLI is read-only.',
      'It never creates a human decision.',
      'It never applies FH-20 cutover or enables V3 authority.',
    ],
    authority: 'NONE',
  };
}

export function cutoverPreviewCliCanCreateHumanApproval(): false {
  return false;
}

export function cutoverPreviewCliCanApplyCutover(): false {
  return false;
}

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value;
}

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') throw new Error(`${field} must be boolean`);
  return value;
}

function requireParityStatus(value) {
  const allowed = new Set(['PASS', 'MISMATCH', 'INSUFFICIENT_EVIDENCE', 'UNAVAILABLE']);
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error('parityStatus is invalid');
  }
  return value;
}

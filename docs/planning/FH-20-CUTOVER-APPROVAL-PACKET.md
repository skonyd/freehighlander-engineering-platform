# FH-20 — Exact Cutover Approval Packet

**Status:** READ-ONLY PREVIEW / AUTHORITY NONE  
**Purpose:** make the final human/policy cutover scope inspectable and replay-safe without applying V3 authority.

## Boundary

The packet binds one proposed V3 authority promotion to:

- repository;
- exact target V3 revision;
- provisional V2 reference;
- final accepted V2 reference;
- parity reference;
- run snapshot;
- evidence bundle hash;
- explicit promotion-review hash;
- human-gate policy hash;
- canonical HUMAN_REQUIRED approval request hash.

The packet itself is not an approval.

```text
packet != human approval
human approval != SYSTEM_POLICY ALLOW
READY preview != cutover application
READY preview != authority enabled
```

## Workflow

### 1. Build the exact packet

Prepare a JSON file containing `V3CutoverApprovalPacketInput` and run:

```bash
npm run cutover:preview -- packet --input /path/to/cutover-packet-input.json
```

The output contains:

- `packetHash`;
- exact `humanApprovalRequest`;
- all bound reference/evidence hashes;
- `cutoverApplied: false`;
- `authorityEnabled: false`.

The human approval must be recorded through the normal human/control-plane approval path. The preview CLI intentionally has no `approve` command.

### 2. Preview current readiness

Prepare a JSON document containing:

- the exact packet;
- current observed hashes/revision;
- an explicit existing `humanDecision` object or `null`;
- canonical current `systemPolicyDecision`;
- delta/parity/smoke/promotion-review evidence flags.

Then run:

```bash
npm run cutover:preview -- preview --input /path/to/cutover-preview.json
```

A `READY` preview means only that the supplied exact-bound evidence satisfies the deterministic readiness checks. It does not mutate repository state or change V3 authority.

## Currentness rules

The preview becomes BLOCKED if any of these drift:

- target V3 revision;
- final accepted V2 reference;
- parity reference;
- run snapshot;
- evidence bundle;
- promotion review;
- human-gate policy.

A stale/mismatched human decision, HUMAN DENY, missing decision, changed policy hash, SYSTEM_POLICY DENY/HUMAN_REQUIRED, or MODEL_QUORUM_REQUIRED also blocks.

## Canonical SYSTEM_POLICY

The repository defines one deterministic V3 cutover policy snapshot for the action `promote-v3-authority`:

- MODEL principal => `DENY`;
- HUMAN principal => `HUMAN_REQUIRED`;
- SYSTEM principal => `ALLOW`.

The HUMAN and SYSTEM decisions are evaluated from the same published policy hash. SYSTEM `ALLOW` does not bypass human approval and does not itself apply the cutover; all exact-currentness, reference, parity, smoke and promotion-review gates remain mandatory.

## Security / authority rules

- only an exact canonical human decision can satisfy the human gate;
- model quorum cannot satisfy or impersonate the human gate;
- SYSTEM_POLICY must independently resolve to ALLOW for the current policy snapshot;
- packet and decision hashes are recomputed before use;
- malformed/tampered evidence fails closed;
- CLI is read-only and has no `approve`, `apply`, or `enable` command;
- actual FH-20 cutover remains a separate explicit action outside this preview.

V3 remains `SHADOW_ONLY` until the real cutover is explicitly approved, policy-authorized, current, reviewed and applied.

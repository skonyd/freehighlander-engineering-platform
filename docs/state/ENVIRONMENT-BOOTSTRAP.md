# Environment Bootstrap

**Status:** DRAFT until FH-01 creates executable tooling.

## Hedef

Fresh machine üzerinde yalnız Git credentials + gerekli provider erişimleriyle repository yeniden kurulabilmelidir.

## Fresh clone flow

```bash
git clone https://github.com/skonyd/freehighlander-engineering-platform.git
cd freehighlander-engineering-platform
git fetch --all --prune
```

Ardından:
1. `AGENTS.md`
2. `.freehighlander/state.yaml`
3. `PROJECT_STATE.md`
4. `docs/state/RESUME-PROTOCOL.md`

okunur.

## FH-01'de standardize edilecek

- Node/runtime version pinning
- package manager/version pinning
- dependency install command
- local database initialization
- environment validation
- provider/CLI health checks
- local model endpoint checks
- one-command bootstrap
- one-command resume

Hedef komutlar:

```bash
npm run bootstrap
npm run doctor
npm run project:resume
npm run project:checkpoint
```

Bunlar henüz implement edilmiş komutlar değildir.

## Portability rule

Project state içinde:
- absolute home path,
- machine hostname dependency,
- local-only artifact pointer,
- plaintext secret

bulunmamalıdır.

Machine-specific config source-controlled state'ten ayrılır.

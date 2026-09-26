import {
  getFhKuikaNavigationItem,
  listFhKuikaNavigation,
  type FhKuikaArea,
} from './kuika-navigation.js';

interface FhKuikaAreaCard {
  readonly title: string;
  readonly detail: string;
  readonly status: 'AVAILABLE' | 'PREPARATION';
  readonly href?: string;
}

interface FhKuikaAreaDefinition {
  readonly title: string;
  readonly subtitle: string;
  readonly cards: readonly FhKuikaAreaCard[];
}

const DEFINITIONS: Record<'BUILD' | 'INTEGRATE' | 'KNOWLEDGE', FhKuikaAreaDefinition> = {
  BUILD: {
    title: 'Build',
    subtitle: 'Reusable engineering definitions and visual authoring surfaces.',
    cards: [
      {
        title: 'Blueprints',
        detail: 'Versioned engineering patterns for common delivery intents.',
        status: 'AVAILABLE',
        href: '/modules/fh-kuika/build/blueprints',
      },
      {
        title: 'Workflow Studio',
        detail: 'Visual authoring over the canonical FreeHighlander workflow contract.',
        status: 'AVAILABLE',
        href: '/modules/fh-kuika/build/workflows',
      },
      {
        title: 'Roles & Solution Packs',
        detail: 'Reusable role packages and curated engineering solution bundles.',
        status: 'PREPARATION',
      },
    ],
  },
  INTEGRATE: {
    title: 'Integrate',
    subtitle: 'Safe connector, routing and routine configuration surfaces.',
    cards: [
      {
        title: 'Connector Hub',
        detail: 'ToolAdapter/MCP discovery, trust and permission review.',
        status: 'PREPARATION',
      },
      {
        title: 'Models & Routing',
        detail: 'Inspect role bindings, fallback state and routing constraints.',
        status: 'AVAILABLE',
      },
      {
        title: 'Routines',
        detail: 'Event and schedule trigger definitions with authority-aware activation.',
        status: 'PREPARATION',
      },
    ],
  },
  KNOWLEDGE: {
    title: 'Knowledge',
    subtitle: 'Evidence, lineage and deterministic engineering discovery.',
    cards: [
      {
        title: 'Engineering Graph',
        detail: 'Trace requirements, changes, tests, releases and incidents.',
        status: 'PREPARATION',
      },
      {
        title: 'Evidence',
        detail: 'Inspect exact-revision evidence already owned by FreeHighlander Core.',
        status: 'AVAILABLE',
      },
      {
        title: 'Search',
        detail: 'Lineage-first retrieval with semantic discovery kept non-authoritative.',
        status: 'PREPARATION',
      },
    ],
  },
};

export function renderFhKuikaAreaHtml(area: 'BUILD' | 'INTEGRATE' | 'KNOWLEDGE'): string {
  const definition = DEFINITIONS[area];
  const active = getFhKuikaNavigationItem(area);
  const navigation = listFhKuikaNavigation()
    .map((item) => {
      const selected = item.area === area ? ' aria-current="page"' : '';
      return '<a href="' + item.href + '"' + selected + '>' + item.label + '</a>';
    })
    .join('');

  const cards = definition.cards
    .map(
      (card) =>
        (card.href ? '<a class="card" href="' + card.href + '">' : '<article class="card">') +
        '<div class="card-head"><h2>' +
        card.title +
        '</h2><span class="badge">' +
        card.status +
        '</span></div>' +
        '<p>' +
        card.detail +
        '</p>' +
        (card.href ? '</a>' : '</article>'),
    )
    .join('');

  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · FH-KUIKA · ${definition.title}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg:#0b0f14; --panel:#121821; --line:#263241;
      --text:#e8eef6; --muted:#93a4b8; --accent:#7dd3fc; --good:#86efac;
    }
    * { box-sizing:border-box; }
    body {
      margin:0;
      background:radial-gradient(circle at top left,#122032 0,var(--bg) 38rem);
      color:var(--text);
      font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    header,main { max-width:1180px; margin:auto; padding:24px; }
    header { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; }
    h1 { margin:0; font-size:25px; }
    h2 { margin:0; font-size:16px; }
    p { color:var(--muted); margin:8px 0 0; }
    a { color:var(--accent); text-decoration:none; }
    a:hover,a:focus-visible { text-decoration:underline; }
    nav { display:flex; gap:8px; flex-wrap:wrap; margin:18px 0; }
    nav a {
      border:1px solid var(--line); border-radius:8px; padding:7px 10px;
      color:var(--text); background:#111823;
    }
    nav a[aria-current="page"] { border-color:var(--accent); color:var(--accent); }
    .eyebrow {
      color:var(--accent); text-transform:uppercase; font-size:11px;
      letter-spacing:.14em; font-weight:700;
    }
    .muted { color:var(--muted); }
    .grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
    .card {
      background:color-mix(in srgb,var(--panel) 92%,transparent);
      border:1px solid var(--line); border-radius:12px; padding:16px; min-height:140px;
    }
    a.card { display:block; color:var(--text); text-decoration:none; }
    a.card:hover,a.card:focus-visible { border-color:var(--accent); text-decoration:none; }
    .card-head { display:flex; justify-content:space-between; gap:10px; align-items:center; }
    .badge {
      border:1px solid var(--line); border-radius:999px; padding:2px 7px;
      color:var(--good); font-size:10px; white-space:nowrap;
    }
    .boundary {
      margin-top:16px; padding:12px; border:1px solid var(--line);
      border-radius:10px; color:var(--muted);
    }
    @media (max-width:800px) {
      .grid { grid-template-columns:1fr; }
      header { flex-direction:column; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="eyebrow">FH-KUIKA · ${active.label}</div>
      <h1>${definition.title}</h1>
      <div class="muted">${definition.subtitle}</div>
    </div>
    <a href="/">← Core Home</a>
  </header>
  <main>
    <nav aria-label="FH-KUIKA areas">${navigation}</nav>
    <section class="grid">${cards}</section>
    <div class="boundary">
      Navigation and area inspection are read-only. Opening this page invokes no model,
      mutates no runtime state and grants no authority.
    </div>
  </main>
</body>
</html>`;
}

export function fhKuikaAreaPageCanInvokeModel(): false {
  return false;
}

export function fhKuikaAreaPageCanMutateRuntime(): false {
  return false;
}

export function fhKuikaAreaPageCanGrantAuthority(): false {
  return false;
}

export function isFhKuikaPreparationArea(area: FhKuikaArea): boolean {
  return area === 'BUILD' || area === 'INTEGRATE' || area === 'KNOWLEDGE';
}

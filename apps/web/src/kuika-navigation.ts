export type FhKuikaArea =
  | 'OVERVIEW'
  | 'WORKBENCH'
  | 'BUILD'
  | 'INTEGRATE'
  | 'KNOWLEDGE'
  | 'OPERATE';

export interface FhKuikaNavigationItem {
  readonly area: FhKuikaArea;
  readonly label: string;
  readonly href: string;
  readonly authority: 'NONE';
  readonly mutationOnNavigate: false;
  readonly modelCallOnNavigate: false;
}

const ITEMS: readonly FhKuikaNavigationItem[] = [
  {
    area: 'OVERVIEW',
    label: 'Overview',
    href: '/modules/fh-kuika',
    authority: 'NONE',
    mutationOnNavigate: false,
    modelCallOnNavigate: false,
  },
  {
    area: 'WORKBENCH',
    label: 'Workbench',
    href: '/modules/fh-kuika/workbench',
    authority: 'NONE',
    mutationOnNavigate: false,
    modelCallOnNavigate: false,
  },
  {
    area: 'BUILD',
    label: 'Build',
    href: '/modules/fh-kuika/build',
    authority: 'NONE',
    mutationOnNavigate: false,
    modelCallOnNavigate: false,
  },
  {
    area: 'INTEGRATE',
    label: 'Integrate',
    href: '/modules/fh-kuika/integrate',
    authority: 'NONE',
    mutationOnNavigate: false,
    modelCallOnNavigate: false,
  },
  {
    area: 'KNOWLEDGE',
    label: 'Knowledge',
    href: '/modules/fh-kuika/knowledge',
    authority: 'NONE',
    mutationOnNavigate: false,
    modelCallOnNavigate: false,
  },
  {
    area: 'OPERATE',
    label: 'Operate',
    href: '/modules/fh-kuika/operate',
    authority: 'NONE',
    mutationOnNavigate: false,
    modelCallOnNavigate: false,
  },
];

export function listFhKuikaNavigation(): readonly FhKuikaNavigationItem[] {
  return ITEMS.map((item) => ({ ...item }));
}

export function getFhKuikaNavigationItem(area: FhKuikaArea): FhKuikaNavigationItem {
  const item = ITEMS.find((candidate) => candidate.area === area);
  if (!item) throw new Error('unknown FH-KUIKA area');
  return { ...item };
}

export function fhKuikaNavigationCanInvokeModel(): false {
  return false;
}

export function fhKuikaNavigationCanMutateRuntime(): false {
  return false;
}

export function fhKuikaNavigationCanGrantAuthority(): false {
  return false;
}

export type TelegramEvent =
  | 'activated' | 'deactivated' | 'themeChanged' | 'viewportChanged'
  | 'safeAreaChanged' | 'contentSafeAreaChanged';

type Edge = 'top' | 'right' | 'bottom' | 'left';
type Insets = Readonly<Record<Edge, number>>;

export interface TelegramApp {
  readonly platform?: string;
  readonly colorScheme?: 'light' | 'dark';
  readonly viewportStableHeight?: number;
  readonly safeAreaInset?: Partial<Insets>;
  readonly contentSafeAreaInset?: Partial<Insets>;
  readonly isActive?: boolean;
  readonly initDataUnsafe?: {readonly user?: unknown};
  readonly BackButton?: {
    show(): void;
    hide(): void;
    onClick(handler: () => void): void;
    offClick(handler: () => void): void;
  };
  ready?(): void;
  expand?(): void;
  isVersionAtLeast?(version: string): boolean;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  onEvent?(event: TelegramEvent, handler: () => void): void;
  offEvent?(event: TelegramEvent, handler: () => void): void;
}

export interface TelegramProfile {
  readonly name?: string;
  readonly avatar?: string;
}

export interface TelegramSnapshot {
  readonly active: boolean;
  readonly theme: 'light' | 'dark' | undefined;
  readonly stableHeight: number | undefined;
  readonly insets: Insets;
  readonly profile: TelegramProfile;
}

const edges = ['top', 'right', 'bottom', 'left'] as const;
const events = [
  'activated', 'deactivated', 'themeChanged', 'viewportChanged',
  'safeAreaChanged', 'contentSafeAreaChanged',
] as const;
const initialized = new WeakSet<TelegramApp>();
const backOwners = new WeakMap<NonNullable<TelegramApp['BackButton']>, Set<() => void>>();

export function getTelegramApp(scope: Window): TelegramApp | null {
  const {Telegram} = scope as Window & {Telegram?: {WebApp?: TelegramApp}};
  const app = Telegram?.WebApp;
  return app?.platform && app.platform !== 'unknown' ? app : null;
}

function positivePixels(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function readProfile(user: unknown): TelegramProfile {
  if (typeof user !== 'object' || user === null) return {};
  const {username, first_name, last_name, photo_url} = user as Record<string, unknown>;
  const names = [first_name, last_name].filter((part): part is string =>
    typeof part === 'string' && part.trim() !== '',
  );
  const name = typeof username === 'string' && username.trim()
    ? `@${username.trim()}`
    : names.join(' ').trim();

  let avatar: string | undefined;
  if (typeof photo_url === 'string') {
    try {
      const url = new URL(photo_url);
      if (url.protocol === 'https:' && !url.username && !url.password) avatar = url.href;
    } catch {
      // Telegram profile hints are optional.
    }
  }

  return {
    ...(name ? {name: name.slice(0, 80)} : {}),
    ...(avatar ? {avatar} : {}),
  };
}

export function readTelegramSnapshot(app: TelegramApp | null, visible: boolean): TelegramSnapshot {
  const insets = {top: 0, right: 0, bottom: 0, left: 0};
  for (const edge of edges) {
    insets[edge] = positivePixels(app?.safeAreaInset?.[edge]) + positivePixels(app?.contentSafeAreaInset?.[edge]);
  }

  return {
    active: visible && app?.isActive !== false,
    theme: app?.colorScheme,
    stableHeight: positivePixels(app?.viewportStableHeight) || undefined,
    insets,
    profile: readProfile(app?.initDataUnsafe?.user),
  };
}

export function startTelegram(app: TelegramApp | null): void {
  if (!app || initialized.has(app)) return;
  initialized.add(app);
  app.ready?.();
  app.expand?.();
}

export function setTelegramColors(app: TelegramApp | null, color: string): void {
  if (!app) return;
  if (app.isVersionAtLeast?.('6.9')) app.setHeaderColor?.(color);
  if (app.isVersionAtLeast?.('6.1')) app.setBackgroundColor?.(color);
}

export function subscribeTelegram(
  app: TelegramApp | null, onChange: (event: TelegramEvent) => void,
): () => void {
  if (!app?.onEvent || !app.offEvent) return () => {};
  const bindings = events.map((event) => {
    const handler = (): void => onChange(event);
    app.onEvent?.(event, handler);
    return {event, handler};
  });

  return () => {
    for (const {event, handler} of bindings) app.offEvent?.(event, handler);
  };
}

export function bindTelegramBack(app: TelegramApp | null, onBack: () => void): () => void {
  const back = app?.BackButton;
  if (!back || app?.isVersionAtLeast?.('6.1') === false) return () => {};
  const owners = backOwners.get(back) ?? new Set<() => void>();
  owners.add(onBack);
  backOwners.set(back, owners);
  back.onClick(onBack);
  back.show();

  return () => {
    back.offClick(onBack);
    owners.delete(onBack);
    if (owners.size === 0) back.hide();
  };
}

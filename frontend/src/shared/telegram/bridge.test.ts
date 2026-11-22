import {act, render, screen} from '@testing-library/react';
import {createElement, StrictMode} from 'react';
import type {ReactElement} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {TelegramLifecycle} from '../../app/TelegramLifecycle';
import {getTelegramApp, readTelegramSnapshot} from './bridge';
import type {TelegramApp, TelegramEvent} from './bridge';
import {useTelegram, useTelegramBack} from './useTelegram';

function makeApp() {
  const events = new Map<TelegramEvent, Set<() => void>>();
  const backHandlers = new Set<() => void>();
  const app = {
    platform: 'android',
    colorScheme: 'dark' as 'light' | 'dark',
    viewportStableHeight: 710,
    isActive: true as boolean,
    ready: vi.fn(),
    expand: vi.fn(),
    isVersionAtLeast: vi.fn(() => true),
    onEvent(event: TelegramEvent, listener: () => void): void {
      const listeners = events.get(event) ?? new Set();
      listeners.add(listener);
      events.set(event, listeners);
    },
    offEvent(event: TelegramEvent, listener: () => void): void {
      events.get(event)?.delete(listener);
    },
    safeAreaInset: {top: 22},
    contentSafeAreaInset: {top: 30, bottom: 10},
    initDataUnsafe: {user: {username: 'trader', photo_url: 'https://example.org/avatar.jpg'}},
    BackButton: {
      show: vi.fn(),
      hide: vi.fn(),
      onClick: (listener: () => void): void => { backHandlers.add(listener); },
      offClick: (listener: () => void): void => { backHandlers.delete(listener); },
    },
  } satisfies TelegramApp;

  return {
    app,
    events,
    backHandlers,
    dispatch(event: TelegramEvent): void {
      events.get(event)?.forEach((listener) => listener());
    },
  };
}

function install(app: TelegramApp): void {
  Object.defineProperty(window, 'Telegram', {value: {WebApp: app}, configurable: true});
}

function Consumer({onBack}: {onBack?: () => void}): ReactElement {
  const {state} = useTelegram();
  useTelegramBack(onBack);
  return createElement('output', null, [
    state.active, state.theme, state.stableHeight, state.insets.top, state.insets.bottom, state.profile.name,
  ].join(' '));
}

afterEach(() => {
  Reflect.deleteProperty(window, 'Telegram');
});

describe('Telegram Mini App', () => {
  it('works without the SDK and ignores the SDK browser shim', () => {
    expect(getTelegramApp(window)).toBeNull();
    install({platform: 'unknown'});
    const {unmount} = render(createElement(TelegramLifecycle, null, createElement(Consumer)));
    expect(getTelegramApp(window)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('true 0 0');
    unmount();
  });

  it('initializes once and updates stable viewport, safe areas, theme and activity', () => {
    const {app, dispatch, events} = makeApp();
    install(app);
    const {unmount} = render(createElement(
      StrictMode, null, createElement(TelegramLifecycle, null, createElement(Consumer)),
    ));
    expect(app.ready).toHaveBeenCalledTimes(1);
    expect(app.expand).toHaveBeenCalledTimes(1);
    expect([...events.values()].map((listeners) => listeners.size)).toEqual(Array(6).fill(1));
    expect(screen.getByRole('status')).toHaveTextContent('true dark 710 52 10 @trader');

    act(() => {
      app.colorScheme = 'light';
      dispatch('themeChanged');
      app.viewportStableHeight = 665;
      dispatch('viewportChanged');
      app.contentSafeAreaInset.bottom = 18;
      dispatch('contentSafeAreaChanged');
      app.isActive = false;
      dispatch('deactivated');
    });
    expect(screen.getByRole('status')).toHaveTextContent('false light 665 52 18 @trader');
    act(() => {
      app.isActive = true;
      dispatch('activated');
    });
    expect(screen.getByRole('status')).toHaveTextContent('true light 665 52 18 @trader');

    unmount();
    expect([...events.values()].map((listeners) => listeners.size)).toEqual(Array(6).fill(0));
  });

  it('calls the current back action exactly once and removes it when leaving', () => {
    const {app, backHandlers} = makeApp();
    install(app);
    const previous = vi.fn();
    const next = vi.fn();
    const view = (onBack?: () => void): ReactElement => createElement(
      TelegramLifecycle, null, createElement(Consumer, onBack ? {onBack} : {}),
    );
    const {rerender, unmount} = render(view(previous));
    rerender(view(next));
    expect(backHandlers.size).toBe(1);
    expect(app.BackButton.show).toHaveBeenCalledTimes(1);
    backHandlers.forEach((listener) => listener());
    expect(previous).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    rerender(view());
    expect(backHandlers.size).toBe(0);
    expect(app.BackButton.hide).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('returns optional UI hints and rejects unsafe avatar URLs and invalid insets', () => {
    const snapshot = readTelegramSnapshot({
      platform: 'ios',
      viewportStableHeight: Infinity,
      safeAreaInset: {top: -12, bottom: NaN},
      initDataUnsafe: {user: {first_name: 'Ada', last_name: 'Lovelace', photo_url: 'javascript:void(0)'}},
    }, false);

    expect(snapshot.active).toBe(false);
    expect(snapshot.stableHeight).toBeUndefined();
    expect(snapshot.insets).toEqual({top: 0, right: 0, bottom: 0, left: 0});
    expect(snapshot.profile).toEqual({name: 'Ada Lovelace'});
  });
});

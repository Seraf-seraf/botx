import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import type {Operation, OperationResult, Quote} from '../../shared/data/contracts';
import {TradeSheet} from './TradeSheet';

const quote: Quote = {
  symbol: 'QST', name: 'QuestBot', icon: 'robot', price: 24_800, priorPrice: 22_064, isNew: false, history: [],
};

const purchase: Operation = {
  kind: 'buy', id: 'buy-test', date: 1_795_340_000_000, amount: 74_400, symbol: 'QST', quantity: 3,
};

beforeAll(() => {
  // jsdom does not implement the top layer. Playwright covers the real dialog.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {configurable: true, value(this: HTMLDialogElement): void { this.open = true; }},
    close: {configurable: true, value(this: HTMLDialogElement): void { this.open = false; }},
  });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TradeSheet', () => {
  it('shows insufficient BC, blocks submits and restores the action after editing', () => {
    const onConfirm = vi.fn(async (): Promise<OperationResult> => ({ok: true, operation: purchase}));
    render(<TradeSheet quote={quote} side="buy" held={20} balance={328_000} onConfirm={onConfirm} onSuccess={vi.fn()} onClose={vi.fn()} />);

    const quantity = screen.getByRole('spinbutton', {name: 'Количество'});
    fireEvent.change(quantity, {target: {value: '14'}});
    expect(screen.getByRole('alert')).toHaveTextContent('Не хватает 192 BC');
    expect(quantity).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', {name: 'Купить 14 акций'})).toBeDisabled();

    const form = quantity.closest('form');
    if (!form) throw new Error('Missing trade form');
    fireEvent.submit(form);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', {name: 'Уменьшить количество'}));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', {name: 'Купить 13 акций'})).toBeEnabled();
  });

  it('locks the form on submit, handles a double submit and reports the same displayed price', async () => {
    const onConfirm = vi.fn(async (): Promise<OperationResult> => ({ok: true, operation: purchase}));
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const {rerender} = render(<TradeSheet quote={quote} side="buy" held={20} balance={328_000} onConfirm={onConfirm} onSuccess={onSuccess} onClose={onClose} />);
    const quantity = screen.getByRole('spinbutton');
    const form = quantity.closest('form');
    if (!form) throw new Error('Missing trade form');

    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(screen.getByRole('button', {name: 'Покупаем…'})).toBeDisabled();
    expect(quantity).toBeDisabled();
    fireEvent.click(screen.getByRole('button', {name: 'Назад'}));
    expect(onClose).not.toHaveBeenCalled();

    rerender(<TradeSheet quote={{...quote, price: 24_900}} side="buy" held={20} balance={328_000} onConfirm={onConfirm} onSuccess={onSuccess} onClose={onClose} />);
    expect(screen.getByText('248 BC')).toBeVisible();
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(3, 24_800, expect.any(String));
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith(purchase);
  });

  it('clears a scheduled confirmation when the user leaves the form', async () => {
    const onConfirm = vi.fn(async (): Promise<OperationResult> => ({ok: true, operation: purchase}));
    const {unmount} = render(<TradeSheet quote={quote} side="buy" held={20} balance={328_000} onConfirm={onConfirm} onSuccess={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name: 'Купить 3 акции'}));
    unmount();
    await vi.runAllTimersAsync();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

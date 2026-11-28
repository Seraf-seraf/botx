import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import type {Operation, OperationResult, Quote} from '../../shared/data/contracts';
import {TradeSheet} from './TradeSheet';

const quote: Quote = {
  symbol: 'QST', name: 'QuestBot', icon: 'robot', price: 24_800, priorPrice: 22_064, isNew: false, tradingStatus: 'active', history: [],
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
  it('reports a failed status check and retries the original request without another trade', async () => {
    const onConfirm = vi.fn();
    const onSuccess = vi.fn();
    const onCheckTrade = vi.fn<(_: string) => Promise<OperationResult>>()
      .mockResolvedValueOnce({ok: false, reason: 'storage'})
      .mockResolvedValueOnce({ok: true, operation: purchase});
    render(<TradeSheet fees={{buyBps: 500, sellBps: 500, transferBps: 50, serviceBps: 50}} quote={quote} side="buy" held={20} balance={328_000}
      unknownTradeId={purchase.id} unknownOperation={purchase} onCheckTrade={onCheckTrade} onConfirm={onConfirm} onSuccess={onSuccess} onClose={vi.fn()} />);

    await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Проверить статус'})); });
    expect(screen.getByText('Не удалось сохранить операцию. Попробуйте ещё раз.')).toBeVisible();
    expect(screen.getByRole('button', {name: 'Проверить статус'})).toBeEnabled();
    expect(onSuccess).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Проверить статус'})); });
    expect(onCheckTrade).toHaveBeenCalledTimes(2);
    expect(onCheckTrade).toHaveBeenNthCalledWith(1, purchase.id);
    expect(onCheckTrade).toHaveBeenNthCalledWith(2, purchase.id);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith(purchase);
  });
  it('does not submit empty, fractional or out-of-range input', () => {
    const onConfirm = vi.fn();
    render(<TradeSheet fees={{buyBps: 500, sellBps: 500, transferBps: 50, serviceBps: 50}} onCheckTrade={vi.fn()} quote={quote} side="buy" held={20} balance={328_000} onConfirm={onConfirm} onSuccess={vi.fn()} onClose={vi.fn()} />);
    const input = screen.getByRole('spinbutton');
    for (const value of ['', '0.5', '1000']) {
      fireEvent.change(input, {target: {value}});
      const form = input.closest('form');
      if (!form) throw new Error('Missing trade form');
      fireEvent.submit(form);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(input).toHaveAttribute('aria-invalid', 'true');
    }
  });
  it('shows insufficient BC, blocks submits and restores the action after editing', () => {
    const onConfirm = vi.fn(async (): Promise<OperationResult> => ({ok: true, operation: purchase}));
    render(<TradeSheet fees={{buyBps: 500, sellBps: 500, transferBps: 50, serviceBps: 50}} onCheckTrade={vi.fn()} quote={quote} side="buy" held={20} balance={328_000} onConfirm={onConfirm} onSuccess={vi.fn()} onClose={vi.fn()} />);

    const quantity = screen.getByRole('spinbutton', {name: 'Количество акций'});
    fireEvent.change(quantity, {target: {value: '14'}});
    expect(screen.getByRole('alert')).toHaveTextContent('Не хватает 365,60 BC');
    expect(quantity).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', {name: 'Недостаточно средств'})).toBeDisabled();

    const form = quantity.closest('form');
    if (!form) throw new Error('Missing trade form');
    fireEvent.submit(form);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', {name: 'Уменьшить количество'})[0]!);
    expect(screen.getByRole('alert')).toHaveTextContent('Не хватает 105,20 BC');
    fireEvent.click(screen.getAllByRole('button', {name: 'Уменьшить количество'})[0]!);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', {name: 'Купить 12 акций'})).toBeEnabled();
  });

  it('locks the form on submit, handles a double submit and reports the same displayed price', async () => {
    let resolve!: (result: OperationResult) => void;
    const onConfirm = vi.fn((): Promise<OperationResult> => new Promise((done) => { resolve = done; }));
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const {rerender} = render(<TradeSheet fees={{buyBps: 500, sellBps: 500, transferBps: 50, serviceBps: 50}} onCheckTrade={vi.fn()} quote={quote} side="buy" held={20} balance={328_000} onConfirm={onConfirm} onSuccess={onSuccess} onClose={onClose} />);
    const quantity = screen.getByRole('spinbutton');
    const form = quantity.closest('form');
    if (!form) throw new Error('Missing trade form');

    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(screen.getByRole('button', {name: 'Покупаем…'})).toBeDisabled();
    expect(quantity).toBeDisabled();
    fireEvent.click(screen.getByRole('button', {name: 'Назад'}));
    expect(onClose).not.toHaveBeenCalled();

    rerender(<TradeSheet fees={{buyBps: 500, sellBps: 500, transferBps: 50, serviceBps: 50}} onCheckTrade={vi.fn()} quote={{...quote, price: 24_900}} side="buy" held={20} balance={328_000} onConfirm={onConfirm} onSuccess={onSuccess} onClose={onClose} />);
    expect(screen.getByText('248 BC')).toBeVisible();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ok: true, operation: purchase}); });
    expect(onConfirm).toHaveBeenCalledWith(3, 24_800, expect.any(String), 500);
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith(purchase);
  });

  it('starts immediately and ignores a late response after unmount', async () => {
    let resolve!: (result: OperationResult) => void;
    const onConfirm = vi.fn((): Promise<OperationResult> => new Promise((done) => { resolve = done; }));
    const onSuccess = vi.fn();
    const {unmount} = render(<TradeSheet fees={{buyBps: 500, sellBps: 500, transferBps: 50, serviceBps: 50}} onCheckTrade={vi.fn()} quote={quote} side="buy" held={20} balance={328_000} onConfirm={onConfirm} onSuccess={onSuccess} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name: 'Купить 3 акции'}));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => { resolve({ok: true, operation: purchase}); });
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

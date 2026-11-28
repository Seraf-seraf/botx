import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {createDemoFixtures} from '../../shared/data/demo-fixtures';
import type {PaymentRequest, PaymentResult} from '../../shared/data/contracts';
import {PaymentPage} from './PaymentPage';

const request: PaymentRequest = {id: 'study-bot', recipient: 'Study Bot', serviceName: 'Игровой предмет', amount: 10_000, expiresAt: 2_000_000_000_000, status: 'open'};
const snapshot = createDemoFixtures(1_795_340_000_000);

beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {configurable: true, value(this: HTMLDialogElement): void { this.open = true; }},
    close: {configurable: true, value(this: HTMLDialogElement): void { this.open = false; }},
  });
});
afterAll(() => { Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close'); });

describe('PaymentPage', () => {
  it('requires confirmation, blocks duplicate submission and preserves the request after a storage error', async () => {
    let resolve!: (result: PaymentResult) => void;
    const onPay = vi.fn(() => new Promise<PaymentResult>((done) => { resolve = done; }));
    render(<PaymentPage request={request} snapshot={snapshot} onPay={onPay} onCancel={vi.fn()} onCheck={vi.fn()} onDone={vi.fn()} onPendingChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name: 'Оплатить 100,50 BC'}));
    expect(onPay).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', {name: 'Подтвердить 100,50 BC'}));
    expect(onPay).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', {name: /Оплачиваем/})).toBeDisabled();
    await act(async () => resolve({ok: false, reason: 'storage'}));
    expect(screen.getByText('Не удалось сохранить платёж. Попробуйте ещё раз.')).toBeVisible();
    expect(screen.getByRole('button', {name: 'Оплатить 100,50 BC'})).toBeEnabled();
  });

  it('checks the original unknown request and never resubmits payment', async () => {
    const onPay = vi.fn();
    const onCheck = vi.fn(async (): Promise<PaymentResult> => ({ok: false, reason: 'storage'}));
    render(<PaymentPage request={{...request, status: 'unknown', requestId: 'original', total: 10_050}} snapshot={snapshot}
      onPay={onPay} onCancel={vi.fn()} onCheck={onCheck} onDone={vi.fn()} onPendingChange={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Проверить статус'})); });
    expect(onCheck).toHaveBeenCalledWith('original');
    expect(onPay).not.toHaveBeenCalled();
    expect(screen.getByText('Не удалось сохранить платёж. Попробуйте ещё раз.')).toBeVisible();
  });
});

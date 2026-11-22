import type {AppSnapshot} from './contracts';

export const demoFixtures: AppSnapshot = {
  balance: 328_000,
  quotes: [
    {symbol: 'QST', name: 'QuestBot', icon: 'robot', price: 24_800, priorPrice: 22_064, isNew: false, history: []},
    {symbol: 'DICE', name: 'DiceLab', icon: 'dice-5', price: 17_600, priorPrice: 18_182, isNew: false, history: []},
    {symbol: 'MUSE', name: 'Muse AI', icon: 'brain', price: 9_400, priorPrice: 8_885, isNew: true, history: []},
    {symbol: 'NEKO', name: 'NekoBot', icon: 'cat', price: 31_200, priorPrice: 30_439, isNew: true, history: []},
  ],
  holdings: {
    QST: {quantity: 20, cost: 441_200},
    NEKO: {quantity: 15, cost: 419_600},
    DICE: {quantity: 16, cost: 263_200},
  },
  operations: [],
  bonusClaimed: false,
};

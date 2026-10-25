import {isMoney, isQuantity, roundQuantity, buildSaleReturn, paymentAmount, expectedCash} from './payment-rules.js';
import {applyInventoryCommand} from './inventory-commands.js';
import {applyRestaurantCommand} from './restaurant-commands.js';
import {applyFinanceCommand} from './finance-commands.js';

const identifier = () => crypto.randomUUID();
const requiredText = (value, max = 120) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error('Açıklama veya ad gerekli.');
  return value.trim();
};
const money = value => { if (!isMoney(value)) throw Error('Tutar geçersiz.'); return value; };
const find = (s, kind, id) => s[kind]?.find(x => x.id === id) || (() => { throw Error('Kayıt bulunamadı.'); })();
const addStock = (item, qty, unitCostCents) => {
  const stock = roundQuantity(item.stock + qty);
  item.rawCostCents = stock ? (item.stock * (item.rawCostCents ?? item.costCents) + qty * unitCostCents) / stock : (item.rawCostCents ?? item.costCents);
  item.costCents = Math.round(item.rawCostCents);
  item.stock = stock;
};

export function applyBusinessCommand(s, action, now) {
  const currentShift = () => s.shifts?.find(x => x.status === 'open');
  if (action.type === 'sale-return') {
    const value = buildSaleReturn(s, action, now);
    for (const d of value.deductions) addStock(find(s, d.kind, d.id), d.qty, d.rawUnitCostCents ?? d.unitCostCents);
    const credit = paymentAmount(value, 'credit');
    if (credit) find(s, 'customers', value.customerId).balanceCents -= credit;
    (s.saleReturns ??= []).push(value);
  } else if (action.type === 'register-open') {
    if (currentShift()) throw Error('Önce açık kasayı kapat.');
    (s.shifts ??= []).push({id: identifier(), name: requiredText(action.name, 80), openingCents: money(action.openingCents), openedAt: now, status: 'open'});
  } else if (action.type === 'register-move') {
    const shift = currentShift();
    if (!shift || !['in', 'out'].includes(action.direction) || !money(action.amountCents)) throw Error('Açık kasa, yön ve pozitif tutar gerekli.');
    (s.cashMoves ??= []).push({id: identifier(), shiftId: shift.id, date: now, direction: action.direction,
      amountCents: action.amountCents, reason: requiredText(action.reason, 500)});
  } else if (action.type === 'register-close') {
    const shift = currentShift();
    if (!shift || shift.id !== action.shiftId) throw Error('Kasa oturumu değişti. Yeniden kontrol et.');
    const counted = money(action.countedCents), expected = expectedCash(s, shift.id);
    if (counted !== expected) requiredText(action.reason, 500);
    Object.assign(shift, {status: 'closed', closedAt: now, expectedCents: expected, countedCents: counted,
      differenceCents: counted - expected, reason: String(action.reason || '').trim().slice(0, 500)});
  } else return applyInventoryCommand(s, action, now) || applyRestaurantCommand(s, action, now) || applyFinanceCommand(s, action, now);
  return true;
}

import {buildSaleReturn, paymentAmount, expectedCash, isMoney} from './payment-rules.js';
import {inventoryCollections,validateInventory} from './inventory-validation.js';
import {restaurantCollections,validateRestaurant} from './restaurant-validation.js';
import {financeCollections,validateFinance} from './finance-validation.js';

export const extraCollections = ['saleReturns', 'shifts', 'cashMoves', ...inventoryCollections, ...restaurantCollections, ...financeCollections];
export function equalRecord(a, b) {
  const normalize = value => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ?
    Object.fromEntries(Object.keys(value).sort().map(k => [k, normalize(value[k])])) : value;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
export function validateBusinessExtras(s, {stocks, balances}) {
  if ((s.shifts || []).filter(x => x.status === 'open').length > 1) throw Error('Bir panelde tek kasa açık olabilir.');
  const shifts = new Map((s.shifts || []).map(x => [x.id, x]));
  const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  for (const shift of shifts.values()) {
    if (typeof shift.name !== 'string' || !shift.name.trim() || shift.name.length > 80 ||
        !['open', 'closed'].includes(shift.status) || !validDate(shift.openedAt) || !isMoney(shift.openingCents)) throw Error('Kasa kaydı geçersiz.');
    if (shift.status === 'closed' && (!validDate(shift.closedAt) || !isMoney(shift.countedCents) ||
        !Number.isSafeInteger(shift.expectedCents) || shift.differenceCents !== shift.countedCents - shift.expectedCents ||
        shift.expectedCents !== expectedCash(s, shift.id) || shift.differenceCents && !shift.reason?.trim())) throw Error('Kasa kapanışı kayıtlarla eşleşmiyor.');
  }
  for (const row of s.cashMoves || []) {
    if (!shifts.has(row.shiftId) || !['in', 'out'].includes(row.direction) || !isMoney(row.amountCents) || !row.amountCents ||
        !validDate(row.date) || typeof row.reason !== 'string' || !row.reason.trim() || row.reason.length > 500) throw Error('Kasa hareketi geçersiz.');
  }
  const accepted = [];
  for (const value of s.saleReturns || []) {
    if (!validDate(value.date)) throw Error('İade tarihi geçersiz.');
    const rebuilt = buildSaleReturn({...s, saleReturns: accepted}, {type: 'sale-return', id: value.id,
      saleId: value.saleId, lines: value.lines.map(({productId, qty}) => ({productId, qty})), restock: value.restock,
      payments: value.payments, reason: value.reason}, value.date);
    for (const key of ['saleId', 'warehouseId', 'lines', 'totalCents', 'costCents', 'payments', 'customerId', 'restock', 'reason', 'deductions']) {
      if (!equalRecord(value[key], rebuilt[key])) throw Error('İade tutarı veya stok hareketi satışla eşleşmiyor.');
    }
    for (const d of value.deductions) {
      const key = d.kind + ':' + d.id;
      if (!stocks.has(key)) throw Error('İade stok kaydı eksik.');
      stocks.set(key, stocks.get(key) + Math.round(d.qty * 1000));
    }
    const credit = paymentAmount(value, 'credit');
    if (credit) balances.set(value.customerId, balances.get(value.customerId) - credit);
    accepted.push(value);
  }
  for (const row of [...s.sales, ...s.collections, ...(s.refunds || []), ...(s.saleReturns || []), ...(s.expenses || []), ...(s.supplierPayments || [])]) {
    if (row.shiftId != null && !shifts.has(row.shiftId)) throw Error('İşlemin kasa oturumu eksik.');
    if (row.shiftId && Date.parse(row.date) < Date.parse(shifts.get(row.shiftId).openedAt)) throw Error('İşlem tarihi kasa açılışından önce olamaz.');
    if (row.shiftId && shifts.get(row.shiftId).closedAt && Date.parse(row.date) > Date.parse(shifts.get(row.shiftId).closedAt)) throw Error('Kapalı kasaya yeni işlem eklenemez.');
  }
  validateInventory(s,{stocks});
  validateRestaurant(s);
  validateFinance(s);
}

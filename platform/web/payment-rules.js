import {returnedLots} from './lot-rules.js';
import {isMoney,isQuantity,roundQuantity} from './numeric-rules.js';
export {isMoney,isQuantity,roundQuantity} from './numeric-rules.js';
export const paymentMethods = ['cash', 'card', 'credit', 'other'];

export function paymentsFor(sale) {
  return sale.payments ?? [{method: sale.payment, amountCents: sale.totalCents}];
}
export function paymentAmount(sale, method) {
  return paymentsFor(sale).filter(x => x.method === method).reduce((n, x) => n + x.amountCents, 0);
}
export function normalizePayments(rows, totalCents, fallback) {
  if (!isMoney(totalCents) || !Array.isArray(rows) || !rows.length || rows.length > 20) throw Error('Ödeme dağılımı gerekli.');
  const totals = new Map();
  for (const row of rows) {
    if (!row || !paymentMethods.includes(row.method) || !isMoney(row.amountCents)) throw Error('Ödeme yöntemi veya tutarı geçersiz.');
    totals.set(row.method, (totals.get(row.method) || 0) + row.amountCents);
  }
  const sum = [...totals.values()].reduce((n, x) => n + x, 0);
  if (!isMoney(sum) || sum !== totalCents) throw Error('Ödeme toplamı satış tutarıyla eşleşmiyor. Kalan tutarı kontrol et.');
  const result = [...totals].filter(([, amount]) => amount > 0).map(([method, amountCents]) => ({method, amountCents}));
  return result.length ? result : [{method: paymentMethods.includes(fallback) ? fallback : rows[0].method, amountCents: 0}];
}

export function usageForLine(state, line) {
  if (state.module === 'market') return [{kind: 'products', id: line.productId, qty: line.qty}];
  const product = state.products.find(p => p.id === line.productId);
  return (line.recipeSnapshot || product?.recipe || []).map(r => ({kind: 'materials', id: r.materialId, qty: roundQuantity(line.qty * r.qty)}));
}

export function buildSaleReturn(state, action, date) {
  if (!action.id || state.saleReturns?.some(r => r.id === action.id)) throw Error('İade işlem kimliği eksik veya daha önce kullanılmış.');
  const sale = state.sales.find(x => x.id === action.saleId);
  if (!sale || sale.status !== 'completed') throw Error('İade edilecek tamamlanmış satış bulunamadı.');
  if (!Array.isArray(action.lines) || !action.lines.length || typeof action.restock !== 'boolean' ||
      typeof action.reason !== 'string' || action.reason.trim().length < 3 || action.reason.length > 500) throw Error('İade ürünleri, stok tercihi ve açıklama gerekli.');
  const previous = (state.saleReturns || []).filter(r => r.saleId === sale.id);
  const seen = new Set();
  let totalCents = 0, costCents = 0;
  const deductions = new Map();
  const lines = action.lines.map(row => {
    const original = sale.lines.find(l => l.productId === row.productId);
    if (!original || seen.has(row.productId) || !isQuantity(row.qty)) throw Error('İade ürün miktarı geçersiz.');
    seen.add(row.productId);
    const oldLines = previous.flatMap(r => r.lines).filter(l => l.productId === row.productId);
    const beforeQty = oldLines.reduce((n, l) => n + Math.round(l.qty * 1000), 0);
    const afterQty = beforeQty + Math.round(row.qty * 1000), originalQty = Math.round(original.qty * 1000);
    if (afterQty > originalQty) throw Error('İade miktarı satılan ve iade edilmemiş miktarı aşamaz.');
    const amount = Math.round(original.totalCents * afterQty / originalQty) - oldLines.reduce((n, l) => n + l.totalCents, 0);
    // Only physically returned stock reverses cost of goods sold.
    const returnedCost = action.restock ? Math.round(original.costCents * afterQty / originalQty) -
      Math.round(original.costCents * beforeQty / originalQty) : 0;
    totalCents += amount; costCents += returnedCost;
    if (action.restock) for (const use of usageForLine(state, original)) {
      const key = use.kind + ':' + use.id;
      const qty = (Math.round(use.qty * 1000 * afterQty / originalQty) - Math.round(use.qty * 1000 * beforeQty / originalQty)) / 1000;
      if (qty <= 0) continue;
      const originalDeduction = sale.deductions.find(d => d.kind === use.kind && d.id === use.id);
      const item = state[use.kind].find(x => x.id === use.id);
      if(use.kind==='materials'&&originalDeduction?.unitCostCents===undefined)throw Error('Bu eski satışın malzeme maliyeti eksik. İadeyi stoksuz kaydet; kullanılabilir stok için ayrı sayım kaydı oluştur.');
      const prior = deductions.get(key);
      const historicalCost=originalDeduction?.unitCostCents??original.unitCostCents;
      deductions.set(key, {kind: use.kind, id: use.id, qty: roundQuantity((prior?.qty || 0) + qty), unitCostCents: historicalCost,rawUnitCostCents:originalDeduction?.rawUnitCostCents??historicalCost});
    }
    return {productId: row.productId, qty: row.qty, totalCents: amount, costCents: returnedCost};
  });
  for(const d of deductions.values()){const original=sale.deductions.find(x=>x.kind===d.kind&&x.id===d.id);const before=previous.flatMap(r=>r.deductions).filter(x=>x.kind===d.kind&&x.id===d.id).reduce((n,x)=>n+x.qty,0);const lots=returnedLots(sale,original,before,d.qty);if(lots)d.lots=lots;}
  const payments = normalizePayments(action.payments, totalCents);
  for (const payment of payments) {
    const prior = previous.reduce((n, r) => n + paymentAmount(r, payment.method), 0);
    if (prior + payment.amountCents > paymentAmount(sale, payment.method)) throw Error('İade yöntemi tutarı satıştaki kalan ödeme tutarını aşamaz.');
  }
  return {id: action.id, saleId: sale.id, warehouseId:sale.warehouseId||'main', date, lines, totalCents, costCents, payments,
    customerId: sale.customerId, restock: action.restock, reason: action.reason.trim(),
    shiftId: state.shifts?.find(x => x.status === 'open')?.id || null, deductions: [...deductions.values()]};
}

export function expectedCash(state, shiftId) {
  const shift = state.shifts?.find(x => x.id === shiftId);
  if (!shift) throw Error('Kasa oturumu bulunamadı.');
  let total = shift.openingCents;
  for (const sale of state.sales) if (sale.shiftId === shiftId && sale.status === 'completed') total += paymentAmount(sale, 'cash');
  for (const row of state.saleReturns || []) if (row.shiftId === shiftId) total -= paymentAmount(row, 'cash');
  for (const row of state.collections) if (row.shiftId === shiftId && (row.payment || 'cash') === 'cash') total += row.amountCents;
  for (const row of state.refunds || []) if (row.shiftId === shiftId && row.payment === 'cash') total -= row.amountCents;
  for (const row of state.cashMoves || []) if (row.shiftId === shiftId) total += row.direction === 'in' ? row.amountCents : -row.amountCents;
  for (const row of [...(state.expenses || []), ...(state.supplierPayments || [])]) if (row.shiftId === shiftId && row.payment === 'cash') total -= row.amountCents;
  return total;
}

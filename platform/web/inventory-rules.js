import {isQuantity, roundQuantity} from './payment-rules.js';

export const MAIN_WAREHOUSE = 'main';
const units = {gram: ['mass', 1], gr: ['mass', 1], g: ['mass', 1], kg: ['mass', 1000], ml: ['volume', 1], lt: ['volume', 1000], l: ['volume', 1000], adet: ['count', 1]};
export function convertQuantity(qty, from, to, packSize) {
  if (!isQuantity(qty)) throw Error('Miktar geçersiz.');
  if (from === to) return qty;
  if (['koli','kasa','paket'].includes(from) && to === 'adet' && isQuantity(packSize)) return roundQuantity(qty * packSize);
  const a = units[from], b = units[to];
  if (!a || !b || a[0] !== b[0]) throw Error('Stok birimleri birbirine çevrilemez.');
  const value = qty * a[1] / b[1];
  if (!isQuantity(value)) throw Error('Çevrilen miktar en fazla 3 ondalık içermeli.');
  return value;
}
export function selectedRecipe(product, line) {
  const choices = line.substitutions || {};
  if (!choices || typeof choices !== 'object' || Array.isArray(choices)) throw Error('Reçete tercihi geçersiz.');
  const used = new Set();
  const recipe = product.recipe.map(row => {
    const selected = choices[row.materialId];
    if (!selected || selected === row.materialId) return {materialId: row.materialId, qty: row.qty};
    const alternative = row.alternatives?.find(x => x.materialId === selected);
    if (!alternative) throw Error('Seçilen alternatif bu reçetede yok.');
    used.add(row.materialId);
    return {materialId: alternative.materialId, qty: alternative.qty};
  });
  if (Object.keys(choices).some(key => !product.recipe.some(r => r.materialId === key))) throw Error('Reçete tercihi ürüne ait değil.');
  const grouped = new Map();
  for (const row of recipe) grouped.set(row.materialId, roundQuantity((grouped.get(row.materialId) || 0) + row.qty));
  return [...grouped].map(([materialId, qty]) => ({materialId, qty}));
}
export function warehouseExists(s, id) {
  return id === MAIN_WAREHOUSE || s.warehouses?.some(x => x.id === id);
}
export function warehouseBalances(s) {
  const balances = new Map(), sales = new Map(s.sales.map(x => [x.id, x]));
  const add = (kind, itemId, warehouseId, qty) => {
    const key = warehouseId + ':' + kind + ':' + itemId;
    balances.set(key, (balances.get(key) || 0) + Math.round(qty * 1000));
  };
  for (const p of s.purchases) add(p.kind, p.itemId, p.warehouseId || MAIN_WAREHOUSE, p.qty);
  for (const sale of s.sales) if (sale.status === 'completed') for (const d of sale.deductions) add(d.kind, d.id, sale.warehouseId || MAIN_WAREHOUSE, -d.qty);
  for (const r of s.saleReturns || []) for (const d of r.deductions) add(d.kind, d.id, r.warehouseId || sales.get(r.saleId)?.warehouseId || MAIN_WAREHOUSE, d.qty);
  for (const a of s.stockAdjustments || []) add(a.kind, a.itemId, a.warehouseId || MAIN_WAREHOUSE, a.deltaQty);
  for (const t of s.transfers || []) for (const line of t.lines) {
    add(line.kind, line.itemId, t.fromWarehouseId, -line.qty);
    if (t.status === 'received') add(line.kind, line.itemId, t.toWarehouseId, line.qty);
  }
  return balances;
}
export function warehouseBalance(s, kind, itemId, warehouseId = MAIN_WAREHOUSE) {
  return (warehouseBalances(s).get(warehouseId + ':' + kind + ':' + itemId) || 0) / 1000;
}
export function stockAlerts(s) {
  return ['products', 'materials'].flatMap(kind => s[kind].filter(x => x.reorderLevel != null && x.stock <= x.reorderLevel)
    .map(x => ({kind, itemId: x.id, name: x.name, stock: x.stock, reorderLevel: x.reorderLevel})));
}
export function expiryAlerts(s, at = new Date(), days = 30) {
  const start = new Date(at).toISOString().slice(0, 10), end = new Date(+new Date(at) + days * 86400000).toISOString().slice(0, 10);
  return s.purchases.filter(p => p.expiryDate && p.expiryDate <= end).map(p => ({...p, expired: p.expiryDate < start,
    name: s[p.kind].find(x => x.id === p.itemId)?.name || 'Stok kalemi'}));
}

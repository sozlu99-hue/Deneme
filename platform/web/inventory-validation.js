import {validateLots} from './lot-rules.js';
import {isMoney, isQuantity} from './payment-rules.js';
import {warehouseBalances, warehouseExists, MAIN_WAREHOUSE} from './inventory-rules.js';

export const inventoryCollections = ['catalogRevisions', 'stockAdjustments', 'warehouses', 'transfers'];
export function validateInventory(s, {stocks}) {
  const date = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
  const text = (v, max) => typeof v === 'string' && v.trim() && v.length <= max;
  const exists = (kind, id) => ['products', 'materials'].includes(kind) && s[kind].some(x => x.id === id);
  for (const p of [...s.products, ...s.materials]) {
    if (p.rawCostCents !== undefined && (!Number.isFinite(p.rawCostCents) || p.rawCostCents < 0 || p.rawCostCents > 1e12 || Math.round(p.rawCostCents) !== p.costCents)) throw Error('Hassas stok maliyeti geçersiz.');
    if (p.reorderLevel !== undefined && (!Number.isFinite(p.reorderLevel) || p.reorderLevel < 0 || p.reorderLevel > 1e6)) throw Error('Kritik stok miktarı geçersiz.');
    if (p.packSize !== undefined && !isQuantity(p.packSize)) throw Error('Koli içeriği geçersiz.');
  }
  for (const row of s.warehouses || []) if (!text(row.name, 80) || row.id === MAIN_WAREHOUSE) throw Error('Depo kaydı geçersiz.');
  for (const p of s.purchases) {
    if (!warehouseExists(s, p.warehouseId || MAIN_WAREHOUSE) || p.rawCostCents !== undefined &&
      (!Number.isFinite(p.rawCostCents) || p.rawCostCents < 0 || Math.round(p.rawCostCents) !== p.costCents || p.totalCents !== Math.round(p.rawCostCents * p.qty))) throw Error('Mal kabul kaydı geçersiz.');
    if (p.expiryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(p.expiryDate) || !date(p.expiryDate) || new Date(p.expiryDate).toISOString().slice(0, 10) !== p.expiryDate)) throw Error('Son kullanma tarihi geçersiz.');
  }
  for (const row of s.catalogRevisions || []) {
    if (!s.products.some(x => x.id === row.productId) || !date(row.date) || !row.before || !row.after || !isMoney(row.before.priceCents) ||
      !isMoney(row.after.priceCents) || !Number.isSafeInteger(row.after.version) || row.after.version !== row.before.version + 1) throw Error('Ürün değişiklik kaydı geçersiz.');
  }
  for (const row of s.stockAdjustments || []) {
    const key = row.kind + ':' + row.itemId;
    if (!stocks.has(key) || !isQuantity(Math.abs(row.deltaQty)) || !['count', 'waste'].includes(row.type) || row.type === 'waste' && row.deltaQty >= 0 ||
      !date(row.date) || !text(row.reason, 500) || !isMoney(row.unitCostCents) || row.rawUnitCostCents !== undefined && (!Number.isFinite(row.rawUnitCostCents) || row.rawUnitCostCents < 0 || row.rawUnitCostCents > 1e12 || Math.round(row.rawUnitCostCents) !== row.unitCostCents) || !warehouseExists(s, row.warehouseId || MAIN_WAREHOUSE)) throw Error('Sayım veya fire kaydı geçersiz.');
    stocks.set(key, stocks.get(key) + Math.round(row.deltaQty * 1000));
  }
  for (const transfer of s.transfers || []) {
    if (!warehouseExists(s, transfer.fromWarehouseId) || !warehouseExists(s, transfer.toWarehouseId) || transfer.fromWarehouseId === transfer.toWarehouseId ||
      !date(transfer.date) || !['in_transit', 'received'].includes(transfer.status) || transfer.status === 'received' && !date(transfer.receivedAt) || !Array.isArray(transfer.lines) || !transfer.lines.length) throw Error('Depo transferi geçersiz.');
    const seen = new Set();
    for (const line of transfer.lines) {
      const key = line.kind + ':' + line.itemId;
      if (!exists(line.kind, line.itemId) || seen.has(key) || !isQuantity(line.qty) || !isMoney(line.unitCostCents)) throw Error('Transfer satırı geçersiz.');
      seen.add(key);
    }
  }
  for (const value of warehouseBalances(s).values()) if (value < 0) throw Error('Depo bakiyesi negatif olamaz.');
  validateLots(s);
}

import {dateKey} from './business-calendar.js';
import {allocateLots,availableLots} from './lot-rules.js';
import {isMoney, isQuantity, roundQuantity} from './payment-rules.js';
import {convertQuantity, warehouseBalance, warehouseExists, MAIN_WAREHOUSE} from './inventory-rules.js';

const text = (v, max = 100) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw Error('Ad veya açıklama gerekli.'); return v.trim(); };
const item = (s, kind, id) => ['products', 'materials'].includes(kind) && s[kind].find(x => x.id === id) || (() => { throw Error('Stok kalemi bulunamadı.'); })();
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const uid = () => crypto.randomUUID();

export function applyInventoryCommand(s, action, now) {
  if (action.type === 'product-update') {
    const p = item(s, 'products', action.id), data = action.product;
    if (!data || !isMoney(data.priceCents)) throw Error('Ürün fiyatı geçersiz.');
    const barcode = String(data.barcode || '').trim().slice(0, 80);
    if (barcode && s.products.some(x => x.id !== p.id && x.barcode === barcode)) throw Error('Bu barkod başka üründe var.');
    const recipe = s.module === 'market' ? [] : data.recipe;
    if (!Array.isArray(recipe)) throw Error('Reçete gerekli.');
    const seen = new Set();
    for (const row of recipe) {
      item(s, 'materials', row.materialId);
      if (!isQuantity(row.qty) || seen.has(row.materialId)) throw Error('Reçete miktarı geçersiz veya yinelenmiş.');
      seen.add(row.materialId);
      const alternatives = new Set([row.materialId]);
      for (const a of row.alternatives || []) {
        item(s, 'materials', a.materialId);
        if (!isQuantity(a.qty) || alternatives.has(a.materialId)) throw Error('Alternatif malzeme geçersiz.');
        alternatives.add(a.materialId);
      }
    }
    // Backfill only the missing recipe context. Never change saved money/cost.
    for (const sale of s.sales) for (const line of sale.lines) if (line.productId === p.id && !line.recipeSnapshot && s.module !== 'market') {
      line.recipeSnapshot = structuredClone(p.recipe); line.recipeVersion = p.recipeVersion || 1;
    }
    const before = {name: p.name, priceCents: p.priceCents, recipe: structuredClone(p.recipe), version: p.recipeVersion || 1};
    Object.assign(p, {name: text(data.name), priceCents: data.priceCents, barcode,
      category: text(data.category || 'Genel', 40), recipe: structuredClone(recipe), recipeVersion: (p.recipeVersion || 1) + 1,
      station: data.station === 'bar' ? 'bar' : 'kitchen'});
    (s.catalogRevisions ??= []).push({id: uid(), productId: p.id, date: now, before,
      after: {name: p.name, priceCents: p.priceCents, recipe: structuredClone(p.recipe), version: p.recipeVersion}});
  } else if (action.type === 'stock-settings') {
    const p = item(s, action.kind, action.itemId);
    if (!Number.isFinite(action.reorderLevel) || action.reorderLevel < 0 || Math.abs(action.reorderLevel * 1000 - Math.round(action.reorderLevel * 1000)) > 1e-5) throw Error('Kritik stok miktarı geçersiz.');
    if (action.packSize != null && !isQuantity(action.packSize)) throw Error('Koli içeriği geçersiz.');
    if(action.trackLots!==undefined&&typeof action.trackLots!=='boolean')throw Error('Parti takip tercihi geçersiz.');if(action.trackLots!==undefined&&action.trackLots!==Boolean(p.trackLots)){if(p.stock!==0)throw Error('Parti takip tercihini yalnız stok sıfırken değiştir.');p.trackLots=action.trackLots;}p.reorderLevel = action.reorderLevel;
    if (action.packSize != null) p.packSize = action.packSize;
  } else if (action.type === 'receive') {
    const p = item(s, action.kind, action.itemId), warehouseId = action.warehouseId || MAIN_WAREHOUSE;
    if (!warehouseExists(s, warehouseId) || !isMoney(action.unitPriceCents)) throw Error('Depo veya alış fiyatı geçersiz.');
    const packSize=action.packSize??p.packSize;if(['koli','kasa','paket'].includes(action.unit)&&(!Number.isSafeInteger(packSize)||packSize<=0||!Number.isSafeInteger(action.qty)))throw Error('Paket miktarı ve içindeki adet pozitif tam sayı olmalı.');
    const qty = convertQuantity(action.qty, action.unit, p.unit || 'adet', packSize);
    if (!isQuantity(qty) || !isQuantity(p.stock + qty)) throw Error('Alış sonrası stok miktarı geçersiz.');
    const totalCents = Math.round(action.qty * action.unitPriceCents), rawCostCents = totalCents / qty;
    if (!isMoney(totalCents) || rawCostCents > 1e12) throw Error('Alış tutarı geçersiz.');
    if(p.trackLots&&(!action.lotNumber?.trim()||!validDate(action.expiryDate)))throw Error('Parti numarası ve geçerli son kullanma tarihi gerekli.');if (action.expiryDate && !validDate(action.expiryDate)) throw Error('Son kullanma tarihi geçersiz.');
    if (action.supplierId && !s.suppliers?.some(x => x.id === action.supplierId)) throw Error('Tedarikçi bulunamadı.');
    const stock = roundQuantity(p.stock + qty);
    p.rawCostCents = ((p.rawCostCents ?? p.costCents) * p.stock + totalCents) / stock;
    p.costCents = Math.round(p.rawCostCents); p.stock = stock;
    const purchase = {id: uid(), date: now,inputUnit:action.unit,inputQty:action.qty,...(['koli','kasa','paket'].includes(action.unit)?{packSize}:{}), kind: action.kind, itemId: p.id, qty, costCents: Math.round(rawCostCents), rawCostCents,
      totalCents, warehouseId, supplierId: action.supplierId || null, invoiceNumber: String(action.invoiceNumber || '').trim().slice(0, 80),
      lotNumber: String(action.lotNumber || '').trim().slice(0, 80), expiryDate: action.expiryDate || null,lotTracked:Boolean(p.trackLots)};
    s.purchases.push(purchase);
    if(action.supplierId){
      const bills=s.supplierBills??=[],dueDate=action.dueDate||dateKey(now);
      if(!validDate(dueDate))throw Error('Tedarikçi vade tarihi geçersiz.');
      const old=purchase.invoiceNumber&&bills.find(x=>x.supplierId===action.supplierId&&x.invoiceNumber===purchase.invoiceNumber);
      if(old){if(!old.purchaseIds||old.dueDate!==dueDate)throw Error('Belge mevcut. Vadesini kontrol et; bağımsız borç kaydını ikinci kez mal kabul olarak ekleme.');old.purchaseIds.push(purchase.id);old.amountCents+=totalCents;}
      else bills.push({id:uid(),supplierId:action.supplierId,purchaseIds:[purchase.id],purchaseId:null,amountCents:totalCents,date:now,dueDate,invoiceNumber:purchase.invoiceNumber});
    }
  } else if (action.type === 'stock-count' || action.type === 'stock-waste') {
    const p = item(s, action.kind, action.itemId), warehouseId = action.warehouseId || MAIN_WAREHOUSE;
    if (!warehouseExists(s, warehouseId)) throw Error('Depo bulunamadı.');
    const available = warehouseBalance(s, action.kind, p.id, warehouseId);
    if (available !== action.expectedStock) throw Error('Stok değişti. Son miktarı al ve sayımı yeniden kontrol et.');
    let delta;
    if (action.type === 'stock-count') {
      if (!Number.isFinite(action.countedQty) || action.countedQty < 0 || action.countedQty > 1e6 || Math.abs(action.countedQty * 1000 - Math.round(action.countedQty * 1000)) > 1e-5) throw Error('Sayım miktarı geçersiz.');
      delta = roundQuantity(action.countedQty - available);
    } else {
      if (!isQuantity(action.qty) || action.qty > available) throw Error('Fire miktarı depodaki stoktan fazla olamaz.');
      delta = -action.qty;
    }
    if (!delta) throw Error('Stok farkı yok.');
    const reason = text(action.reason, 500);
    let lots;if(p.trackLots){const lot=availableLots(s,action.kind,p.id,warehouseId).find(x=>x.id===action.lotPurchaseId);if(!lot||delta<0&&lot.remainingQty+delta<0)throw Error('Fark uygulanacak partiyi ve parti miktarını kontrol et.');lots=[{purchaseId:lot.id,qty:delta}];}p.stock = roundQuantity(p.stock + delta);
    (s.stockAdjustments ??= []).push({id: uid(), date: now, kind: action.kind, itemId: p.id, warehouseId,
      deltaQty: delta, type: action.type === 'stock-count' ? 'count' : 'waste', reason,
      unitCostCents: p.costCents, rawUnitCostCents: p.rawCostCents ?? p.costCents,...(lots?{lots}:{})});
  } else if (action.type === 'warehouse') {
    const name = text(action.name, 80);
    if (s.warehouses?.some(x => x.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) throw Error('Bu depo adı mevcut.');
    (s.warehouses ??= []).push({id: uid(), name});
  } else if (action.type === 'transfer-send') {
    const {fromWarehouseId, toWarehouseId} = action;
    if (!warehouseExists(s, fromWarehouseId) || !warehouseExists(s, toWarehouseId) || fromWarehouseId === toWarehouseId || !action.lines?.length) throw Error('Farklı iki depo ve stok satırları gerekli.');
    const seen = new Set();
    const lines = action.lines.map(line => {
      const p = item(s, line.kind, line.itemId), key = line.kind + ':' + p.id;
      if (seen.has(key) || !isQuantity(line.qty) || warehouseBalance(s, line.kind, p.id, fromWarehouseId) < line.qty) throw Error('Transfer miktarı geçersiz veya stok yetersiz.');
      seen.add(key);
      const lots=allocateLots(s,line.kind,p.id,line.qty,fromWarehouseId,now,true);return {kind: line.kind, itemId: p.id, qty: line.qty, unitCostCents: p.costCents,...(lots?{lots}:{})};
    });
    (s.transfers ??= []).push({id: uid(), date: now, fromWarehouseId, toWarehouseId, lines, status: 'in_transit', reason: text(action.reason, 500)});
  } else if (action.type === 'transfer-receive') {
    const transfer = s.transfers?.find(x => x.id === action.id);
    if (!transfer || transfer.status !== 'in_transit') throw Error('Transfer bulunamadı veya daha önce teslim alındı.');
    transfer.status = 'received'; transfer.receivedAt = now;
  } else return false;
  return true;
}

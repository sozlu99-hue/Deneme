import {isQuantity, roundQuantity} from './payment-rules.js';

const uid = () => crypto.randomUUID();
const text = (v, max = 60) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw Error('Masa veya sipariş adı gerekli.'); return v.trim(); };
const order = (s, id) => s.orders.find(x => x.id === id) || (() => { throw Error('Açık adisyon bulunamadı.'); })();
const record = (s, row, action, now, detail = {}) => (s.orderEvents ??= []).push({id: uid(), orderId: row.id, action, date: now, detail});
const quantities = lines => Object.fromEntries(lines.map(x => [x.productId, Math.round(x.qty * 1000)]));
export function assertOrderCheckout(s, action) {
  if (!action.orderId) return;
  const row = order(s, action.orderId), expected = quantities(row.lines), actual = quantities(action.lines);
  if (Object.keys(expected).length !== Object.keys(actual).length || Object.keys(expected).some(key => expected[key] !== actual[key])) throw Error('Adisyon değişti. Güncel adisyonu yeniden aç.');
}
export function closePaidOrder(s, action, now) {
  if (!action.orderId) return;
  const row = order(s, action.orderId);
  (s.closedOrders ??= []).push({...structuredClone(row), closedAt: now, outcome: 'paid', saleId: action.id});
  record(s, row, 'paid', now, {saleId: action.id});
  s.orders = s.orders.filter(x => x.id !== row.id);
}
function validLines(s, rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > s.products.length) throw Error('Sipariş ürünleri gerekli.');
  const seen = new Set();
  return rows.map(row => {
    if (!s.products.some(x => x.id === row.productId) || seen.has(row.productId) || !isQuantity(row.qty)) throw Error('Sipariş ürünü veya miktarı geçersiz.');
    seen.add(row.productId);
    return {productId: row.productId, qty: row.qty, ...(row.substitutions ? {substitutions: structuredClone(row.substitutions)} : {})};
  });
}
export function applyRestaurantCommand(s, action, now) {
  if (!['table', 'order', 'order-send', 'kitchen-status', 'order-move', 'order-merge', 'order-split', 'order-cancel', 'external-order'].includes(action.type)) return false;
  if (s.module === 'market') throw Error('Bu işlem restoran veya kafe paneline aittir.');
  if (action.type === 'table') {
    const name = text(action.name), area = text(action.area || 'Salon', 60);
    if (!Number.isInteger(action.seats) || action.seats < 1 || action.seats > 100) throw Error('Kişi sayısı 1 ile 100 arasında olmalı.');
    if (s.tables?.some(x => x.name === name && x.area === area)) throw Error('Bu masa mevcut.');
    (s.tables ??= []).push({id: uid(), name, area, seats: action.seats});
  } else if (action.type === 'order' || action.type === 'external-order') {
    if (action.type === 'external-order') {
      if (!['qr', 'external'].includes(action.source) || !/^[a-zA-Z0-9_:-]{1,180}$/.test(action.externalKey || '')) throw Error('Dış sipariş kimliği geçersiz.');
      if ([...s.orders, ...(s.closedOrders || [])].some(x => x.externalKey === action.externalKey)) throw Error('Bu dış sipariş daha önce alındı.');
    }
    const old = action.id ? order(s, action.id) : null;
    if (old?.status && old.status !== 'draft') throw Error('Mutfağa gönderilen adisyon doğrudan değiştirilemez. Yeni sipariş veya gerekçeli iptal kullan.');
    if (action.tableId && !s.tables?.some(x => x.id === action.tableId)) throw Error('Masa bulunamadı.');
    const value = {id: old?.id || uid(), label: text(action.label), lines: validLines(s, action.lines), date: old?.date || now,
      updatedAt: now, tableId: action.tableId || old?.tableId || null, status: 'draft',
      ...(action.type === 'external-order' ? {source: action.source, externalKey: action.externalKey} : {})};
    if (old) s.orders[s.orders.indexOf(old)] = value; else s.orders.push(value);
    record(s, value, old ? 'updated' : 'created', now);
  } else if (action.type === 'order-send') {
    const row = order(s, action.id);
    if (row.status && row.status !== 'draft') throw Error('Bu adisyon mutfağa daha önce gönderildi.');
    const stations = new Set(row.lines.map(l => s.products.find(p => p.id === l.productId)?.station || 'kitchen'));
    for (const station of stations) (s.kitchenTickets ??= []).push({id: uid(), orderId: row.id, label: row.label, station,
      status: 'pending', createdAt: now, updatedAt: now,
      lines: row.lines.filter(l => (s.products.find(p => p.id === l.productId)?.station || 'kitchen') === station)
        .map(l => ({productId: l.productId, name: s.products.find(p => p.id === l.productId).name, qty: l.qty}))});
    row.status = 'sent'; row.updatedAt = now;
    record(s, row, 'sent', now);
  } else if (action.type === 'kitchen-status') {
    const ticket = s.kitchenTickets?.find(x => x.id === action.id);
    const allowed = {pending: 'preparing', preparing: 'ready', ready: 'served'};
    if (!ticket || allowed[ticket.status] !== action.status) throw Error('Mutfak durumu değişti veya geçiş geçersiz.');
    ticket.status = action.status; ticket.updatedAt = now;
    record(s, {id: ticket.orderId}, 'kitchen-' + action.status, now, {ticketId: ticket.id, station: ticket.station});
  } else if (action.type === 'order-move') {
    const row = order(s, action.id), table = s.tables?.find(x => x.id === action.tableId);
    if (!table) throw Error('Hedef masa bulunamadı.');
    const before = row.tableId;
    row.tableId = table.id; row.label = table.name; row.updatedAt = now;
    for (const t of s.kitchenTickets || []) if (t.orderId === row.id) t.label = table.name;
    record(s, row, 'moved', now, {from: before, to: table.id});
  } else if (action.type === 'order-merge') {
    const target = order(s, action.id), source = order(s, action.sourceId);
    if (target.id === source.id || [target, source].some(x => x.status && x.status !== 'draft') || source.externalKey || target.externalKey) throw Error('Yalnız mutfağa gönderilmemiş yerel adisyonlar birleştirilebilir.');
    const rows = new Map(target.lines.map(x => [x.productId, x.qty]));
    for (const line of source.lines) rows.set(line.productId, roundQuantity((rows.get(line.productId) || 0) + line.qty));
    if ([...rows.values()].some(q => !isQuantity(q))) throw Error('Birleştirme miktarı geçersiz.');
    if ([...target.lines, ...source.lines].some(x => x.substitutions && Object.keys(x.substitutions).length)) throw Error('Reçete tercihi olan adisyonları ayrı kapat.');
    target.lines = [...rows].map(([productId, qty]) => ({productId, qty})); target.updatedAt = now;
    (s.closedOrders ??= []).push({...structuredClone(source), closedAt: now, outcome: 'merged', targetOrderId: target.id});
    s.orders = s.orders.filter(x => x.id !== source.id);
    record(s, target, 'merged', now, {sourceOrderId: source.id});
  } else if (action.type === 'order-split') {
    const source = order(s, action.id);
    if (source.status && source.status !== 'draft' || source.externalKey) throw Error('Bu adisyon bölünemez. Ödeme ekranında parçalı tahsilat kullan.');
    const moved = validLines(s, action.lines);
    for (const line of moved) {
      const existing = source.lines.find(x => x.productId === line.productId);
      if (!existing || line.qty > existing.qty || existing.substitutions && Object.keys(existing.substitutions).length) throw Error('Bölünecek miktar veya reçete tercihi geçersiz.');
      existing.qty = roundQuantity(existing.qty - line.qty);
    }
    source.lines = source.lines.filter(x => x.qty > 0);
    if (!source.lines.length) throw Error('Tüm adisyonu taşımak için masa taşıma işlemini kullan.');
    const target = {id: uid(), label: text(action.label), lines: moved, date: now, updatedAt: now, tableId: null, status: 'draft'};
    source.updatedAt = now; s.orders.push(target);
    record(s, source, 'split', now, {targetOrderId: target.id}); record(s, target, 'created-by-split', now, {sourceOrderId: source.id});
  } else if (action.type === 'order-cancel') {
    const row = order(s, action.id), reason = text(action.reason, 500);
    (s.closedOrders ??= []).push({...structuredClone(row), closedAt: now, outcome: 'cancelled', reason});
    s.orders = s.orders.filter(x => x.id !== row.id);
    for (const ticket of s.kitchenTickets || []) if (ticket.orderId === row.id && ticket.status !== 'served') { ticket.status = 'cancelled'; ticket.updatedAt = now; }
    record(s, row, 'cancelled', now, {reason});
  }
  return true;
}

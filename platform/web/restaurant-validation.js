import {isQuantity} from './payment-rules.js';
export const restaurantCollections = ['tables', 'closedOrders', 'kitchenTickets', 'orderEvents'];
export function validateRestaurant(s) {
  const date = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
  const text = (v, max) => typeof v === 'string' && v.trim() && v.length <= max;
  const orders = new Map([...s.orders, ...(s.closedOrders || [])].map(x => [x.id, x]));
  const tables = new Set((s.tables || []).map(x => x.id));
  if (s.module === 'market' && restaurantCollections.some(k => s[k]?.length)) throw Error('Market panelinde restoran işlemi bulunamaz.');
  for (const table of s.tables || []) if (!text(table.name, 60) || !text(table.area, 60) || !Number.isInteger(table.seats) || table.seats < 1 || table.seats > 100) throw Error('Masa kaydı geçersiz.');
  const externalKeys = new Set();
  for (const row of orders.values()) {
    if (!text(row.label, 60) || !date(row.date) || !Array.isArray(row.lines) || !row.lines.length || row.tableId && !tables.has(row.tableId)) throw Error('Adisyon geçmişi geçersiz.');
    if (row.status !== undefined && !['draft', 'sent'].includes(row.status)) throw Error('Adisyon durumu geçersiz.');
    const products = new Set();
    for (const line of row.lines) {
      if (!s.products.some(p => p.id === line.productId) || products.has(line.productId) || !isQuantity(line.qty)) throw Error('Adisyon geçmiş ürünü geçersiz.');
      products.add(line.productId);
    }
    if (row.externalKey) {
      if (!['qr', 'external'].includes(row.source) || externalKeys.has(row.externalKey)) throw Error('Dış sipariş kimliği yinelenmiş.');
      externalKeys.add(row.externalKey);
    }
  }
  for (const row of s.closedOrders || []) if (!date(row.closedAt) || !['paid', 'merged', 'cancelled'].includes(row.outcome) ||
    row.outcome === 'paid' && !s.sales.some(x => x.id === row.saleId) || row.outcome === 'merged' && !orders.has(row.targetOrderId)) throw Error('Adisyon kapanış kaydı geçersiz.');
  const tickets = new Set();
  for (const ticket of s.kitchenTickets || []) {
    const key = ticket.orderId + ':' + ticket.station;
    if (!orders.has(ticket.orderId) || !['kitchen', 'bar'].includes(ticket.station) || tickets.has(key) || !['pending', 'preparing', 'ready', 'served', 'cancelled'].includes(ticket.status) ||
      !date(ticket.createdAt) || !date(ticket.updatedAt) || !Array.isArray(ticket.lines) || !ticket.lines.length) throw Error('Mutfak fişi geçersiz.');
    tickets.add(key);
    for (const line of ticket.lines) if (!s.products.some(p => p.id === line.productId) || !isQuantity(line.qty) || !text(line.name, 100)) throw Error('Mutfak ürünü geçersiz.');
  }
  for (const event of s.orderEvents || []) if (!orders.has(event.orderId) || !date(event.date) || !text(event.action, 60) || !event.detail || typeof event.detail !== 'object') throw Error('Sipariş işlem kaydı geçersiz.');
}

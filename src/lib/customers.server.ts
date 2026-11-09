import { eq, sql } from 'drizzle-orm';
import { db } from './db/db';
import { customers, orders, orderItems, menuItems } from './db/schema';

// Finds the customer by phone, or creates one. Returns the customer id, or null when no phone is given.
export async function resolveCustomer(name: string | undefined, phone: string | undefined, branchId: string | undefined) {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const key = digits.length === 10 ? `+91 ${digits}` : phone!.trim();
  const found = await db.select().from(customers).where(eq(customers.phone, key)).limit(1);
  if (found.length) {
    if (name && found[0].fullName !== name) {
      await db.update(customers).set({ fullName: name }).where(eq(customers.id, found[0].id));
    }
    return found[0].id;
  }
  const created = await db.insert(customers).values({
    fullName: name?.trim() || 'Guest',
    phone: key,
    branchId: branchId ?? null,
  }).returning({ id: customers.id });
  return created[0].id;
}

export async function getCustomerProfile(phoneOrName: string) {
  if (!phoneOrName?.trim()) return null;
  const digits = phoneOrName.replace(/\D/g, '');
  let cust;
  if (digits.length >= 10) {
    const key = `+91 ${digits.slice(-10)}`;
    const [c] = await db.select().from(customers).where(eq(customers.phone, key)).limit(1);
    cust = c;
    if (!cust) {
      const [cRaw] = await db.select().from(customers).where(sql`${customers.phone} like ${`%${digits.slice(-10)}%`}`).limit(1);
      cust = cRaw;
    }
  } else {
    const [c] = await db.select().from(customers).where(sql`lower(${customers.fullName}) = lower(${phoneOrName.trim()})`).limit(1);
    cust = c;
  }

  if (!cust) return null;

  // Order history
  const history = await db.execute(sql`
    select count(distinct o.id)::int as visits,
           coalesce(sum(o.total), 0)::float as total_spent
    from orders o
    where (o.customer_id = ${cust.id} or o.customer_phone = ${cust.phone}) and o.status in ('paid', 'completed')
  `) as unknown as Array<{ visits: number; total_spent: number }>;

  const visits = Number(history[0]?.visits ?? 0);
  const totalSpent = Number(history[0]?.total_spent ?? 0);

  // Favorite dishes
  const favRows = await db.execute(sql`
    select m.id, m.name, m.price::float as price, coalesce(sum(oi.quantity), 0)::int as total_qty
    from order_items oi
    join orders o on o.id = oi.order_id
    join menu_items m on m.id = oi.menu_item_id
    where (o.customer_id = ${cust.id} or o.customer_phone = ${cust.phone}) and o.status in ('paid', 'completed')
    group by m.id, m.name, m.price
    order by total_qty desc limit 3
  `) as unknown as Array<{ id: number; name: string; price: number; total_qty: number }>;

  // Tier calculation
  let tier = cust.loyaltyTier || 'Standard';
  if (visits >= 10 || totalSpent >= 5000) tier = 'VIP Gold';
  else if (visits >= 4 || totalSpent >= 2000) tier = 'Silver';

  return {
    id: cust.id,
    name: cust.fullName,
    phone: cust.phone,
    tier,
    visits,
    totalSpent,
    favorites: favRows.map(r => ({ id: String(r.id), name: r.name, price: Number(r.price), totalQty: Number(r.total_qty) })),
  };
}



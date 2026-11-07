import type { CartItem } from "./orders";

const carts = new Map<number, CartItem[]>();

export const getCart = (userId: number) => carts.get(userId) ?? [];

export function addToCart(userId: number, productId: string, qty: number) {
  const cart = carts.get(userId) ?? [];
  const existing = cart.find((c) => c.productId === productId);
  if (existing) existing.qty += qty;
  else cart.push({ productId, qty });
  carts.set(userId, cart);
}

export const clearCart = (userId: number) => carts.delete(userId);
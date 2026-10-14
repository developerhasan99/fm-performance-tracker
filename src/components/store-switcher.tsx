"use client";

import Form from "next/form";
import { Store } from "lucide-react";

/** Store scope for the overview: switches as soon as a store is picked (keeps the period). */
export function StoreSwitcher({ stores, storeId, days }: { stores: { id: string; name: string }[]; storeId?: string; days: number }) {
  return (
    <Form action="/" className="store-switcher" key={storeId ?? "all"}>
      <input type="hidden" name="days" value={days} />
      <label>
        <Store size={13} aria-hidden="true" />
        <span className="sr-only">Store</span>
        <select name="store" defaultValue={storeId ?? ""} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
          <option value="">All stores</option>
          {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select>
      </label>
      <noscript><button className="secondary-button" type="submit">Apply</button></noscript>
    </Form>
  );
}

"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions/result";
import { Field, FormMessage, SubmitButton } from "./form";

type Values = { sku: string; name: string; category: string; unit: string; cost: string; price: string; reorderLevel: string };

export function ProductForm({
  action,
  initial,
  isNew,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  initial?: Values;
  isNew?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  // After an error, show what was typed; otherwise the saved values.
  const v = (key: keyof Values | "openingStock", fallback?: string) => state?.values?.[key] ?? fallback;
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name" name="name" defaultValue={v("name", initial?.name)} required placeholder="Mealie meal 25 kg" error={err.name} />
        <Field label="Product code" name="sku" defaultValue={v("sku", initial?.sku)} required placeholder="MEAL-25" hint="Your own code or the barcode number" error={err.sku} />
        <Field label="Category" name="category" defaultValue={v("category", initial?.category ?? "General")} error={err.category} />
        <Field label="Sold by" name="unit" defaultValue={v("unit", initial?.unit ?? "each")} hint="each, bag, packet, bottle…" error={err.unit} />
        <Field label="Cost price (K)" name="cost" defaultValue={v("cost", initial?.cost)} required inputMode="decimal" placeholder="230.00" error={err.costNgwee} />
        <Field label="Selling price (K)" name="price" defaultValue={v("price", initial?.price)} required inputMode="decimal" placeholder="265.00" error={err.priceNgwee} />
        <Field
          label="Reorder when stock reaches"
          name="reorderLevel"
          defaultValue={v("reorderLevel", initial?.reorderLevel ?? "0")}
          inputMode="numeric"
          hint="You'll see it under Running low"
          error={err.reorderLevel}
        />
        {isNew && <Field label="Opening stock" name="openingStock" defaultValue={v("openingStock", "0")} inputMode="numeric" hint="How many are on the shelf now" error={err.openingStock} />}
      </div>
      <SubmitButton>{isNew ? "Add product" : "Save changes"}</SubmitButton>
    </form>
  );
}

# Fix: till fails to load ("catch is not a function")

## What's wrong

When the app loads data from the cloud, it also tries to read the optional store-directory table. That read is written defensively so a missing table can't break startup — but the defensive `.catch(...)` is attached to a query object that isn't a real promise, so the call itself throws a `TypeError` and the whole data load aborts. Result: the console error you're seeing and no catalogue/members/sales loading.

## The fix

In `src/lib/pos-db.ts`, inside `loadCloudState`, replace the store lookup expression with an async helper that awaits the query inside a `try/catch` and returns `{ data: null }` on any failure (missing table, permission error, network). The rest of the parallel load is unchanged, and `stores` still degrades gracefully to an empty list.

## Technical detail

Supabase query builders are thenables (`.then` only), not `Promise` instances, so `.catch()` is undefined. Correct patterns are `await` inside `try/catch`, or `Promise.resolve(builder).catch(...)`. Will use the former for clarity:

```ts
(async () => {
  try {
    const res = await supabase.from("stores" as never).select("*");
    return { data: (res.data as Row[] | null) ?? null };
  } catch {
    return { data: null };
  }
})(),
```

Then verify the register loads cleanly with no console error.


<h1 align="center">Orvex The Future Of SQLite</h1>
<h3 align="center">JavaScript SDK for orvex with ORMs, and batching built in.</h3>

## Installation

```
npm install @orvex/orvex-js
```

## Setup

```ts
//database.ts
import { createClient } from "@orvex/orvex-js";

const orvex = createClient({
  org: "sql://<tenant>.<db>.orvex"
  authToken: "orvex_sk_....."
});

export default orvex;
```

## Single query
Run a single SQL statement with `client.execute()` Use ? placeholders to safely pass parameters.

```ts
const worker = await client.execute("SELECT * FROM users WHERE id = ?", [1]);
const user = worker.get(); //{ id: 1, name: "Alice", email: "alice@test.com" }
```

## Batch query

Send multiple statements in a single round-trip with `client.batch()` Each statement is an object with sql and optional params.
```ts
const worker = await client.batch([
  { sql: "SELECT * FROM users WHERE id = ?", params: [1] },
  { sql: "SELECT * FROM users WHERE id = ?", params: [2] },
]);

const users = worker.get();
// [
//   { id: 1, name: "Alice", email: "alice@test.com" },
//   { id: 2, name: "Bob",   email: "bob@test.com"   }
// ]
```

## Mixed reads and writes

A single batch can mix:
`SELECT`, `INSERT`, `UPDATE`, and `DELETE`. 
Results come back in order, one entry per statement — reads return rows, writes return metadata.
```ts
const worker = await client.batch([
  { sql: "INSERT INTO users (name) VALUES (?)", params: ["Dave"] },
  { sql: "SELECT * FROM users WHERE name = ?",  params: ["Dave"] },
  { sql: "UPDATE users SET email = ? WHERE name = ?", params: ["dave@test.com", "Dave"] },
]);

worker.get();
// [
//   undefined,                                 // INSERT has no row
//   { id: 43, name: "Dave", email: null },     // SELECT row
//   undefined,                                 // UPDATE has no row
// ]

worker.run();
// [
//   { rowsAffected: 1, lastInsertRowid: 43 },   // INSERT
//   { rowsAffected: 0, lastInsertRowid: null }, // SELECT
//   { rowsAffected: 1, lastInsertRowid: null }, // UPDATE
// ]
```

### Dizzle 

### Drizzle ORM Support
`@orvex/orvex-js` ships with built-in Drizzle ORM support. 
Define your schema in TypeScript, get full type safety, and query your Orvex database. With familiar query builder — no codegen, no migrations, no extra setup.
## setup 

```ts
//schema.ts
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id:    integer("id").primaryKey({ autoIncrement: true }),
  name:  text("name").notNull(),
  email: text("email").notNull().unique(),
});

export const posts = sqliteTable("posts", {
  id:       integer("id").primaryKey({ autoIncrement: true }),
  userId:   integer("user_id").notNull().references(() => users.id),
  title:    text("title").notNull(),
  body:     text("body"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

```

```ts
//database.ts
import { createOrvexDrizzle } from "@orvex/orvex-js/drizzle";
import * as schema from "./schema";

const orvex = createClient({
  org: "sql://<tenant>.<db>.orvex"
  authToken: "orvex_sk_....."
});

export const db = createOrvexDrizzle(orvex, { schema });
```

## Query with Full Type Safety
Once your schema is defined, every query is fully typed — autocomplete on every column, compile-time errors for typos, and inferred return types.

# Insert
Use `db.insert()` to add rows. Chain `.values()` to specify the data and `.returning()` to get the inserted row back — including auto-generated fields like id.
```ts
const [alice] = await db
  .insert(users)
  .values({ name: "Alice", email: "alice@test.com" })
  .returning();
// alice: { id: 1, name: "Alice", email: "alice@test.com" }
```

# Select sigle data from table
Use `.get()` to fetch exactly one row. It returns the first match, or undefined if nothing is found — no array to unwrap.
```ts
const user = await db
  .select()
  .from(users)
  .where(eq(users.id, 1))
  .get();
// user: { id: 1, name: "Alice", email: "alice@test.com" } | undefined
```

# Import all data from the table
Use `.all()` to fetch every row that matches your query. Always returns an array — empty if nothing matches.
```ts
//select many
const allUsers = await db.select().from(users).all();
// allUsers: { id: number, name: string, email: string }[]
```

# Update existing data
Use `.update()` to modify rows. Chain `.set()` with the new values and `.where()` to target specific rows — without `.where()`, every row is updated.
```ts
//update
await db
  .update(users)
  .set({ name: "Alice Smith" })
  .where(eq(users.id, 1))
  .run();
```

# Mixed: Drizzle + Raw SQL
Not everything fits the query builder. Drop down to raw SQL with the `sql` template tag — parameters are safely bound, not string-concatenated.
```ts
import { sql } from "drizzle-orm";

const result = await db.run(sql`UPDATE users SET email = ${"new@test.com"} WHERE id = ${1}`);

// result: { rowsAffected: 1, lastInsertRowid: undefined }
```

## Mix Drizzle and raw SQL in the same batch
Both share the same connection, so you can combine them freely:
```ts
const [users, stats] = await db.batch([
  db.select().from(users),
  db.all(sql`SELECT COUNT(*) as total FROM posts`),
]);
```

## Escape fully to the orvex-js
For statements Drizzle doesn't cover (`PRAGMA`, `ATTACH`, `VACUUM`), use the client directly:
```ts
const worker = await orvex.execute("PRAGMA table_info(users)");
const columns = worker.all();
```

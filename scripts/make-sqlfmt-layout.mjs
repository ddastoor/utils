// Writes tests/fixtures/sqlfmt/layout.json: the layout the SQL Formatter gives to every statement of the corpus
// (tests/fixtures/sqlfmt/corpus.json) and to the extra cases below, as produced by the engine that is built now.
//
// The layout is a matter of taste, not of right and wrong, so this file is a record: READ THE DIFF before committing
// it (git diff tests/fixtures/sqlfmt/layout.json) — every changed line is a change the users of the tab will see.
// That the formatter never changes what the SQL means is checked elsewhere, against independent references
// (tests/unit/sqlfmt.test.mjs, tests/e2e/sqlfmt.e2e.mjs).
//
//   node scripts/make-sqlfmt-layout.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mod = await WebAssembly.compile(readFileSync(join(root, 'src/wasm/bin/devcore-sqlfmt.wasm')));
let memory;
const w = {};
for (const i of WebAssembly.Module.imports(mod)) if (i.module === 'wasi_snapshot_preview1') w[i.name] = () => 52;
w.fd_prestat_get = () => 8;
w.random_get = (p, n) => { crypto.getRandomValues(new Uint8Array(memory.buffer, p, n)); return 0; };
w.environ_sizes_get = (a, b) => { const dv = new DataView(memory.buffer); dv.setUint32(a, 0, true); dv.setUint32(b, 0, true); return 0; };
w.environ_get = () => 0;
const e = (await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: w })).exports;
memory = e.memory; e._initialize?.();
const enc = new TextEncoder(), dec = new TextDecoder();
const fmt = (arg) => {
  const op = enc.encode('sqlfmt'), inp = enc.encode(JSON.stringify(arg));
  const po = e.dc_alloc(op.length), pi = e.dc_alloc(inp.length);
  new Uint8Array(memory.buffer, po, op.length).set(op); new Uint8Array(memory.buffer, pi, inp.length).set(inp);
  try {
    const r = e.dc_call(po, op.length, pi, inp.length), out = dec.decode(new Uint8Array(memory.buffer, e.dc_out_ptr(), e.dc_out_len()).slice());
    if (r !== 0) throw new Error(out);
    return JSON.parse(out);
  } finally { e.dc_free(po, op.length); e.dc_free(pi, inp.length); }
};

/** Cases beside the corpus: [dialect ('' = detect), options, SQL]. */
export const EXTRA = [
  ['', {}, 'select a, b from t where x = 1 and y > 2 order by a'],
  ['', {}, "select o.id, c.name, sum(i.qty * i.price) as total from orders o join customers c on c.id = o.customer_id left join items i on i.order_id = o.id and i.x = 1 where o.created_at >= '2026-01-01' and c.city in ('Pune', 'Mumbai') group by o.id, c.name having sum(i.qty) > 2 order by total desc limit 10; update stock set qty = qty - 1 where sku = 'A-1';"],
  ['', {}, 'select a from t where (a = 1 or b = 2) and c in (select id from u where x = 1) and exists (select 1 from v)'],
  ['', {}, 'with a as (select 1 x), b as (select 2 y) select * from a, b union all select 1, 2'],
  ['', {}, "select case when a = 1 then 'one' when a = 2 then 'two' else 'other' end as n, case a when 1 then 2 end from t"],
  ['', {}, "create table t (id int primary key, name varchar(10) not null default 'x', created timestamp default current_timestamp, foreign key (id) references u (id) on delete cascade)"],
  ['', {}, 'select count(*), coalesce(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s) from t -- trailing\n-- own line\nwhere a /* inline */ = 1'],
  ['', {}, 'select a from t limit 10 offset 5; delete from t where a = 1; select distinct a from t'],
  ['', {}, 'select row_number() over (partition by customer_id, region order by created_at desc rows between unbounded preceding and current row) from t'],
  ['', {}, "DECLARE @x INT = 5\nSET @x += 1\nIF @x > 3\n    PRINT 'big'\nELSE\n    PRINT 'small'\nSELECT @x AS x\nGO\nUSE [my db]\nGO\nEXEC dbo.p @a = 1\nselect top 5 * from #t where [status] = 'x'"],
  ['', {}, "insert into customers (id, first_name, last_name, email, phone, city, state, country, pincode, created_at, updated_at, notes) values (1, 'Asha', 'Rao', 'a@example.com', '+91 98765 43210', 'Pune', 'MH', 'IN', '411001', now(), now(), null), (2, 'Ravi', 'Kumar', 'r@example.com', null, 'Mumbai', 'MH', 'IN', '400001', now(), now(), 'vip')"],
  ['', {}, "select * from orders where status in ('new', 'paid', 'packed', 'shipped', 'delivered', 'returned', 'refunded', 'cancelled', 'failed', 'on-hold', 'pending-review') and id in (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40)"],
  ['', {}, "select {{ col }}, a from {{ ref('orders') }} where d >= '{{ start }}' {% if x %} and b = 1 {% endif %} and c = %s and e = %(name)s and f = ${v} and g = #{w} and h = ?"],
  ['', {}, '-- report\n/* multi\n   line */\nselect a, -- first\n b /* second */, c\nfrom t; -- done\n\n\n-- next\nselect 2'],
  ['', {}, "select case when a > 0 then case when b > 0 then 'both positive and large enough to matter' else 'only a' end when a = 0 then 'zero' else 'negative' end, x from t"],
  ['postgres', {}, "with a as (select 1), ins as (insert into t select * from a returning id) select count(*) from ins; create or replace view v as select a, b from t where c; create materialized view mv as select 1; refresh materialized view concurrently mv; drop table if exists a, b cascade; comment on column t.c is 'x; y'; alter table t alter column c type text using c::text, alter column d set default 0, add constraint fk foreign key (d) references u (id) on delete set null; vacuum analyze t; begin; savepoint s1; rollback to savepoint s1; commit;"],
  ['mysql', {}, "select a.id, (select count(*) from b where b.a_id = a.id) cnt from a where a.name like concat('%', ?, '%') and (a.x = 1 or a.y = 2 or (a.z = 3 and a.w = 4)) order by cnt desc, a.id limit 20, 10"],
  ['', {}, "create table t (id int primary key, name varchar(10)); create index i on t (name); select count(distinct id), sum(case when x then 1 else 0 end) total from t group by 1 having count(*)>1 order by 2 desc nulls last limit 5"],
  // options
  ['', { inline: true }, "select o.id, c.name from orders o join customers c on c.id = o.customer_id where c.city in ('Pune', 'Mumbai') order by 1; update stock set qty = qty - 1 where sku = 'A-1'"],
  ['', { inline: true }, '-- report\n/* multi\n   line */\nselect a, -- first\n b /* second */, c\nfrom t; -- done\n\n\n-- next\nselect 2'],
  ['', { inline: true }, "select a from t where x in (select y from u where z = 'k') and w = 1 -- why\nunion all select 2"],
  ['sqlite', { inline: true }, "create trigger tr after insert on orders for each row when new.total > 1000 begin update customers set notes = 'vip' where id = new.customer_id; insert into items values (new.id, 'GIFT', 1, 0); end"],
  ['', { keywords: 'lower' }, 'SELECT A, B FROM T WHERE X IS NOT NULL AND Y BETWEEN 1 AND 2 ORDER BY A DESC'],
  ['', { keywords: 'keep' }, 'Select A, b From T Where X Is Not Null Order By A Desc'],
  ['', { indent: 4 }, 'select a, b from t where c in (select d from u where e = 1)'],
  ['', { indent: 0 }, 'select a, b from t where c in (select d from u where e = 1)'],
  ['', { lines: 3 }, 'select 1; select 2; select 3'],
  ['', { lines: 2 }, "begin; update t set a = 1; commit; -- done\nselect 1"],
];

const C = JSON.parse(readFileSync(join(root, 'tests/fixtures/sqlfmt/corpus.json'), 'utf8'));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = { about: 'The layout the SQL Formatter gives (devcore-sqlfmt.wasm). Written by scripts/make-sqlfmt-layout.mjs — read its diff before committing it.', corpus: {}, extra: [] };
  for (const d of ['sqlite', 'postgres', 'mysql', 'tsql', 'oracle']) out.corpus[d] = C[d].map((sql) => fmt({ sql, dialect: d }).text);
  for (const [d, o, sql] of EXTRA) { const r = fmt({ sql, dialect: d || 'auto', ...o }); out.extra.push({ d, o, sql, read: r.dialect, out: r.text }); }
  writeFileSync(join(root, 'tests/fixtures/sqlfmt/layout.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(Object.values(out.corpus).flat().length, 'corpus statements and', out.extra.length, 'extra cases written');
}

// Pure business-state checks. No network requests, credentials or database writes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url),
  modules = new Map();
async function moduleUrl(file) {
  if (modules.has(file.href)) return modules.get(file.href);
  let source = ts.transpileModule(await readFile(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  for (const match of [...source.matchAll(/from ['"]([^'"]+)['"]/g)]) {
    const specifier = match[1];
    const resolved = specifier.startsWith(".")
      ? await moduleUrl(new URL(`${specifier}.ts`, file))
      : pathToFileURL(require.resolve(specifier)).href;
    source = source.replace(match[0], `from '${resolved}'`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  modules.set(file.href, url);
  return url;
}
const { buildActivity, activitySources } = await import(
  await moduleUrl(new URL("../src/utils/activity.ts", import.meta.url))
);
const {
  staffNeedsAction,
  awaitingAssignment,
  staffWorkRank,
  isOverdueInvoice,
} = await import(
  await moduleUrl(new URL("../src/utils/work-queue.ts", import.meta.url))
);
const { matchesSource } = await import(
  await moduleUrl(new URL("../src/services/live-events.ts", import.meta.url))
);
const checks = [];
for (const kind of ["support-requests", "maintenance", "stock-movements"]) {
  const row = {
    id: kind,
    status: kind === "stock-movements" ? "REQUESTED" : "OPEN",
    assignedStaff: null,
  };
  assert(awaitingAssignment(kind, row));
  assert(!staffNeedsAction(kind, row, "staff-a"));
  const manager = buildActivity("MANAGER", "manager", { [kind]: [row] })[0];
  assert(manager.action && manager.web.startsWith("/manager/assignments"));
  const worker = buildActivity("STAFF", "staff-a", { [kind]: [row] })[0];
  assert(!worker.action && worker.title.includes("Chờ quản lý phân công"));
  const assigned = {
    ...row,
    status: kind === "maintenance" ? "OPEN" : "ASSIGNED",
    assignedStaff: { id: "staff-a", fullName: "Nhân viên A" },
  };
  assert(staffNeedsAction(kind, assigned, "staff-a"));
  assert(!staffNeedsAction(kind, assigned, "staff-b"));
}
checks.push(
  "Unassigned work belongs to Manager assignment; only the assigned employee executes it",
);
assert(
  staffNeedsAction(
    "maintenance",
    { status: "AWAITING_VERIFICATION" },
    "staff-a",
  ),
);
assert(
  staffNeedsAction("support-requests", { status: "ESCALATED" }, "staff-a"),
);
assert(
  staffNeedsAction(
    "inquiries",
    { status: "PENDING_CONTACT", requestType: "INQUIRY" },
    "staff-a",
  ),
);
assert(
  !staffNeedsAction(
    "inquiries",
    { status: "PENDING_CONTACT", requestType: "RESERVATION" },
    "staff-a",
  ),
);
assert(!staffNeedsAction("invoices", { status: "OPEN" }, "staff-a"));
const now = Date.now();
assert(
  staffWorkRank(
    "appointments",
    { status: "CONFIRMED", scheduledAt: new Date(now - 1000).toISOString() },
    now,
  ) <
    staffWorkRank(
      "appointments",
      {
        status: "CONFIRMED",
        scheduledAt: new Date(now + 3600000).toISOString(),
      },
      now,
    ),
);
checks.push(
  "Staff review/inspection permissions and due handovers are prioritized correctly",
);

const invoice = {
  id: "invoice-a",
  status: "OPEN",
  balanceDue: 1000000,
  dueAt: new Date(now - 1000).toISOString(),
};
assert(isOverdueInvoice(invoice, now));
assert(!isOverdueInvoice({ ...invoice, status: "PAID" }, now));
assert(!isOverdueInvoice({ ...invoice, balanceDue: 0 }, now));
assert(!isOverdueInvoice({ ...invoice, dueAt: "invalid" }, now));
const overdue = buildActivity("MANAGER", "manager", { invoices: [invoice] });
assert.equal(overdue.length, 1);
assert(
  overdue[0].action &&
    overdue[0].web.startsWith("/manager/operations/invoices/"),
);
assert.equal(
  buildActivity("MANAGER", "manager", {
    invoices: [{ ...invoice, dueAt: "2099-01-01" }],
  }).length,
  0,
);
checks.push(
  "Manager sees outstanding overdue invoices without false paid/future warnings",
);

const renewal = {
  id: "renewal-a",
  status: "APPROVED_PENDING_PAYMENT",
  invoices: [
    { ...invoice, renewalCycle: 1 },
    { ...invoice, id: "invoice-b", renewalCycle: 2 },
  ],
};
const customerData = { renewals: [renewal], invoices: [invoice] };
const renewalEntry = buildActivity("CUSTOMER", "customer", customerData).find(
  (row) => row.kind === "renewals",
);
assert.equal(renewalEntry.web, "/customer/payments?invoice=invoice-a");
assert.equal(renewalEntry.mobile, "/customer/invoices/invoice-a");
assert(renewalEntry.action);
const pendingData = {
  ...customerData,
  "payment-submissions": [
    {
      id: "submission-a",
      status: "PENDING_VERIFICATION",
      invoice: { id: "invoice-a" },
    },
  ],
};
assert(
  buildActivity("CUSTOMER", "customer", pendingData).every(
    (row) => !row.action,
  ),
);
const completed = buildActivity("CUSTOMER", "customer", {
  renewals: [{ ...renewal, status: "COMPLETED" }],
})[0];
assert(!completed.action && completed.token !== renewalEntry.token);
checks.push(
  "Approved renewals lead to the activation invoice; pending transfers suppress duplicate payment prompts",
);

const contract = {
  id: "contract-a",
  status: "READY_FOR_HANDOVER",
  endDate: "2099-01-01",
  reservation: { id: "reservation-a", quantity: 1 },
};
assert(
  buildActivity("CUSTOMER", "customer", { contracts: [contract] })[0].action,
);
assert.equal(
  buildActivity("CUSTOMER", "customer", {
    contracts: [contract],
    appointments: [
      {
        id: "appointment-a",
        status: "REQUESTED",
        reservation: { id: "reservation-a" },
      },
    ],
  }).filter((row) => row.kind === "contracts").length,
  0,
);
const beforeTransfer = buildActivity("CUSTOMER", "customer", {
  contracts: [
    {
      ...contract,
      status: "ACTIVE",
      storageUnit: { id: "unit-a", unitCode: "A101" },
    },
  ],
})[0];
const afterTransfer = buildActivity("CUSTOMER", "customer", {
  contracts: [
    {
      ...contract,
      status: "ACTIVE",
      storageUnit: { id: "unit-b", unitCode: "A102" },
    },
  ],
})[0];
assert.notEqual(beforeTransfer.token, afterTransfer.token);
assert.match(afterTransfer.title, /A102/);
assert.deepEqual(
  activitySources("ADMIN").map((source) => source.path),
  ["/admin/users"],
);
checks.push(
  "Ready contracts request one handover; Admin activity remains account-only",
);

assert(matchesSource("/manager/*", ["/manager/invoices"]));
assert(
  matchesSource("/staff/management/maintenance/id", ["/staff/maintenance"]),
);
assert(matchesSource("/customer/rentals", ["/customer/renewals"]));
assert(
  matchesSource("/customer/payments?view=invoices", [
    "/customer/payment-submissions",
  ]),
);
assert(matchesSource("/reservations/id", ["/customer/contracts"]));
assert(!matchesSource("/admin/users", ["/manager/invoices"]));
assert(!matchesSource("/customer/rentals", ["/manager/renewals"]));
checks.push(
  "Refreshes follow related resources without crossing role boundaries",
);
for (const name of [
  "activity",
  "workflow-guide",
  "work-queue",
  "operation-access",
])
  assert.equal(
    await readFile(new URL(`../src/utils/${name}.ts`, import.meta.url), "utf8"),
    await readFile(
      new URL(`../../mobile/src/utils/${name}.ts`, import.meta.url),
      "utf8",
    ),
    `${name}: web/mobile drift`,
  );
checks.push(
  "Web and mobile use identical workflow, notification and permission rules",
);
console.log(JSON.stringify({ passed: checks, realDatabaseWrites: 0 }, null, 2));

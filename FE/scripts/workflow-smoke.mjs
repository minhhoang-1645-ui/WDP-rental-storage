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
    const resolved = specifier.startsWith("@/") ? await moduleUrl(new URL(`../../mobile/src/${specifier.slice(2)}.ts`, import.meta.url)) : specifier.startsWith(".")
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
  assignmentNeedsAttention,
  managerNeedsAction,
  staffWorkRank,
  isOverdueInvoice,
} = await import(
  await moduleUrl(new URL("../src/utils/work-queue.ts", import.meta.url))
);
const { matchesSource } = await import(
  await moduleUrl(new URL("../src/services/live-events.ts", import.meta.url))
);
const checks = [];
const { customerProgress } = await import(await moduleUrl(new URL('../src/utils/customer-progress.ts', import.meta.url)));
const { filterNotifications, newActivityCount, actionCountForPath } = await import(await moduleUrl(new URL('../src/utils/notification-tools.ts', import.meta.url)));
const journeyReservation = { id: 'PUBLIC-REFERENCE', reference: 'PUBLIC-REFERENCE', quantity: 1, status: 'CONFIRMED' };
const journeyRelation = { id: 'private-db-id', reference: 'PUBLIC-REFERENCE' };
const journey = { contracts: [{ id: 'jc', status: 'PENDING_PAYMENT', endDate: '2099-01-01', reservation: journeyRelation, terms: {} }], invoices: [{ id: 'ji', type: 'INITIAL', status: 'OPEN', balanceDue: 100, reservation: journeyRelation }], appointments: [], returns: [], 'payment-submissions': [] };
assert.equal(customerProgress({ ...journeyReservation, status: 'PENDING' }, journey).stage, 0);
assert.equal(customerProgress(journeyReservation, journey).stage, 1, 'Public code must resolve private contract by reservation.reference');
journey.contracts[0].terms.acceptedAt = '2026-10-29T00:00:00Z';
assert.equal(customerProgress(journeyReservation, journey).stage, 2);
journey['payment-submissions'].push({ status: 'PENDING_VERIFICATION', invoice: { id: 'ji' } });
assert.match(customerProgress(journeyReservation, journey).title, /Đang đối chiếu/);
journey.contracts[0].status = 'READY_FOR_HANDOVER'; journey.invoices[0].status = 'PAID';
assert.equal(customerProgress(journeyReservation, journey).cta, 'Đặt lịch nhận kho');
journey.appointments.push({ id: 'ja', status: 'CONFIRMED', reservation: journeyRelation });
assert.equal(customerProgress(journeyReservation, journey).cta, 'Xem lịch nhận kho');
journey.contracts[0].status = 'ACTIVE';
assert.equal(customerProgress(journeyReservation, journey).stage, 4);
journey.returns.push({ id: 'jr', status: 'REQUESTED', reservation: journeyRelation });
assert.equal(customerProgress(journeyReservation, journey).stage, 5);
journey.returns[0].status = 'COMPLETED';
assert.equal(customerProgress(journeyReservation, journey).stage, 6);
assert(customerProgress({ ...journeyReservation, status: 'EXPIRED' }, journey).closed);
assert.match(customerProgress(journeyReservation, { ...journey, contracts: [], returns: [], invoices: [{ ...journey.invoices[0], status: 'VOID' }] }).cta, /hỗ trợ/);
const manyNotifications = buildActivity('ADMIN', 'admin', { users: Array.from({length: 135}, (_, i) => ({id: `user-${i}`, fullName: 'Nguyễn Văn An', email: `${i}@example.test`, accountStatus: 'ACTIVE', role: 'STAFF'})) });
assert.equal(manyNotifications.length, 135, 'All fetched dossiers must be available to the paginated inbox');
assert.equal(filterNotifications(manyNotifications, [], 'all', 'users', 'nguyen van an').length, 135);
assert.equal(filterNotifications(manyNotifications, [manyNotifications[0].token], 'unread', 'all', '').length, 134);
assert.equal(newActivityCount(manyNotifications, manyNotifications), 0);
assert.equal(newActivityCount([], manyNotifications), 135);
assert.equal(actionCountForPath([{id:'a',action:true,web:'/staff/transfers/x'},{id:'a',action:true,web:'/staff/transfers/x'},{id:'b',action:false,web:'/staff/transfers/y'}], '/staff/transfers'), 1);
assert(!buildActivity('CUSTOMER', 'c', { invoices: [{ id: 'void', type: 'INITIAL', status: 'VOID', balanceDue: 10, signing: { complete: false } }] })[0].action);
assert(!buildActivity('STAFF', 's', { 'support-requests': [{ id: 'closed-transfer', subject: 'Chuyển kho', status: 'RESOLVED' }] })[0].action);
checks.push('Six-step customer journey, public/private identity matching, pending transfer confirmation, VOID safety, complete inbox beyond 100 records, accent-insensitive search and stable update/read badges');
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
  !staffNeedsAction(
    "maintenance",
    { status: "AWAITING_VERIFICATION" },
    "staff-a",
  ),
);
assert(
  !staffNeedsAction("support-requests", { status: "ESCALATED" }, "staff-a"),
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
  }).filter(item => item.action).length,
  0,
);
checks.push(
  "Manager sees outstanding overdue invoices without false paid/future warnings",
);

const renewal = {
  id: "renewal-a",
  appendix: { acceptedAt: "2026-10-28T00:00:00Z" },
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
const unsignedRenewal = buildActivity('CUSTOMER', 'customer', { renewals: [{ ...renewal, appendix: { acceptedAt: null } }] })[0];
assert.equal(unsignedRenewal.web, '/customer/renewals?renewal=renewal-a');
assert.equal(unsignedRenewal.mobile, '/customer/renewals/renewal-a');
assert(unsignedRenewal.action);
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
  "payment-state",
  "handover",
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
const { paymentWindowClosed, paymentExpiry, paymentTimeLeft } = await import(await moduleUrl(new URL('../src/utils/payment-state.ts', import.meta.url)));
const { customerAppointmentAction } = await import(await moduleUrl(new URL('../../mobile/src/portals/actions.ts', import.meta.url)));
const clock = Date.parse('2050-01-01T00:00:00Z');
assert(paymentWindowClosed({ type: 'INITIAL', reservation: { expiresAt: '2050-01-01T00:00:00Z' } }, clock));
assert(!paymentWindowClosed({ type: 'INITIAL', reservation: { expiresAt: '2050-01-01T00:00:01Z' } }, clock));
assert(!paymentWindowClosed({ type: 'RENEWAL', reservation: { expiresAt: '2000-01-01' } }, clock));
assert(paymentWindowClosed({ reservation: { status: 'EXPIRED' } }));
assert.equal(paymentExpiry(undefined, '2050-01-01T00:00:00Z'), '2050-01-01T00:15:00.000Z');
assert(!paymentTimeLeft('invalid').includes('NaN'));
assert(!isOverdueInvoice({ type: 'INITIAL', status: 'OPEN', balanceDue: 100, dueAt: '2050-01-01', reservation: { expiresAt: '2050-01-01T14:00:00Z' } }, clock + 1000));
const scheduledContract = { id: 'c', status: 'READY_FOR_HANDOVER', startDate: '2050-02-01', endDate: '2050-03-01', reservation: { id: 'r', quantity: 1 } };
const appointment = customerAppointmentAction(scheduledContract, [scheduledContract], [], clock);
assert(appointment);
assert.equal(appointment.validateValues({ scheduledAt: '2050-01-29 10:00' }), undefined);
assert(appointment.validateValues({ scheduledAt: '2050-01-28 23:59' }));
assert(appointment.validateValues({ scheduledAt: '2050-03-01 00:00' }));
assert(appointment.validateValues({ scheduledAt: '2050-02-30 10:00' }));
assert.equal(appointment.transform({ scheduledAt: '2050-01-29 10:00' }).scheduledAt, '2050-01-29T03:00:00.000Z');
checks.push('Hold deadlines, legacy payment session migration, exact hourly debt and mobile three-day appointment boundaries');
for (const [kind, status, suffix] of [['maintenance', 'AWAITING_VERIFICATION', '/manager/operations/maintenance/'], ['support-requests', 'ESCALATED', '/manager/operations/support-requests/']]) {
  const row = { id: 'review', status, assignedStaff: { id: 'staff-a' } };
  assert(!staffNeedsAction(kind, row, 'staff-a'));
  assert(managerNeedsAction(kind, row));
  const activity = buildActivity('MANAGER', 'manager', { [kind]: [row] })[0];
  assert(activity.action && activity.web.startsWith(suffix));
}
for (const kind of ['support-requests', 'maintenance', 'stock-movements']) {
  const row = { id: 'disabled-owner', status: kind === 'maintenance' ? 'OPEN' : 'ASSIGNED', assignedStaff: { id: 'disabled', accountStatus: 'DISABLED' } };
  assert(assignmentNeedsAttention(kind, row));
  assert(buildActivity('MANAGER', 'manager', { [kind]: [row] })[0].web.startsWith('/manager/assignments'));
}
assert(buildActivity('MANAGER', 'manager', { 'online-payment-reconciliations': [{ id: 'late', status: 'REFUND_REQUIRED' }] })[0].action);
assert(matchesSource('/staff/returns/return', ['/staff/stock-movements/movement/complete']));
const { resolveApiBase } = await import(await moduleUrl(new URL('../../mobile/src/services/api-base.ts', import.meta.url)));
assert.equal(resolveApiBase({ configured: 'https://api.example.org/api/', development: true, hostUri: '192.168.1.9:8081' }), 'https://api.example.org/api');
assert.equal(resolveApiBase({ development: true, hostUri: '192.168.1.9:8081', platform: 'android' }), 'http://192.168.1.9:3000/api');
assert.equal(resolveApiBase({ development: true, webHost: '127.0.0.1' }), 'http://127.0.0.1:3000/api');
assert.equal(resolveApiBase({ development: false, hostUri: '192.168.1.9:8081', platform: 'android' }), 'http://10.0.2.2:3000/api');
checks.push('Manager reviews are not Staff tasks; disabled assignees need replacement; late-payment follow-up and stock→return refresh; mobile follows current host without overriding explicit configuration');
const { defaultServiceSelection, serviceEstimatedTotal, serviceSelectionIssue } = await import(await moduleUrl(new URL('../src/utils/service-period.ts', import.meta.url)));
const { serviceDisplayName } = await import(await moduleUrl(new URL('../src/utils/service-labels.ts', import.meta.url)));
const shelfService = { id:'shelf',code:'SHELF_STANDARD',name:'Storage Shelf',kind:'RENTAL',billingUnit:'MONTH',unitPrice:120000,isActive:true };
assert.equal(defaultServiceSelection(shelfService,'2027-01-31','2027-02-15'),null);
const defaultMonth = defaultServiceSelection(shelfService,'2027-01-31','2027-03-15');
assert.equal(defaultMonth.serviceEndDate,'2027-02-28');
assert.equal(serviceEstimatedTotal(shelfService,defaultMonth,'2027-01-31','2027-03-15'),120000);
assert.equal(serviceEstimatedTotal(shelfService,{...defaultMonth,serviceEndDate:'2027-03-15'},'2027-01-31','2027-03-15'),null);
const dayService={...shelfService,id:'cart',billingUnit:'DAY',unitPrice:60000};
assert.equal(serviceEstimatedTotal(dayService,{serviceId:'cart',quantity:2,serviceStartDate:'2027-01-05',serviceEndDate:'2027-01-10'},'2027-01-01','2027-04-01'),600000);
assert(serviceSelectionIssue(dayService,{serviceId:'cart',quantity:0},'2027-01-01','2027-04-01'));
assert.equal(serviceDisplayName('SHELF_STANDARD','Storage Shelf'),'Kệ lưu trữ');
assert.equal(serviceDisplayName('SHELF_STANDARD','Kệ sắt tầng 1'),'Kệ sắt tầng 1');
assert.equal(serviceDisplayName('','Small Moving Box'),'Thùng carton nhỏ');
for (const file of ['service-period','service-labels','document-display']) assert.equal(await readFile(new URL('../src/utils/'+file+'.ts',import.meta.url),'utf8'),await readFile(new URL('../../mobile/src/utils/'+file+'.ts',import.meta.url),'utf8'));
const { documentText } = await import(await moduleUrl(new URL('../src/utils/document-display.ts', import.meta.url)));
assert.match(documentText('rentalAmount',1500000),/1\.500\.000/);
assert.equal(documentText('paymentPlan','PAY_MONTHLY'),'Thanh toán theo tháng');
assert.match(documentText('acceptedAt','2026-10-29T01:00:00Z'),/8:00|08:00/);
checks.push('Equipment defaults, subtotals, monthly end-date boundaries, Vietnamese labels, preserved custom names and matching web/mobile policies');
const rolePolicy = await import(await moduleUrl(new URL('../src/utils/operation-access.ts',import.meta.url)));
const sections = await import(await moduleUrl(new URL('../src/utils/manager-sections.ts',import.meta.url)));
assert.equal(sections.managerPrimaryMenu.length,7);
for(const page of rolePolicy.managerPages) assert(rolePolicy.isManagerDestination(page));
assert(!rolePolicy.isManagerDestination('invented-module'));
assert.equal(rolePolicy.staffWorkflows.length,9);
for(const resource of rolePolicy.staffWorkflows) for(const role of ['STAFF','MANAGER','ADMIN','CUSTOMER']) assert.equal(rolePolicy.canOperateResource(role,resource),role==='STAFF');
for(const resource of rolePolicy.managerResources) for(const role of ['STAFF','MANAGER','ADMIN','CUSTOMER']) assert.equal(rolePolicy.canOperateResource(role,resource),role==='MANAGER');
for(const role of ['STAFF','MANAGER','ADMIN','CUSTOMER']) assert(!rolePolicy.canOperateResource(role,'invented-module'));
for(const section of Object.values(sections.managerSections)) for(const item of section.items) { assert(item.web.startsWith('/manager/'));assert(item.mobile.startsWith('/manager/')); }
assert.equal(actionCountForPath([{id:'same',action:true,web:'/manager/operations/invoices/a'}],['/manager','/manager/operations/invoices']),1);
for(const file of ['manager-sections','manager-review-access']) assert.equal(await readFile(new URL('../src/utils/'+file+'.ts',import.meta.url),'utf8'),await readFile(new URL('../../mobile/src/utils/'+file+'.ts',import.meta.url),'utf8'));
checks.push('Explicit capability allowlists: nine Staff operations, seven Manager groups, no unknown resource grants, matching web/mobile policy and grouped badges without double counts');
const { quotePaymentSummary, quotePeriod } = await import(await moduleUrl(new URL('../src/utils/quote-payment-summary.ts',import.meta.url)));
const lockerQuote={paymentPlan:'PAY_MONTHLY',billingMode:'MONTHLY',termMonths:3,quotedTotalAmount:1950000,estimatedInitialAmountDue:650000,addOnTotalAmount:0,initialPaymentBreakdown:{rentalAmount:650000,depositAmount:0,remainingAmount:1300000}};
assert.deepEqual(quotePaymentSummary(lockerQuote),{first:650000,total:1950000,remaining:1300000,monthly:true,laterCount:2,laterEach:650000,plan:'Trả theo tháng'});
assert.equal(quotePaymentSummary({...lockerQuote,addOnTotalAmount:10000}).laterEach,null,'Do not promise equal later bills when services can vary');
assert.equal(quotePaymentSummary({...lockerQuote,paymentPlan:'PREPAID',quotedTotalAmount:1852500,estimatedInitialAmountDue:1852500,initialPaymentBreakdown:{remainingAmount:0}}).remaining,0);
assert.equal(quotePaymentSummary({grandTotal:1950000,paymentPlan:'PAY_MONTHLY'}).first,null,'An old quote total is not proof of an initial amount due');
assert.equal(quotePaymentSummary({estimatedInitialAmountDue:-1}).first,null);
assert.equal(quotePaymentSummary({estimatedInitialAmountDue:NaN}).first,null);
assert.match(quotePeriod('2026-10-30','2026-11-30'),/30\/10\/2026.*29\/11\/2026/);
assert.match(quotePeriod('2028-02-01','2028-03-01'),/29\/2\/2028/);
assert.equal(quotePeriod('2026-02-30','2026-04-01'),'');
assert.equal(await readFile(new URL('../src/utils/quote-payment-summary.ts',import.meta.url),'utf8'),await readFile(new URL('../../mobile/src/utils/quote-payment-summary.ts',import.meta.url),'utf8'));
checks.push('Upfront payment differs from full-term cost; correct 650k locker example, variable service installments, prepaid/legacy amounts, and inclusive end dates on web/mobile');
const { rentalChoice, normalizeRentalSearch } = await import(await moduleUrl(new URL('../src/utils/rental-choice.ts',import.meta.url)));
const rentalOption=rentalChoice({id:'own-contract',contractCode:'WDP-C01',storageType:{name:'Kho vừa D04',condition:'STANDARD'},storageUnit:{unitCode:'MD-D04-002',floor:'Ground',zone:'D04'},startDate:'2026-10-01',endDate:'2027-01-01'});
assert.equal(rentalOption.id,'own-contract');assert.equal(rentalOption.unitCode,'MD-D04-002');assert.equal(rentalOption.location,'Tầng trệt · Khu D04');
assert(rentalOption.search.includes(normalizeRentalSearch('kho vua')));assert(rentalOption.search.includes(normalizeRentalSearch('WDP-C01')));
assert.match(rentalOption.period,/31\/12\/2026/);
assert(!JSON.stringify(rentalChoice({id:'legacy'})).includes('undefined'));
assert.equal(await readFile(new URL('../src/utils/rental-choice.ts',import.meta.url),'utf8'),await readFile(new URL('../../mobile/src/utils/rental-choice.ts',import.meta.url),'utf8'));
checks.push('Warehouse choices retain contract IDs but show physical unit, name, Vietnamese location, inclusive term and matching accent-insensitive search on web/mobile');
console.log(JSON.stringify({ passed: checks, realDatabaseWrites: 0 }, null, 2));

// All /api/ calls are intercepted, including writes. No real database mutations.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.WDP_PLAYWRIGHT_MODULE || "playwright");
const base = process.env.WDP_FE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.WDP_BROWSER_PATH
    ? { executablePath: process.env.WDP_BROWSER_PATH }
    : {}),
});
const roles = ["MANAGER", "STAFF", "ADMIN", "CUSTOMER"];
const root = (role) => `/${role.toLowerCase()}`;
const user = (role) => ({
  id: `${role.toLowerCase()}-id`,
  fullName: `Tài khoản ${role}`,
  email: `${role.toLowerCase()}@example.test`,
  phone: "0900000000",
  role,
});
const when = "2026-10-11T03:00:00Z";
const storageType = {
  id: "type-id",
  name: "Kho nhỏ",
  code: "SMALL",
  dimensions: "1 × 2 × 3 m",
};
const unit = {
  id: "unit-id",
  unitCode: "A101",
  status: "OCCUPIED",
  physicalStatus: "OCCUPIED",
  floor: "Tầng 1",
  zone: "A",
};
const reservation = {
  id: "rental-id",
  reference: "RES-ACTIVE",
  status: "CONFIRMED",
  quantity: 1,
  storageType,
  customer: user("CUSTOMER"),
};
const quote = {
  status: "PRICED",
  currency: "VND",
  grandTotal: 2000000,
  quotedTotalAmount: 2000000,
  rentalAmount: 1000000,
  depositAmount: 1000000,
  paymentPlan: "PAY_MONTHLY",
  lineItems: [
    { code: "rent", label: "Tiền thuê", amount: 1000000, status: "INCLUDED" },
    { code: "deposit", label: "Tiền cọc", amount: 1000000, status: "INCLUDED" },
  ],
  message: "Báo giá lịch sử",
};
const rentalContract = {
  id: "contract-id",
  contractCode: "CON-ACTIVE",
  status: "ACTIVE",
  startDate: "2020-01-01",
  endDate: "2020-02-01",
  unit,
};
const rental = {
  reservationId: "rental-id",
  reservationReference: "RES-ACTIVE",
  storageType,
  customer: user("CUSTOMER"),
  quantity: 1,
  startDate: "2020-01-01",
  endDate: "2020-02-01",
  effectiveEndDate: "2020-02-01",
  isOverdue: true,
  rentalState: "OVERDUE",
  unitCount: 1,
  contracts: [rentalContract],
  pendingRenewal: null,
  billingSummary: { totalOutstanding: 0 },
};
const publicReservation = {
  ...reservation,
  id: "RES-ACTIVE",
  product: storageType,
  quote,
  startDate: "2020-01-01",
  endDateExclusive: "2020-02-01",
  periodMode: "duration",
  durationMonths: 1,
  adjacencyPreference: false,
  createdAt: when,
};
const writes = [],
  reads = [],
  errors = [],
  forbidden = [],
  checks = [];
let failSupport = true,
  expireRole = "",
  failSource = "";

function fixtures() {
  const staff = user("STAFF");
  return {
    staff: {
      appointments: [
        {
          id: "handover-id",
          appointmentCode: "APP-STAFF",
          status: "CONFIRMED",
          scheduledAt: "2030-11-01T03:00:00Z",
          customer: user("CUSTOMER"),
          reservation,
          allocatedUnits: [
            {
              unitCode: "A101",
              contractCode: "CON-ACTIVE",
              unitStatus: "RESERVED",
            },
          ],
          createdAt: when,
        },
      ],
      rentals: [rental],
      returns: [
        {
          id: "return-id",
          returnCode: "RET-STAFF",
          status: "REQUESTED",
          reservation,
          customer: user("CUSTOMER"),
          inspections: [
            {
              id: "inspection-id",
              unit,
              contract: rentalContract,
              result: "PENDING",
            },
          ],
          inspectionSummary: { total: 1, pending: 1, passed: 0, issues: 0 },
          createdAt: when,
        },
      ],
      maintenance: Array.from({ length: 105 }, (_, i) => ({
        id: `maintenance-${i}`,
        maintenanceCode: `MNT-${i}`,
        status: "OPEN",
        unit: { ...unit, status: "MAINTENANCE" },
        assignedStaff:
          i === 1
            ? { ...staff, id: "another-staff-id", fullName: "Nhân viên khác" }
            : staff,
        category: "UNIT_DAMAGE",
        priority: "HIGH",
        description: "Khóa cần sửa",
        createdAt: when,
      })),
      "support-requests": [
        {
          id: "support-id",
          supportCode: "SUP-STAFF",
          status: "ASSIGNED",
          assignedStaff: staff,
          customer: user("CUSTOMER"),
          reservation,
          subject: "Hỗ trợ khóa",
          description: "Khóa bị kẹt",
          category: "LOCK_OR_KEY_ISSUE",
          priority: "MEDIUM",
          createdAt: when,
        },
      ],
      transfers: [
        {
          id: "transfer-id",
          transferCode: "TRF-APPROVED",
          status: "APPROVED",
          reason: "UNIT_ISSUE",
          reservation,
          contract: rentalContract,
          fromUnit: { ...unit, unitCode: "A101", storageType },
          toUnit: { ...unit, id: "unit-target", unitCode: "A102", status: "RESERVED", storageType },
          approvedBy: user("MANAGER"),
          completedBy: null,
          approvedAt: when,
          completedAt: null,
          createdAt: when,
        },
      ],
    },
    customer: {
      contracts: Array.from({ length: 105 }, (_, i) => ({
        ...rentalContract,
        id: `contract-${i}`,
        contractCode: `CON-${i}`,
        reservation:
          i === 0
            ? { id: "ready-id", reference: "RES-READY", quantity: 1 }
            : { id: `book-${i}`, reference: `RES-${i}`, quantity: 1 },
        status: i === 0 ? "READY_FOR_HANDOVER" : "ACTIVE",
        storageType,
        storageUnit: unit,
      })),
      rentals: [
        rental,
        {
          ...rental,
          reservationId: "pending-rental",
          reservationReference: "RES-PENDING",
          pendingRenewal: {
            renewalCode: "REN-PENDING",
            status: "PENDING",
            requestedEndDate: "2030-12-01",
          },
        },
      ],
      invoices: Array.from({ length: 105 }, (_, i) => ({
        id: `invoice-${i}`,
        invoiceCode: `INV-${i}`,
        reservation,
        type: "INITIAL",
        status: "OPEN",
        totalAmount: 2000000,
        amountPaid: 0,
        balanceDue: 2000000,
        currency: "VND",
        issuedAt: when,
        dueAt: "2030-11-01",
      })),
      payments: [
        {
          id: "payment-id",
          paymentCode: "PAY-1",
          invoice: { invoiceCode: "INV-0" },
          amount: 1000000,
          method: "CASH",
          receivedAt: when,
        },
      ],
      "payment-submissions": [],
      appointments: [
        {
          id: "past-id",
          appointmentCode: "APP-PAST",
          status: "REQUESTED",
          scheduledAt: "2020-01-01T03:00:00Z",
          reservation: { id: "past-rental", reference: "RES-PAST" },
          allocatedUnits: [],
          createdAt: when,
        },
      ],
      renewals: [],
      returns: [],
      "deposit-settlements": [],
      "support-requests": [],
    },
    reservations: [
      publicReservation,
      { ...publicReservation, id: "RES-READY", status: "CONFIRMED" },
      ...Array.from({ length: 103 }, (_, i) => ({
        ...publicReservation,
        id: `RES-${i}`,
        status: "PENDING",
      })),
    ],
  };
}
async function setup(initialRole, authenticated = true) {
  const data = fixtures();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "UTC",
  });
  context.setDefaultTimeout(15000);
  if (authenticated)
    await context.addInitScript((token) => {
      if (!localStorage.getItem("wdp-fixture-initialized")) {
        localStorage.setItem("wdp-auth-token-v1", token);
        localStorage.setItem("wdp-fixture-initialized", "true");
      }
    }, `token-${initialRole}`);
  await context.route(/\/api\//, async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace(/^\/api\//, ""),
      method = request.method();
    const role =
      request.headers().authorization?.replace("Bearer token-", "") ?? "";
    const send = (value, status = 200) =>
      route.fulfill({ json: value, status });
    if (path === "auth/me")
      return roles.includes(role)
        ? send(user(role))
        : send({ message: "Phiên hết hạn" }, 401);
    if (path === "auth/login" || path === "auth/register")
      return send({ token: `token-${initialRole}`, user: user(initialRole) });
    if (path === "auth/logout") return send({ ok: true });
    if (path === "health")
      return send({ status: "ok", service: "WDP", timestamp: when });
    if (path === 'payments/vnpay/return') return send({ valid: true, transaction: { merchantOrderRef: 'WDP-VNPAY-TEST', status: 'SUCCESS', amount: 2000000 }, invoice: { invoiceCode: 'INV-0', status: 'PAID' }, providerResponseCode: '00' });
    if (path === "booking/catalog")
      return send({
        products: [
          { ...storageType, monthlyPrice: 1000000, status: "available" },
        ],
        sizes: [],
      });
    if (role === expireRole) return send({ message: "Phiên hết hạn" }, 401);
    const prefix = path.split("/")[0];
    const allowed =
      prefix === "admin"
        ? role === "ADMIN"
        : prefix === "manager"
          ? ["MANAGER", "ADMIN"].includes(role)
          : prefix === "staff"
            ? ["STAFF", "MANAGER", "ADMIN"].includes(role)
            : role === "CUSTOMER";
    if (!allowed) {
      forbidden.push({ path, role });
      return send({ message: "Forbidden" }, 403);
    }
    if (path === failSource)
      return send({ message: "Không thể tải hồ sơ kiểm thử" }, 503);
    if (method !== "GET") {
      const body = request.postData() ? request.postDataJSON() : undefined;
      writes.push({
        role,
        path,
        method,
        body,
        key: request.headers()["idempotency-key"],
      });
      if (/^customer\/invoices\/[^/]+\/online-payment$/.test(path)) {
        return send({
          transactionId: "online-payment-id",
          merchantOrderRef: "WDP-VNPAY-TEST",
          status: "PENDING",
          amount: 2000000,
          paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?test=wdp',
        }, 201);
      }
      if (/^customer\/invoices\/[^/]+\/payment-submissions$/.test(path)) {
        const invoice = data.customer.invoices.find((item) => item.id === path.split("/")[2]);
        const submission = {
          id: "payment-submission-id",
          submissionCode: "PS-TEST",
          status: "PENDING_VERIFICATION",
          amount: body.amount,
          method: "BANK_TRANSFER",
          transferReference: body.transferReference,
          customerNote: body.customerNote,
          submittedAt: when,
          reviewedAt: null,
          reviewedBy: null,
          rejectionReason: null,
          verifiedPayment: null,
          customer: user("CUSTOMER"),
          invoice,
          createdAt: when,
          updatedAt: when,
        };
        data.customer["payment-submissions"].push(submission);
        return send(submission, 201);
      }
      if (path.startsWith("staff/")) {
        assert.equal(role, "STAFF");
        const [, resource, id, action] = path.split("/");
        if (resource === "transfers") return send({ status: "COMPLETED" });
        if (resource === "maintenance" && !id) {
          data.staff.maintenance.push({
            id: "reported-id",
            maintenanceCode: "MNT-REPORTED",
            status: "OPEN",
            unit,
            assignedStaff: null,
            ...body,
          });
          return send(data.staff.maintenance.at(-1));
        }
        const row = data.staff[resource].find((item) => item.id === id);
        assert(row, path);
        if (["start", "complete-work", "resolve", "escalate"].includes(action))
          assert.equal(row.assignedStaff.id, user(role).id);
        if (action === "start") row.status = "IN_PROGRESS";
        if (action === "complete-work") {
          row.status = "AWAITING_VERIFICATION";
          row.workNote = body.workNote;
        }
        if (action === "resolve") {
          assert(
            !["MANAGER_RESOLVED", "TRANSFER_RECOMMENDED"].includes(
              body.resolutionType,
            ),
          );
          row.status = "RESOLVED";
          row.resolutionNote = body.resolutionNote;
        }
        if (action === "escalate") {
          row.status = "ESCALATED";
          row.escalationReason = body.reason;
        }
        if (action === "complete-handover") row.status = "COMPLETED";
        if (action === "start-inspection")
          row.status = "INSPECTION_IN_PROGRESS";
        if (action === "inspections") {
          assert.equal(body.approvedChargeAmount, undefined);
          if (body.result === "ISSUE_FOUND")
            assert(body.issueNote?.trim().length >= 3);
          Object.assign(row.inspections[0], body, {
            inspectedBy: user(role),
            inspectedAt: when,
          });
          row.inspectionSummary.pending = 0;
          row.inspectionSummary.passed = body.result === "PASS" ? 1 : 0;
          if (body.result === "ISSUE_FOUND") row.status = "ISSUE_FOUND";
        }
        if (action === "finalize") {
          assert.equal(row.inspectionSummary.pending, 0);
          row.status = "PENDING_SETTLEMENT";
        }
        return send(row);
      }
      assert.equal(role, "CUSTOMER");
      const resource = path.split("/")[1];
      if (resource === "support-requests" && failSupport) {
        failSupport = false;
        return send(
          { message: "Mất phản hồi kiểm thử; thử lại cùng dữ liệu." },
          503,
        );
      }
      const created = {
        id: `created-${resource}`,
        ...body,
        reservation,
        storageType,
        status: "REQUESTED",
        createdAt: when,
        allocatedUnits: [],
        inspectionSummary: { total: 1, passed: 0, pending: 1, issues: 0 },
        inspections: [],
        quoteSnapshot: { totalAmount: 1000000, currency: "VND" },
        supportCode: "SUP-CREATED",
        renewalCode: "REN-CREATED",
        returnCode: "RET-CREATED",
        appointmentCode: "APP-CREATED",
      };
      if (resource === "appointments")
        created.reservation = {
          id: body.reservationId,
          reference: "RES-READY",
        };
      data.customer[resource].push(created);
      return send(created);
    }
    reads.push({ role, path, page: Number(url.searchParams.get("page") ?? 1) });
    if (path === "customer/payment-config") return send({ configured: true, bankName: "Ngân hàng kiểm thử", bankCode: "970436", accountNumber: "123456789", accountName: "WDP STORAGE" });
    if (path === "payments/vnpay/return") return send({ valid: true, transaction: { merchantOrderRef: "WDP-VNPAY-TEST", status: "SUCCESS", amount: 2000000 }, invoice: { invoiceCode: "INV-0", status: "PAID" }, providerResponseCode: "00" });
    if (path === "reservations") return send(data.reservations);
    if (path.startsWith("reservations/"))
      return send(
        data.reservations.find(
          (item) => item.id === decodeURIComponent(path.split("/")[1]),
        ) ?? data.reservations[0],
      );
    if (path === "manager/dashboard/summary")
      return send({ availableUnits: 1, occupiedUnits: 1 });
    let items;
    if (prefix === "admin")
      items = [
        user("STAFF"),
        user("MANAGER"),
        user("ADMIN"),
        user("CUSTOMER"),
      ].map((value) => ({ ...value, accountStatus: "ACTIVE" }));
    else {
      const resource = path.split("/")[1];
      items =
        (prefix === "staff"
          ? data.staff[resource]
          : prefix === "customer"
            ? data.customer[resource]
            : resource === "units"
              ? [{ ...unit, storageType }]
              : data.customer[resource]) ?? [];
    }
    const id = path.split("/")[2];
    if (id)
      return send(
        items.find(
          (row) => (row.id ?? row.reservationId) === decodeURIComponent(id),
        ) ?? items[0],
      );
    const page = Number(url.searchParams.get("page") || 1),
      limit = Number(url.searchParams.get("limit") || 20);
    return send({
      page,
      limit,
      total: items.length,
      items: items.slice((page - 1) * limit, page * limit),
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
        /unique|nesting|descendant|Received NaN/.test(message.text())
    )
      errors.push(message.text());
  });
  return { context, page, data };
}
async function open(page, path) {
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
  await page.locator("h1").first().waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".portal-loading, .customer-state--loading"),
  );
}
async function ownLinks(page, role) {
  const wrong = await page
    .locator("a[href]")
    .evaluateAll(
      (links, own) =>
        links
          .map((link) => link.getAttribute("href"))
          .filter(
            (href) =>
              /^\/(manager|staff|admin|customer)(\/|$)/.test(href) &&
              !href.startsWith(own + "/") &&
              href !== own,
          ),
      root(role),
    );
  assert.deepEqual(wrong, [], `${role} has cross-role links`);
}
async function savedLogin(role, entry, loginPage) {
  const app = await setup(role, false);
  await app.page.goto(base + entry);
  await app.page.waitForURL((url) => url.pathname === loginPage);
  await app.page.getByLabel("Email", { exact: true }).fill(user(role).email);
  await app.page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("FixturePassword123!");
  await app.page
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .click();
  await app.page.waitForURL(base + entry);
  await app.context.close();
}
try {
  for (const role of roles) {
    const app = await setup(role);
    for (const target of roles) {
      await open(app.page, root(target));
      const expected = root(role);
      assert.equal(
        new URL(app.page.url()).pathname,
        expected,
        `${role} entering ${target}`,
      );
      await ownLinks(app.page, role);
    }
    await open(app.page, root(role) + "/missing-route");
    assert(
      (await app.page.locator("h1").innerText()).includes("Không tìm thấy"),
    );
    assert(new URL(app.page.url()).pathname.startsWith(root(role)));
    if (role !== "CUSTOMER") {
      await open(app.page, "/booking");
      assert.equal(new URL(app.page.url()).pathname, root(role));
    }
    await open(
      app.page,
      "/account/login?returnTo=" +
        encodeURIComponent(
          role === "CUSTOMER" ? "/staff/maintenance" : "/customer/returns",
        ),
    );
    assert.equal(new URL(app.page.url()).pathname, root(role));
    for (const unsafe of [
      "//external.example.test",
      root(role) + "/../" + (role === "CUSTOMER" ? "manager" : "customer"),
    ]) {
      await open(
        app.page,
        "/account/login?returnTo=" + encodeURIComponent(unsafe),
      );
      assert.equal(new URL(app.page.url()).pathname, root(role));
    }
    if (role === "MANAGER") {
      const basePath = "/manager";
      await open(app.page, basePath + "/operations/constructor");
      assert.match(await app.page.locator("h1").innerText(), /Không tìm thấy/);
    }
    await app.context.close();
  }
  checks.push(
    "16 role/workspace combinations and unknown private routes retain the correct workspace",
  );
  await savedLogin(
    "STAFF",
    "/staff/maintenance?mine=true#work",
    "/portal/login",
  );
  await savedLogin(
    "CUSTOMER",
    "/customer/payments?page=2#invoice",
    "/account/login",
  );
  checks.push(
    "Staff and customer saved login destinations preserve query and hash",
  );
  const staff = await setup("STAFF");
  for (const resource of Object.keys(staff.data.staff)) {
    await open(staff.page, `/staff/${resource}`);
    await ownLinks(staff.page, "STAFF");
    const row = staff.data.staff[resource][0];
    await open(staff.page, `/staff/${resource}/${row.id ?? row.reservationId}`);
    assert.equal(await staff.page.getByRole("alert").count(), 0);
    await ownLinks(staff.page, "STAFF");
    assert(
      !/Còn phải trả|Tổng tiền|Duyệt charge|Duyệt gia hạn/.test(
        await staff.page.locator("main").innerText(),
      ),
    );
  }
  await open(staff.page, "/staff/maintenance?search=MNT-104");
  await staff.page
    .getByRole("cell", { name: "MNT-104", exact: true })
    .waitFor();
  await open(staff.page, "/staff/appointments?date=2030-11-01");
  await staff.page.getByText("APP-STAFF", { exact: true }).waitFor();
  await staff.page
    .getByLabel("Ngày bàn giao", { exact: true })
    .fill("2030-11-02");
  await staff.page
    .getByText("Không tìm thấy dữ liệu", { exact: true })
    .waitFor();
  assert(
    reads.some(
      (item) =>
        item.role === "STAFF" &&
        item.path === "staff/maintenance" &&
        item.page === 2,
    ),
  );
  failSource = "staff/maintenance/maintenance-0";
  await open(staff.page, "/staff/maintenance/maintenance-0");
  await staff.page
    .getByRole("alert")
    .filter({ hasText: "Không thể tải hồ sơ kiểm thử" })
    .waitFor();
  assert.equal(
    await staff.page
      .getByRole("button", { name: "Bắt đầu sửa chữa", exact: true })
      .count(),
    0,
  );
  failSource = "";
  await staff.page
    .getByRole("button", { name: "Thử lại", exact: true })
    .click();
  await staff.page
    .getByRole("button", { name: "Bắt đầu sửa chữa", exact: true })
    .waitFor();
  await open(staff.page, "/staff/maintenance/maintenance-1");
  assert.equal(
    await staff.page
      .getByRole("button", { name: "Bắt đầu sửa chữa", exact: true })
      .count(),
    0,
  );
  await open(staff.page, "/staff/maintenance/maintenance-0");
  await staff.page
    .getByRole("button", { name: "Bắt đầu sửa chữa", exact: true })
    .click();
  await staff.page
    .getByLabel("Kết quả sửa chữa", { exact: true })
    .fill("Đã sửa và kiểm tra khóa.");
  await staff.page
    .getByRole("button", { name: "Gửi kết quả để nghiệm thu", exact: true })
    .click();
  await staff.page
    .getByText("Đang chờ quản lý nghiệm thu. Kho vẫn ở trạng thái bảo trì.", {
      exact: true,
    })
    .waitFor();
  await open(staff.page, "/staff/support-requests/support-id");
  await staff.page
    .getByRole("button", { name: "Bắt đầu hỗ trợ", exact: true })
    .click();
  assert.equal(
    await staff.page
      .getByRole("option", { name: "Quản lý đã giải quyết", exact: true })
      .count(),
    0,
  );
  await staff.page
    .getByLabel("Lý do chuyển quản lý", { exact: true })
    .fill("Cần quản lý đánh giá trách nhiệm.");
  await staff.page
    .getByRole("button", { name: "Chuyển quản lý xem xét", exact: true })
    .click();
  await staff.page
    .getByText("Đã chuyển cho quản lý xem xét.", { exact: true })
    .waitFor();
  await open(staff.page, "/staff/appointments/handover-id");
  await staff.page
    .getByLabel("Đã bàn giao thực tế đầy đủ các kho trong lịch này", {
      exact: true,
    })
    .check();
  await staff.page
    .getByRole("button", { name: "Hoàn tất bàn giao", exact: true })
    .click();
  await staff.page
    .getByText("Lịch này không còn thao tác bàn giao.", { exact: true })
    .waitFor();
  await open(staff.page, "/staff/returns/return-id");
  await staff.page
    .getByRole("button", { name: "Bắt đầu kiểm tra", exact: true })
    .click();
  assert(
    await staff.page
      .getByRole("button", { name: "Hoàn tất nhận kho trả", exact: true })
      .isDisabled(),
  );
  await staff.page
    .getByLabel("Ghi chú hiện trạng", { exact: true })
    .fill("Kho sạch, đã dọn hết hàng.");
  await staff.page
    .getByRole("button", { name: "Lưu kết quả kho A101", exact: true })
    .click();
  await staff.page
    .getByLabel("Đã nhận lại thực tế toàn bộ kho và ghi đủ kết quả kiểm tra", {
      exact: true,
    })
    .check();
  await staff.page
    .getByRole("button", { name: "Hoàn tất nhận kho trả", exact: true })
    .click();
  await staff.page
    .getByText(
      "Đã nhận kho trả. Quyết toán tiền cọc được quản lý xử lý riêng.",
      { exact: true },
    )
    .waitFor();
  await open(staff.page, "/staff/transfers");
  await staff.page
    .getByRole("link", { name: /Thực hiện/ })
    .click();
  await staff.page
    .getByLabel(
      "Đã hoàn tất chuyển thực tế và bàn giao kho đích",
      { exact: true },
    )
    .check();
  await staff.page
    .getByRole("button", { name: "Hoàn tất chuyển kho", exact: true })
    .click();
  await staff.page
    .getByRole("status")
    .filter({ hasText: "Đã hoàn tất chuyển kho thực tế." })
    .waitFor();
  staff.data.staff["support-requests"].push({
    ...structuredClone(staff.data.staff["support-requests"][0]),
    id: "support-resolve",
    supportCode: "SUP-RESOLVE",
    status: "ASSIGNED",
  });
  await open(staff.page, "/staff/support-requests/support-resolve");
  await staff.page
    .getByRole("button", { name: "Bắt đầu hỗ trợ", exact: true })
    .click();
  await staff.page
    .getByLabel("Nội dung xử lý", { exact: true })
    .fill("Đã hướng dẫn và khắc phục tại chỗ.");
  await staff.page
    .getByRole("button", { name: "Hoàn tất hỗ trợ", exact: true })
    .click();
  await staff.page
    .getByText("Yêu cầu đã được giải quyết.", { exact: true })
    .waitFor();
  await open(staff.page, "/staff/maintenance");
  await staff.page
    .getByLabel("Mã định danh kho", { exact: true })
    .fill("available-unit-id");
  await staff.page
    .getByLabel("Mô tả sự cố", { exact: true })
    .fill("Kho cần kiểm tra khóa trước khi cho thuê.");
  await staff.page
    .getByRole("button", { name: "Gửi báo cáo sự cố", exact: true })
    .click();
  await staff.page
    .getByText("Đã ghi nhận sự cố bảo trì.", { exact: true })
    .waitFor();
  const issueReturn = structuredClone(staff.data.staff.returns[0]);
  issueReturn.id = "return-issue";
  issueReturn.status = "INSPECTION_IN_PROGRESS";
  issueReturn.inspections[0].result = "PENDING";
  issueReturn.inspectionSummary.pending = 1;
  staff.data.staff.returns.push(issueReturn);
  await open(staff.page, "/staff/returns/return-issue");
  await staff.page
    .getByLabel("Kết quả kiểm tra", { exact: true })
    .selectOption("ISSUE_FOUND");
  await staff.page
    .getByLabel("Mô tả vấn đề", { exact: true })
    .fill("Khóa có dấu hiệu hỏng, cần quản lý đánh giá.");
  await staff.page
    .getByRole("button", { name: "Lưu kết quả kho A101", exact: true })
    .click();
  await staff.page.waitForFunction(
    () => !document.querySelector('select option[value="PASS"]'),
  );
  assert.equal(
    await staff.page.getByRole("option", { name: "Đạt", exact: true }).count(),
    0,
  );
  checks.push(
    "Staff lists/details, full pagination, assignment guards, maintenance report/repair, support resolve/escalation, handover, PASS/ISSUE inspection and physical transfer",
  );
  const customer = await setup("CUSTOMER");
  await customer.context.route('https://sandbox.vnpayment.vn/**', route => route.fulfill({ status: 302, headers: { location: `${base}/customer/payments/vnpay-return?vnp_TxnRef=WDP-VNPAY-TEST&vnp_SecureHash=signed-test` } }));
  const customerPages = [
    "",
    "reservations",
    "contracts",
    "rentals",
    "payments",
    "appointments",
    "renewals",
    "returns",
    "support",
    "transfers",
    "profile",
    "reservations/RES-ACTIVE",
  ];
  for (const path of customerPages) {
    await open(customer.page, `/customer${path ? "/" + path : ""}`);
    assert.equal(await customer.page.getByRole("alert").count(), 0, path);
    await ownLinks(customer.page, "CUSTOMER");
    assert(
      !/NaN|undefined/.test(await customer.page.locator("main").innerText()),
      path,
    );
  }
  await open(customer.page, "/customer/payments");
  await customer.page.getByRole("button", { name: "Chuyển khoản QR", exact: true }).first().click();
  await customer.page.getByRole("button", { name: "Tôi đã chuyển khoản", exact: true }).click();
  await customer.page.getByText("Mã yêu cầu: PS-TEST", { exact: true }).waitFor();
  await customer.page.getByRole("button", { name: "Xem trạng thái yêu cầu", exact: true }).click();
  customer.data.customer["payment-submissions"] = [];
  await open(customer.page, "/customer/payments");
  await customer.page.getByRole("button", { name: "Thanh toán VNPay", exact: true }).first().click();
  await customer.page.waitForURL((url) => url.pathname === "/customer/payments/vnpay-return");
  await customer.page.getByRole("heading", { name: "Thanh toán thành công", exact: true }).waitFor();
  assert.match(writes.findLast((item) => item.path.endsWith("/online-payment")).key, /^cust-vnpay-/);
  await open(customer.page, "/customer/contracts?page=6");
  await customer.page.getByText("CON-104", { exact: true }).waitFor();
  assert(
    reads.some(
      (item) =>
        item.role === "CUSTOMER" &&
        item.path === "customer/contracts" &&
        item.page === 2,
    ),
  );
  await open(customer.page, "/customer/support");
  assert.equal(
    await customer.page
      .getByRole("option", { name: "RES-ACTIVE", exact: true })
      .count(),
    1,
    "No duplicate database ID/reference options",
  );
  await customer.page
    .getByLabel("Reservation", { exact: true })
    .selectOption("RES-ACTIVE");
  await customer.page
    .getByLabel("Hợp đồng liên quan", { exact: true })
    .selectOption("contract-id");
  assert.equal(
    await customer.page
      .getByLabel("Kho liên quan", { exact: true })
      .inputValue(),
    "unit-id",
  );
  await customer.page
    .getByLabel("Tiêu đề", { exact: true })
    .fill("Khóa đang gặp sự cố");
  await customer.page
    .getByLabel("Chi tiết", { exact: true })
    .fill("Cần nhân viên kiểm tra khóa.");
  await customer.page
    .getByRole("button", { name: "Gửi yêu cầu", exact: true })
    .click();
  await customer.page
    .getByRole("status")
    .filter({ hasText: "Mất phản hồi kiểm thử" })
    .waitFor();
  const first = writes.at(-1);
  await customer.page
    .getByRole("button", { name: "Gửi yêu cầu", exact: true })
    .click();
  await customer.page
    .getByRole("status")
    .filter({ hasText: "Đã gửi yêu cầu hỗ trợ" })
    .waitFor();
  assert.equal(writes.at(-1).key, first.key);
  assert.equal(writes.at(-1).role, "CUSTOMER");
  await open(customer.page, "/customer/appointments");
  await customer.page
    .getByLabel("Reservation", { exact: true })
    .selectOption("ready-id");
  await customer.page
    .getByLabel("Ngày giờ mong muốn", { exact: true })
    .fill("2030-11-01T10:00");
  await customer.page
    .getByRole("button", { name: "Gửi yêu cầu", exact: true })
    .click();
  await customer.page
    .getByRole("status")
    .filter({ hasText: "Đã gửi yêu cầu lịch bàn giao" })
    .waitFor();
  assert.equal(
    writes.at(-1).body.scheduledAt,
    "2030-11-01T03:00:00.000Z",
    "Appointment input uses the facility timezone",
  );
  await open(customer.page, "/customer/renewals");
  assert.equal(
    await customer.page
      .getByRole("option")
      .filter({ hasText: "RES-PENDING" })
      .count(),
    0,
  );
  await customer.page
    .getByLabel("Kho đang thuê", { exact: true })
    .selectOption("rental-id");
  await customer.page
    .getByRole("button", { name: "Gửi yêu cầu gia hạn", exact: true })
    .click();
  await customer.page
    .getByRole("status")
    .filter({ hasText: "Đã gửi yêu cầu gia hạn" })
    .waitFor();
  await open(customer.page, "/customer/returns");
  await customer.page
    .getByLabel("Rental đã đến hạn", { exact: true })
    .selectOption("rental-id");
  await customer.page
    .getByRole("button", { name: "Gửi yêu cầu trả kho", exact: true })
    .click();
  await customer.page
    .getByRole("status")
    .filter({ hasText: "Đã gửi yêu cầu trả kho" })
    .waitFor();
  failSource = "customer/contracts";
  await open(customer.page, "/customer/appointments");
  await customer.page
    .getByRole("alert")
    .filter({ hasText: "Không thể tải hồ sơ kiểm thử" })
    .waitFor();
  assert(
    await customer.page.getByLabel("Reservation", { exact: true }).isDisabled(),
  );
  failSource = "";
  checks.push(
    "All customer pages, full pagination, valid next actions, deduplicated reservation selection, all four submit flows, stable retry and visible dependency errors",
  );
  for (const [app, role, path] of [
    [staff, "STAFF", "/staff/maintenance"],
    [customer, "CUSTOMER", "/customer/support"],
  ]) {
    await app.page.setViewportSize({ width: 390, height: 844 });
    await open(app.page, path);
    assert(
      await app.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${role} mobile overflow`,
    );
    if (role === "STAFF") {
      await app.page
        .getByRole("button", { name: "Mở điều hướng", exact: true })
        .click();
      await app.page
        .getByRole("dialog")
        .getByRole("link", { name: "Hỗ trợ khách hàng", exact: true })
        .click();
    } else {
      await app.page
        .getByRole("button", { name: "Mở menu", exact: true })
        .click();
      await app.page.keyboard.press("Escape");
      await app.page
        .getByRole("button", { name: "Mở menu", exact: true })
        .waitFor();
      assert.equal(
        await app.page
          .getByRole("button", { name: "Mở menu", exact: true })
          .getAttribute("aria-expanded"),
        "false",
      );
      await app.page
        .getByRole("button", { name: "Mở menu", exact: true })
        .click();
      await app.page
        .locator(".customer-sidebar")
        .getByRole("link", { name: "Hỗ trợ", exact: true })
        .click();
    }
    await ownLinks(app.page, role);
    if (process.env.WDP_SCREENSHOTS_DIR) {
      await mkdir(process.env.WDP_SCREENSHOTS_DIR, { recursive: true });
      await app.page.screenshot({
        path: `${process.env.WDP_SCREENSHOTS_DIR}/${role.toLowerCase()}-mobile.png`,
        fullPage: true,
      });
    }
  }
  checks.push("390px staff/customer layouts and mobile navigation");
  await staff.page.setViewportSize({ width: 1440, height: 1000 });
  const secondTab = await staff.context.newPage();
  await open(secondTab, "/staff");
  await secondTab.evaluate(() =>
    localStorage.setItem("wdp-auth-token-v1", "token-CUSTOMER"),
  );
  await staff.page.waitForURL(base + "/customer");
  assert(
    (await staff.page.locator(".customer-brand").innerText())
      .toLocaleLowerCase("vi")
      .includes("khu vực khách hàng"),
  );
  checks.push(
    "Switching account in another tab revalidates role and removes the previous workspace",
  );
  expireRole = "CUSTOMER";
  await open(customer.page, "/customer/payments?page=2#invoice");
  await customer.page.waitForURL((url) => url.pathname === "/account/login");
  assert.equal(
    await customer.page.evaluate(() =>
      localStorage.getItem("wdp-auth-token-v1"),
    ),
    null,
  );
  assert.equal(
    new URL(customer.page.url()).searchParams.get("returnTo"),
    "/customer/payments?page=2#invoice",
  );
  expireRole = "";
  checks.push(
    "Expired customer sessions clear auth and preserve the current destination",
  );
  await customer.page
    .getByLabel("Email", { exact: true })
    .fill(user("CUSTOMER").email);
  await customer.page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("FixturePassword123!");
  await customer.page
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .click();
  await customer.page.waitForURL(
    (url) => url.pathname === "/customer/payments",
  );
  await customer.page.setViewportSize({ width: 1440, height: 1000 });
  await customer.page
    .getByRole("button", { name: "Đăng xuất", exact: true })
    .click();
  await customer.page.waitForURL((url) => url.pathname === "/account/login");
  await customer.page.reload();
  await customer.page
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .waitFor();
  assert.equal(
    await customer.page.evaluate(() =>
      localStorage.getItem("wdp-auth-token-v1"),
    ),
    null,
  );
  checks.push(
    "Logout and reload do not restore the previous authenticated workspace",
  );
  await staff.context.close();
  await customer.context.close();
  assert.deepEqual(
    forbidden,
    [],
    "UI must not request another role's restricted APIs",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: checks,
        mockedWrites: writes.length,
        crossRoleApiRequests: forbidden.length,
        browserErrors: errors.length,
        realDatabaseWrites: 0,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}

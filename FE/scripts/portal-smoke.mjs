// All API requests are intercepted. This test never changes the real database.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.WDP_PLAYWRIGHT_MODULE || "playwright");
const base = process.env.WDP_FE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.WDP_BROWSER_PATH
    ? { executablePath: process.env.WDP_BROWSER_PATH }
    : {}),
});
const customer = {
  id: "customer-id",
  fullName: "Khách kiểm thử",
  email: "customer@example.test",
  phone: "0900000000",
};
const staff = {
  id: "staff-id",
  fullName: "Nhân viên kiểm thử",
  role: "STAFF",
  accountStatus: "ACTIVE",
  email: "staff@example.test",
  phone: "0900000001",
};
const storageType = { id: "type-id", code: "TEST", name: "Loại kho kiểm thử" };
const unit = {
  id: "unit-id",
  unitCode: "A101",
  status: "AVAILABLE",
  storageType,
  floor: "Tầng 1",
  zone: "A",
};
const reservation = {
  id: "reservation-id",
  reference: "RES-TEST",
  status: "CONFIRMED",
  quantity: 1,
  customer,
  storageType,
  startDate: "2026-10-01",
  endDate: "2027-01-01",
};
const quote = {
  rentalAmount: 1000000,
  depositAmount: 1000000,
  quotedTotalAmount: 2000000,
  paymentPlan: "PAY_MONTHLY",
  lineItems: [],
};
const when = "2026-10-11T03:00:00.000Z";
const fixture = {
  units: [
    {
      ...unit,
      category: { id: "small", name: "Kho nhỏ" },
      condition: "STANDARD",
      dimensions: { display: "1 × 2 × 3 m" },
      allocationSummary: { current: null, future: [] },
      currentAllocation: null,
      futureAllocations: [],
      allocations: [],
      createdAt: when,
      updatedAt: when,
    },
  ],
  customers: [
    {
      ...customer,
      accountStatus: "ACTIVE",
      reservationCount: 1,
      reservations: [reservation],
      latestReservation: reservation,
      createdAt: when,
      updatedAt: when,
    },
  ],
  reservations: Array.from({ length: 105 }, (_, index) => ({
    ...reservation,
    id: `reservation-${index}`,
    reference: `RES-${index}`,
    requestType: "RESERVATION",
    status: "PENDING",
    product: storageType,
    endDateExclusive: "2027-01-01",
    quote,
    allocatedUnits: [],
    createdAt: when,
    updatedAt: when,
  })),
  inquiries: [
    {
      ...reservation,
      id: "inquiry-id",
      reference: "INQ-TEST",
      requestType: "INQUIRY",
      status: "PENDING_CONTACT",
      product: storageType,
      quote,
      createdAt: when,
      internalNotes: "Ghi chú ban đầu",
    },
    {
      ...reservation,
      requestType: "RESERVATION",
      product: storageType,
      quote,
      createdAt: when,
    },
  ],
  appointments: [
    {
      id: "appointment-id",
      appointmentCode: "APP-TEST",
      status: "REQUESTED",
      scheduledAt: "2027-01-01T03:00:00Z",
      reservation,
      allocatedUnits: [
        {
          unitId: unit.id,
          unitCode: unit.unitCode,
          unitStatus: "RESERVED",
          contractCode: "CON-TEST",
        },
      ],
      createdAt: when,
    },
  ],
  renewals: [
    {
      id: "renewal-id",
      renewalCode: "REN-TEST",
      status: "PENDING",
      previousEndDate: "2027-01-01",
      requestedEndDate: "2027-04-01",
      termMonths: 3,
      paymentPlan: "PAY_MONTHLY",
      customer,
      reservation,
      quoteSnapshot: {
        currency: 'VND', storageTypeId: storageType.id, storageTypeName: storageType.name,
        quantity: 1, previousEndDate: '2027-01-01', renewalStartDate: '2027-01-01',
        requestedEndDate: '2027-04-01', termMonths: 3, paymentPlan: 'PAY_MONTHLY',
        monthlyUnitPrice: 1000000, baseRentalAmount: 3000000, discountPercent: 0,
        discountAmount: 0, rentalAmount: 3000000, depositAmount: 0, totalAmount: 3000000,
      },
      invoices: [],
      createdAt: when,
    },
  ],
  invoices: Array.from({ length: 105 }, (_, index) => ({
    id: `invoice-${index}`,
    invoiceCode: `INV-${index}`,
    type: "INITIAL",
    status: "OPEN",
    rentalAmount: 1000000,
    depositAmount: 1000000,
    chargeAmount: 0,
    totalAmount: 2000000,
    amountPaid: 0,
    balanceDue: 2000000,
    reservation,
    historicalPricing: quote,
    payments: [],
    contracts: [],
    issuedAt: when,
    createdAt: when,
  })),
  payments: [
    {
      id: "payment-id",
      paymentCode: "PAY-TEST",
      amount: 2000000,
      method: "BANK_TRANSFER",
      reference: "BANK-TEST",
      invoice: { id: "invoice-0", invoiceCode: "INV-0", reservation },
      recordedBy: staff,
      receivedAt: when,
    },
  ],
  contracts: [
    {
      id: "contract-id",
      contractCode: "CON-TEST",
      status: "ACTIVE",
      storageType,
      storageUnit: { ...unit, physicalStatus: "OCCUPIED" },
      reservation,
      reservationPricing: quote,
      startDate: reservation.startDate,
      endDate: reservation.endDate,
      createdAt: when,
    },
  ],
  rentals: [
    {
      reservationId: reservation.id,
      reservationReference: reservation.reference,
      rentalState: "OVERDUE",
      isOverdue: true,
      effectiveEndDate: "2026-10-01",
      customer,
      storageType,
      contracts: [],
      invoices: [],
      futureAllocationRisk: {
        hasFutureAllocation: true,
        hasCurrentAllocationConflict: true,
      },
    },
  ],
  returns: [
    {
      id: "return-id",
      returnCode: "RET-TEST",
      status: "PENDING_SETTLEMENT",
      reservation,
      inspections: [
        {
          id: "inspection-id",
          result: "ISSUE_FOUND",
          unit,
          contract: { contractCode: "CON-TEST" },
          issueType: "LOST_KEY_OR_ACCESS_ITEM",
          issueNote: "Mất chìa khóa",
          inspectedBy: staff,
          inspectedAt: when,
        },
      ],
      inspectionSummary: { total: 1, pending: 0, passed: 0, issues: 1 },
      settlementStatus: "PENDING_REVIEW",
      createdAt: when,
    },
  ],
  transfers: [
    {
      id: "transfer-id",
      transferCode: "TRF-TEST",
      status: "REQUESTED",
      reason: "UNIT_ISSUE",
      reservation,
      contract: { id: "contract-id", contractCode: "CON-TEST" },
      fromUnit: { ...unit, id: "source-id", status: "OCCUPIED" },
      toUnit: null,
      createdAt: when,
    },
  ],
  'stock-movements': [{
    id: 'movement-id', movementCode: 'MOV-TEST', type: 'IN', status: 'COMPLETED', customer,
    rentalContract: { id: 'contract-id', contractCode: 'CONTRACT-TEST', status: 'ACTIVE' },
    assignedStaff: staff, assignedBy: null, completedBy: staff, scheduledAt: null,
    assignedAt: null, completedAt: '2026-10-23T03:00:00Z', createdAt: '2026-10-22T03:00:00Z', updatedAt: '2026-10-23T03:00:00Z',
    note: null, completionNote: null,
    lines: [{ id: 'line-id', requestedQty: 4, actualQty: 4, note: null, storedItem: { id: 'item-id', itemCode: 'ITEM-TEST', name: 'Thùng hồ sơ', unit: 'thùng', balance: 4 } }],
  }],
  maintenance: [
    {
      id: "maintenance-id",
      maintenanceCode: "MNT-TEST",
      status: "AWAITING_VERIFICATION",
      priority: "HIGH",
      category: "UNIT_DAMAGE",
      unit: { ...unit, status: "MAINTENANCE" },
      assignedStaff: staff,
      workNote: "Đã sửa chữa",
      description: "Kiểm thử bảo trì",
      createdAt: when,
    },
  ],
  "support-requests": [
    {
      id: "support-id",
      supportCode: "SUP-TEST",
      status: "OPEN",
      priority: "MEDIUM",
      category: "UNIT_ISSUE",
      subject: "Kiểm thử hỗ trợ",
      description: "Mô tả hỗ trợ",
      customer,
      reservation,
      assignedStaff: staff,
      createdAt: when,
    },
  ],
  "deposit-settlements": [
    {
      id: "settlement-id",
      settlementCode: "SET-TEST",
      status: "PENDING_REVIEW",
      depositAmount: 1000000,
      totalApprovedCharges: 0,
      deductionAmount: 0,
      refundAmount: 0,
      outstandingAmount: 0,
      reservation,
      physicalInspections: [
        {
          id: "inspection-id",
          result: "ISSUE_FOUND",
          unit,
          contract: { contractCode: "CON-TEST" },
          issueType: "LOST_KEY_OR_ACCESS_ITEM",
          issueNote: "Mất chìa khóa",
        },
      ],
      issues: [],
      createdAt: when,
    },
  ],
};
const userRows = [
  staff,
  {
    id: "admin-id",
    fullName: "Quản trị kiểm thử",
    role: "ADMIN",
    accountStatus: "ACTIVE",
    email: "admin@example.test",
    phone: "0900000002",
  },
  ...Array.from({ length: 103 }, (_, i) => ({
    id: `user-${i}`,
    fullName: `Khách ${i}`,
    email: `customer${i}@example.test`,
    phone: "0900000000",
    role: "CUSTOMER",
    accountStatus: "ACTIVE",
  })),
];
const writes = [];
const requests = [];
const errors = [];
let paymentFails = true;
let supportStatus = "OPEN";
let invoiceFail = false;

async function setup(role, authenticated = true) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  if (authenticated)
    await context.addInitScript(() =>
      localStorage.setItem("wdp-auth-token-v1", "test-token"),
    );
  await context.route(/\/api\//, async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace(/^\/api\//, "");
    requests.push({
      path,
      query: Object.fromEntries(url.searchParams),
      method: request.method(),
    });
    const respond = (value, status = 200) =>
      route.fulfill({ status, json: value });
    if (path === "auth/login")
      return respond({
        token: "test-token",
        user: {
          id: role === "ADMIN" ? "admin-id" : "manager-id",
          fullName: "Tài khoản kiểm thử",
          email: "portal@example.test",
          role,
        },
      });
    if (path === "auth/me")
      return respond({
        id: role === "ADMIN" ? "admin-id" : "manager-id",
        fullName: "Tài khoản kiểm thử",
        email: "portal@example.test",
        role,
      });
    if (path === "health")
      return respond({
        status: "ok",
        service: "wdp-storage-api",
        timestamp: when,
      });
    if (path === "booking/catalog")
      return respond({
        sizes: [{ id: "small", name: "Kho nhỏ" }],
        products: [
          {
            ...storageType,
            sizeId: "small",
            status: "available",
            dimensions: "1 × 2 × 3 m",
            floorArea: "2 m²",
            volume: "6 m³",
            condition: "standard",
            monthlyPrice: null,
            depositMonths: null,
            minRentalDays: null,
            allowDailyRental: false,
          },
        ],
      });
    if (path === "booking/availability") {
      const body = request.postDataJSON();
      assert.equal(body.periodMode, "dates");
      assert.equal(body.paymentChoice, "pay-later");
      assert.deepEqual(body.addonIds, []);
      return respond({
        available: body.quantity === 1,
        startDate: body.startDate,
        endDateExclusive: body.endDate,
        message:
          body.quantity === 1
            ? "Còn kho cho toàn kỳ; chưa giữ kho."
            : "Không đủ kho cho toàn kỳ.",
      });
    }
    if (path === "manager/dashboard/summary")
      return respond({
        pendingReservations: 105,
        activeRentals: 1,
        overdueRentals: 1,
        upcomingAppointments: 1,
        pendingRenewals: 1,
        openSupportRequests: 1,
        maintenanceUnits: 0,
        pendingDepositSettlements: 1,
        availableUnits: 1,
        occupiedUnits: 0,
      });
    if (request.method() !== "GET") {
      const body = request.postDataJSON();
      writes.push({
        path,
        body,
        method: request.method(),
        key: request.headers()["idempotency-key"],
      });
      if (path.endsWith("/payments") && paymentFails) {
        paymentFails = false;
        return respond(
          { message: "Kiểm thử mất phản hồi. Thử lại cùng thao tác." },
          503,
        );
      }
      return respond({
        id: "new-user",
        fullName: body?.fullName || "Kiểm thử",
        accountStatus: body?.accountStatus || "ACTIVE",
        ...body,
      });
    }
    if (path.startsWith("admin/users")) {
      if (role !== "ADMIN") return respond({ message: "Forbidden" }, 403);
      const id = path.split("/")[2];
      if (id) return respond(userRows.find((row) => row.id === id));
      const page = Number(url.searchParams.get("page") || 1),
        limit = Number(url.searchParams.get("limit") || 20);
      return respond({
        page,
        limit,
        total: userRows.length,
        items: userRows.slice((page - 1) * limit, page * limit),
      });
    }
    const [, resource, id] = path.split("/");
    if (!(resource in fixture))
      return respond({ message: `Unmocked endpoint ${path}` }, 500);
    if (invoiceFail && resource === "invoices")
      return respond({ message: "Không thể tải hóa đơn kiểm thử" }, 500);
    if (resource === "support-requests")
      fixture[resource][0].status = supportStatus;
    if (resource === "returns")
      assert.notEqual(
        url.searchParams.get("status"),
        "PENDING_SETTLEMENT",
        "Backend rejects this status filter; filter this one in frontend",
      );
    if (resource === "rentals")
      assert.equal(
        url.searchParams.has("status"),
        false,
        "Rentals API uses overdue, not status",
      );
    const data = fixture[resource];
    if (id)
      return respond(
        data.find(
          (row) => (row.id || row.reservationId) === decodeURIComponent(id),
        ) || data[0],
      );
    const page = Number(url.searchParams.get("page") || 1),
      limit = Number(url.searchParams.get("limit") || 20);
    return respond({
      page,
      limit,
      total: data.length,
      items: data.slice((page - 1) * limit, page * limit),
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("unique"))
      errors.push(message.text());
  });
  return { context, page };
}
async function open(page, path) {
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
  await page.locator("h1").waitFor();
  await page.locator(".portal-loading").waitFor({ state: "hidden" });
}
async function success(page) {
  await page
    .getByRole("status")
    .filter({ hasText: "Đã lưu thao tác thành công" })
    .waitFor();
}
const checks = [];
try {
  const { context, page } = await setup("MANAGER");
  for (const resource of Object.keys(fixture)) {
    const root = ["units", "customers", "reservations", "inquiries"].includes(
      resource,
    )
      ? `/manager/${resource}`
      : `/manager/operations/${resource}`;
    await open(page, root);
    assert.equal(
      await page.getByRole("alert").count(),
      0,
      `${resource} list error`,
    );
    await open(
      page,
      root +
        "/" +
        (fixture[resource][0].id || fixture[resource][0].reservationId),
    );
    assert.equal(
      await page.getByRole("alert").count(),
      0,
      `${resource} detail error`,
    );
    checks.push(`${resource}: list and detail`);
    console.log(`PASS ${resource}: list and detail`);
  }
  await open(page, "/manager/reservations?search=RES-104");
  await page.getByRole("link", { name: "RES-104", exact: true }).waitFor();
  assert.equal(await page.locator(".manager-table tbody tr").count(), 1);
  checks.push("Search includes records beyond page 100");
  await open(page, "/manager/inquiries");
  await page.getByRole("link", { name: "INQ-TEST", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("link", { name: "RES-TEST", exact: true }).count(),
    0,
  );
  await open(page, "/manager/operations/rentals?status=true");
  assert(
    requests.some(
      (row) => row.path === "manager/rentals" && row.query.overdue === "true",
    ),
  );
  await open(page, "/manager/operations/returns?status=PENDING_SETTLEMENT");
  await page.getByRole("link", { name: "RET-TEST", exact: true }).waitFor();
  checks.push("Correct inquiry separation and backend filter contracts");
  await open(page, "/manager/reservations/reservation-0");
  await page.getByLabel("Quyết định").selectOption("CONFIRMED");
  await page
    .getByRole("button", { name: "Lưu quyết định", exact: true })
    .click();
  await success(page);
  assert.equal(writes.at(-1).body.status, "CONFIRMED");
  await open(page, "/manager/inquiries/inquiry-id");
  await page.getByLabel("Trạng thái liên hệ").selectOption("CONTACTED");
  await page.getByLabel("Ghi chú nội bộ").fill("Đã gọi khách kiểm thử");
  await page.getByRole("button", { name: "Lưu cập nhật", exact: true }).click();
  await success(page);
  assert.equal(writes.at(-1).body.internalNotes, "Đã gọi khách kiểm thử");
  await open(page, "/manager/operations/appointments/appointment-id");
  await page
    .getByRole("button", { name: "Xác nhận lịch bàn giao", exact: true })
    .click();
  await success(page);
  assert.equal(writes.at(-1).method, "PATCH");
  await open(page, "/manager/operations/renewals/renewal-id");
  assert(await page.getByRole('button', { name: 'Duyệt gia hạn', exact: true }).isDisabled());
  await page.getByRole('region', { name: 'Thông tin đối chiếu gia hạn' }).waitFor();
  await page.getByLabel('Tôi đã đối chiếu thông tin và báo giá gia hạn', { exact: true }).check();
  await page
    .getByRole("button", { name: "Duyệt gia hạn", exact: true })
    .click();
  await success(page);
  assert.equal(writes.at(-1).path, "manager/renewals/renewal-id/approve");
  await open(page, "/manager/operations/renewals/renewal-id");
  await page
    .getByLabel("Lý do từ chối")
    .fill("Không phù hợp lịch thuê kiểm thử");
  await page
    .getByRole("button", { name: "Từ chối gia hạn", exact: true })
    .click();
  await success(page);
  assert.equal(writes.at(-1).body.reason, "Không phù hợp lịch thuê kiểm thử");
  checks.push(
    "Reservation decision, inquiry notes, appointment confirmation, renewal approve and reject",
  );
  await open(page, "/manager/operations/support-requests/support-id");
  assert.equal(
    await page
      .getByRole("button", { name: "Hoàn tất hỗ trợ", exact: true })
      .count(),
    0,
  );
  supportStatus = "ESCALATED";
  await open(page, "/manager/operations/support-requests/support-id");
  await page
    .getByLabel("Nội dung giải quyết")
    .fill("Quản lý giải quyết yêu cầu kiểm thử");
  await page
    .getByRole("button", { name: "Hoàn tất hỗ trợ", exact: true })
    .click();
  await success(page);
  assert.equal(writes.at(-1).body.resolutionType, "MANAGER_RESOLVED");
  checks.push("Manager resolves only ESCALATED support");
  await open(page, "/manager/operations/deposit-settlements/settlement-id");
  await page
    .getByLabel("Căn cứ duyệt")
    .fill("Chi phí mất chìa khóa theo backend");
  await page
    .getByRole("button", { name: "Duyệt quyết toán", exact: true })
    .click();
  await success(page);
  assert.equal(writes.at(-1).body.issues[0].inspectionId, "inspection-id");
  assert.equal(writes.at(-1).body.issues[0].approvedChargeAmount, 200000);
  checks.push("Review all inspection issues with backend lost-key fee");
  await open(page, "/manager/operations/invoices/invoice-0");
  await page.getByLabel("Số tiền nhận (VND)").fill("1000000");
  await page.getByLabel("Mã tham chiếu giao dịch").fill("BANK-TEST");
  await page.getByLabel("Tôi đã nhận và đối chiếu khoản tiền này.").check();
  await page
    .getByRole("button", { name: "Ghi nhận thanh toán", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Kiểm thử mất phản hồi" })
    .waitFor();
  await page
    .getByRole("button", { name: "Ghi nhận thanh toán", exact: true })
    .click();
  await success(page);
  const payments = writes.filter((row) => row.path.endsWith("/payments"));
  assert.equal(payments.length, 2);
  assert.equal(payments[0].key, payments[1].key);
  checks.push("Payment retry preserves idempotency key");
  const settlement = fixture["deposit-settlements"][0];
  settlement.status = "APPROVED";
  settlement.refundAmount = 800000;
  await open(page, "/manager/operations/deposit-settlements/settlement-id");
  await page.getByLabel("Mã tham chiếu giao dịch").fill("REFUND-TEST");
  await page.getByLabel("Tôi đã hoàn tiền thực tế cho khách.").check();
  await page
    .getByRole("button", { name: "Ghi nhận hoàn tiền", exact: true })
    .click();
  await success(page);
  assert.equal(
    writes.at(-1).path,
    "manager/deposit-settlements/settlement-id/refund",
  );
  assert.equal(writes.at(-1).body.reference, "REFUND-TEST");
  settlement.status = "PENDING_REVIEW";
  checks.push(
    "Refund records require approved settlement and real-payment acknowledgment",
  );
  await open(page, "/manager/operations/transfers/transfer-id");
  await page
    .getByRole("combobox", { name: "Kho đích", exact: true })
    .selectOption("unit-id");
  await page
    .getByRole("button", { name: "Duyệt chuyển kho", exact: true })
    .click();
  await success(page);
  assert.equal(writes.at(-1).body.toStorageUnitId, "unit-id");
  assert(
    requests.some(
      (row) =>
        row.path === "manager/units" && row.query.storageType === "type-id",
    ),
  );
  checks.push("Transfer chooses actual destination ID of same storage type");
  await open(page, "/manager/operations/transfers");
  await page
    .getByRole("button", { name: "Tạo chuyển kho", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Hợp đồng đang thuê", exact: true })
    .selectOption("contract-id");
  await page
    .getByRole("combobox", {
      name: "Yêu cầu hỗ trợ liên quan (tùy chọn)",
      exact: true,
    })
    .selectOption("support-id");
  await page.getByRole("button", { name: "Tạo yêu cầu", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(writes.at(-1).body.rentalContractId, "contract-id");
  assert.equal(writes.at(-1).body.supportRequestId, "support-id");
  checks.push("Create transfer linked to support from the same reservation");
  const originalUnits = fixture.units;
  fixture.units = Array.from({ length: 25 }, (_, i) => ({
    ...unit,
    id: `unit-page-${i}`,
    unitCode: `PAGE-${i}`,
  }));
  await open(page, "/manager/operations/maintenance");
  await page.getByRole("button", { name: "Tạo bảo trì", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Kho cần bảo trì", exact: true })
    .selectOption("unit-page-0");
  await page
    .getByLabel("Mô tả tình trạng")
    .fill("Tạo yêu cầu bảo trì kiểm thử");
  const beforePaging = writes.length;
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Trang sau", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Kho cần bảo trì", exact: true })
    .selectOption("unit-page-20");
  assert.equal(
    writes.length,
    beforePaging,
    "Picker pagination must not submit its containing form",
  );
  await page.getByRole("button", { name: "Tạo yêu cầu", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(writes.at(-1).body.storageUnitId, "unit-page-20");
  assert(writes.at(-1).key);
  fixture.units = originalUnits;
  await open(page, "/manager/operations/maintenance/maintenance-id");
  await page.getByLabel("Ghi chú nghiệm thu").fill("Nghiệm thu kiểm thử");
  await page
    .getByRole("button", { name: "Nghiệm thu hoàn tất", exact: true })
    .click();
  await success(page);
  assert.equal(writes.at(-1).path, "manager/maintenance/maintenance-id/verify");
  checks.push("Maintenance create and verify");
  await open(page, "/manager/reports");
  assert(
    requests.some(
      (row) => row.path === "manager/invoices" && row.query.page === "2",
    ),
  );
  assert(
    (await page.locator(".portal-metrics").innerText()).includes("210.000.000"),
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Xuất hóa đơn CSV", exact: true })
    .click();
  assert((await download).suggestedFilename().endsWith(".csv"));
  invoiceFail = true;
  await open(page, "/manager/reports");
  await page
    .getByRole("alert")
    .filter({ hasText: "Không thể tải hóa đơn kiểm thử" })
    .waitFor();
  assert.equal(await page.locator(".portal-metrics").count(), 0);
  invoiceFail = false;
  checks.push("Complete report pagination, export and failure state");
  await open(page, "/manager/catalog");
  assert(
    (await page.locator("main").innerText()).includes("Cần xác nhận báo giá"),
  );
  await page
    .getByLabel("Ngày bắt đầu kiểm tra", { exact: true })
    .fill("2027-11-01");
  await page
    .getByLabel("Ngày kết thúc kiểm tra", { exact: true })
    .fill("2027-12-01");
  await page
    .getByRole("button", { name: "Kiểm tra khả dụng", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Còn kho phù hợp cho toàn kỳ", exact: true })
    .waitFor();
  await page.getByLabel("Số kho cần kiểm tra", { exact: true }).fill("2");
  assert.equal(
    await page
      .getByRole("heading", {
        name: "Còn kho phù hợp cho toàn kỳ",
        exact: true,
      })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "Kiểm tra khả dụng", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Không đủ kho phù hợp cho toàn kỳ",
      exact: true,
    })
    .waitFor();
  checks.push(
    "Full-period availability uses read-only API and clears stale results on input change",
  );
  await open(page, "/manager/operations/returns/return-id");
  assert((await page.locator("main").innerText()).includes(staff.fullName));
  await open(page, "/manager/operations/contracts/contract-id");
  await page
    .getByRole("heading", {
      name: "Lịch sử chuyển kho của hợp đồng",
      exact: true,
    })
    .waitFor();
  await page
    .locator("main")
    .getByRole("link", { name: "TRF-TEST", exact: true })
    .waitFor();
  checks.push(
    "Inspection reviewer metadata and existing contract transfer history",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/manager");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page
    .getByRole("button", { name: "Mở điều hướng", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Điều hướng nội bộ", exact: true }).getByRole("button", { name: "Kho & khách hàng", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Điều hướng nội bộ", exact: true })
    .getByRole("link", { name: "Kho vật lý", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert(page.url().includes("/manager/units"));
  checks.push("390px mobile layout and navigation");
  const adminLogin = await setup("ADMIN", false);
  await adminLogin.page.goto(base + "/manager/operations/invoices?status=OPEN&page=2");
  await adminLogin.page.getByLabel("Email", { exact: true }).fill("portal@example.test");
  await adminLogin.page.getByLabel("Mật khẩu", { exact: true }).fill("TestingPassword123!");
  await adminLogin.page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await adminLogin.page.waitForURL(base + "/admin");
  await adminLogin.context.close();
  checks.push("Admin saved Manager URLs return to Admin summary, never expose operations");
  const admin = await setup("ADMIN");
  const adminLinks = ["/admin", "/admin/users"];
  for (const path of ["/admin", "/admin/users", "/manager/assignments", "/manager/operations/invoices", "/admin/facility/reports", "/admin/facility/operations/returns", "/admin/assignments", "/admin/activity", "/admin/settings", "/admin/roles", "/admin/account-status"]) {
    await open(admin.page, path);
    const destination = ["/admin/users", "/admin/roles", "/admin/account-status"].includes(path) ? "/admin/users" : "/admin";
    assert.equal(new URL(admin.page.url()).pathname, destination);
    assert.deepEqual(await admin.page.locator('.manager-sidebar nav a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), adminLinks);
    assert.equal(await admin.page.locator('a[href^="/manager"], a[href^="/admin/facility"]').count(), 0);
  }
  checks.push("Admin has exactly two menu items; legacy and Manager URLs cannot open operational screens");
  await open(admin.page, "/admin/users?search=customer102");
  await admin.page.getByRole("cell").filter({ hasText: "customer102@example.test" }).waitFor();
  await open(admin.page, "/admin/users");
  await admin.page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await admin.page.getByLabel("Họ và tên", { exact: true }).fill("Nhân viên mới kiểm thử");
  await admin.page.getByLabel("Email", { exact: true }).fill("new@example.test");
  await admin.page.getByLabel("Số điện thoại", { exact: true }).fill("0900000009");
  await admin.page.getByLabel("Mật khẩu ban đầu", { exact: true }).fill("TestingPassword123!");
  await admin.page.getByRole("dialog").getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await admin.page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(writes.at(-1).body.role, "STAFF");assert.equal(writes.at(-1).path, "admin/users");
  await admin.page.getByRole("row").filter({ hasText: staff.fullName }).getByRole("button", { name: "Vô hiệu hóa", exact: true }).click();
  await admin.page.getByLabel("Xác nhận vô hiệu hóa tài khoản", { exact: true }).check();
  await admin.page.getByRole("button", { name: "Vô hiệu hóa tài khoản", exact: true }).click();
  assert.equal(writes.at(-1).body.accountStatus, "DISABLED");
  await admin.page.getByRole("button", { name: "Đóng", exact: true }).click();
  checks.push("Admin search all pages, create STAFF/MANAGER, view account, update status and prevent self disable");
  const assignment = await setup("MANAGER");
  await open(assignment.page, "/manager/assignments?scope=all");
  await assignment.page.getByRole("row").filter({hasText:"SUP-TEST"}).getByRole("button").click();
  await assignment.page.getByLabel("Mã tài khoản nhân viên",{exact:true}).fill("different-staff-id");
  await assignment.page.getByRole("dialog").getByRole("button",{name:/^(Phân công|Đổi nhân viên)$/}).click();
  await assignment.page.getByRole("dialog").waitFor({state:"hidden"});
  assert.equal(writes.at(-1).body.staffUserId,"different-staff-id");assert.match(writes.at(-1).path,/manager\/support-requests\/[^/]+\/assign/);assert.ok(writes.at(-1).key);
  await assignment.context.close();
  await context.close();
  checks.push("Manager assignment screen filters work and submits to manager assign API with idempotency key");
  await admin.context.close();
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: checks,
        mockedWrites: writes.length,
        realDatabaseWrites: 0,
        browserErrors: errors.length,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}

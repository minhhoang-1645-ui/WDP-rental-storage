import { selectChoice } from './select-choice.mjs';
// Browser integration against intercepted API responses only. Never writes to BE.
import assert from "node:assert/strict";
import { launchTestBrowser } from "./browser-test.mjs";
import { mkdir } from "node:fs/promises";
import {
  fixture as original,
  staff,
  customer,
  when,
} from "./fixtures/workspace.mjs";
const browser = await launchTestBrowser();
const errors = [],
  unexpected = [],
  writes = [],
  checks = [];
const moved = [
  "reservations",
  "inquiries",
  "support-requests",
  "appointments",
  "stock-movements",
  "renewals",
  "transfers",
  "returns",
  "maintenance",
];
const pageOf = (items, url) => {
  const page = Number(url.searchParams.get("page") || 1),
    limit = Number(url.searchParams.get("limit") || 20);
  return {
    page,
    limit,
    total: items.length,
    items: items.slice((page - 1) * limit, page * limit),
  };
};
async function setup(role, mobile) {
  const data = structuredClone(original);
  data["payment-submissions"] = [];
  data["stock-movements"][0].status = "ASSIGNED";
  data["stock-movements"][0].assignedStaff = staff;
  data["support-requests"][0].status = "ASSIGNED";
  data["support-requests"][0].assignedStaff = staff;
  data.returns[0].status = "REQUESTED";
  const context = await browser.newContext({
    viewport: { width: mobile ? 390 : 1440, height: 960 },
  });
  await context.addInitScript(
    ({ role, mobile }) =>
      localStorage.setItem(
        mobile ? "wdp-mobile-auth-token" : "wdp-auth-token-v1",
        `fixture-${role}`,
      ),
    { role, mobile },
  );
  await context.route(/\/api\//, async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace(/^\/api\//, ""),
      method = req.method();
    const send = (json, status = 200) => route.fulfill({ status, json });
    if (method === "OPTIONS") return route.fulfill({ status: 204 });
    if (path === "auth/me")
      return send({
        ...staff,
        id: role === "STAFF" ? staff.id : `${role.toLowerCase()}-id`,
        role,
      });
    if (path === "auth/logout") return send({});
    if (path === "health")
      return send({
        status: "ok",
        service: "wdp-storage-api",
        timestamp: when,
      });
    if (path === "booking/catalog") return send({ sizes: [], products: [] });
    const own =
      role === "ADMIN"
        ? path.startsWith("admin/")
        : role === "CUSTOMER"
          ? path.startsWith("customer/") || path.startsWith("reservations")
          : role === "MANAGER"
            ? path.startsWith("manager/")
            : path.startsWith("staff/");
    if (!own) {
      unexpected.push(`${role}:${method}:${path}`);
      return send({ message: "Wrong workspace" }, 403);
    }
    if (path === "manager/dashboard/summary")
      return send({
        activeRentals: 1,
        overdueRentals: 1,
        maintenanceUnits: 1,
        availableUnits: 0,
        occupiedUnits: 1,
      });
    if (path === "manager/staff") return send(pageOf([staff], url));
    if (path === "customer/payment-config") return send({ vnpayConfigured: true, configured: false });
    if (path === "reservations") return send(data.reservations);
    if (path === "admin/users")
      return send(
        pageOf(
          [staff, { ...customer, role: "CUSTOMER", accountStatus: "ACTIVE" }],
          url,
        ),
      );
    const parts = path.split("/"),
      management = parts[0] === "staff" && parts[1] === "management";
    const kind = parts[management ? 2 : 1],
      id = parts[management ? 3 : 2],
      action = parts[management ? 4 : 3];
    if (!(kind in data)) {
      unexpected.push(`${role}:${method}:${path}`);
      return send({ message: "Unmocked " + path }, 500);
    }
    if (
      role === "STAFF" &&
      !moved.includes(kind) &&
      !["contracts", "units", "rentals"].includes(kind)
    ) {
      unexpected.push(`${role}:${method}:${path}`);
      return send({ message: "Not Staff context" }, 403);
    }
    const items = data[kind],
      row =
        items.find(
          (item) =>
            (item.id || item.reservationId) === decodeURIComponent(id || ""),
        ) || items[0];
    if (method !== "GET") {
      const body = req.postData() ? req.postDataJSON() : {};
      if (action === "assign") assert.equal(role, "MANAGER");
      else assert.equal(role, "STAFF");
      writes.push({ role, mobile, path, body });
      if (action === "status") row.status = body.status;
      else if (kind === "inquiries") Object.assign(row, body);
      else if (action === "confirm") row.status = "CONFIRMED";
      else if (action === "approve")
        row.status =
          kind === "renewals" ? "APPROVED_PENDING_PAYMENT" : "APPROVED";
      else if (action === "reject") row.status = "REJECTED";
      else if (action === "assign") {
        row.assignedStaff = staff;
        row.status = kind === "maintenance" ? "OPEN" : "ASSIGNED";
      } else if (action === "start-inspection")
        row.status = "INSPECTION_IN_PROGRESS";
      else if (action === "start") row.status = "IN_PROGRESS";
      else if (["verify", "complete", "complete-handover"].includes(action))
        row.status = "COMPLETED";
      row.updatedAt = new Date().toISOString();
      return send(row);
    }
    return send(id ? row : pageOf(items, url));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(60000);
  page.on("pageerror", (error) =>
    errors.push(`${role}/${mobile}: ${error.message}`),
  );
  page.on('console', message => { if (message.type() === 'error' && /unique|nesting|descendant|Received NaN/.test(message.text())) errors.push(message.text()); });
  return {
    context,
    page,
    data,
    base: mobile
      ? process.env.WDP_MOBILE_URL || "http://127.0.0.1:8081"
      : process.env.WDP_FE_URL || "http://127.0.0.1:5173",
    mobile,
  };
}
async function open(app, path, detail = false) {
  console.log('CHECK workspace', app.base, path);
  await app.page.goto(app.base + path, { waitUntil: "domcontentloaded" });
  if (!app.mobile) {
    await app.page.locator("h1").waitFor();
    await app.page.waitForFunction(
      () => !document.querySelector(".portal-loading"),
    );
  } else if (/^\/staff\/[^/]+/.test(path))
    await app.page
      .getByRole("button", {
        name: detail
          ? "Làm mới hồ sơ"
          : path.includes("stock-movements")
            ? "Làm mới"
            : "Làm mới danh sách",
        exact: true,
      })
      .waitFor();
}
async function mutation(app, path, action) {
  const response = app.page.waitForResponse(
    (res) =>
      new URL(res.url()).pathname === "/api/" + path &&
      res.request().method() !== "GET",
  );
  await action();
  assert((await response).ok());
  assert.equal(writes.at(-1).path, path);
}
try {
  for (const mobile of (process.env.WDP_WORKSPACE_FOCUS ? [] : [false, true])) {
    const app = await setup("MANAGER", mobile);
    await open(app, "/manager");
    await app.page
      .getByText("Việc quản lý cần xử lý", { exact: true })
      .or(app.page.getByText("Việc cần xử lý", { exact: true }))
      .waitFor();
    assert.equal(
      await app.page.getByText("Đặt kho chờ duyệt", { exact: true }).count(),
      0,
    );
    if (!mobile) {
      assert.equal(await app.page.locator('a[href^="/staff"]').count(), 0);
      for (const kind of moved.filter(kind => !['support-requests', 'maintenance'].includes(kind)))
        assert.equal(
          await app.page
            .locator(
              `a[href^="/manager/operations/${kind}"], a[href^="/manager/${kind}"]`,
            )
            .count(),
          0,
        );
      await open(app, "/manager/assignments");
      await app.page
        .getByRole("row")
        .filter({ hasText: "SUP-TEST" })
        .getByRole("button")
        .click();
      await selectChoice(app.page
        .getByLabel("Nhân viên phụ trách", { exact: true }), staff.id);
      app.data["support-requests"][0].supportCode = "SUP-LIVE-UPDATED";
      await app.page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await app.page
        .getByText(/Vừa nhận \d+ cập nhật hồ sơ/)
        .waitFor();
      assert.equal(
        await app.page
          .getByLabel("Nhân viên phụ trách", { exact: true })
          .getAttribute('data-value'),
        staff.id,
      );
      assert.equal(
        await app.page
          .locator("table")
          .getByText("SUP-LIVE-UPDATED", { exact: true })
          .count(),
        0,
      );
      await app.page
        .getByRole("dialog")
        .getByRole("button", { name: "Đóng", exact: true })
        .click();
      await app.page
        .locator("table")
        .getByText("SUP-LIVE-UPDATED", { exact: true })
        .waitFor();
      await app.page.setViewportSize({ width: 390, height: 844 });
      await open(app, "/manager");
      assert(
        await app.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      if (process.env.WDP_SCREENSHOTS_DIR) { await mkdir(process.env.WDP_SCREENSHOTS_DIR, { recursive: true }); await app.page.screenshot({ path: `${process.env.WDP_SCREENSHOTS_DIR}/manager-390.png`, fullPage: true }); }
      checks.push(
        "Web Manager: correct dashboard, 390px layout and deferred refresh preserves an open assignment form",
      );
    } else {
      if (process.env.WDP_SCREENSHOTS_DIR) { await mkdir(process.env.WDP_SCREENSHOTS_DIR, { recursive: true }); await app.page.screenshot({ path: `${process.env.WDP_SCREENSHOTS_DIR}/expo-manager-390.png`, fullPage: false }); }
      await open(app, "/manager/stock-movements");
      await app.page.waitForURL(
        (url) => url.pathname === "/manager/assignments",
      );
      await app.page
        .getByRole("button", { name: "Đổi nhân viên phụ trách", exact: true })
        .first()
        .click();
      await app.page
        .getByRole("radio", {
          name: `${staff.fullName} · ${staff.email}`,
          exact: true,
        })
        .click();
      await app.page
        .getByRole("button", {
          name: "□ Tôi xác nhận thực hiện thao tác này",
          exact: true,
        })
        .click();
      const response = app.page.waitForResponse(
        (res) =>
          /\/api\/manager\/[^/]+\/[^/]+\/assign$/.test(
            new URL(res.url()).pathname,
          ) && res.request().method() === "PATCH",
      );
      await app.page.getByRole("button", { name: "Lưu", exact: true }).click();
      assert((await response).ok());
      checks.push(
        "Mobile Manager: legacy stock route stays in Manager and assignment sends to Manager API",
      );
    }
    await app.context.close();
  }
  const mobile = await setup("STAFF", true);
  for (const kind of (process.env.WDP_WORKSPACE_FOCUS ? [] : moved)) {
    await open(mobile, `/staff/${kind}`);
    await open(mobile, `/staff/${kind}/${mobile.data[kind][0].id}`, true);
    assert.equal(
      await mobile.page
        .getByRole("button", { name: "Phân công nhân viên", exact: true })
        .count(),
      0,
    );
  }
  async function mobileAction(
    kind,
    title,
    suffix,
    configure,
    confirmation = "□ Tôi xác nhận thực hiện thao tác này",
    execution = false,
  ) {
    if (process.env.WDP_WORKSPACE_FOCUS && process.env.WDP_WORKSPACE_FOCUS !== kind) return;
    await open(mobile, `/staff/${kind}/${mobile.data[kind][0].id}`, true);
    await mobile.page.getByRole("button", { name: title, exact: true }).click();
    if (configure) await configure();
    await mobile.page
      .getByRole("button", { name: confirmation, exact: true })
      .click();
    await mutation(
      mobile,
      `staff/${execution ? "" : "management/"}${kind}/${mobile.data[kind][0].id}${suffix}`,
      () =>
        mobile.page.getByRole("button", { name: "Lưu", exact: true }).click(),
    );
    await mobile.page.getByText("Đã lưu thành công.", { exact: true }).waitFor();
  }
  await mobileAction("reservations", "Xử lý yêu cầu đặt kho", "/status", () =>
    mobile.page
      .getByRole("radio", { name: "Đã xác nhận", exact: true })
      .click(),
  );
  await mobileAction("inquiries", "Cập nhật liên hệ", "", () =>
    mobile.page
      .getByRole("radio", { name: "Đã liên hệ", exact: true })
      .click(),
  );
  await mobileAction("appointments", "Xác nhận lịch bàn giao", "/confirm");
  await mobileAction(
    "renewals",
    "Duyệt gia hạn",
    "/approve",
    null,
    "□ Tôi đã đối chiếu thông tin và báo giá gia hạn",
  );
  if (!process.env.WDP_WORKSPACE_FOCUS) await open(mobile, '/staff/maintenance/maintenance-id', true);
  assert.equal(await mobile.page.getByRole('button', { name: 'Nghiệm thu bảo trì', exact: true }).count(), 0);
  await mobileAction("transfers", "Từ chối chuyển kho", "/reject");
  await mobileAction(
    "returns",
    "Bắt đầu kiểm tra",
    "/start-inspection",
    null,
    "□ Tôi xác nhận thông tin và thao tác này",
    true,
  );
  await mobileAction(
    "support-requests",
    "Bắt đầu hỗ trợ",
    "/start",
    null,
    "□ Tôi xác nhận thông tin và thao tác này",
    true,
  );
  await mobileAction(
    "stock-movements",
    "Hoàn tất phiếu",
    "/complete",
    null,
    "□ Tôi đã đối chiếu và xác nhận thao tác thực tế",
    true,
  );
  checks.push(
    "Mobile Staff: all nine lists/details and permitted forms use Staff endpoints; Manager verification remains hidden; no assignment controls",
  );
  await mobile.context.close();
  for (const role of (process.env.WDP_WORKSPACE_FOCUS ? [] : ["ADMIN", "CUSTOMER"])) {
    const app = await setup(role, true);
    await open(app, "/" + role.toLowerCase());
    await app.page
      .getByText(
        role === "ADMIN" ? "Khu vực quản trị" : "Bạn muốn làm gì hôm nay?",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await app.page
        .getByRole("button", { name: "Phân công nhân viên", exact: true })
        .count(),
      0,
    );
    await app.page.goto(app.base + "/staff/reservations");
    await app.page.waitForURL((url) => !url.pathname.startsWith("/staff"));
    await app.context.close();
  }
  checks.push("Mobile Admin/Customer cannot enter Staff or access assignment");
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log(
    JSON.stringify(
      {
        passed: process.env.WDP_WORKSPACE_FOCUS ? [`Focused Staff workflow: ${process.env.WDP_WORKSPACE_FOCUS}`] : checks,
        mockedWrites: writes.length,
        browserErrors: errors.length,
        unexpectedRequests: unexpected.length,
        realDatabaseWrites: 0,
      },
      null,
      2,
    ),
  );
} catch(error) { for (const context of browser.contexts()) for (const page of context.pages()) console.error("FAILED STATE", page.url(), (await page.locator("body").innerText()).slice(-6000)); throw error; } finally {
  await browser.close();
}

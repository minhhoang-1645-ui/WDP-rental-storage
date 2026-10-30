/** Exercise the visible entity picker, while retaining coverage for simple native filters. */
export async function selectChoice(control, value) {
  if (await control.evaluate(element => element.tagName) === 'SELECT') return control.selectOption(value);
  await control.click();
  await control.locator('..').locator(`[role="option"][data-value=${JSON.stringify(value)}]`).click();
}

import { Page, Locator } from '@playwright/test';
import * as os from 'os';

export const META = os.platform() === 'darwin' ? 'Meta' : 'Control';

export async function commandPalette(page: Page): Promise<void> {
  await page.keyboard.press(`${META}+KeyK`);
}

export async function pressEscape(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
}

export async function dragAndDrop(source: Locator, target: Locator): Promise<void> {
  const sb = await source.boundingBox();
  const tb = await target.boundingBox();
  if (!sb || !tb) throw new Error('drag source/target not visible');
  await source.page().mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await source.page().mouse.down();
  await source.page().mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 12 });
  await source.page().mouse.up();
}

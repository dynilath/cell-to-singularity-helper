/**
 * 构建产物冒烟测试：确认 dist/index.html 完全自包含，并能在
 * 不经过打包器的环境里启动、计算、保存到 localStorage。
 *
 * 运行：pnpm build && pnpm verify
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const distPath = resolve(process.cwd(), 'dist/index.html');
const html = readFileSync(distPath, 'utf8');

if (/<script[^>]+src=/.test(html)) throw new Error('构建产物仍有外部 script 引用');
if (/<link[^>]+href=/.test(html)) throw new Error('构建产物仍有外部样式/资源引用');
if (!/<style[\s>]/.test(html)) throw new Error('构建产物缺少内联样式');

const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('构建产物中没有内联脚本');

const dom = new JSDOM(html.replace(scriptMatch[0], ''), {
  url: 'http://localhost/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});

dom.window.eval(scriptMatch[1]);
await new Promise((resolvePromise) => setTimeout(resolvePromise, 80));

const { document } = dom.window;
const factoryRows = document.querySelectorAll('#factory-rows .fac-row');
if (factoryRows.length !== 1) throw new Error(`启动后工厂行数应为 1，实际 ${factoryRows.length}`);
if (document.querySelectorAll('#resource-rows .res-row').length !== 1) {
  throw new Error('启动后资源行数应为 1');
}

function input(element, value) {
  element.value = value;
  element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

const resourceInputs = document.querySelectorAll('#resource-rows .res-row input');
input(resourceInputs[0], '0');
input(resourceInputs[1], '0');

const factoryInputs = factoryRows[0].querySelectorAll('.factory-inline input');
input(factoryInputs[0], '1');
input(factoryInputs[1], '100');
input(factoryInputs[2], '10');
input(factoryInputs[3], '2');

document.getElementById('add-upgrade').click();
const upgradeInputs = document.querySelectorAll('#upgrade-rows .upg-row .edit-grid input');
input(upgradeInputs[0], '2');
input(upgradeInputs[1], '1000');

await new Promise((resolvePromise) => setTimeout(resolvePromise, 450));

if (document.getElementById('result-body').classList.contains('hidden')) {
  throw new Error('计算完成后结果面板仍然隐藏');
}
if (!document.getElementById('strategy').textContent.trim()) {
  throw new Error('策略结论为空');
}
if (!document.getElementById('total-line').textContent.trim()) {
  throw new Error('总时长未渲染');
}

const raw = dom.window.localStorage.getItem('cts_data_v6');
const saved = raw ? JSON.parse(raw) : null;
if (!saved?.plan?.steps?.length) {
  throw new Error('计划没有写入 localStorage');
}

const dialog = document.getElementById('mh-dialog');
document.getElementById('mh-open').click();
if (!dialog.hasAttribute('open')) throw new Error('倍率助手弹窗没有打开');
document.getElementById('mh-close').click();
if (dialog.hasAttribute('open')) throw new Error('倍率助手弹窗没有关闭');

// 快速结算需要足够的资源：补一笔，再买 1 台。
input(resourceInputs[0], '1000');
await new Promise((resolvePromise) => setTimeout(resolvePromise, 450));
document.querySelector('#factory-rows .fac-buy[data-count="1"]').click();
if (!document.getElementById('factory-status').textContent.includes('已结算')) {
  throw new Error('快速结算没有生效');
}

console.log(
  `dist 冒烟通过：自包含 ${html.length} 字节，${saved.plan.steps.length} 步，` +
    `策略「${document.getElementById('strategy').textContent.trim()}」，弹窗与快速结算可用`,
);

dom.window.close();

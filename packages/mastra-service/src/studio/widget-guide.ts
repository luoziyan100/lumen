/**
 * [INPUT]: none (fixed text)
 * [OUTPUT]: WIDGET_GUIDE (the Chinese handbook reading_widget_guide returns, ≤4KB), WIDGET_EXAMPLE (its complete example: params plus html)
 * [POS]: the on-demand half of the widget knowledge (P5). When to use a widget and the gentle guess-first step are beliefs and stay in the persona; the block's
 *        field shape lives in the reading tools' parameter text; how to write one lives here and is fetched only before writing a widget. It ships with the code,
 *        not as a user skill, because it is one contract with the renderer (receiver's lumenParams / lumen:params) and widget-check: the three change together.
 *        tests/studio/widget.test.ts runs WIDGET_EXAMPLE through widget-check so the handbook never teaches a page the service refuses
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */

export const WIDGET_EXAMPLE = {
  params: [
    { type: 'range', name: 'rate', label: '衰减速率', min: 0.1, max: 2, step: 0.1, default: 0.5, unit: '/s' },
    { type: 'toggle', name: 'showHalf', label: '标出半衰期', default: true },
  ],
  html: `<div style="background:#fbfaf7;color:#2b2a27;font:14px system-ui;padding:12px">
<svg id="plot" viewBox="0 0 320 140" width="100%"></svg>
<p id="read"></p>
<ol id="steps" style="display:flex;gap:12px;list-style:none;padding:0">
<li>① 起点满电</li><li>② 按速率衰减</li><li>③ 读半衰期</li>
</ol>
<button id="tell">把这个速率说给 AI</button>
</div>
<script>
var p = window.lumenParams, step = 2;
function draw() {
  var k = p.rate, half = Math.log(2) / k, pts = [];
  for (var t = 0; t <= (step ? 10 : 0); t += 0.25) pts.push((t * 30 + 10) + ',' + (130 - 120 * Math.exp(-k * t)));
  var x = half * 30 + 10;
  document.getElementById('plot').innerHTML =
    '<polyline fill="none" stroke="#2b2a27" stroke-width="2" points="' + pts.join(' ') + '"/>' +
    (p.showHalf && step === 2 ? '<line x1="' + x + '" y1="10" x2="' + x + '" y2="130" stroke="#b5651d" stroke-dasharray="4 3"/>' : '');
  document.getElementById('read').textContent = '速率 ' + k + ' /s，半衰期 ' + half.toFixed(2) + ' s';
  document.querySelectorAll('#steps li').forEach(function (li, i) { li.style.fontWeight = i === step ? '600' : '400'; });
}
document.querySelectorAll('#steps li').forEach(function (li, i) {
  li.onclick = function () { step = i; draw(); };
});
window.addEventListener('lumen:params', function (e) { p = e.detail; draw(); });
document.getElementById('tell').onclick = function () {
  window.__widgetSendMessage('我把衰减速率调到 ' + p.rate + ' /s，半衰期变成 ' + (Math.log(2) / p.rate).toFixed(2) + ' s');
};
draw();
</script>`,
} as const

export const WIDGET_GUIDE = `# 小实验写法手册

## 视觉语法
- 纸面浅底（如 #fbfaf7）、深墨线条；贴合学科的 2D SVG 或 Canvas，不画方框流程图。
- 底部 3–5 步推演条：一步一句，点哪一步，画面就停在哪一步。
- 1–2 个反事实开关或滑块，画面里同步显示读数。

## params：控件交给宿主
在块上声明 params（最多 6 个）。桌面在小实验下方画控件，并记住用户调过的值：
- range：{ type: "range", name, label, min, max, step, default, unit? }
- toggle：{ type: "toggle", name, label, default: true 或 false }
- choice：{ type: "choice", name, label, options: [{ value, label }]（2–6 个）, default: 某个 value }
name 用小写字母开头的字母数字。改一个已有的小实验：先用 reading_view({ itemId, blockId }) 读这一块的 html 和 params，再用 reading_patch 只换要改的几处，沿用原来的 name 和标题，用户调过的值就会保留。
页面这样读：脚本开始执行时 window.lumenParams 已经是全部当前值；之后每次变化，页面收到 lumen:params 事件，event.detail 是全部当前值。页面不能改参数。
不要在页面里再画这些控件，读数可以画。声明了就必须读，没声明就不能读，否则写入会被拒。

## 回发对话
window.__widgetSendMessage("一句话") 只在用户点击之后调用（如「先猜一下」的提交按钮）。加载时或定时器里调用会被丢弃。

## 硬限制
- 零外网：src、<link href>、CSS url() 不用 http:、https: 或 // 开头的地址；不用 fetch、XMLHttpRequest、WebSocket、EventSource、import()。<a href> 指向论文或网页可以保留，点击后由宿主在外部浏览器打开。
- 不用 type="module" 的脚本；整块 html ≤64KB；每个脚本都要能编译通过。
- 服务写入前只编译、不执行；运行期报错由用户点「请 AI 修正」发回给你。

## 范例
params：${JSON.stringify(WIDGET_EXAMPLE.params)}
html：
${WIDGET_EXAMPLE.html}
`

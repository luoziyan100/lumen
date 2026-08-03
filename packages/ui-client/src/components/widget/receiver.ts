/**
 * [INPUT]: sanitize.ts 的 CDN_WHITELIST;宿主注入的 CSS 变量块
 * [OUTPUT]: buildReceiverSrcdoc —— receiver HTML(供 emit 成 public/ 同源页;勿再当 srcdoc)
 * [POS]: widget/ 沙箱壳 —— CSP + 高度同步 + 链接拦截 + __widgetSendMessage
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * 为何不 srcdoc:父页 CSP(script-src 'self')会继承进 srcdoc,掐死本页内联 bootstrap,
 * 症状=标题在父 React 画出、iframe 身子空白。必须同源独立导航(/widget-receiver.html)。
 */

import { CDN_WHITELIST } from './sanitize'

export const WIDGET_RESIZE = 'lumen-widget:resize'
export const WIDGET_READY = 'lumen-widget:ready'
export const WIDGET_UPDATE = 'lumen-widget:update'
export const WIDGET_FINALIZE = 'lumen-widget:finalize'
export const WIDGET_THEME = 'lumen-widget:theme'
export const WIDGET_LINK = 'lumen-widget:link'
export const WIDGET_SEND = 'lumen-widget:sendMessage'

/**
 * 构建 receiver srcdoc。iframe 全程存活,内容经 postMessage 推送:
 * update=流式视觉预览;finalize=完整 HTML 并执行 script。
 */
export function buildReceiverSrcdoc(styleBlock: string, isDark: boolean): string {
  const cspDomains = CDN_WHITELIST.map((d) => `https://${d}`).join(' ')
  const csp = [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${cspDomains}`,
    "style-src 'unsafe-inline'",
    'img-src * data: blob:',
    'font-src * data:',
    "connect-src 'none'",
  ].join('; ')

  const receiverScript = `(function(){
var root=document.getElementById('__root');
var _t=null,_first=true,_lastH=0;
function _h(){
  if(_t)clearTimeout(_t);
  _t=setTimeout(function(){
    var r=root.getBoundingClientRect();
    var h=Math.ceil(r.height);
    if(h>0&&h!==_lastH){_lastH=h;parent.postMessage({type:'${WIDGET_RESIZE}',height:h,first:_first},'*');}
    _first=false;
  },60);
}
var _ro=new ResizeObserver(_h);
_ro.observe(root);

function applyHtml(html){root.innerHTML=html;_h();}

function finalizeHtml(html){
  var tmp=document.createElement('div');
  tmp.innerHTML=html;
  var ss=tmp.querySelectorAll('script');
  var scripts=[];
  for(var i=0;i<ss.length;i++){
    scripts.push({src:ss[i].src||'',text:ss[i].textContent||'',attrs:[]});
    for(var j=0;j<ss[i].attributes.length;j++){
      var a=ss[i].attributes[j];
      if(a.name!=='src')scripts[scripts.length-1].attrs.push({name:a.name,value:a.value});
    }
    ss[i].remove();
  }
  var visualHtml=tmp.innerHTML;
  if(root.innerHTML!==visualHtml)root.innerHTML=visualHtml;
  var cdnScripts=scripts.filter(function(s){return !!s.src});
  var inlineScripts=scripts.filter(function(s){return !s.src&&s.text});
  function _appendInline(){
    for(var k=0;k<inlineScripts.length;k++){
      var s=document.createElement('script');
      s.textContent=inlineScripts[k].text;
      for(var j=0;j<inlineScripts[k].attrs.length;j++)s.setAttribute(inlineScripts[k].attrs[j].name,inlineScripts[k].attrs[j].value);
      root.appendChild(s);
    }
    _h();
  }
  if(cdnScripts.length===0){_appendInline();}
  else{
    var _pending=cdnScripts.length;
    function _onCdnDone(){_pending--;if(_pending<=0)_appendInline()}
    for(var i=0;i<cdnScripts.length;i++){
      var n=document.createElement('script');
      n.src=cdnScripts[i].src;
      n.onload=_onCdnDone;n.onerror=_onCdnDone;
      for(var j=0;j<cdnScripts[i].attrs.length;j++){
        if(cdnScripts[i].attrs[j].name!=='onload')n.setAttribute(cdnScripts[i].attrs[j].name,cdnScripts[i].attrs[j].value);
      }
      root.appendChild(n);
    }
  }
  _h();
}

window.addEventListener('message',function(e){
  if(!e.data)return;
  switch(e.data.type){
    case '${WIDGET_UPDATE}': applyHtml(e.data.html); break;
    case '${WIDGET_FINALIZE}': finalizeHtml(e.data.html); setTimeout(_h,150); break;
    case '${WIDGET_THEME}':
      var r=document.documentElement,v=e.data.vars;
      if(v)for(var k in v)r.style.setProperty(k,v[k]);
      if(typeof e.data.isDark==='boolean')r.className=e.data.isDark?'dark':'light';
      setTimeout(_h,100);
      break;
  }
});

document.addEventListener('click',function(e){
  var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;
  if(!a)return;var h=a.getAttribute('href');
  if(!h||h.charAt(0)==='#')return;
  e.preventDefault();
  parent.postMessage({type:'${WIDGET_LINK}',href:h},'*');
});

window.__widgetSendMessage=function(t){
  if(typeof t!=='string'||t.length>500)return;
  parent.postMessage({type:'${WIDGET_SEND}',text:t},'*');
};

parent.postMessage({type:'${WIDGET_READY}'},'*');
})();`

  const darkClass = isDark ? 'dark' : 'light'
  return `<!DOCTYPE html><html class="${darkClass}"><head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="${csp}"/>
<style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden;}
body{font-family:system-ui,-apple-system,sans-serif;color:var(--color-text-primary,#1a1a1a);}
#__root{min-height:1px;}
${styleBlock}
</style>
</head><body>
<div id="__root"></div>
<script>${receiverScript}</script>
</body></html>`
}

/** 把宿主暖纸 token 映射为 widget 指南里的标准变量名 */
export function collectThemeVars(el: HTMLElement | null): Record<string, string> {
  if (!el) return {}
  const cs = getComputedStyle(el)
  const pick = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  return {
    '--color-background-primary': pick('--paper-solid', '#fffeff'),
    '--color-background-secondary': pick('--card', '#ffffff'),
    '--color-background-tertiary': pick('--paper-deep', '#f4f2ec'),
    '--color-text-primary': pick('--ink', '#211f1c'),
    '--color-text-secondary': pick('--ink-soft', 'rgba(33,31,28,0.82)'),
    '--color-text-tertiary': pick('--ink-mute', 'rgba(33,31,28,0.56)'),
    '--color-border-tertiary': pick('--sand-deep', 'rgba(66,56,42,0.17)'),
    '--color-border-secondary': pick('--sand-deep', 'rgba(66,56,42,0.17)'),
    '--color-border-primary': pick('--ink-faint', 'rgba(33,31,28,0.34)'),
    '--border-radius-md': '8px',
    '--border-radius-lg': '12px',
    '--font-sans': pick('--font-sans', 'system-ui,sans-serif'),
    '--font-mono': pick('--font-mono', 'ui-monospace,monospace'),
  }
}

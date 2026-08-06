/**
 * [INPUT]: sanitize.ts 的 CDN_WHITELIST;宿主注入的 CSS 变量块
 * [OUTPUT]: buildReceiverSrcdoc —— receiver HTML(供 emit 成 public/ 同源页;勿再当 srcdoc)
 * [POS]: widget/ 沙箱壳 —— CSP + 高度同步 + 链接拦截 + __widgetSendMessage;
 *       主题变量见 themeVars.ts;THEME.fillHeight 切岛内滚动(阅读器)vs hidden(对话跟高)
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
    "style-src-attr 'unsafe-inline'",
    "style-src-elem 'unsafe-inline'",
    'img-src * data: blob:',
    'font-src * data:',
    "connect-src 'none'",
  ].join('; ')

  const receiverScript = `(function(){
var root=document.getElementById('__root');
var _t=null,_first=true,_lastH=0,_fill=false;
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

/* 对话内:overflow hidden + 宿主跟高;阅读器 fillHeight:钉视口 → 必须在岛内滚动 */
function setFillScroll(on){
  _fill=!!on;
  var r=document.documentElement,b=document.body;
  r.style.overflow=b.style.overflow=_fill?'auto':'hidden';
  r.style.height=b.style.height=_fill?'100%':'';
}

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
      if(typeof e.data.isDark==='boolean'){
        r.className=e.data.isDark?'dark':'light';
        /* only:禁止 WKWebView/系统暗色把浅档文档自动换皮(丢 inline 颜色) */
        r.style.colorScheme=e.data.isDark?'only dark':'only light';
      }
      if(typeof e.data.fillHeight==='boolean')setFillScroll(e.data.fillHeight);
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
  const scheme = isDark ? 'only dark' : 'only light'
  return `<!DOCTYPE html><html class="${darkClass}" style="color-scheme:${scheme}"><head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="${csp}"/>
<style>
/* 内容岛默认浅档实底;only light 阻止系统暗色自适应抹掉 author/inline 颜色 */
html,body{margin:0;padding:0;overflow:hidden;}
html.light,html:not(.dark){color-scheme:only light;background:#ffffff;}
html.dark{color-scheme:only dark;background:#14161c;}
body{
  font-family:system-ui,-apple-system,sans-serif;
  color:var(--color-text-primary,#211f1c);
  background:transparent;
}
/* 让 button 吃得下 inline background(WK 在 appearance:auto 时会忽略) */
button,input,select,textarea{-webkit-appearance:none;appearance:none;}
#__root{min-height:1px;}
${styleBlock}
</style>
</head><body>
<div id="__root"></div>
<script>${receiverScript}</script>
</body></html>`
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../js/views/settings.js',import.meta.url),'utf8');
const helpers = await readFile(new URL('../js/utils/helpers.js',import.meta.url),'utf8');
const {escHtml} = await import('data:text/javascript;base64,'+Buffer.from(helpers).toString('base64'));
const settingsSource = source.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/g,'');
let sequence=0;
async function setup({result, savedKey='', failSave=false}={}) {
  const stored = new Map(savedKey ? [['geminiApiKey',savedKey]] : []);
  const status = {innerHTML:''};
  const button = {disabled:false,addEventListener(type,callback){this.callback=callback;}};
  const input = {value:'dummy-key'};
  const nodes = {'#api-key-input':input,'#validate-key-btn':button,'#api-key-status':status};
  const container = {innerHTML:'',querySelector:id=>nodes[id] || null};
  globalThis.window = {__appState:{apiKey:savedKey}};
  globalThis.__settingsDeps = {
    settingsDB:{get:async k=>stored.get(k),set:async(k,v)=>{if(failSave)throw Error('offline');stored.set(k,v);}},
    validateApiKey:async()=>result, getMaxDailyReviews:async()=>50, setMaxDailyReviews:async()=>{},
    escHtml, showToast:()=>{}, showConfirm:async()=>false,
  };
  const shim = 'const {settingsDB,validateApiKey,getMaxDailyReviews,setMaxDailyReviews,escHtml,showToast,showConfirm}=globalThis.__settingsDeps;\n';
  const module=await import('data:text/javascript;base64,'+Buffer.from(shim+settingsSource).toString('base64')+'#'+sequence++);
  await module.renderSettings(container);
  return {stored,status,button,input};
}

test('saved key is not shown as freshly verified on page load',async()=>{
  const ui=await setup({savedKey:'old-key'});
  assert.match(ui.status.innerHTML,/يوجد مفتاح محفوظ/);
  assert.ok(!ui.status.innerHTML.includes('المفتاح صالح'));
});

test('successful discovery saves key and displays selected model',async()=>{
  const ui=await setup({result:{valid:true,model:'gemini-2.5-flash'}});
  await ui.button.callback();
  assert.equal(ui.stored.get('geminiApiKey'),'dummy-key');
  assert.match(ui.status.innerHTML,/gemini-2.5-flash/);
  assert.equal(ui.button.disabled,false);
});

for(const kind of ['quota','permission','service','network','no_model']) {
  test(`${kind} does not label key invalid or overwrite saved key`,async()=>{
    const ui=await setup({savedKey:'old-key',result:{valid:false,kind,error:'failure'}});
    await ui.button.callback();
    assert.ok(!ui.status.innerHTML.includes('مفتاح غير صالح'));
    assert.match(ui.status.innerHTML,/تعذّر التحقق/);
    assert.equal(ui.stored.get('geminiApiKey'),'old-key');
    assert.equal(ui.button.disabled,false);
  });
}

test('invalid credentials receive the invalid-key message; provider HTML is escaped',async()=>{
  const ui=await setup({result:{valid:false,kind:'invalid_key',error:'<img src=x onerror=alert(1)>'}});
  await ui.button.callback();
  assert.match(ui.status.innerHTML,/مفتاح غير صالح/);
  assert.ok(!ui.status.innerHTML.includes('<img'));
  assert.ok(ui.status.innerHTML.includes('&lt;img'));
});

test('storage failure does not claim success and re-enables validation',async()=>{
  const ui=await setup({savedKey:'old-key',failSave:true,result:{valid:true,model:'gemini-2.5-flash'}});
  await ui.button.callback();
  assert.match(ui.status.innerHTML,/تعذّر حفظ المفتاح/);
  assert.equal(window.__appState.apiKey,'old-key');
  assert.equal(ui.button.disabled,false);
});

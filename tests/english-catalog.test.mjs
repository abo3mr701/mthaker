import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { oxfordWords, legacyOxfordWords } from '../js/data/oxfordWords.js';
import * as vocabulary from '../js/services/englishVocabulary.js';
import * as srs from '../js/services/englishSrs.js';

const fixture = Array.from({length:100}, (_,i)=>({id:`w-${i}`,word:`word-${i}`,level:['A1','A2','B1','B2','C1'][i%5],ar:`ترجمة ${i}`,pos:'n.',definition:'a test entry',examples:{daily:'First example.',academic:'Second example.',idiom:'Third example.'}}));

test('complete bundled dataset: unique stable IDs, Arabic, definition, three examples and valid CEFR',()=>{
  assert.equal(oxfordWords.length,4958);
  assert.equal(new Set(oxfordWords.map(w=>w.id)).size,oxfordWords.length);
  assert.equal(new Set(oxfordWords.map(w=>w.word.toLowerCase())).size,oxfordWords.length);
  for(const word of oxfordWords){
    assert.ok(['A1','A2','B1','B2','C1'].includes(word.level),word.word);
    assert.match(word.ar,/[\u0600-\u06ff]/,word.word);
    assert.ok(word.definition?.trim(),word.word);
    assert.ok(word.pos?.trim(),word.word);
    for(const key of ['daily','academic','idiom']) assert.ok(word.examples[key]?.trim(),`${word.word}:${key}`);
    assert.ok(word.isOxford);
    assert.equal(word.exampleCredits.length,3);
    word.exampleCredits.filter(Boolean).forEach(credit=>{
      assert.match(credit[0],/^\d+$/);assert.ok(credit[1]);assert.equal(typeof credit[2],'boolean');
    });
  }
});

test('merge fills missing content while preserving custom identity and all SRS data',()=>{
  const builtin={...fixture[0],isOxford:true,exampleCredits:[['1','author',true],null,null]};
  const custom={id:'custom-1',word:' WORD-0 ',level:'B1',ar:'ترجمتي',definition:'',examples:{daily:'My own sentence.'},custom:true};
  const card={id:custom.id,dueDate:'2030-01-01',ease:2.8,reps:7};
  const original=JSON.stringify(card);
  const merged=vocabulary.mergeVocabulary([builtin],[custom],{[card.id]:card});
  assert.equal(merged.length,1);
  assert.equal(merged[0].id,custom.id);
  assert.equal(merged[0].ar,'ترجمتي');
  assert.equal(merged[0].definition,builtin.definition);
  assert.equal(merged[0].examples.daily,'My own sentence.');
  assert.equal(merged[0].exampleCredits[0],null);
  assert.equal(JSON.stringify(card),original);
  assert.equal(custom.definition,'');
});

test('pre-existing active builtin and custom records are both retained instead of losing progress',()=>{
  const custom={...fixture[0],id:'custom-copy',custom:true};
  const result=vocabulary.mergeVocabulary([fixture[0]],[custom],{[fixture[0].id]:{id:fixture[0].id}});
  assert.equal(result.length,2);
});

for(const count of [10,20])test(`mixed batch adds ${count} distinct new words with balanced levels`,()=>{
  const cards={'w-0':{id:'w-0'}};
  const result=vocabulary.selectNewVocabulary(fixture,cards,count,()=>0.4);
  assert.equal(result.length,count);
  assert.equal(new Set(result.map(w=>w.id)).size,count);
  assert.ok(!result.some(w=>w.id==='w-0'));
  const counts=Object.values(Object.fromEntries(['A1','A2','B1','B2','C1'].map(level=>[level,result.filter(w=>w.level===level).length])));
  assert.equal(Math.max(...counts),Math.min(...counts));
});

test('selected level and Arabic/English search are respected',()=>{
  const result=vocabulary.filterVocabulary(fixture,{level:'B1',query:'ترجمة'});
  const chosen=vocabulary.selectNewVocabulary(result,{},20);
  assert.equal(chosen.length,20);
  assert.ok(chosen.every(w=>w.level==='B1'));
  assert.equal(vocabulary.filterVocabulary(fixture,{query:'WORD-99'})[0].id,'w-99');
});

test('exhausted pools return fewer words and never repeat active headwords with different IDs',()=>{
  const alias={...fixture[0],id:'custom',word:'WORD-0'};
  const words=[fixture[0],fixture[1],alias];
  const cards={custom:{id:'custom'}};
  assert.deepEqual(vocabulary.selectNewVocabulary(words,cards,20).map(w=>w.id),['w-1']);
  assert.equal(vocabulary.filterVocabulary(words,{cards,newOnly:true}).length,1);
});

class Element {
  constructor(){this.children=new Map();this.listeners={};this.dataset={};this.checked=false;this.disabled=false;this.style={};}
  set innerHTML(html){this.html=html;this.children=new Map();}
  get innerHTML(){return this.html || '';}
  querySelector(selector){if(!this.children.has(selector))this.children.set(selector,new Element());return this.children.get(selector);}
  querySelectorAll(selector){
    if(selector!=='[data-pick]')return [];
    return [...this.innerHTML.matchAll(/<input[^>]+data-pick="([^"]+)"[^>]*>/g)].map(match=>{
      const node=this.querySelector(match[1]);node.dataset.pick=match[1];node.checked=/\schecked[\s>]/.test(match[0]);return node;
    });
  }
  addEventListener(type,fn){this.listeners[type]=fn;}
}
const escHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const stripped=async path=>(await readFile(new URL(path,import.meta.url),'utf8')).replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/g,'');
let sequence=0;
async function catalogFixture(){
  const cards={},calls=[],toasts=[];
  globalThis.__catalogDeps={...vocabulary,escHtml,showToast:message=>toasts.push(message)};
  const shim='const {filterVocabulary,selectNewVocabulary,activeWordKeys,normalizeWord,escHtml,showToast}=globalThis.__catalogDeps;\n';
  const source=shim+await stripped('../js/views/englishCatalog.js');
  const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+sequence++);
  const el=new Element();
  module.renderEnglishCatalog(el,{words:fixture,cards,onAdd:async chosen=>{calls.push(chosen);chosen.forEach(w=>cards[w.id]={id:w.id});return chosen.length;}});
  return {module,el,cards,calls,toasts,node:id=>el.querySelector('#catalog-'+id)};
}

test('catalog renders 40 entries per page and filtering affects the 10-word action',async()=>{
  const f=await catalogFixture();
  assert.equal((f.node('grid').innerHTML.match(/<article/g)||[]).length,40);
  f.node('level').listeners.change({target:{value:'A2'}});
  await f.node('add-10').listeners.click();
  assert.equal(f.calls[0].length,10);
  assert.ok(f.calls[0].every(w=>w.level==='A2'));
  assert.equal(Object.keys(f.cards).length,10);
});

test('individual selection works across pages and adds only selected entries',async()=>{
  const f=await catalogFixture();
  const first=f.node('grid').querySelectorAll('[data-pick]')[0];
  first.checked=true;first.listeners.change();
  f.node('next').listeners.click();
  const next=f.node('grid').querySelectorAll('[data-pick]')[0];
  next.checked=true;next.listeners.change();
  await f.node('add-selected').listeners.click();
  assert.deepEqual(f.calls[0].map(w=>w.id),['w-0','w-40']);
});

test('example attribution links escape contributor text',async()=>{
  const f=await catalogFixture();
  const html=f.module.creditHtml(['123','<script>',false]);
  assert.ok(html.includes('https://tatoeba.org/en/sentences/show/123'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('CC BY 2.0 FR'));
});

async function englishModule(deps) {
  globalThis.__fullEnglishDeps={...srs,...vocabulary,escHtml,oxfordWords,legacyOxfordWords,showToast:()=>{},...deps};
  const names=Object.keys(globalThis.__fullEnglishDeps).join(',');
  const shim=`const {${names}}=globalThis.__fullEnglishDeps;\n`;
  const hooks='\nexport function setState(state){S=state;} export function getState(){return S;} export {openAddWordModal,openAskAiModal,loadState,dictionaryWords};';
  return import('data:text/javascript;base64,'+Buffer.from(shim+await stripped('../js/views/english.js')+hooks).toString('base64')+'#'+sequence++);
}

test('manual add reuses bundled details without reading an API key or calling Gemini',async()=>{
  const nodes=new Map();
  globalThis.document={getElementById:id=>{
    if(!nodes.has(id)){const node=new Element();node.classList={add(){},remove(){}};nodes.set(id,node);}return nodes.get(id);
  }};
  let geminiCalls=0;
  const module=await englishModule({settings:{get:async()=>{throw Error('must not request API key');}},generateEnglishWordEntry:async()=>{geminiCalls++;}});
  module.setState({wordBank:[{...fixture[0],isOxford:true}]});
  module.openAddWordModal(new Element());
  const body=document.getElementById('modal-form-body');
  body.querySelector('#w-word').value='WORD-0';
  await body.querySelector('#w-ai-btn').listeners.click();
  assert.equal(geminiCalls,0);
  assert.equal(body.querySelector('#w-ar').value,fixture[0].ar);
});

test('loading the dictionary keeps existing card IDs and all review dates intact',async()=>{
  const saved={id:'custom-existing',word:'Abandon',ar:'ترجمتي',level:'B2',examples:{},custom:true};
  const card={id:saved.id,dueDate:'2030-02-01',ease:2.9,reps:8};
  const settings=new Map([['englishDailyQueue',{date:'2026-11-04',wordIds:[card.id]}]]);
  const module=await englishModule({customWordsDB:{getAll:async()=>[saved]},cardsDB:{getAll:async()=>[card]},settings:{get:async key=>settings.get(key)}});
  await module.loadState();
  const state=module.getState();
  assert.equal(state.cards[card.id].dueDate,'2030-02-01');
  assert.equal(state.cards[card.id].reps,8);
  assert.ok(state.seenIds.has(card.id));
  assert.equal(state.wordBank.filter(w=>w.word.toLowerCase()==='abandon').length,1);
  assert.equal(state.wordBank.find(w=>w.id===card.id).ar,'ترجمتي');
});

test('old US-spelling SRS cards regain their metadata only when already active',async()=>{
  const module=await englishModule({});
  assert.equal(module.dictionaryWords({}).length,4958);
  const word=legacyOxfordWords[0];
  assert.equal(module.dictionaryWords({[word.id]:{id:word.id}}).find(w=>w.id===word.id).word,word.word);
});

test('activation stores only selected SRS records and preserves existing due dates',async()=>{
  const cards={'w-0':{id:'w-0',dueDate:'2030-01-01',reps:9}},writes=[];
  const state={wordBank:fixture,cards,seenIds:new Set(['w-0']),queue:{date:'2026-11-04',wordIds:[]},stats:{},dailyTarget:10};
  globalThis.__activationDeps={...vocabulary,...srs,todayStr:()=> '2026-11-04',showToast:()=>{},
    cardsDB:{bulkSave:async records=>writes.push(...records)},settings:{set:async()=>{}}};
  const shim='const {normalizeWord,activeWordKeys,createNewCard,RATINGS,todayStr,showToast,cardsDB,settings}=globalThis.__activationDeps;\n';
  const module=await import('data:text/javascript;base64,'+Buffer.from(shim+await stripped('../js/views/english.js')+'\nexport function setState(state){S=state;} export {activateCatalogWords};').toString('base64')+'#'+sequence++);
  module.setState(state);
  const added=await module.activateCatalogWords(fixture.slice(0,21));
  assert.equal(added,20);
  assert.equal(writes.length,20);
  assert.ok(writes.every(card=>!('ar' in card)&&!('examples' in card)));
  assert.equal(cards['w-0'].dueDate,'2030-01-01');
  assert.equal(cards['w-0'].reps,9);
  assert.equal(state.queue.wordIds.length,20);
});

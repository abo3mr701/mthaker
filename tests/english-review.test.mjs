import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function moduleFrom(path) {
  return import('data:text/javascript;base64,' + Buffer.from(await readFile(new URL(path, import.meta.url), 'utf8')).toString('base64'));
}
const srs = await moduleFrom('../js/services/englishSrs.js');
const queue = await moduleFrom('../js/services/englishQueue.js');
const words = [{id:'old',word:'return',level:'A1'}, {id:'new',word:'learn',level:'A2'}];
const start = new Date('2026-11-04T09:00:00+03:00');
const ids = result => result.map(word => word.id);

test('easy word returns at three days, including after serialization/reload', () => {
  const card = srs.applyRating(srs.createNewCard('old'), 'easy', start);
  assert.equal(card.interval, 3);
  const restored = JSON.parse(JSON.stringify({old:card}));
  assert.deepEqual(ids(queue.buildReviewQueue(words, restored, [], new Date('2026-11-07T08:59:59+03:00'))), []);
  assert.deepEqual(ids(queue.buildReviewQueue(words, restored, [], new Date('2026-11-07T09:00:00+03:00'))), ['old']);
  assert.deepEqual(ids(queue.buildReviewQueue(words, restored, [], new Date('2026-11-10T09:00:00+03:00'))), ['old']);
});

test('seen words excluded from new words are still returned as due reviews', () => {
  const seen = new Set(['old','new']);
  const card = srs.applyRating(srs.createNewCard('old'), 'easy', start);
  assert.equal(queue.generateDailyQueue(words, seen, 10).selected.length, 0);
  assert.deepEqual(ids(queue.buildReviewQueue(words, {old:card}, [], new Date(card.dueDate))), ['old']);
});

for(const [rating, days] of [['hard',1], ['good',1], ['easy',3], ['again',0]]) {
  test(`${rating} returns at its scheduled time`, () => {
    const card = srs.applyRating(srs.createNewCard('old'), rating, start);
    assert.equal(card.interval, days);
    assert.ok(!srs.isDue(card, new Date(new Date(card.dueDate).getTime()-1)));
    assert.ok(srs.isDue(card, new Date(card.dueDate)));
    assert.deepEqual(ids(queue.buildReviewQueue(words,{old:card},[],new Date(card.dueDate))), ['old']);
  });
}

test('same-day cached daily queue cannot hide a newly due old word', () => {
  const card = srs.applyRating(srs.createNewCard('old'), 'easy', start);
  assert.deepEqual(ids(queue.buildReviewQueue(words,{old:card},['new'],new Date(card.dueDate))), ['new','old']);
});

test('a future word in the cached daily queue is not shown prematurely', () => {
  const card = srs.applyRating(srs.createNewCard('old'), 'easy', start);
  assert.deepEqual(ids(queue.buildReviewQueue(words,{old:card},['old'],start)), []);
});

test('overdue reviews survive an exhausted new-word pool and are not capped by the target', () => {
  const bank = Array.from({length:25},(_,n)=>({id:String(n),word:`word ${n}`,level:'A1'}));
  const cards = Object.fromEntries(bank.map(word=>[word.id,{id:word.id,dueDate:start.toISOString()}]));
  assert.equal(queue.generateDailyQueue(bank,new Set(bank.map(w=>w.id)),1).selected.length,0);
  assert.equal(queue.buildReviewQueue(bank,cards,[],start).length,25);
});

test('duplicates and deleted words do not enter the review session', () => {
  const cards = {old:{id:'old',dueDate:start.toISOString()}, deleted:{id:'deleted',dueDate:start.toISOString()}};
  assert.deepEqual(ids(queue.buildReviewQueue(words,cards,['old','old','deleted'],start)), ['old']);
});

test('old overdue cards retain their saved dates and return without migration', () => {
  const card = {...srs.createNewCard('old'), interval:4, status:'review', dueDate:'2026-10-01T00:00:00Z'};
  assert.deepEqual(ids(queue.buildReviewQueue(words,{old:card},[],start)), ['old']);
  assert.equal(card.dueDate,'2026-10-01T00:00:00Z');
});

test('subsequent easy reviews use the grown interval and return again', () => {
  const first = srs.applyRating(srs.createNewCard('old'), 'easy', start);
  const second = srs.applyRating(first,'easy',new Date(first.dueDate));
  assert.ok(second.interval > first.interval);
  assert.deepEqual(ids(queue.buildReviewQueue(words,{old:second},[],new Date(second.dueDate))), ['old']);
  assert.equal(first.interval,3);
});

class Element {
  constructor() {this.style={};this.listeners={};this.dataset={};this.children=new Map();this.disabled=false;}
  set innerHTML(value) {this.html=value;this.children=new Map();}
  get innerHTML() {return this.html || '';}
  querySelector(selector) {
    if(!this.children.has(selector))this.children.set(selector,new Element());
    return this.children.get(selector);
  }
  querySelectorAll(selector) {
    if(selector!=='[data-rating]')return [];
    return ['again','hard','good','easy'].map(rating=>{
      const button=this.querySelector(rating);button.dataset.rating=rating;return button;
    });
  }
  addEventListener(type,callback) {this.listeners[type]=callback;}
}

const viewSource = (await readFile(new URL('../js/views/english.js',import.meta.url),'utf8'))
  .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/g,'');
let sequence=0;
async function viewFixture({failSave=false}={}) {
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  let saves=0;
  const toasts=[];
  const state={
    wordBank:words,wordById:new Map(words.map(w=>[w.id,w])),customWords:[],
    cards:{old:{...srs.createNewCard('old'),dueDate:'2020-01-01T00:00:00Z'}},
    queue:{date:'today',wordIds:[]},seenIds:new Set(['old']),dailyTarget:1,
    stats:{streak:0,longestStreak:0,totalReviewed:0,lastActiveDate:null},sessionIndex:0,activeTab:'today',
  };
  globalThis.__englishDeps={...srs,...queue,escHtml:s=>String(s).replaceAll('<','&lt;'),todayStr:()=>new Date().toISOString().slice(0,10),
    showToast:message=>toasts.push(message),cardsDB:{save:async()=>{saves++;await gate;if(failSave)throw Error('offline');}},
    settings:{set:async()=>{}},oxfordWords:words};
  const shim='const {createNewCard,applyRating,isDue,forecastLabel,RATINGS,generateDailyQueue,buildReviewQueue,escHtml,todayStr,showToast,cardsDB,settings,oxfordWords}=globalThis.__englishDeps;\n';
  const hooks='\nexport function setState(state){S=state;} export {renderTodayTab};';
  const view=await import('data:text/javascript;base64,'+Buffer.from(shim+viewSource+hooks).toString('base64')+'#'+sequence++);
  view.setState(state);
  const container=new Element(), el=container.querySelector('#eng-content');
  view.renderTodayTab(container,el);
  return {view,state,container,el,release,toasts,saves:()=>saves};
}

test('actual English view shows an old due word even with an empty daily queue',async()=>{
  const {el}=await viewFixture();
  assert.match(el.innerHTML,/return/);
  assert.match(el.innerHTML,/سهل<span>3 يوم/);
  assert.ok(!el.innerHTML.includes('~10'));
});

test('rating the current word does not skip the next due word',async()=>{
  const f=await viewFixture();
  f.state.cards.new={...srs.createNewCard('new'),dueDate:'2020-01-02T00:00:00Z'};
  const button=f.el.querySelector('#eng-rate-grid').querySelector('easy');
  const pending=button.listeners.click({stopPropagation(){}});
  f.release();await pending;
  const content=f.container.querySelector('#eng-content').innerHTML;
  assert.match(content,/learn/);
  assert.ok(!content.includes('dir="ltr">return</p>'));
});

test('double click saves one review only; completed session shows next review date',async()=>{
  const f=await viewFixture();
  const button=f.el.querySelector('#eng-rate-grid').querySelector('easy');
  const event={stopPropagation(){}};
  const pending=button.listeners.click(event);
  await button.listeners.click(event);
  assert.equal(f.saves(),1);
  f.release();await pending;
  assert.equal(f.state.stats.totalReviewed,1);
  assert.match(f.container.querySelector('#eng-content').innerHTML,/أقرب مراجعة/);
  assert.equal(f.state.cards.old.interval,3);
});

test('failed review storage leaves the card due and lets the user retry',async()=>{
  const f=await viewFixture({failSave:true});
  const button=f.el.querySelector('#eng-rate-grid').querySelector('easy');
  const pending=button.listeners.click({stopPropagation(){}});
  f.release();await pending;
  assert.equal(f.state.cards.old.lastReviewed,null);
  assert.equal(f.state.sessionIndex,0);
  assert.equal(button.disabled,false);
  assert.match(f.toasts[0],/تعذّر حفظ المراجعة/);
});

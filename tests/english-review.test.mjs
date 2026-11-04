import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as srs from '../js/services/englishSrs.js';
import * as queue from '../js/services/englishQueue.js';
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

for(const [rating, days] of [['hard',1], ['good',2], ['easy',3], ['very-easy',10], ['again',0]]) {
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

test('ordinary easy reviews keep the three-day interval and do not count toward mastery', () => {
  const first = srs.applyRating(srs.createNewCard('old'), 'easy', start);
  const second = srs.applyRating(first,'easy',new Date(first.dueDate));
  assert.equal(second.interval, 3);
  assert.equal(second.easyCount, 0);
  assert.deepEqual(ids(queue.buildReviewQueue(words,{old:second},[],new Date(second.dueDate))), ['old']);
  assert.equal(first.interval,3);
});

test('the third very easy rating retires a card even across reloads and other ratings', () => {
  let card = srs.createNewCard('old');
  delete card.easyCount;
  for (const rating of ['very-easy', 'easy', 'very-easy', 'hard', 'very-easy']) {
    card = JSON.parse(JSON.stringify(srs.applyRating(card, rating, start)));
  }
  assert.equal(card.easyCount, 3);
  assert.equal(card.status, 'mastered');
  assert.equal(card.dueDate, null);
  const removed = { ...srs.createNewCard('new'), status: 'removed' };
  assert.deepEqual(ids(queue.buildReviewQueue(words, { old: card, new: removed }, ['old', 'new'], new Date('2030-01-01'))), []);
});

class Element {
  constructor() {this.style={};this.listeners={};this.dataset={};this.children=new Map();this.disabled=false;this.value='';this.classList={toggle(){}};}
  reportValidity() {return Boolean(this.value);}
  set innerHTML(value) {this.html=value;this.children=new Map();}
  get innerHTML() {return this.html || '';}
  querySelector(selector) {
    if(!this.children.has(selector))this.children.set(selector,new Element());
    return this.children.get(selector);
  }
  querySelectorAll(selector) {
    if(selector!=='[data-rating]')return [];
    return ['hard','good','easy','very-easy'].map(rating=>{
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
    settings:{set:async()=>{}},oxfordWords:words,englishMessageForDay:()=>'',localStudyDay:()=> '2026-11-04'};
  const shim='const {createNewCard,applyRating,isDue,isReviewActive,forecastLabel,RATINGS,generateDailyQueue,buildReviewQueue,escHtml,todayStr,showToast,cardsDB,settings,oxfordWords,englishMessageForDay,localStudyDay}=globalThis.__englishDeps;\n';
  const hooks='\nexport function setState(state){S=state;} export {renderTodayTab};';
  const view=await import('data:text/javascript;base64,'+Buffer.from(shim+viewSource+hooks).toString('base64')+'#'+sequence++);
  view.setState(state);
  const container=new Element(), el=container.querySelector('#eng-content');
  view.renderTodayTab(container,el);
  el.querySelector('#eng-answer-translation').value='يعود';
  el.querySelector('#eng-answer-word').value='return';
  return {view,state,container,el,release,toasts,saves:()=>saves};
}

test('actual English view shows an old due word even with an empty daily queue',async()=>{
  const {el}=await viewFixture();
  assert.match(el.innerHTML,/return/);
  assert.match(el.innerHTML,/سهل<span>3 أيام/);
  assert.ok(!el.innerHTML.includes('~10'));
});

test('rating requires a translation and a word, including when only spaces are entered',async()=>{
  const f=await viewFixture();
  const button=f.el.querySelector('#eng-rate-grid').querySelector('easy');
  for(const field of ['#eng-answer-translation','#eng-answer-word']) {
    const input=f.el.querySelector(field);
    input.value='   ';
    await button.listeners.click({stopPropagation(){}});
    assert.equal(f.saves(),0);
    input.value='answer';
  }
});

test('an unanswered card can be revealed but cannot be rated', async () => {
  const f = await viewFixture();
  f.el.querySelector('#eng-answer-translation').value = '';
  f.el.querySelector('#eng-answer-word').value = '';
  f.el.querySelector('#eng-writing-practice').listeners.submit({ preventDefault() {} });
  const ratings = f.el.querySelector('#eng-rate-grid');
  assert.equal(ratings.style.display, 'grid');
  await ratings.querySelector('very-easy').listeners.click({ stopPropagation() {} });
  assert.equal(f.saves(), 0);
});

test('rating intervals remain ordered for existing cards',()=>{
  for(const interval of [0,1,2,8,30,150]) {
    const card={...srs.createNewCard('old'),interval,reps:interval?1:0,ease:1.3};
    const intervals=['hard','good','easy'].map(rating=>srs.applyRating(card,rating,start).interval);
    assert.ok(intervals[0]<intervals[1] && intervals[1]<intervals[2]);
  }
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

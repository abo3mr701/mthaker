export const RIYADH_ROADS = [
  { path:[[-7.75,-5],[-5.1,-5],[-2.65,-5.02],[.46,-5.03],[4.75,-5.04],[7.65,-5]], lanes:4 },
  { path:[[-6.8,-2.39],[-4.2,-2.38],[-2.64,-2.39],[.46,-2.4],[4.8,-2.4],[7.7,-2.4]], lanes:4 },
  { path:[[-6.9,.23],[-4.7,.24],[-2.64,.24],[.46,.24],[4.18,.24],[7.8,.22]], lanes:3 },
  { path:[[-6.4,2.66],[-3.75,2.66],[-2.64,2.66],[.46,2.66],[4.32,2.66],[8.13,2.65]], lanes:3 },
  { path:[[-5.3,4.76],[-2.64,4.75],[.46,4.76],[4.7,4.76],[8.2,4.8]], lanes:2 },
  { path:[[.46,-6.62],[.46,-5],[.46,-2.4],[.46,.24],[.46,2.66],[.46,4.76],[.46,6.3]], lanes:5 },
  { path:[[-2.63,-6.53],[-2.64,-4.99],[-2.64,-2.39],[-2.64,.24],[-2.64,2.66],[-2.64,4.76]], lanes:3 },
  { path:[[4.76,-6.43],[4.75,-5.04],[4.8,-2.4],[4.18,.24],[4.32,2.66],[4.7,4.76],[4.7,6.25]], lanes:3 },
  { path:[[-6.35,-4.95],[-6.35,-2.39],[-6.35,.23],[-6.35,2.65]], lanes:2 },
  { path:[[7.03,-5],[7.03,-2.4],[7.03,.23],[7.03,2.65],[7.03,5.65]], lanes:2 },
  { path:[[-6.9,-5.7],[-5.5,-5.91],[-2.65,-5.91],[.46,-5.91]], lanes:1 },
  { path:[[.46,-3.76],[2.7,-3.77],[4.78,-3.77],[7.03,-3.77]], lanes:1 },
  { path:[[-6.35,1.52],[-4.7,1.52],[-2.64,1.52]], lanes:1 },
  { path:[[.46,1.62],[2.2,1.63],[4.25,1.63]], lanes:1 },
  { path:[[.46,3.62],[2.35,3.62],[4.48,3.62]], lanes:1 },
  { path:[[-3.8,5.95],[-1.15,5.95],[.46,5.95],[2.9,5.95]], lanes:1 },
];
const LARGE = {
  'ksu-campus':[1.74,1.54], 'ksu-library':[.84,.7], 'ksu-hospital':[.93,.76],
  kafd:[1.45,1.08], 'riyadh-park':[1.18,.88],
  'king-salman-park':[1.23,.91], 'king-abdullah-park':[1.06,.8], 'riyadh-zoo':[1.02,.8],
};

export function riyadhFootprint(lot) {
  const kind = lot[6], id = lot[7];
  return LARGE[id] ?? (/^(lot|block|infill)-/.test(id) ? [.42,.40]
    : kind === 'cafe' ? [.53,.48] : kind === 'retail' ? [.92,.70] : [1.07,.91]);
}

function crossesBox(a,b,left,top,right,bottom) {
  let start=0,end=1;
  for(const [origin,delta,min,max] of [[a[0],b[0]-a[0],left,right],[a[1],b[1]-a[1],top,bottom]]) {
    if (!delta) { if(origin<min||origin>max) return false; continue; }
    const first=(min-origin)/delta,last=(max-origin)/delta;
    start=Math.max(start,Math.min(first,last));
    end=Math.min(end,Math.max(first,last));
    if (start>end) return false;
  }
  return true;
}

export function clearOfRoads(x,y,w,l) {
  return RIYADH_ROADS.every(({path,lanes})=>{
    // Minimum pixels per world unit over all four camera angles is sqrt(2) * 15.
    const buffer=(lanes*2.25+4)/42.42+.025;
    return !path.slice(1).some((end,i)=>crossesBox(path[i],end,
      x-w/2-buffer,y-l/2-buffer,x+w/2+buffer,y+l/2+buffer));
  });
}

function inUrbanArea(x,y,w,l) {
  return Math.abs(x)+w/2 <= 8.05 && Math.abs(y)+l/2 <= 6.26
    && Math.abs(x)+Math.abs(y)+w/2+l/2 < 13.05;
}

export function layoutRiyadh(landmarks) {
  const placed=[];
  const fits=(lot,x,y)=>{
    const [w,l]=riyadhFootprint(lot);
    return inUrbanArea(x,y,w,l) && clearOfRoads(x,y,w,l) &&
      placed.every(([px,py,pw,pl])=>Math.abs(x-px)>=(w+pw)/2+.065 || Math.abs(y-py)>=(l+pl)/2+.065);
  };
  function put(lot,x,y) {
    const [w,l]=riyadhFootprint(lot);
    lot[4]=x;lot[5]=y;placed.push([x,y,w,l]);
  }
  const points=[];
  for(let row=0;row<47;row++) for(let col=0;col<61;col++) points.push([-7.8+col*.26,-6+row*.26]);
  const sorted=landmarks.slice().sort((a,b)=>{
    const [aw,al]=riyadhFootprint(a),[bw,bl]=riyadhFootprint(b);
    return bw*bl-aw*al;
  });
  for(const lot of sorted) {
    const x=lot[4],y=lot[5];
    const target=fits(lot,x,y)?[x,y]:points.filter(([px,py])=>fits(lot,px,py))
      .sort((a,b)=>Math.hypot(a[0]-x,a[1]-y)-Math.hypot(b[0]-x,b[1]-y))[0];
    if(!target) throw new Error('No buildable lot for '+lot[7]);
    put(lot,...target);
  }

  // Infill the large urban blocks while keeping the wadi corridor open.
  for (let row=0;row<16;row++) for(let col=0;col<20;col++) {
    const x=-6+col*.70,y=-5.70+row*.74;
    const district=y<-2.5?(x<-.7?'شمال المدينة':'العقيق'):y>2.4?(x<2.8?'المربع والديرة':'الملز'):(x<-3?'حي السفارات':x<2.5?'العليا':'شرق الرياض');
    const kind=(col+row*2)%7===0?'garden':(col+row)%4===0?'shop':'house';
    const label={garden:'حديقة الحي',shop:'متاجر الحي',house:'مساكن الحي'}[kind];
    const lot=[kind==='garden'?120:kind==='shop'?180:150,'',`${district} · ${label} ${row*20+col+1}`,'قطعة تطوير ضمن المجسّم.',x,y,kind,`infill-${row}-${col}`,6];
    if(fits(lot,x,y)) {put(lot,x,y);landmarks.push(lot);}
  }
  // Fill the largest remaining interior pockets before the narrower ones.
  const pockets=points.map(([x,y],index)=>({x,y,index,gap:Math.min(...placed.map(([px,py])=>Math.hypot(x-px,y-py)))}))
    .filter(({x,y,gap})=>x>-5.75&&x<7.4&&Math.abs(y)<5.85&&gap>.49)
    .sort((a,b)=>b.gap-a.gap);
  const previousCount=landmarks.length;
  for(const {x,y,index} of pockets) {
    if (landmarks.length-previousCount>=34) break;
    const type=index%4;
    const [label,kind]=type===0?['ساحة مشاة','plaza']:type===1?['خدمات الحي','shop']:['وحدة سكنية','house'];
    const lot=[kind==='plaza'?120:150,'',`${label} ${landmarks.length-previousCount+1}`,'قطعة صغيرة تُستكمل بين البلوكات السكنية.',
      x,y,kind,`infill-pocket-${index}`,6];
    if(fits(lot,x,y)) {put(lot,x,y);landmarks.push(lot);}
  }
}

import { RIYADH_ROADS, riyadhFootprint } from './riyadhPlan.js';

export function landmarkProgress(city, index, minutes, projects = {}) {
  const [goal, , , , , , , id, stages] = city[index];
  if (id) {
    const spent = (projects[id] || 0) / 60000;
    const fraction = Math.min(1, spent / goal);
    const stage = Math.floor(fraction * stages);
    return { unlocked: spent > 0, complete: fraction === 1, fraction, stage, stages,
      model: stage / stages * 3, remaining: Math.max(0, Math.ceil(goal - spent)), spent };
  }
  const previous = city[index - 1]?.[0] ?? 0;
  const next = city[index + 1]?.[0] ?? goal + 600;
  const unlocked = minutes >= goal;
  const start = unlocked ? goal : previous;
  const end = unlocked ? next : goal;
  const fraction = Math.max(0, Math.min(1, (minutes - start) / (end - start)));
  const stage = unlocked ? Math.min(3, 1 + Math.floor(fraction * 3)) : 0;
  return { unlocked, complete: unlocked, fraction, stage, stages: 3, model: stage,
    remaining: Math.max(0, Math.ceil(goal - minutes)) };
}

function camera(turn) {
  const angle = turn * Math.PI / 2;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return ([x, y, z]) => {
    const u = x * cos - y * sin;
    const v = x * sin + y * cos;
    return [500 + (u - v) * 36, 336 + (u + v) * 20 - z * 69, u + v];
  };
}

function face(project, points, fill) {
  const screen = points.map(project);
  return {
    depth: screen.reduce((sum, point) => sum + point[2], 0) / screen.length,
    html: `<polygon points="${screen.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="${fill}"/>`,
  };
}

function solid(project, x, y, width, length, bottom, top, colors, taper = 1) {
  const corners = (z, f) => [
    [x - width * f / 2, y - length * f / 2, z],
    [x + width * f / 2, y - length * f / 2, z],
    [x + width * f / 2, y + length * f / 2, z],
    [x - width * f / 2, y + length * f / 2, z],
  ];
  const base = corners(bottom, 1), roof = corners(top, taper);
  const sides = base.map((point, i) => {
    const next = (i + 1) % 4;
    return face(project, [point, base[next], roof[next], roof[i]], colors[i % 2 + 1]);
  });
  return sides.sort((a, b) => a.depth - b.depth).slice(-2).map(side => side.html).join('')
    + face(project, roof, colors[0]).html;
}


export const CITY_FRAME = [0, 0, 1000, 650];
const OUTLINE = [[-7.4,-3],[-6.3,-5.4],[-3.8,-5.9],[-1,-5.4],[2.1,-6],[5.9,-5.3],[7.4,-3],[7,0],[7.5,2.4],[5.9,5.1],[2.5,5.7],[-.5,5.3],[-3.2,5.8],[-5.9,4.8],[-7.4,2.2],[-6.9,0]];
const PALETTES = {
  desert: { land:['#e7c895','#c59d6f','#a77b53'], road:'#b5a084', water:'#639e9c', green:['#8fb77c','#66935f','#4b7956'], block:['#f6dfbe','#cea887','#b78e6e'], ridge:['#e6b981','#c79969','#af7e54'] },
  fjord: { land:['#a8c9a1','#719d83','#557e6f'], road:'#9aa6a1', water:'#5498b5', green:['#88b582','#568d67','#3e725b'], block:['#d8dfd4','#a5bcb3','#809f97'], ridge:['#9ec098','#779e84','#578b74'] },
  alpine: { land:['#b8ce96','#81a77c','#668e66'], road:'#a7ad92', water:'#65a8cb', green:['#89bd7e','#609b62','#488057'], block:['#e8d9be','#c4b092','#ab9478'], ridge:['#aecb9c','#87a785','#698e75'] },
};
const GLASS = ['#cceaf2','#729eae','#517688'];
const CLAY = ['#f6d7a0','#c39365','#a67553'];
const TIMBER = ['#c89b6c','#996748','#794937'];
const TRUNK = ['#aa835a','#956846','#694b37'];
const ROOFS = [
  ['#ec926b','#c96a53','#ae543e'], ['#f2c573','#d9a45a','#bb8246'],
  ['#aec3df','#829ebc','#687d9d'], ['#e8a3a0','#c97876','#a95959'],
];
const PLANTS = new Set(['palm','pine','garden','plaza']);
const offset = (n, a) => ((Math.sin(n * 191.37 + a * 21.7) * 4871.23) % 1 + 1) % 1;
const flatten = (project, points, color, z = 0) => face(project, points.map(([x,y]) => [x,y,z]), color).html;

function terrain(project, style, palette) {
  const top = OUTLINE.map(([x,y]) => [x,y,0]);
  const sides = top.map((point, index) => {
    const next = top[(index + 1) % top.length];
    return face(project, [point, next, [next[0],next[1],-.52], [point[0],point[1],-.52]], palette.land[index % 2 + 1]);
  }).sort((a,b) => a.depth-b.depth).map(item => item.html).join('');
  const water = style === 'desert'
    ? [[-6.5,-4.1],[-5.45,-2.4],[-5.8,-.7],[-6.55,1.4],[-5.6,3.7],[-4.7,4.75],[-5.02,4.9],[-6.0,3.95],[-6.93,1.42],[-6.2,-.7],[-5.8,-2.3],[-6.8,-3.9]]
    : [[-7.1,-2.9],[-6.1,-5],[-3.9,-5.45],[-2.8,-3.9],[-1.75,-2.7],[-1.2,-1.1],[-1.2,.05],[-2.1,1.1],[-2.9,2.4],[-2,4.75],[-3.35,5.37],[-5.6,4.35],[-6.95,2.1],[-6.55,0]];
  return sides + face(project,top,palette.land[0]).html + flatten(project,water,palette.water,.012);
}

function street(project, points, color, width) {
  const coords = points.map(([x,y]) => project([x,y,.018]).slice(0,2).join(',')).join(' ');
  return `<polyline points="${coords}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function tree(project,x,y,size,kind,colors,z=0) {
  const trunk = solid(project,x,y,.045,.045,z,z+size*.75,TRUNK);
  if (kind === 'palm') {
    const fronds = [[-.24,0],[.24,0],[0,-.24],[0,.24]].map(([dx,dy]) =>
      face(project,[[x-dy*.25,y+dx*.25,z+size],[x+dx,y+dy,z+size*.83],[x+dy*.25,y-dx*.25,z+size],[x,y,z+size*1.08]],colors[1]).html).join('');
    return trunk + fronds;
  }
  return trunk + solid(project,x,y,size*.65,size*.65,z+size*.34,z+size,colors,kind==='pine'?.06:.5);
}

function landmarkModel(project,x,y,kind,stage,palette) {
  const height = .22 + stage * (1.9 / 3);
  if (PLANTS.has(kind)) {
    const count = Math.max(1, Math.ceil(stage * 3));
    return Array.from({length:count},(_,i) => {
      const dx = (i%3-1)*.32, dy=(Math.floor(i/3)-1)*.31;
      return tree(project,x+dx,y+dy,.16+stage*.12+offset(i,7)*.14,kind,palette.green,.035);
    }).join('');
  }
  if (kind === 'kingdom') {
    const body = solid(project,x,y,.58,.45,.04,height*.73,GLASS,.84);
    if (stage < 3) return body + solid(project,x,y,.34,.26,height*.73,height,GLASS,.87);
    const legs = [-.205,.205].map(dx => solid(project,x+dx,y,.15,.34,height*.71,height,GLASS,.75)).join('');
    return body + legs + solid(project,x,y,.5,.33,height-.075,height,GLASS);
  }
  if (kind === 'faisaliah') {
    const spire = solid(project,x,y,.71,.62,.05,height,GLASS,.075);
    const [cx,cy] = project([x,y,height*.82]);
    return spire + (stage===3 ? `<circle cx="${cx}" cy="${cy}" r="6" fill="#edbe64"/>` : '');
  }
  if (kind === 'bridge') {
    return solid(project,x,y,1.2,.27,.09,.16+stage*.035,TIMBER)
      + solid(project,x-.28,y,.24,.25,.04,.27+stage*.13,CLAY,.88);
  }
  if (kind === 'fort') {
    const walls = .06 + stage * .10;
    const court = solid(project,x,y,.75,.68,.02,.055,CLAY);
    const outer = [[0,-.31,.72,.09],[0,.31,.72,.09],[-.34,0,.09,.62],[.34,0,.09,.62]];
    const towers = [[-.34,-.31],[.34,-.31],[-.34,.31],[.34,.31]];
    const parts = outer.map(([dx,dy,w,l]) => [dx,dy,w,l,walls,1])
      .concat(towers.map(([dx,dy]) => [dx,dy,.18,.18,walls+.04+stage*.045,.74]));
    return court + parts.sort((a,b)=>project([x+a[0],y+a[1],0])[2]-project([x+b[0],y+b[1],0])[2])
      .map(([dx,dy,w,l,h,taper])=>solid(project,x+dx,y+dy,w,l,.035,h,CLAY,taper)).join('');
  }
  if (kind === 'campus') {
    const roof = .07 + stage * .12;
    const colors = ['#e6dfc9','#c6bda6','#9c927e'];
    const wings = [[-.31,0,.23,.59],[.31,0,.23,.59],[0,-.26,.58,.2]];
    return solid(project,x,y,.9,.76,.02,.05,palette.green)
      + wings.sort((a,b)=>project([x+a[0],y+a[1],0])[2]-project([x+b[0],y+b[1],0])[2])
        .map(([dx,dy,w,l])=>solid(project,x+dx,y+dy,w,l,.05,roof,colors)).join('')
      + solid(project,x,y,.29,.22,.055,.06+stage*.07,GLASS);
  }
  if (kind === 'house' || kind === 'shop') {
    const top = .07 + stage * .095;
    return solid(project,x,y,.4,.34,.035,top,palette.block)
      + (stage > 1 ? solid(project,x,y,.43,.37,top,top+.06,kind==='house'?ROOFS[0]:ROOFS[2],.72) : '');
  }
  const count = Math.floor(stage) + 1;
  return Array.from({length:count},(_,i) => {
    const dx = (i%2-.5)*.58, dy=(Math.floor(i/2)-.5)*.48;
    const z = kind==='financial' ? height*(.54+offset(i,2)*.45) : .14 + stage*.14 + offset(i,8)*.15;
    const colors = kind==='financial'?GLASS:kind==='fort'?CLAY:kind==='campus'?['#d8eaf0','#8fadc6','#687f9c']:palette.block;
    const body = solid(project,x+dx,y+dy,.42,.36,.025,z,colors,kind==='financial'?.68:1);
    return body + (kind==='harbor' ? solid(project,x+dx,y+dy,.48,.42,z,z+.19,ROOFS[i%4],.15) : '');
  }).join('');
}

function activity(project,x,y,planting,phase,spread=.45) {
  const [cx,cy] = project([x+spread,y+spread,.045]);
  const [ax,ay] = project([x-spread,y+spread*.75,.04]);
  const worker = (px,py,second) => `<g transform="translate(${px} ${py})" aria-hidden="true">
    <g class="city-worker ${second?'city-worker-alt':''}">
      <ellipse cx="0" cy="0" rx="4" ry="1.6" fill="#354c47" opacity=".4"/>
      <path d="M-2 0l1-5m3 5-1-5" stroke="#304656" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M0-5v-6m0 2 4 3" stroke="${planting?'#14685d':'#ff773c'}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="0" cy="-12" r="2.4" fill="#e5ad7c"/>
      <path d="M-3-13h6" stroke="${planting?'#f9dc92':'#ffc845'}" stroke-width="2" stroke-linecap="round"/>
    </g></g>`;
  const tool = planting
    ? `<g transform="translate(${cx+8} ${cy})"><g class="city-seed"><path d="M0 0v-8m0 5-4-3m4 1 4-4" stroke="#257247" fill="none" stroke-width="1.5" stroke-linecap="round"/></g></g>`
    : `<g transform="translate(${ax-8} ${ay})" fill="none" stroke="#dc9b22" stroke-width="2" aria-hidden="true">
      <path d="M0 0v-${26+phase*7}l21 4m-21-4-8 6m0-1h8"/>
      <path class="city-crane-hook" d="M15-${22+phase*7}v12l-3 2m-4 0h8" stroke="#755e3f"/>
    </g>`;
  return tool + worker(cx,cy,false) + worker(ax,ay,true);
}

export function cityScene(world, minutes, selected, turn, escape, projects = {}, activeProject = null) {
  if (world.terrain === 'riyadh') return riyadhScene(world, minutes, selected, turn, escape, projects, activeProject);
  const project = camera(turn);
  const palette = PALETTES[world.terrain];
  const dry = world.terrain === 'desert';
  const landmarks = world.landmarks;
  const ground = terrain(project,world.terrain,palette);
  const lanes = [-3.1,-.55,2.55,4].map(y =>
    street(project,[[dry?-5:-.6,y],[.7,y+.12],[3.5,y-.1],[6,y+.16]],palette.road,6));
  lanes.push(...[-2.8,-.8,1.15,3.45,5.6].filter(x=>dry||x>=-.8).map(x =>
    street(project,[[x,-4.8],[x+.12,-2],[x-.12,1.9],[x+.2,4.7]],palette.road,x===1.15?10:5)));
  if (dry) lanes.push(street(project,[[1.15,-4.8],[1.27,-2],[1.03,1.9],[1.35,4.7]],'#f6dfbc',1.2));
  const objects = [];
  const add = (x,y,html) => objects.push({depth:project([x,y,0])[2],html});
  for (let row=0;!dry&&row<13;row++) {
    for (let col=0;col<16;col++) {
      const i=row*16+col;
      const x=-5.35+col*.71+offset(i,3)*.22;
      const y=-4.65+row*.75+offset(i,4)*.22;
      if ((!dry&&x<-.9)||Math.abs(x)>6.5||Math.abs(y)>4.8||
          landmarks.some(([, , , , lx,ly])=>Math.hypot(lx-x,ly-y)<.96) ||
          [-3.1,-.55,2.55,4].some(value=>Math.abs(y-value)<.16) ||
          [-2.8,-.8,1.15,3.45,5.6].some(value=>Math.abs(x-value)<.17)) continue;
      if (!dry&&(x>4.25||y<-3.9)) {
        const tall=.22+offset(i,9)*.35;
        add(x,y,tree(project,x,y,tall,'pine',palette.green));
      } else if (offset(i,6)>(dry?.13:.42)) {
        const high=.08+offset(i,1)*.32+(dry&&Math.abs(x-1)<1.8?.16:0);
        const roof = !dry ? solid(project,x,y,.39,.33,high,high+.13,ROOFS[i%4],.18) : '';
        add(x,y,solid(project,x,y,.35+offset(i,2)*.1,.32,.02,high,palette.block)+roof);
      } else {
        add(x,y,tree(project,x,y,.23+offset(i,9)*.18,dry?'palm':'pine',palette.green));
      }
    }
  }
  const ridges = dry ? [[-5,-4.4,.42],[-6.6,2.5,.43],[-4.5,4.75,.38]]
    : [[4.65,-4.45,.95],[5.7,-3.6,1.05],[5.7,3.5,.87],[5.2,4.25,1.12]];
  for (const [x,y,height] of ridges) add(x,y,solid(project,x,y,1.7,1.35,.005,height,palette.ridge,.12));
  const next = landmarks.findIndex(([goal])=>minutes<goal);
  const locations = [];
  landmarks.forEach(([, , label, , x,y,kind,id],index) => {
    const progress = landmarkProgress(landmarks,index,minutes,projects);
    const isSelected=index===selected;
    const plant=PLANTS.has(kind);
    const isActive = id ? id === activeProject && !progress.complete
      : index===next || (progress.unlocked && progress.stage<3);
    const stage = progress.model;
    const model = progress.unlocked || isActive || id ? landmarkModel(project,x,y,kind,stage,palette) : '';
    const compact = id?.startsWith('lot-');
    const lot = solid(project,x,y,compact ? .66 : 1.13,compact ? .65 : 1.05,.015,.045,isSelected?['#ffe491','#d5a950','#aa7b38']:plant?palette.green:palette.block);
    const [cx,cy] = project([x,y,0]);
    const tower = kind === 'kingdom' || kind === 'faisaliah' || kind === 'financial';
    locations[index] = [cx, cy - (tower ? 5 + stage * 19 : 9)];
    add(x,y,`<g class="city-lot" role="button" tabindex="0" data-tile="${index}" aria-pressed="${isSelected}"
      aria-label="${escape(label)}"><title>${escape(label)}</title>${lot}${model}
      ${isActive ? activity(project,x,y,plant,stage) : ''}
      <circle class="city-pin" cx="${cx}" cy="${cy+18}" r="${isSelected?6:4}" fill="${isSelected?'#ffe187':'#fff1ca'}" stroke="#394d5b" stroke-width="1.4"/></g>`);
  });
  const svg = `<svg class="city-scene" viewBox="0 0 1000 650" role="group" aria-label="مجسّم ${escape(world.name)}">
    <ellipse cx="502" cy="556" rx="335" ry="49" fill="#203451" opacity=".17"/>
    ${ground}${lanes.join('')}${objects.sort((a,b)=>a.depth-b.depth).map(item=>item.html).join('')}
  </svg>`;
  return { svg, locations };
}

const RIYADH_BOUNDARY = [[-9.4,-5.4],[-8.1,-7],[-3.1,-7.2],[2.5,-7.3],[7,-6.9],[9,-5.4],[9.35,-1.2],[8.9,2.8],[8.25,6.05],[5.55,7],[-1.6,6.95],[-5.7,6.35],[-8.1,5.05],[-9.2,1.5]];
const ASPHALT = '#434f60';
const PAVEMENT = '#aab4b8';
const LIMESTONE = ['#f6ebd8','#c9bcaa','#a99c8a'];
const WADI = [[-8.45,-6.35],[-7.72,-4.7],[-7.67,-3.2],[-8.2,-1.65],[-7.6,.2],[-7.35,1.8],[-6.8,3.2],[-6.24,4.65],[-5.7,5.9]];
const DISTRICT_LABELS = [
  ['العقيق', 2.3,-6.53],['الدرعية',-7.8,-4.72],['جامعة الملك سعود',-4.72,-3.82],
  ['العليا',-.87,-.08],['حي السفارات',-5.35,1.35],['الملز',6.32,2.95],
  ['المربع',1.15,3.67],['الديرة',-1.3,5.64],
];
const PARKS = [
  [-7.55,-3.25,1.1,1.65],[-7.56,.9,.95,1.62],[-5.3,1.03,1.6,.68],
  [5.53,-.63,2.1,1.6],[5.71,3.74,2.54,1.33],[-3.26,5.44,1.19,.91],[-1.5,3.19,1.0,.65],
];
const URBAN_GREEN = ['#769772','#567f62','#39654e'];

function cityCamera(turn) {
  const angle = turn * Math.PI / 2, cos = Math.cos(angle), sin = Math.sin(angle);
  return ([x,y,z]) => {
    const u=x*cos-y*sin, v=x*sin+y*cos;
    return [500+(u-v)*28,328+(u+v)*15-z*74,u+v];
  };
}

function quad(project,x,y,width,length,z,color) {
  return flatten(project,[[x-width/2,y-length/2],[x+width/2,y-length/2],[x+width/2,y+length/2],[x-width/2,y+length/2]],color,z);
}

function ribbon(project, path, color, width, extra = '', offsetPx=0) {
  const projected=path.map(([x,y])=>project([x,y,.022]));
  const points = projected.map(([x,y],i)=>{
    const a=projected[Math.max(0,i-1)],b=projected[Math.min(projected.length-1,i+1)];
    const distance=Math.hypot(b[0]-a[0],b[1]-a[1]);
    return [x-(b[1]-a[1])*offsetPx/distance,y+(b[0]-a[0])*offsetPx/distance].map(n=>n.toFixed(1)).join(',');
  }).join(' ');
  return `<polyline points="${points}" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" fill="none" ${extra}/>`;
}

function urbanGround(project) {
  const edge = RIYADH_BOUNDARY.map(([x,y])=>[x,y,0]);
  const sides = edge.map((p,i)=>{
    const q=edge[(i+1)%edge.length];
    return face(project,[p,q,[q[0],q[1],-.45],[p[0],p[1],-.45]],i%2?'#77838a':'#596a72');
  }).sort((a,b)=>a.depth-b.depth).map(f=>f.html).join('');
  const plots = PARKS.map(([x,y,w,l])=>quad(project,x,y,w,l,.006,'#a9be97')
    + ribbon(project,[[x-w*.42,y+l*.37],[x,y],[x+w*.39,y-l*.35]],'#e0dbc7',2)).join('');
  const blocks = [[-4.7,-4.22,2.55,1.3],[-.92,-1.09,2.8,2.1],[1.85,-4.1,2.56,1.44],
    [-1.22,4.17,2.6,1.08],[1.92,4.09,2.7,1.03],[6.1,1.48,1.7,1.2]];
  const sidewalks = RIYADH_ROADS.map(({path,lanes})=>ribbon(project,path,PAVEMENT,lanes*2.25+4));
  const carriageways = RIYADH_ROADS.map(({path,lanes})=>ribbon(project,path,ASPHALT,lanes*2.25));
  const markings = RIYADH_ROADS.filter(({lanes})=>lanes>1).map(({path,lanes})=>lanes>=4
    ? ribbon(project,path,'#8f9c89',1.45)
      + [-2.6,2.6].map(offset=>ribbon(project,path,'#e3e7e6',.55,'stroke-dasharray="4 5"',offset)).join('')
    : ribbon(project,path,'#e3e7e6',.65,'stroke-dasharray="4 5"'));
  const crossings = [-2.4,.24,2.66,4.76].map(y=>Array.from({length:5},(_,i)=>
    quad(project,.31+i*.072,y+.26,.043,.13,.028,'#edf0e8')).join('')).join('');
  return sides + face(project,edge,'#c6cdcb').html
    + blocks.map(([x,y,w,l])=>quad(project,x,y,w,l,.004,'#e1e3d9')).join('')
    + ribbon(project,WADI,'#91aa81',21) + ribbon(project,WADI,'#6b9b9d',7)
    + plots
    + [...sidewalks,...carriageways,...markings].join('') + crossings;
}

function roadLife(project) {
  const names = new Map([[0,'الدائري الشمالي'],[5,'طريق الملك فهد'],[7,'طريق الملك عبدالعزيز']]);
  let traffic='', lights='', labels='';
  for(const [index,{path,lanes}] of RIYADH_ROADS.entries()) {
    const points=path.map(([x,y])=>project([x,y,.03]));
    for(let i=0;i<points.length-1;i++) {
      const [ax,ay]=points[i],[bx,by]=points[i+1];
      const length=Math.hypot(bx-ax,by-ay);
      if(length<16) continue;
      const nx=-(by-ay)/length,ny=(bx-ax)/length;
      const side=lanes*1.125+1.4;
      if(lanes>1) for(let j=13;j<length-5;j+=23) {
        const ratio=j/length;
        const x=ax+(bx-ax)*ratio+nx*side,y=ay+(by-ay)*ratio+ny*side;
        lights+=`<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><path d="M0 0v-5h2" fill="none" stroke="#5d6d73" stroke-width=".65"/>
          <circle class="riyadh-lamp" cx="2" cy="-5" r="4.7" fill="url(#riyadh-lamp-glow)"/><circle class="riyadh-lamp" cx="2" cy="-5" r="1" fill="#fff4bf"/></g>`;
      }
    }
    if(lanes<2) continue;
    const carCount=lanes>=4?4:2;
    for(let i=0;i<carCount;i++) {
      const ordered=i%2?points.slice().reverse():points;
      const lane=lanes>=4?(i<2?1.9:3.35):1.1;
      const shifted=ordered.map(([x,y],j)=>{
        const a=ordered[Math.max(0,j-1)],b=ordered[Math.min(ordered.length-1,j+1)];
        const d=Math.hypot(b[0]-a[0],b[1]-a[1]);
        return [x-(b[1]-a[1])/d*lane,y+(b[0]-a[0])/d*lane];
      });
      const line=shifted.map(([x,y],j)=>`${j?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('');
      const duration=18+index%4*3+i*1.4;
      traffic+=`<g class="riyadh-vehicle" aria-hidden="true"><rect x="-2.6" y="-1.05" width="5.2" height="2.1" rx=".55" fill="${['#e6ebed','#7598aa','#c17768','#c8b38d'][i]}" stroke="#2d3b48" stroke-width=".28"/>
        <rect x="-.55" y="-.85" width="1.2" height="1.7" rx=".2" fill="#435465"/><path class="riyadh-lamp" d="M2.2-.7h.65m-.65 1.4h.65" stroke="#ffeda5" stroke-width=".65"/>
        <animateMotion path="${line}" rotate="auto" dur="${duration}s" begin="-${(index*2.65+i*6)%duration}s" repeatCount="indefinite"/></g>`;
    }
    if(names.has(index)) {
      const mid=points[Math.floor(points.length/2)];
      labels+=`<text class="riyadh-road-label" x="${mid[0]}" y="${mid[1]+10}" direction="rtl" text-anchor="middle">${names.get(index)}</text>`;
    }
  }
  return { traffic, lights, labels };
}

/** Shaded faces and projected windows keep detailing aligned when rotating. */
function facade(project,x,y,w,l,z0,z1,colors,columns=4,floors=4,taper=1) {
  const bounds = (z,s)=>[[x-w*s/2,y-l*s/2,z],[x+w*s/2,y-l*s/2,z],[x+w*s/2,y+l*s/2,z],[x-w*s/2,y+l*s/2,z]];
  const lower=bounds(z0,1),upper=bounds(z1,taper);
  const lerp = (a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);
  const sides = lower.map((p,i)=>{
    const j=(i+1)%4;
    const shape=face(project,[p,lower[j],upper[j],upper[i]],colors[i%2+1]);
    const at=(u,v)=>lerp(lerp(p,lower[j],u),lerp(upper[i],upper[j],u),v);
    let details='';
    for(let row=0;row<floors;row++) for(let col=0;col<columns;col++) {
      const u=(col+.19)/columns, r=(col+.81)/columns, b=(row+.26)/floors, t=(row+.76)/floors;
      details+=face(project,[at(u,b),at(r,b),at(r,t),at(u,t)],(col+row)%5===0?'#c2d9df':'#426579').html
        .replace('<polygon ',`<polygon class="city-window ${(col+row)%3?'':'is-lit'}" `);
    }
    return { depth:shape.depth,html:shape.html+details };
  }).sort((a,b)=>a.depth-b.depth);
  return sides.slice(-2).map(side=>side.html).join('') + face(project,upper,colors[0]).html;
}

const SKY = ['#e0f2f3','#86afba','#5f8d9f'];
const CIVIC = ['#fff0d9','#cabca9','#a69b88'];
const BLUE = ['#b8d9e0','#729da9','#527988'];
function riyadhTower(project,x,y,kind) {
  if (kind==='kingdom') {
    const base = facade(project,x,y,.62,.34,.1,1.53,SKY,5,15,.87);
    const wing = side => [[.025,1.50],[.087,1.59],[.135,1.74],[.17,1.94],[.197,2.15],[.208,2.35],
      [.269,2.35],[.277,2.11],[.29,1.83],[.30,1.50]].map(([dx,z])=>[x+side*dx,z]);
    const crown = [-1,1].map(side=>{
      const profile=wing(side);
      const back=profile.map(([px,z])=>[px,y-.14,z]);
      const front=profile.map(([px,z])=>[px,y+.14,z]);
      const panels=profile.map((_,i)=>{
        const next=(i+1)%profile.length;
        return face(project,[back[i],back[next],front[next],front[i]],i<5?'#658693':'#9fc0c9');
      });
      return [...panels,face(project,back,'#a4c5cf'),face(project,front,'#85aebd')]
        .sort((a,b)=>a.depth-b.depth).map(part=>part.html).join('');
    }).join('');
    return base+crown+solid(project,x,y,.51,.21,2.32,2.35,SKY);
  }
  if(kind==='faisaliah') {
    const body = facade(project,x,y,.66,.59,.09,1.84,BLUE,5,14,.19);
    const [cx,cy]=project([x,y,1.56]);
    return body+`<circle cx="${cx}" cy="${cy}" r="6" fill="#dcaf56" stroke="#f6df9b" stroke-width="1.5"/>`
      + solid(project,x,y,.057,.057,1.84,2.07,SKY,.22);
  }
  const group=[[-.37,.2,.37,.38,1.25],[.03,.04,.4,.42,2.05],[.43,.20,.35,.33,1.63],
    [-.35,-.26,.32,.33,1.64],[.36,-.24,.32,.32,1.27]];
  return group.sort((a,b)=>project([x+a[0],y+a[1],0])[2]-project([x+b[0],y+b[1],0])[2])
    .map(([dx,dy,w,l,h],i)=>facade(project,x+dx,y+dy,w,l,.09,h,i%2?BLUE:SKY,3,10,.70)).join('');
}

function riyadhLandmark(project,lot,progress) {
  const [, , , , x,y,kind,id] = lot;
  const fraction=progress.fraction;
  const short = kind==='house'||kind==='shop';
  const tower = ['kingdom','faisaliah','financial'].includes(kind);
  if(tower) {
    // The blueprint previews the finished skyline. Only the solid part is earned.
    const totalHeight=kind==='kingdom'?2.37:kind==='faisaliah'?2.07:2.05;
    const top=project([x,y,0])[1]-totalHeight*74*fraction;
    const full=riyadhTower(project,x,y,kind);
    const clipId=`riyadh-rise-${id}`;
    return `<defs><clipPath id="${clipId}"><rect x="0" y="${top.toFixed(2)}" width="1000" height="650"/></clipPath></defs>
      <g opacity="${progress.complete?0:.50}">${full}</g><g clip-path="url(#${clipId})">${full}</g>`
      + solid(project,x,y,kind==='financial'?1.34:.96,kind==='financial'?.91:.73,.028,.079,LIMESTONE);
  }
  if(kind==='plaza') {
    return quad(project,x,y,.39,.36,.045,'#c9c3ae')
      + quad(project,x,y,.12,.12,.052,'#91a686')
      + tree(project,x,y,.20+fraction*.12,'garden',URBAN_GREEN,.052)
      + [-.11,.11].map(dx=>solid(project,x+dx,y+.12,.08,.027,.049,.071,TIMBER)).join('');
  }
  if(PLANTS.has(kind)) {
    const grove=[[-.34,-.25],[.31,-.24],[-.31,.25],[.34,.25],[0,-.36],[0,.36]];
    const small=/^(lot|block|infill)-/.test(id);
    const paths=id==='king-salman-park'
      ? ribbon(project,[[x-.62,y],[x-.26,y-.38],[x+.37,y-.31],[x+.60,y+.06],[x+.21,y+.41],[x-.42,y+.34],[x-.62,y]],'#f0e5cf',2)
      : id==='salam' ? quad(project,x,y,.33,.24,.059,'#75a5b2') : '';
    return quad(project,x,y,small?.35:.82,small?.35:.68,.052,'#9bb28b') + paths
      + grove.slice(0,Math.max(2,Math.ceil(fraction*grove.length))).map(([dx,dy],i)=>
        tree(project,x+dx*(small?.43:.82),y+dy*(small?.43:.82),.17+fraction*.20+(i%2)*.05,
          kind==='palm'?'palm':'garden',URBAN_GREEN,.052)).join('');
  }
  if(kind==='fort') {
    const height=.22+fraction*.24;
    return landmarkModel(project,x,y,kind,1.5+fraction*1.5,{green:URBAN_GREEN,block:CIVIC})
      + solid(project,x,y-.34,.24,.07,.04,height,LIMESTONE);
  }
  if(kind==='campus') {
    return campusModel(project,x,y,id,fraction);
  }
  if (kind==='cafe' || kind==='retail' || id==='riyadh-park') {
    const cafe=kind==='cafe', h=.12+fraction*.18, w=cafe?.36:.76, l=cafe?.25:.42;
    const facadeColors=id==='barns-riyadh'?['#eee0be','#a97750','#775741']:['#eee8dc','#a9a09a','#74706c'];
    const canopy=solid(project,x,y+l*.48,w*.9,.12,.10,.125,id==='barns-riyadh'?CLAY:BLUE);
    const [tx,ty]=project([x,y+l*.40,h*.75]);
    const sign=id==='halfm-tahlia'?'½M':id==='barns-riyadh'?'BARN’S':'';
    return quad(project,x,y,w*1.1,l*1.35,.035,'#d8cbb3')
      + facade(project,x,y,w,l,.05,h,facadeColors,cafe?3:7,2)+canopy
      + (sign?`<text class="riyadh-store-sign" x="${tx}" y="${ty}" text-anchor="middle">${sign}</text>`:'')
      + solid(project,x+w*.36,y+l*.64,.06,.05,.04,.095,LIMESTONE)
      + solid(project,x-w*.36,y+l*.64,.06,.05,.04,.095,LIMESTONE);
  }
  if(kind==='bridge') return landmarkModel(project,x,y,kind,1+fraction*2,{green:URBAN_GREEN,block:CIVIC});
  const variant=Array.from(id).reduce((sum,ch)=>sum+ch.charCodeAt(0),0)%4;
  const palette = kind==='shop'?BLUE:variant===1?LIMESTONE:variant===2?['#f1dcc9','#bfa795','#9f8878']:CIVIC;
  const w=short ? .26+variant*.012 : .68,l=short ? .22+variant*.012 : .52;
  const h=(short ? .15+variant*.037 : .25)+fraction*(short?.25:.36);
  const roof=solid(project,x-w*.16,y,w*.36,l*.44,h,h+.038,LIMESTONE);
  const entry=facade(project,x,y+l*.42,w*.57,.085,.045,.115,BLUE,2,1);
  const yard=short ? quad(project,x,y,.39,.375,.032,variant%2?'#d8c9b3':'#adbc98') : '';
  const terrace=variant===2?solid(project,x-w*.35,y,w*.26,l*.84,.09,.11,LIMESTONE):'';
  return yard+facade(project,x,y,w,l,.05,h,palette,short?2:5,short?2:4)+entry+terrace+roof;
}

function campusModel(project,x,y,id,fraction) {
  const h=.19+fraction*.30;
  if(id==='ksu-library') {
    return quad(project,x,y,.78,.64,.04,'#d5c9b0')
      + facade(project,x,y,.69,.49,.06,h,CIVIC,7,4)
      + facade(project,x,y+.26,.44,.09,.05,h*.6,BLUE,5,2)
      + solid(project,x,y-.11,.34,.25,h,h+.047,LIMESTONE);
  }
  if(id==='ksu-hospital') {
    return quad(project,x,y,.90,.71,.04,'#d4d8d3')
      + facade(project,x-.22,y,.25,.55,.05,h,CIVIC,3,5)
      + facade(project,x+.23,y,.26,.55,.05,h*1.16,CIVIC,3,5)
      + facade(project,x,y+.15,.48,.24,.05,h*.64,BLUE,5,3)
      + solid(project,x,y+.31,.3,.10,.11,.13,SKY);
  }
  // Three pedestrian spines, linked colleges and interior courtyards.
  const spines=[-.46,0,.46], wings=[];
  for(const dx of spines) for(const dy of [-.46,.20]) {
    wings.push([dx-.14,dy,.19,.39],[dx+.14,dy,.19,.39],[dx,dy-.19,.29,.13]);
  }
  const stone=quad(project,x,y,1.70,1.49,.04,'#d8ccb7');
  const courts=spines.map(dx=>quad(project,x+dx,y+.18,.20,.23,.051,'#859c77')).join('');
  const buildings=wings.sort((a,b)=>project([x+a[0],y+a[1],0])[2]-project([x+b[0],y+b[1],0])[2])
    .map(([dx,dy,w,l])=>facade(project,x+dx,y+dy,w,l,.055,h,CIVIC,3,3)).join('');
  const walks=spines.map(dx=>solid(project,x+dx,y-.10,.075,1.16,.10,.137,LIMESTONE)).join('')
    + solid(project,x,y-.105,1.29,.095,.10,.138,LIMESTONE);
  return stone+courts+buildings+walks+facade(project,x,y+.56,.34,.19,.055,h*.75,BLUE,4,2);
}

function buildYard(project,x,y,kind,compact) {
  const park=PLANTS.has(kind), s=compact?.48:.82, color=park?'#78b38d':'#e9b85d';
  const [cx,cy]=project([x,y+s*.58,.05]);
  const markers=Array.from({length:8},(_,i)=>
    `<rect data-build-step="${i}" x="${(cx-16+i*4.25).toFixed(2)}" y="${(cy+3).toFixed(2)}" width="3.5" height="2.7" rx=".6" fill="${color}" opacity=".23"/>`).join('');
  return `<g aria-hidden="true" class="city-build-yard">
    ${ribbon(project,[[x-s/2,y+s/2],[x+s/2,y+s/2],[x+s/2,y-s/2]],color,1.7,'stroke-dasharray="2 3"')}
    ${activity(project,x,y,park,compact?0:1,compact?.15:.38)}${markers}</g>`;
}

function riyadhScene(world,minutes,selected,turn,escape,projects,activeProject) {
  const project=cityCamera(turn);
  const roads=roadLife(project);
  const locations=[];
  const objects=[];
  const add=(x,y,html)=>objects.push({depth:project([x,y,0])[2],html});
  PARKS.forEach(([x,y,w,l])=>{
    for(let i=0;i<5;i++) {
      const tx=x-w*.41+i*w*.2,ty=y+l*.34;
      add(tx,ty,tree(project,tx,ty,.21,i%2?'garden':'palm',URBAN_GREEN));
    }
  });
  world.landmarks.forEach((lot,index)=>{
    const [, , label, ,x,y,kind,id]=lot;
    const p=landmarkProgress(world.landmarks,index,minutes,projects);
    const isSelected=index===selected,compact=/^(lot|block|infill)-/.test(id);
    const [cx,cy]=project([x,y,.024]);
    locations[index]=[cx,cy-(['kingdom','faisaliah','financial'].includes(kind)?65:18)];
    const [width,length]=riyadhFootprint(lot);
    const base=quad(project,x,y,width,length,.03,isSelected?'#9dd0d7':PLANTS.has(kind)?'#9bb18e':'#dce0d9');
    const model=riyadhLandmark(project,lot,p);
    const pin=isSelected||!compact?`<circle cx="${cx}" cy="${cy+Math.min(8,length*9)}" r="${isSelected?4.5:2.7}" fill="${isSelected?'#eec476':'#f7f3e7'}" stroke="#4b626d" stroke-width="1"/>`:'';
    add(x,y,`<g class="city-lot" role="button" tabindex="0" data-tile="${index}" data-project="${id}" aria-pressed="${isSelected}" aria-label="${escape(label)}">
      <title>${escape(label)}</title>${base}<g data-city-model>${model}</g>${pin}
      ${id===activeProject&&!p.complete?buildYard(project,x,y,kind,compact):''}</g>`);
  });
  const labels=DISTRICT_LABELS.map(([label,x,y])=>{
    const [cx,cy]=project([x,y,.02]);
    return `<text class="riyadh-map-label" x="${cx}" y="${cy}" text-anchor="middle" direction="rtl">${escape(label)}</text>`;
  }).join('');
  return {locations,svg:`<svg class="city-scene riyadh-scene" viewBox="0 0 1000 650" role="group" aria-label="مجسّم مدينة الرياض">
    <defs><radialGradient id="riyadh-lamp-glow"><stop stop-color="#ffe09d" stop-opacity=".85"/><stop offset="1" stop-color="#ffbf62" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="500" cy="553" rx="388" ry="45" fill="#253b47" opacity=".18"/>
    <g class="riyadh-urban-layer">${urbanGround(project)}${roads.traffic}${roads.lights}${objects.sort((a,b)=>a.depth-b.depth).map(o=>o.html).join('')}</g>
    <g class="riyadh-map-labels" aria-hidden="true">${labels}${roads.labels}</g>
  </svg>`};
}

export function riyadhTowerClip(world, turn, selected, fraction) {
  const [, , , ,x,y,kind,id]=world.landmarks[selected];
  const height={kingdom:2.37,faisaliah:2.07,financial:2.05}[kind];
  if (!height) return null;
  return {id:`riyadh-rise-${id}`,y:cityCamera(turn)([x,y,0])[1]-height*74*fraction};
}

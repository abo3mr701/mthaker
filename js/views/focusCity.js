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
const PLANTS = new Set(['palm','pine','garden']);
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

function activity(project,x,y,planting,phase) {
  const [cx,cy] = project([x+.47,y+.48,.045]);
  const [ax,ay] = project([x-.46,y+.36,.04]);
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

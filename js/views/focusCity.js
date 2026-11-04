const COLUMNS = 6;
const ROWS = 4;
const STEP = 1.12;

export function landmarkProgress(city, index, minutes) {
  const goal = city[index][0];
  const previous = city[index - 1]?.[0] ?? 0;
  const next = city[index + 1]?.[0] ?? goal + 600;
  const unlocked = minutes >= goal;
  const start = unlocked ? goal : previous;
  const end = unlocked ? next : goal;
  const fraction = Math.max(0, Math.min(1, (minutes - start) / (end - start)));
  const stage = unlocked ? Math.min(3, 1 + Math.floor(fraction * 3)) : 0;
  return { unlocked, fraction, stage, remaining: Math.max(0, Math.ceil(goal - minutes)), end };
}

function camera(turn) {
  const angle = turn * Math.PI / 2;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return ([x, y, z]) => {
    const u = x * cos - y * sin;
    const v = x * sin + y * cos;
    return [380 + (u - v) * 61, 248 + (u + v) * 33 - z * 76, u + v];
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

const PARKS = new Set([0, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21]);
const GREEN = ['#a9e8a0', '#66ab78', '#4e9468'];
const TRUNK = ['#b48b59', '#966443', '#734d37'];
const FOLIAGE = [
  ['#79e4a6', '#42b779', '#2d8e66'],
  ['#ffe995', '#f5bf57', '#db8c3c'],
  ['#91e7c3', '#52ba96', '#2d9078'],
  ['#f9b3dc', '#d976b5', '#ab5594'],
  ['#bac3fc', '#8f97df', '#6570be'],
];
const BUILDINGS = [
  ['#f6d6a6', '#d5a774', '#ae7d58'],
  ['#e9e2ff', '#bba9ee', '#8979ba'],
  ['#a8e9f4', '#7dbdce', '#568fa7'],
  ['#fbc1b0', '#e48e80', '#bc665f'],
];
const ROOF = ['#ffaf8e', '#e67b65', '#bc524c'];

function park(project, x, y, index, stage) {
  const colors = FOLIAGE[[0, 1, 0, 2, 0, 2, 0, 3, 0, 2, 0, 0, 0, 1, 0, 2, 0, 3, 0, 0, 0, 4][index]];
  if (index === 17) {
    return solid(project, x, y, .69, .61, .08, .12, ['#7addf0', '#459fb8', '#347e9b'])
      + solid(project, x, y, .18 + stage * .09, .18 + stage * .09, .12, .16 + stage * .045, colors, .65);
  }
  const locations = [[0, 0], [-.24, .21], [.24, -.18]].slice(0, stage);
  locations.sort((a, b) => project([x + a[0], y + a[1], 0])[2] - project([x + b[0], y + b[1], 0])[2]);
  return locations.map(([dx, dy]) => {
    const height = dx === 0 ? .24 + stage * .16 : .31;
    const width = dx === 0 ? .22 + stage * .085 : .24;
    return solid(project, x + dx, y + dy, .085, .085, .08, height * .65, TRUNK)
      + solid(project, x + dx, y + dy, width, width, height * .43, height, colors, index === 15 ? .12 : .55);
  }).join('');
}

function building(project, x, y, index, stage) {
  const colors = BUILDINGS[index % BUILDINGS.length];
  const height = (index === 18 || index === 23 ? .34 : .19) + stage * .16;
  if (index === 6) {
    return solid(project, x, y, .68, .63, .08, .18, ['#cbdef2', '#9caec8', '#7186a6'], .88)
      + solid(project, x, y, .46, .43, .18, .21, ['#7addf0', '#459fb8', '#347e9b'])
      + solid(project, x, y, .12, .12, .21, .28 + stage * .11, ['#b6f0ff', '#70d3e6', '#4ca5bc'], .58);
  }
  const width = index === 18 ? .37 : .55 + stage * .052;
  const length = index === 16 ? .79 : .49 + stage * .06;
  const body = solid(project, x, y, width, length, .08, height, colors);
  const roof = solid(project, x, y, width + .07, length + .07, height, height + (index === 2 || index === 22 ? .23 : .09), index === 2 ? ROOF : colors, index === 2 ? .18 : .82);
  const upper = stage >= 2 ? solid(project, x, y, width * .43, length * .43, height + .09, height + .09 + (stage - 1) * .1, BUILDINGS[(index + 1) % 4], .8) : '';
  return body + roof + upper;
}

export function cityScene(city, minutes, selected, turn, escape) {
  const project = camera(turn);
  const ground = solid(project, 0, 0, COLUMNS * STEP + .15, ROWS * STEP + .15, -.23, -.025,
    ['#74969b', '#4b687c', '#385463']);
  const lots = city.map(([goal, icon, label], index) => {
    const x = (index % COLUMNS - (COLUMNS - 1) / 2) * STEP;
    const y = (Math.floor(index / COLUMNS) - (ROWS - 1) / 2) * STEP;
    const { unlocked, stage } = landmarkProgress(city, index, minutes);
    const parkLot = PARKS.has(index);
    const colors = unlocked ? parkLot ? GREEN : ['#c2d8db', '#96b4b7', '#799ba0']
      : ['#9cb3b8', '#78969e', '#637f8b'];
    const isSelected = selected === index;
    const marker = project([x, y, .11]);
    const base = solid(project, x, y, .96, .96, -.01, .08, isSelected ? ['#f5d481', '#d5a950', '#aa7b38'] : colors);
    const model = unlocked ? (parkLot ? park(project, x, y, index, stage) : building(project, x, y, index, stage))
      : solid(project, x, y, .16, .16, .08, .17, ['#c3d2cd', '#93a9a9', '#6e888e'], .65);
    return { depth: marker[2], html: `<g class="city-lot" role="button" tabindex="0" data-tile="${index}"
      aria-pressed="${isSelected}" aria-label="${escape(label)}${unlocked ? '' : '، مقفل'}">
      <title>${escape(label)}</title>${base}${model}</g>` };
  });
  return `<svg class="city-scene" viewBox="0 0 760 505" role="group" aria-label="خريطة مدينة مذاكر ثلاثية الأبعاد">
    <ellipse cx="380" cy="425" rx="272" ry="42" fill="#203451" opacity=".16"/>
    ${ground}${lots.sort((a, b) => a.depth - b.depth).map(lot => lot.html).join('')}
  </svg>`;
}

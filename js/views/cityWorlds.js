import { layoutRiyadh } from './riyadhPlan.js';

export const CITY_WORLDS = {
  riyadh: {
    name: 'الرياض · السعودية',
    description: 'مجسّم مستوحى من الرياض: أبراج في العليا، نسيج عمراني صحراوي، ونخيل على امتداد وادي حنيفة.',
    terrain: 'desert',
    source: 'https://www.rcrc.gov.sa/en/about-entity/rcrc-journey/',
    landmarks: [
      [1800, '🏙️', 'حي العليا · برج المملكة', 'من الحفر إلى جسر المشاهدة.', 1.7, -.9, 'kingdom', 'kingdom', 18],
      [360, '🌴', 'وادي حنيفة', 'تجهيز الضفاف، غرس النخيل، وتأهيل الممرات.', -6.15, 1.35, 'palm', 'wadi-hanifah', 10],
      [1440, '🏙️', 'حي العليا · برج الفيصلية', 'الأساسات، الهيكل المتدرّج، ثم الكرة الذهبية.', -.1, .9, 'faisaliah', 'faisaliah', 16],
      [480, '🏘️', 'حي السفارات · ساحة الكندي', 'رصف الساحة وزراعة الأشجار وبناء الواجهات.', -4.05, .55, 'district', 'al-kindi', 12],
      [2400, '🏢', 'حي العقيق · مركز الملك عبدالله المالي', 'أساسات متعددة، أبراج، وواجهات زجاجية.', 2.6, -4.3, 'financial', 'kafd', 20],
      [420, '🏰', 'منطقة قصر الحكم · المصمك', 'ترتفع الأسوار والأبراج الطينية.', -.3, 4.4, 'fort', 'masmak', 12],
      [300, '🌴', 'حي البجيري · الدرعية', 'مسارات وزراعة على طرف الوادي.', -5.6, -2.85, 'palm', 'bujairi', 10],
      [540, '🏛️', 'حي الطريف · الدرعية', 'مجموعة مبانٍ نجدية تُبنى على مراحل.', -6.35, -1.2, 'fort', 'turaif', 12],
      [960, '🎓', 'جامعة الملك سعود · المدينة الجامعية', 'تهيئة الحرم، مباني الكليات، والساحات.', -3.25, -2.7, 'campus', 'ksu-campus', 16],
      [480, '📚', 'جامعة الملك سعود · مكتبة الملك سلمان المركزية', 'يبنى مبنى المكتبة داخل الحرم الجامعي.', -2.1, -1.45, 'campus', 'ksu-library', 12],
      [600, '🏥', 'جامعة الملك سعود · مستشفى الملك خالد الجامعي', 'بناء أجنحة المستشفى وتجهيز مداخله.', -3.45, -4.25, 'campus', 'ksu-hospital', 14],
      [540, '🏛️', 'حي المربع · المتحف الوطني', 'تشييد قاعات المتحف وساحاته.', 1.3, 3.2, 'district', 'national-museum', 12],
      [360, '🏰', 'حي المربع · قصر المربع', 'بناء الأفنية والممرات ذات الطابع النجدي.', .15, 2.35, 'fort', 'murabba', 10],
      [240, '📖', 'مركز الملك عبدالعزيز التاريخي · مكتبة الملك عبدالعزيز العامة', 'تهيئة المكتبة ومساحاتها.', 2.45, 4.55, 'district', 'kaz-library', 8],
      [180, '🌳', 'مركز الملك عبدالعزيز التاريخي · المتنزه العام', 'زرع الأشجار وإكمال الممرات حول المركز.', -1.4, 3.45, 'garden', 'historical-park', 8],
      [240, '🛍️', 'حي الديرة · سوق الزل', 'تبليط الممرات وتجهيز الدكاكين.', -1.9, 4.5, 'district', 'al-zal', 8],
      [360, '🌳', 'حي الملز · منتزه الملك عبدالله', 'تتوسع المساحات الخضراء على مراحل.', 4.35, 2.35, 'garden', 'king-abdullah-park', 12],
      [540, '🦒', 'حي الملز · حديقة الحيوانات بالرياض', 'تهيئة المسارات وزراعة الظل حول الحديقة.', 5.8, 3.4, 'garden', 'riyadh-zoo', 12],
      [720, '🌳', 'حديقة الملك سلمان', 'تشكيل التضاريس وإضافة مناطق خضراء متتابعة.', 5.25, -.7, 'garden', 'king-salman-park', 14],
      [660, '🚇', 'محطة قصر الحكم · مترو الرياض', 'تنفيذ المحطة ومداخلها وساحتها.', 3.7, 4.45, 'district', 'qasr-metro', 14],
      [300, '🌴', 'منتزه سلام', 'زراعة النخيل وتشكيل أحواض الحديقة.', -3.6, 3.7, 'palm', 'salam', 10],
      [360, '🚲', 'المسار الرياضي · وادي حنيفة', 'تهيئة ممرات المشاة والدراجات بمحاذاة الوادي.', -5.45, 3.45, 'bridge', 'sports-boulevard', 10],
      [540, '🛍️', 'حي العقيق · الرياض بارك', 'بناء مرافق المول ومداخله.', 4.1, -4.4, 'district', 'riyadh-park', 12],
    ],
  },
  bergen: {
    name: 'بيرغن · النرويج',
    description: 'واجهات خشبية ملوّنة عند المرفأ، وتلال خضراء وغابات صنوبر حول المدينة.',
    terrain: 'fjord',
    source: 'https://www.visitnorway.com/places-to-go/fjord-norway/bergen/summer/',
    landmarks: [
      [0, '🏘️', 'بريغن · Bryggen', 'تظهر واجهات المرفأ الخشبية واحدة بعد أخرى.', -.7, -1, 'harbor'],
      [5, '🌲', 'جبل فلوين · Fløyen', 'أشجار جديدة تكبر فوق السفح الأخضر.', 4.8, -2.7, 'pine'],
      [15, '🌳', 'حديقة المدينة · Byparken', 'يمتد العشب وتزداد الأشجار حول الممر.', 1.6, 1.2, 'garden'],
      [25, '🐟', 'سوق السمك · Fisketorget', 'تتكوّن مباني السوق عند طرف المرفأ.', -.1, .5, 'harbor'],
      [40, '🚞', 'قطار فلوين · Fløibanen', 'يمتد مسار القطار صعودًا نحو الجبل.', 2.8, -1.5, 'bridge'],
      [60, '🏔️', 'جبل أولريكن · Ulriken', 'يظهر الغطاء النباتي بالتدريج على السفح.', 5, 3.4, 'pine'],
    ],
  },
  lucerne: {
    name: 'لوتسرن · سويسرا',
    description: 'بحيرة زرقاء، جسور قديمة، وحدائق على سفوح جبال الألب.',
    terrain: 'alpine',
    source: 'https://www.luzern.com/en/the-city/sights/top-sights/All/offset%253A12/offset%3A12/',
    landmarks: [
      [0, '🌉', 'جسر تشابل وبرج الماء', 'يُركّب العمال أجزاء الجسر الخشبي عند مدخل البحيرة.', -.6, .4, 'bridge'],
      [5, '🌿', 'مزرعة هينتر موزيغ', 'يزرع المزارع صفوفًا جديدة خلف سور المدينة.', 2.2, -3.2, 'garden'],
      [15, '🏘️', 'البلدة القديمة', 'تظهر المنازل الملونة والأسقف المتدرجة.', 1.3, -1.25, 'harbor'],
      [25, '🏰', 'سور موزيغ', 'تُستكمل الأبراج الحجرية على الحافة المرتفعة.', 3.8, -2.5, 'fort'],
      [40, '🌳', 'ممشى بحيرة لوتسرن', 'أشجار وظلال على الواجهة المائية.', 3.2, 1.3, 'garden'],
      [60, '🏛️', 'المتحف السويسري للنقل', 'يتوسّع المجسّم على طرف البحيرة.', 5, 2.5, 'district'],
    ],
  },
};

// These lots represent ordinary projects in the model. They are not named buildings.
const riyadh = CITY_WORLDS.riyadh.landmarks;
const districts = [
  ['العليا', .8, .05], ['العقيق', 3.4, -4], ['حي السفارات', -4.2, .5],
  ['المربع', 1.1, 3.2], ['الديرة', -1.5, 4.35], ['الملز', 4.7, 2.4],
];
const mainLots = riyadh.slice();
for (let row = 0; row < 10; row++) {
  for (let column = 0; column < 13; column++) {
    const x = -5.1 + column * .88, y = -4.75 + row * 1.05;
    if (mainLots.some(([, , , , px, py]) => Math.hypot(x - px, y - py) < .9)) continue;
    if ([-3.1, -.55, 2.55, 4].some(road => Math.abs(y - road) < .23)
        || [-2.8, -.8, 1.15, 3.45, 5.6].some(road => Math.abs(x - road) < .24)) continue;
    if (x > 5.25 && Math.abs(y) > 3.5) continue;
    const [district] = districts.reduce((nearest, area) =>
      Math.hypot(x - area[1], y - area[2]) < Math.hypot(x - nearest[1], y - nearest[2]) ? area : nearest);
    const type = (row + 2 * column) % 5;
    const [title, icon, kind, minutes] = type === 0 ? ['حديقة صغيرة', '🌳', 'garden', 120]
      : type < 3 ? ['بيت', '🏠', 'house', 150] : ['محل', '🏪', 'shop', 180];
    const number = row * 13 + column + 1;
    riyadh.push([minutes, icon, `${district} · ${title} ${number}`, 'قطعة تطوير داخل مجسّم الحي.',
      x, y, kind, `lot-${row}-${column}`, 6]);
  }
}

/* Plan coordinates are schematic. Keep existing project IDs and study budgets when moving lots. */
const riyadhPlan = CITY_WORLDS.riyadh;
riyadhPlan.description = 'من وادي حنيفة والدرعية غربًا إلى الملز شرقًا، مرورًا بالعقيق والعليا والرياض التاريخية.';
riyadhPlan.terrain = 'riyadh';
const locations = {
  kingdom:[-.07,-1.48], faisaliah:[-.07,.88], kafd:[1.65,-5.58], 'riyadh-park':[3.16,-5.65],
  'wadi-hanifah':[-7.47,.43], 'al-kindi':[-5.63,.96], bujairi:[-7.04,-3.48], turaif:[-8.36,-3.79],
  'ksu-campus':[-4.55,-3.32], 'ksu-library':[-5.61,-3.28], 'ksu-hospital':[-4.52,-4.5],
  masmak:[-.05,5.12], 'al-zal':[-1.45,5.1], 'qasr-metro':[.95,5.24], salam:[-3.04,5.38],
  'national-museum':[.97,3.13], murabba:[-.07,3.15], 'kaz-library':[1.91,3.13],
  'historical-park':[-1.68,3.21], 'king-abdullah-park':[5.05,3.7], 'riyadh-zoo':[6.65,3.67],
  'king-salman-park':[4.81,-.46], 'sports-boulevard':[-7.77,-.93],
};
const blocks = [
  ['العقيق',1.55,-4.46,2], ['العقيق',4.18,-4.46,2], ['العليا',-1.95,-1.4,2],
  ['العليا',.96,-1.4,2], ['العليا',-1.95,1.12,2], ['العليا',2.2,1.12,2],
  ['حي السفارات',-5.65,2.12,2], ['حي السفارات',-4.42,.91,1], ['حي السفارات',-5.65,-.4,2],
  ['المربع',.75,4.08,2], ['المربع',2.35,4.08,2], ['الديرة',-2.7,4.09,2],
  ['الديرة',-2.18,5.68,2], ['الملز',5.18,1.72,2], ['الملز',7.32,2.18,2],
  ['العقيق',5.49,-4.46,2], ['الملز',7.32,4.73,2], ['العليا',3.53,-1.4,2],
];
const positions = new Map();
for (const [district, x, y, density] of blocks) {
  const lots = positions.get(district) ?? [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < density + 1; col++) {
      const px = x + (col - density / 2) * .43, py = y + (row - .5) * .50;
      if (Object.values(locations).every(([lx,ly]) => Math.hypot(lx-px,ly-py) > .59)
        && lots.every(([lx,ly]) => Math.hypot(lx-px,ly-py) > .39)) lots.push([px,py]);
    }
  }
  positions.set(district,lots);
}
const cursors = new Map();
for (const landmark of riyadhPlan.landmarks) {
  const key = landmark[7];
  const district = landmark[2].split(' · ')[0];
  const slots = positions.get(district) ?? [];
  const cursor = cursors.get(district) ?? 0;
  const point = locations[key] ?? slots[cursor];
  if (point) {
    [landmark[4], landmark[5]] = point;
    if (!locations[key]) cursors.set(district, cursor + 1);
  }
}
for (const [district, slots] of positions) {
  for (let index = cursors.get(district) ?? 0; index < slots.length; index++) {
    const [x,y] = slots[index];
    const kind = index % 4 === 3 ? 'shop' : 'house';
    riyadhPlan.landmarks.push([kind === 'house' ? 150 : 180, kind === 'house' ? '🏠' : '🏪',
      `${district} · ${kind === 'house' ? 'وحدة سكنية' : 'واجهة تجارية'} ${index+1}`,
      'مشروع عمراني داخل الحي.',x,y,kind,`block-${blocks.findIndex(([name])=>name===district)}-${index}`,6]);
  }
}

riyadhPlan.landmarks.push(
  [210, '☕', 'شارع التحلية · هاف مليون', 'مقهى مستوحى من أول فرع للعلامة في شارع التحلية.', 1.25, .86, 'cafe', 'halfm-tahlia', 8],
  [180, '☕', 'الرياض · بارنز', 'فرع مصغّر مستوحى من مقاهي بارنز، بموقع تمثيلي في المجسّم.', 4.16, -3.1, 'cafe', 'barns-riyadh', 8],
  [300, '🛍️', 'العقيق · مجمّع تجاري', 'متاجر ومطاعم وساحة مشاة داخل الحي.', 6.16, -5.55, 'retail', 'aqiq-retail', 10],
  [270, '🛍️', 'الملز · مجمّع الحي', 'محلات متصلة برواق مظلّل وساحة جلوس.', 6.09, 4.19, 'retail', 'malaz-retail', 9],
  [300, '🛍️', 'شرق الرياض · مجمّع المقاهي', 'مقاهٍ ومطاعم تطل على ساحة مشاة.', 5.95, 1.06, 'retail', 'east-food-court', 10],
);
layoutRiyadh(riyadhPlan.landmarks);

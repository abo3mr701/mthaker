const arabic = [
  {
    text: 'سَأَضْرِبُ في طُولِ البِلادِ وَعَرْضِها\nأَنالُ مُرادي أَو أَموتُ غَريبًا',
    author: 'الإمام الشافعي',
    source: 'https://www.islamarchive.cc/ketab_content/22119/p-3',
  },
  'اختر مهمة واضحة قبل أن تبدأ، حتى تعرف متى أنجزتها.',
  'بعد القراءة، أغلق الكتاب وحاول شرح الفكرة بكلماتك.',
  'إذا أخطأت في سؤال، دوّن السبب قبل أن تعيد المحاولة.',
  'خصص وقتًا لما يصعب عليك فهمه، وابدأ بمثال بسيط.',
  'قسّم الدرس الطويل إلى أجزاء، وخذ استراحة بين الأجزاء.',
  {
    text: 'عَلى قَدرِ أَهلِ العَزمِ تَأتي العَزائِمُ\nوَتَأتي عَلى قَدرِ الكِرامِ المَكارِمُ',
    author: 'أبو الطيب المتنبي',
    source: 'https://www.aldiwan.net/poem10524.html',
  },
  'حوّل ملاحظاتك إلى أسئلة تستطيع مراجعتها لاحقًا.',
  'امنح المسألة وقتًا للتفكير قبل أن تطّلع على الحل.',
  'جرّب شرح فكرة واحدة لشخص لم يدرسها من قبل.',
  'إذا تراكمت عليك المهام، ابدأ بالأقرب موعدًا.',
  'ضع جوالك بعيدًا خلال جلسة التركيز.',
  {
    text: 'إِذا غامَرتَ في شَرَفٍ مَرومٍ\nفَلا تَقنَع بِما دونَ النُّجومِ',
    author: 'أبو الطيب المتنبي',
    source: 'https://www.islam.museum/ar/passage/poem-mutanabbi-la-taqnaa-bima-dun-al-nujum-01/',
  },
  'اكتب ما تحتاج مراجعته غدًا قبل أن تنهي جلسة اليوم.',
  'اسأل عن النقطة التي توقفت عندها بالتحديد.',
  'اربط المعلومة الجديدة بشيء تعرفه من قبل.',
  'رتّب مكانك وجهّز أدواتك لتسهّل على نفسك البداية.',
  'اكتب مثالًا من حياتك على المفهوم الذي تدرسه.',
  {
    text: 'وَمَن لا يُحِبُّ صُعودَ الجِبالِ\nيَعِشْ أَبَدَ الدَّهْرِ بَينَ الحُفَرْ',
    author: 'أبو القاسم الشابي',
    source: 'https://ar.wikisource.org/wiki/إرادة_الحياة',
  },
  'اترك في جدولك مساحة للراحة والنوم.',
  'ابدأ جلسة اليوم بسؤال من درس أمس.',
  'راجع سبب اختيارك للإجابة، حتى لو كانت صحيحة.',
  'إن فاتتك جلسة، ارجع في أقرب وقت يناسبك.',
  'جرّب كتابة ملخص قصير من الذاكرة.',
  {
    text: 'وَمَن لَم يَذُق مُرَّ التَّعَلُّمِ ساعَةً\nتَجَرَّعَ ذُلَّ الجَهلِ طولَ حَياتِهِ',
    author: 'الإمام الشافعي',
    source: 'https://www.islamarchive.cc/ketab_content/22119/p-4',
  },
  'استخدم الرسم إذا كان يوضح لك علاقة بين فكرتين.',
  'تدرّب على استخدام كلمة جديدة في جملة تخصّك.',
  'راجع أولوياتك حين يضيق الوقت، وابدأ بالأهم.',
  'لاحظ أي طريقة ساعدتك على الفهم، وكررها في الدرس التالي.',
  'اعترف بما لم تفهمه بعد، وحدد أول سؤال تحتاج إجابته.',
];

const english = [
  'Start with one word and make it yours.',
  'Try to recall the meaning before you turn the card.',
  'Use a new word in a sentence about your own life.',
  'Give yourself time to find the right word.',
  'Write down the words you keep mixing up.',
  'Say one example aloud before moving on.',
  'Pick a small goal for today’s practice.',
  'Notice one thing you can express more clearly today.',
  'Look at a mistake and work out how to fix it.',
  'Take a short break and come back ready to focus.',
];

function forDay(messages, date, start = '2026-11-04') {
  const day = (Date.parse(date + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86_400_000;
  return messages[(day % messages.length + messages.length) % messages.length] || messages[0];
}

export function arabicMessageForDay(date) {
  const message = forDay(arabic, date);
  return typeof message === 'string' ? { text: message } : message;
}
export const englishMessageForDay = date => forDay(english, date);

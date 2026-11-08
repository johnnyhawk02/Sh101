// Shyoy: Preset auto-namer.
// ---------- preset auto-namer (v0.22.12) ----------
// A name is two invented words. Each word is a front piece of one source word joined to a back piece of another
// (sometimes with a middle syllable too). Every piece picks its source evenly, 1/4 each: Welsh village names,
// Yorkshire village names, French dishes and cookery words, and alien syllables. Joints that would be hard to say
// (three or more consonants, three vowels in a row, doubled letters, a hard stop into a consonant) are thrown away and tried again.
const NAMER = (() => {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  const chance = (p) => Math.random() < p;
  const clean = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const WELSH = ['llanfair', 'llanberis', 'beddgelert', 'capelcurig', 'dolgellau', 'abersoch', 'aberdaron', 'penmachno', 'trefriw',
    'llangollen', 'cerrigydrudion', 'rhossili', 'porthgain', 'solva', 'nefyn', 'harlech', 'criccieth', 'llanrwst', 'bala', 'corris',
    'dinas', 'mawddwy', 'tregaron', 'pumsaint', 'llandovery', 'aberaeron', 'llangrannog', 'aberporth', 'cenarth', 'newport', 'trefin',
    'nevern', 'llanelli', 'pontrhydfendigaid', 'devilsbridge', 'ystrad', 'llanidloes', 'machynlleth', 'aberdyfi', 'tywyn', 'barmouth',
    'maentwrog', 'portmeirion', 'borth', 'llanuwchllyn', 'trawsfynydd', 'ffestiniog', 'penrhyndeudraeth', 'llanbedr', 'dyffryn', 'talsarnau',
    'rhyd', 'nantgwynant', 'deiniolen', 'bethesda', 'llanfairfechan', 'penmaenmawr', 'conwy', 'rowen', 'llanrhychwyn', 'cwmystwyth',
    'pontsian', 'llansteffan', 'laugharne', 'pendine', 'amroth', 'manorbier', 'bosherston', 'llanddewi', 'myddfai', 'llanwrtyd', 'abergwesyn',
    'rhayader', 'elan', 'cwmbran', 'tintern', 'skenfrith', 'grosmont', 'crickhowell', 'talgarth', 'llangorse', 'hay', 'clyro', 'painscastle',
    'llanfyllin', 'meifod', 'llanrhaeadr', 'pennant', 'bwlch', 'llanarmon', 'llandegla', 'ruthin', 'cilcain', 'caerwys', 'trelawnyd',
    'dyserth', 'llanfihangel', 'aberffraw', 'rhosneigr', 'moelfre', 'cemaes', 'amlwch', 'beaumaris', 'llangefni', 'pentraeth', 'nefern'];
  const YORKS = ['huttonlehole', 'goathland', 'grassington', 'haworth', 'malham', 'kettlewell', 'thwaite', 'muker', 'reeth', 'askrigg',
    'hawes', 'robinhoods', 'thornton', 'helmsley', 'kilburn', 'coxwold', 'appletreewick', 'burnsall', 'horton', 'ribblesdale', 'settle',
    'giggleswick', 'clapham', 'austwick', 'ingleton', 'dent', 'sedbergh', 'heptonstall', 'mytholmroyd', 'holmfirth', 'slaithwaite', 'marsden',
    'runswick', 'staithes', 'sandsend', 'lastingham', 'rosedale', 'hovingham', 'bainbridge', 'aysgarth', 'wensley', 'middleham', 'masham',
    'kirkby', 'malzeard', 'pateley', 'ramsgill', 'lofthouse', 'linton', 'arncliffe', 'litton', 'buckden', 'starbotton', 'hubberholme',
    'gunnerside', 'keld', 'langthwaite', 'arkengarthdale', 'osmotherley', 'swainby', 'hinderwell', 'ravenscar', 'fylingthorpe', 'grosmont',
    'egton', 'glaisdale', 'lealholm', 'danby', 'castleton', 'westerdale', 'farndale', 'gillamoor', 'wombleton', 'nunnington', 'ampleforth',
    'oswaldkirk', 'stonegrave', 'terrington', 'bulmer', 'sheriffhutton', 'flaxton', 'cawood', 'sledmere', 'thixendale', 'wetwang',
    'fridaythorpe', 'huggate', 'warter', 'bishopwilton', 'londesborough', 'sancton', 'welwick', 'patrington', 'skipsea', 'flamborough',
    'bempton', 'hunmanby', 'wold', 'wharram', 'haxby', 'bilbrough', 'ulleskelf', 'lothersdale', 'cononley', 'embsay', 'cracoe', 'hetton',
    'rylstone', 'threshfield', 'conistone', 'kilnsey', 'hebden', 'cowling', 'oxenhope', 'stanbury', 'ripponden', 'luddenden', 'hepworth'];
  const FRENCH = ['bouillabaisse', 'cassoulet', 'ratatouille', 'tartiflette', 'choucroute', 'blanquette', 'bourguignon', 'gratin',
    'croissant', 'quiche', 'souffle', 'crepe', 'galette', 'rillettes', 'terrine', 'potaufeu', 'coqauvin', 'navarin', 'daube', 'brandade',
    'pissaladiere', 'aligot', 'tapenade', 'vichyssoise', 'consomme', 'veloute', 'bechamel', 'hollandaise', 'remoulade', 'meringue',
    'madeleine', 'financier', 'clafoutis', 'profiterole', 'croquembouche', 'millefeuille', 'eclair', 'brioche', 'fougasse', 'gougere',
    'raclette', 'fondue', 'confit', 'magret', 'escargot', 'andouillette', 'cervelas', 'papillote', 'julienne', 'mirepoix', 'flambe',
    'persillade', 'gribiche', 'ravigote', 'bearnaise', 'meuniere', 'provencale', 'nicoise', 'pistou', 'aioli', 'rouille', 'garbure',
    'piperade', 'tourtiere', 'quenelle', 'gratinee', 'croquemonsieur', 'baguette', 'tarte', 'tatin', 'macaron', 'canele', 'kouignamann',
    'paris', 'brest', 'charlotte', 'bavarois', 'marquise', 'praline', 'nougatine', 'chantilly', 'frangipane', 'sabayon', 'beurreblanc',
    'duxelles', 'bouquetgarni', 'fricassee', 'ragout', 'saucisson', 'jambon', 'boudin', 'pate', 'foie', 'gras', 'cocotte', 'poulet',
    'canard', 'lapin', 'moules', 'mariniere', 'frites', 'soupe', 'oignon', 'potage', 'parmentier', 'dauphinoise', 'lyonnaise', 'bordelaise',
    'chasseur', 'paupiette', 'pithivier', 'feuillete', 'vol', 'vent', 'tuile', 'palmier', 'savarin', 'baba', 'religieuse', 'opera'];
  // alien: made-up front, middle and back syllables, used as pieces directly
  const A_PRE = ['zor', 'qua', 'vex', 'thra', 'xil', 'oom', 'kry', 'bla', 'nyx', 'gor', 'fen', 'plu', 'yth', 'ska', 'zub', 'mor', 'quee',
    'drax', 'xan', 'vor', 'glo', 'zha', 'ul', 'yog', 'shub', 'nar', 'az', 'ix', 'thul', 'krel', 'oog', 'zee', 'phla', 'gri', 'tzo', 'ka',
    'xo', 'quo', 'zim', 'bru', 'dzo', 'wub', 'ruu', 'tlo', 'eek', 'ozz', 'gla', 'hra', 'jhe', 'lyx', 'vim', 'kzo', 'ploo', 'zym'];
  const A_MID = ['la', 'ri', 'on', 'ex', 'ub', 'ix', 'ol', 'ee', 'u', 'yo', 'oz', 'ath', 'ul', 'ik', 'or', 'ei', 'yr', 'ag', 'esh', 'zu', 'qui'];
  const A_END = ['th', 'x', 'nok', 'ar', 'ium', 'ozz', 'eep', 'ul', 'orb', 'ak', 'ish', 'oid', 'onoz', 'ix', 'ux', 'yth', 'aal', 'orr', 'ek',
    'oth', 'ulon', 'ax', 'iq', 'zz', 'oon', 'ra', 'ka', 'ogg', 'esk', 'alq', 'umph', 'izz', 'ond', 'yx', 'zor', 'quax'];
  const V = /[aeiouy]/;
  const DI = ['ll', 'dd', 'ff', 'ch', 'th', 'ph', 'sh', 'rh', 'wh', 'qu', 'gh', 'ss'];
  // split a word into syllables: each vowel group with the consonants before it; a consonant run between vowels
  // gives its first letter (or a digraph) to the syllable before when it is two or more long
  const sylls = (w) => {
    const out = [];
    let cur = '', i = 0;
    while (i < w.length) {
      let c = '';
      while (i < w.length && !V.test(w[i])) c += w[i++];
      if (i >= w.length) { cur += c; break; }
      if (cur) {
        let k = 0;
        if (c.length >= 2) k = (DI.includes(c.slice(0, 2)) && c.length > 2) ? 2 : (DI.includes(c) ? 0 : 1);
        cur += c.slice(0, k); out.push(cur); cur = c.slice(k);
      } else cur = c;
      while (i < w.length && V.test(w[i])) cur += w[i++];
    }
    if (cur) out.push(cur);
    return out;
  };
  const CUT = {};
  for (const [k, list] of Object.entries({ WELSH, YORKS, FRENCH })) CUT[k] = list.map(clean).map(sylls).filter(s => s.length >= 2);
  const SRC = ['WELSH', 'YORKS', 'FRENCH', 'ALIEN'];
  // a front, middle or back piece from one source
  const piece = (where) => {
    const src = pick(SRC);
    if (src === 'ALIEN') return where === 'front' ? pick(A_PRE) : where === 'mid' ? pick(A_MID) : pick(A_END);
    const s = pick(CUT[src]);
    if (where === 'front') return s.slice(0, chance(0.6) || s.length < 3 ? 1 : 2).join('');
    if (where === 'mid') return s[1 + Math.floor(Math.random() * (s.length - 1))].replace(/^[^aeiouy]{2,}/, (c) => c.slice(-1));
    return s.slice(chance(0.7) || s.length < 3 ? -1 : -2).join('');
  };
  // a joint is sayable when it makes no run of 3+ consonants, 3+ vowels or a doubled letter that wasn't in a source
  const sayable = (a, b) => {
    const j = a.slice(-3) + '|' + b.slice(0, 3), t = j.replace('|', '');
    if (/[^aeiouy]{3,}/.test(t) && !/[^aeiouy]{3,}/.test(a.slice(-3)) && !/[^aeiouy]{3,}/.test(b.slice(0, 3))) return false;
    if (/[aeiouy]{3,}/.test(t) && !/[aeiouy]{3,}/.test(a) && !/[aeiouy]{3,}/.test(b)) return false;
    const x = a.slice(-1), y = b[0];
    if (!V.test(x) && !V.test(y) && !/[lrnmsf]/.test(x) && !/[lrhwy]/.test(y)) return false; // Wub+mawr, Stoneg+te
    return x !== y;
  };
  const word = () => {
    for (let i = 0; i < 40; i++) {
      const parts = [piece('front')];
      if (chance(0.25)) parts.push(piece('mid'));
      parts.push(piece('back'));
      let ok = true;
      for (let p = 1; p < parts.length && ok; p++) ok = sayable(parts[p - 1], parts[p]);
      const w = parts.join('');
      if (ok && V.test(w) && w.length >= 4 && w.length <= 10 && !/[^aeiouy]{4,}/.test(w)) return cap(w);
    }
    return cap(pick(A_PRE) + pick(A_END));
  };
  return (taken = {}) => {
    for (let i = 0; i < 30; i++) {
      const a = word(), b = word();
      if (a === b) continue;
      const n = a + ' ' + b;
      if (!(n in taken)) return n;
    }
    return 'Preset ' + (Object.keys(taken).length + 1);
  };
})();

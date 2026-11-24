/**
 * محرك الشخصيات الـ 18 (9 أساسية + 9 VIP) ومكتبة الأصوات البشرية
 * المسار في GitHub: js/characters_engine.js
 * - يعمل بـ 0 استهلاك API عبر إعادة استخدام ملفات MP3 (48kbps Mono) المخزنة في الكاش.
 * - يدعم وضع توفير البيانات (Data Saver) والتخزين الكسول (Lazy Caching).
 */

window.ARENA_CHARACTERS = [
  // === 9 شخصيات أساسية (مجانية للجميع) ===
  {
    id: 'buddy', name: 'بندق الودود', tier: 'basic', img: 'buddy.jpg',
    role: 'مرشد المبتدئين', skillDesc: '+10% XP في أول 3 جولات يومياً',
    lines: {
      welcome: 'أهلاً وسهلاً فيك بعالم التحديات! جاهز نكسر الأرقام؟',
      start: 'ركز منيح وخلّي عينك عالطريق، بالتوفيق يا بطل!',
      win: 'يا عيني عليك! فوز مستحق وممتاز!',
      lose: 'لا تزعل، الجولات الجاية إلك بإذن الله!'
    }
  },
  {
    id: 'lolo', name: 'لولو النشيطة', tier: 'basic', img: 'lolo.jpg',
    role: 'أخصائية السرعة', skillDesc: '+5% نقاط إضافية عند تحقيق نتيجة عالية بسرعة (في تحديات الأرقام)',
    lines: {
      welcome: 'يلا نشاط وحماس! الساحة ناطرتك!',
      start: 'انطلق بأقصى سرعة، ما في وقت للتردد!',
      win: 'واو! سرعة خرافية وفوز رهيب!',
      lose: 'أسرع شوي المرة الجاية وبتجيبها!'
    }
  },
  {
    id: 'noor', name: 'نور الهادئة', tier: 'basic', img: 'noor.jpg',
    role: 'حافظة التركيز', skillDesc: 'استقرار أعلى و+5% XP للتركيز المتزن',
    lines: {
      welcome: 'خذ نفس عميق وركز، الهدوء سر الفوز.',
      start: 'خطوة بخطوة وبهدوء، أنت قدها.',
      win: 'رائع! هدوءك وتركيزك جابوا النتيجة.',
      lose: 'كل تجربة بتعلمنا، جرب مرة تانية بهدوء.'
    }
  },
  {
    id: 'chef', name: 'الشيف الماهر', tier: 'basic', img: 'chef.jpg',
    role: 'حكم التحديات', skillDesc: 'مكافأة XP إضافية في التحديات اليومية',
    lines: {
      welcome: 'اليوم طبختنا تحدي من العيار الثقيل!',
      start: 'المقادير جاهزة، ورجينا مهارتك!',
      win: 'تسلم إيدك! شغل معلمين عن جد!',
      lose: 'نقصها رشة تركيز، المرة الجاية بتزبط!'
    }
  },
  {
    id: 'pastry', name: 'صانعة الحلويات', tier: 'basic', img: 'pastry.jpg',
    role: 'صانعة المكافآت', skillDesc: 'تزيد مكافأة XP اليومية بنسبة 10%',
    lines: {
      welcome: 'أهلاً فيك! يومك حلو متل انتصاراتك!',
      start: 'بالتوفيق، إن شاء الله جولة حلوة وممتعة!',
      win: 'مبروك الفوز الحلو يا بطل!',
      lose: 'مو مشكلة، الجاية أحلى أكيد!'
    }
  },
  {
    id: 'athlete', name: 'البطل الرياضي', tier: 'basic', img: 'athlete.jpg',
    role: 'مضاعف سلاسل الفوز', skillDesc: 'مكافأة XP مضاعفة عند 3 انتصارات متتالية',
    lines: {
      welcome: 'الروح الرياضية العالية بتصنع الأبطال!',
      start: 'سخّن منيح وانطلق للتحدي!',
      win: 'بطل! سلسلة انتصارات ما بتتوقف!',
      lose: 'البطل بيقوم أقوى بعد كل خسارة!'
    }
  },
  {
    id: 'sheikh', name: 'شيخ الشباب', tier: 'basic', img: 'sheikh.jpg',
    role: 'مضيف البطولات', skillDesc: 'شارة شيخ الساحة عند إنشاء تحديات PvP',
    lines: {
      welcome: 'يا هلا بشيخ الشباب! نورت الساحة!',
      start: 'افتح الساحة وورجيهم مين الأفضل!',
      win: 'كفو والله! رفعت الراس!',
      lose: 'بسيطة يا غالي، الساحة طويلة!'
    }
  },
  {
    id: 'saver', name: 'خبير التوفير', tier: 'basic', img: 'saver.jpg',
    role: 'اقتصادي الساحة', skillDesc: 'تخفيض 5% على شراء الأدوات التكتيكية في المتجر',
    lines: {
      welcome: 'الذكي هو اللي بيستثمر نقاطه صح!',
      start: 'احسبها صح واكسب بأقل تكلفة!',
      win: 'صفقة رابحة 100%! أحسنت!',
      lose: 'لا تهدر نقاطك، ركز بالجولة الجاية.'
    }
  },
  {
    id: 'homemaker', name: 'رفيقة المنزل', tier: 'basic', img: 'homemaker.jpg',
    role: 'منظمة المهام', skillDesc: '+15% XP عند إتمام جولات متنوعة',
    lines: {
      welcome: 'كل شي مرتب وجاهز لتحديات اليوم!',
      start: 'ابدأ بنظام وتركيز، بالتوفيق!',
      win: 'ممتاز! ترتيبك وتنظيمك جابوا الفوز!',
      lose: 'ولا يهمك، منرجع نرتب الخطة ومنفوز.'
    }
  },

  // === 9 شخصيات VIP (تُفتح بالملكية الدائمة أو الشراء اليومي من متجر معاذ) ===
  {
    id: 'coach_sakhr', name: 'كابتن صخر', tier: 'vip', img: 'coach_sakhr.jpg',
    role: 'زعيم تحديات التحمل', skillDesc: 'قدرة الاندفاع: +10% مكافأة عند كسر الأرقام القياسية (حد صارم)',
    lines: {
      welcome: 'جاهز للتحمل؟ الصخر ما بينكسر!',
      start: 'أعطِ كل طاقتك الآن، لا تراجع!',
      win: 'قوة جبارة! كسرت الرقم بجدارة!',
      lose: 'انهض فوراً! التمرين يصنع المستحيل!'
    }
  },
  {
    id: 'grand_chef', name: 'الشيف الذهبي', tier: 'vip', img: 'grand_chef.jpg',
    role: 'سيد التحديات الذهبية', skillDesc: '+15% XP ذهبي في جميع الجولات',
    lines: {
      welcome: 'أهلاً بك في مائدة الكبار والنخبة!',
      start: 'الدقة والإتقان هما سر التميز.',
      win: 'أداء ذهبي يليق بالأبطال!',
      lose: 'حتى كبار الطهاة يتعلمون من كل جولة.'
    }
  },
  {
    id: 'princess_layla', name: 'الأميرة ليلى', tier: 'vip', img: 'princess_layla.jpg',
    role: 'راعية البطولات الملكية', skillDesc: 'تخفيض 5% على عمولة ساحة PvP وشارة ملكية',
    lines: {
      welcome: 'أهلاً بك في الساحة الملكية، أتمنى لك فوزاً راقياً.',
      start: 'تألق بأسلوبك الهادئ والواثق.',
      win: 'انتصار ملكي بامتياز! مبارك لك.',
      lose: 'لا بأس، التاج ينتظرك في الجولة القادمة.'
    }
  },
  {
    id: 'butler_farid', name: 'السيد فريد', tier: 'vip', img: 'butler_farid.jpg',
    role: 'مدير الخزينة', skillDesc: 'استرداد 10% (Cashback) من رسم الدخول عند أول خسارة يومياً',
    lines: {
      welcome: 'خزينتك تحت إشرافي، كل نقطة محسوبة بدقة.',
      start: 'سجلت الجلسة في الدفتر، انطلق بثقة.',
      win: 'أرباح ممتازة تُضاف إلى رصيدك فوراً!',
      lose: 'لا تقلق، سأعيد لك نسبة الأمان اليومية إن كانت متاحة.'
    }
  },
  {
    id: 'friend_fadi', name: 'فادي الفرفوش', tier: 'vip', img: 'friend_fadi.jpg',
    role: 'مقدم سهرات التحدي', skillDesc: 'مكافأة XP مضاعفة في تحديات المساء والسهرات',
    lines: {
      welcome: 'أحلى سهرة وأحلى تحدي مع الشباب!',
      start: 'ولّع الساحة وخلّي الكل يشوف!',
      win: 'يا سلام عليك! السهرة إلك الليلة!',
      lose: 'اضحك وفرفش، الجاية بتعوضها دبل!'
    }
  },
  {
    id: 'anime_zain', name: 'كابتن زين', tier: 'vip', img: 'anime_zain.jpg',
    role: 'بطل الـ PvP والمهام', skillDesc: 'مضاعفة نقاط الخبرة (2x XP) في جميع الجولات',
    lines: {
      welcome: 'طاقتي وصلت للحد الأقصى! يلا نبدأ!',
      start: 'هذه لحظة الحسم، انطلق!',
      win: 'مذهل! ارتفع مستواك بسرعة البرق!',
      lose: 'لن أستسلم أبداً! سأعود أقوى!'
    }
  },
  {
    id: 'anime_ryu', name: 'المحقق ريو', tier: 'vip', img: 'anime_ryu.jpg',
    role: 'خبير الألغاز والمنطق', skillDesc: 'تحليل دقيق ومكافأة +20% XP في تحديات المهارة',
    lines: {
      welcome: 'كل حركة لها حساب، دعنا نحلل الخصم.',
      start: 'راقب التوقيت بدقة، الفوز مسألة منطق.',
      win: 'تماماً كما توقعت! تحليل مثالي.',
      lose: 'مثير للاهتمام... سأعدل الاستراتيجية للمرة القادمة.'
    }
  },
  {
    id: 'anime_ritaj', name: 'ريتاج', tier: 'vip', img: 'anime_ritaj.jpg',
    role: 'جالبة الحظ السعيد', skillDesc: 'ترفع فرصة ظهور مكافأة XP مفاجئة بعد كل جولة',
    lines: {
      welcome: 'الحظ السعيد معك اليوم، يلا نلعب!',
      start: 'ابتسم وانطلق، المفاجآت الحلوة بانتظارك!',
      win: 'ياي! فوز رائع وحظ سعيد!',
      lose: 'المهم إننا استمتعنا، الحظ جاي بالجولة الجاية!'
    }
  },
  {
    id: 'friend_saad', name: 'الصديق سعد', tier: 'vip', img: 'friend_saad.jpg',
    role: 'حكم القيم والثقافة', skillDesc: 'مكافأة XP إضافية وشارة اللعب النظيف',
    lines: {
      welcome: 'حياك الله يا أخي، التنافس الشريف أجمل ما في الساحة.',
      start: 'توكل على الله وابدأ بتركيز.',
      win: 'مبارك لك هذا الفوز الطيب!',
      lose: 'الحمد لله على كل حال، القادم أجمل بإذن الله.'
    }
  }
];

// كتالوج متجر الأدوات التكتيكية والمظاهر (بحدود صارمة: أداة واحدة كحد أقصى في الجولة)
window.ARENA_SHOP_ITEMS = [
  { id: 'shield_1', name: '🛡️ درع الحماية', price: 25, type: 'tactical', desc: 'يحميك من أول ضربة في شوتر أو أول انقلاب في القيادة (مرة واحدة بالجولة).' },
  { id: 'fuel_boost', name: '⛽ خزان وقود إضافي', price: 20, type: 'tactical', desc: 'يمنحك +25% وقود بدايةً في لعبة قيادة التلال 2D.' },
  { id: 'double_xp', name: '⚡ مضاعف XP', price: 15, type: 'tactical', desc: 'يضاعف نقاط الخبرة (XP) في الجولة القادمة لفتح القوالب الفاخرة أسرع.' },
  { id: 'frame_gold', name: '👑 إطار الملكي الذهبي', price: 0, reqXp: 300, type: 'cosmetic', desc: 'إطار فاخر لملفك الشخصي (يُفتح مجاناً عند الوصول إلى 300 XP).' },
  { id: 'frame_cyber', name: '💠 إطار سايبر الماسي', price: 0, reqXp: 800, type: 'cosmetic', desc: 'إطار ماسي متوهج (يُفتح مجاناً عند الوصول إلى 800 XP).' }
];

// محرك الصوت والفقاعة التفاعلية (0 استهلاك API + Lazy Caching)
window.ArenaVoice = {
  audioBaseUrl: './assets/audio/', // ضع ملفات MP3 هنا أو رابط مستودع متجر معاذ
  currentAudio: null,

  getChar(id) {
    return window.ARENA_CHARACTERS.find((c) => c.id === id) || window.ARENA_CHARACTERS[0];
  },

  speak(charId, eventType = 'welcome') {
    const ch = this.getChar(charId);
    const text = (ch.lines && ch.lines[eventType]) || ch.lines.welcome;

    // 1. إظهار الفقاعة النصية والاهتزاز التفاعلي
    const bubble = document.getElementById('companionBubble');
    const nameEl = document.getElementById('companionName');
    const avatarBox = document.getElementById('companionAvatar');
    if (bubble && nameEl) {
      nameEl.textContent = ch.name;
      bubble.textContent = text;
      if (avatarBox) {
        avatarBox.classList.remove('pop-anim');
        void avatarBox.offsetWidth;
        avatarBox.classList.add('pop-anim');
      }
    }

    // 2. احترام وضع توفير البيانات (Data Saver Mode)
    const dataSaver = localStorage.getItem('arena_data_saver') === '1';
    if (dataSaver) return;

    // 3. تشغيل الصوت المسجل مسبقاً (48kbps Mono MP3) مع Lazy Caching عبر Service Worker
    try {
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      }
      const audioUrl = `${this.audioBaseUrl}${ch.id}_${eventType}.mp3`;
      const audio = new Audio(audioUrl);
      audio.volume = 0.85;
      this.currentAudio = audio;
      audio.play().catch(() => {
        // إذا لم يكن ملف MP3 مرفوعاً بعد، نكتفي بالفقاعة النصية بصمت دون أي خطأ
      });
    } catch (e) {}
  }
};

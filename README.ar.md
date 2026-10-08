<div dir="rtl">

# envguard

> خلّي ملفات `.env` بتاعتك صادقة.

`envguard` بيحوّل ملف `.env.example` اللي عندك أصلًا لـ schema. بيتأكد إن `.env` (أو متغيرات البيئة الحقيقية في CI) فيه كل المتغيرات المطلوبة، وإن كل قيمة شكلها صح، وبيولّد documentation منه، وبيحذّرك قبل ما ملف `.env` مليان أسرار يتعمله commit في git.

بدون أي dependencies. ملف واحد بس بتضيف عليه تعليقات. بيشتغل مع أي لغة أو framework لأنه بيقرأ ملفات بس.

[English](./README.md)

## ليه؟

كل مشروع فيه `.env.example`، وتقريبًا محدش بيتأكد إنه متطبّق. زميل جديد بينسخه، بينسى متغيّر، وبيضيّع نص يوم في error مالوش علاقة بالسبب الحقيقي. الـ CI بيقع عشان production فيه `PORT=80800`. حد بيعمل commit لملف `.env`.

مكتبات زي `envalid` أو `zod` بتحل المشكلة دي جوّه codebase واحد وبلغة واحدة. `envguard` بيحلها على مستوى الملفات، فنفس الـ `.env.example` بيحمي الـ Node API والـ Python worker والـ Docker Compose والـ CI.

## التثبيت

</div>

```sh
npm install --save-dev envguard
npx envguard --help

# أو آخر نسخة من GitHub مباشرة
npm install --save-dev github:BiztechEG/envguard
```

<div dir="rtl">

محتاج Node.js 18 أو أحدث، ومفيش أي حاجة تانية.

## البداية السريعة

١. أضف تعليقات على `.env.example`. كل التعليقات اختيارية؛ أي متغيّر من غير تعليق معناه "مطلوب، وأي نص مقبول".

</div>

```dotenv
# البيئة اللي التطبيق شغال فيها
# @enum development,production,test
NODE_ENV=development

# البورت اللي السيرفر بيسمع عليه
# @type port
PORT=3000

# رابط الاتصال بقاعدة البيانات
# @type url @secret
DATABASE_URL=

# سيبه فاضي لو مش عايز error reporting
# @type url @optional @secret
SENTRY_DSN=
```

<div dir="rtl">

٢. شغّل الفحص:

</div>

```sh
npx envguard            # بيقارن .env بـ .env.example
npx envguard --strict   # التحذيرات كمان بتوقّع الـ build
```

<div dir="rtl">

٣. حطه في الأماكن اللي البيئة الغلط بتوجع فيها: script زي `pretest`، أو pre-commit hook، أو CI.

## التعليقات المدعومة

اكتبها في التعليق اللي فوق المتغيّر مباشرة (من غير سطر فاضي بينهم). النص العادي بيبقى الوصف، وممكن تحط أكتر من تعليق في سطر واحد.

| التعليق | المعنى |
| --- | --- |
| `@type <t>` | الشكل المتوقع: `string` (الافتراضي) أو `int` أو `float` أو `bool` أو `url` أو `email` أو `port` أو `json` أو `uuid` أو `enum`. |
| `@enum a,b,c` | القيم المسموحة. |
| `@pattern <regex>` | تعبير regex لازم القيمة تطابقه (بياخد باقي السطر). اكتب `/regex/i` عشان تضيف flags. |
| `@min N` / `@max N` | الحدود: رقمية للأنواع الرقمية، وطول النص لباقي الأنواع. |
| `@optional` | المتغيّر ممكن يكون مش موجود أو فاضي. لو موجود بيتفحص عادي. |
| `@secret` | القيمة حساسة: مش بتظهر في الرسائل ولا في الـ docs. |
| `@desc <text>` | الوصف. |

نوع `url` لازم يبدأ ببروتوكول بعده `//` زي `https://` أو `postgres://`، فالقيمة `localhost:3000` مرفوضة.

## الأوامر

| الأمر | الوظيفة |
| --- | --- |
| `envguard check` | الافتراضي. بيفحص `.env` مقابل `.env.example`. استخدم `--process-env` في CI عشان يفحص متغيرات البيئة الحقيقية. |
| `envguard init` | بينشئ `.env` من `.env.example` (مش بيكتب فوق ملف موجود إلا بـ `--force`). |
| `envguard sync` | بيعرض المتغيرات الموجودة في `.env` ومش معلنة في `.env.example`، وبـ `--write` بيضيفها. |
| `envguard diff a b` | بيقارن ملفين env على مستوى المفاتيح. القيم مخفية إلا بـ `--values`. |
| `envguard docs` | بيولّد جدول Markdown من `.env.example`، وبـ `--inject README.md` بيحطه بين علامتين في الملف. |

أكواد الخروج: `0` كله تمام، `1` فيه مشاكل، `2` خطأ في الاستخدام أو ملف مش موجود.

## في الـ CI

</div>

```yaml
- name: Validate environment
  run: npx envguard check --process-env --strict
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    NODE_ENV: test
```

<div dir="rtl">

أو استخدم الـ GitHub Action الجاهزة. بتشغّل نسخة envguard اللي جوه الـ Action نفسها، فمش بتنزّل حاجة من npm.

</div>

```yaml
- uses: BiztechEG/envguard@main
  with:
    process-env: true
    strict: true
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

<div dir="rtl">

## المساهمة

التقارير والأفكار والـ pull requests كلها مرحّب بيها. شوف [CONTRIBUTING.md](./CONTRIBUTING.md). الاختبارات بتشتغل بـ `npm test` من غير أي إعداد.

## الرخصة

[MIT](./LICENSE)

</div>

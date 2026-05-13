import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const IMG = (id) => `https://images.unsplash.com/photo-${id}?w=800&q=80`;

const DAY = 24 * 60 * 60 * 1000;
const daysAhead = (n) => new Date(Date.now() + n * DAY);

async function upsertAgencyUser({ email, password, name, agency }) {
  const hash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: {
      name,
      isAgency: true,
      agencyName: agency.name,
      agencySlug: agency.slug,
      agencyLogo: agency.logo,
      agencyDescription: agency.description,
      agencyCity: agency.city,
      role: "AGENT",
    },
    create: {
      email,
      password: hash,
      name,
      role: "AGENT",
      phone: agency.phone,
      isAgency: true,
      agencyName: agency.name,
      agencySlug: agency.slug,
      agencyLogo: agency.logo,
      agencyDescription: agency.description,
      agencyCity: agency.city,
    },
  });
}

async function main() {
  const adminPass = await bcrypt.hash("admin123", 10);
  const userPass = await bcrypt.hash("demo123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@demo.kg" },
    update: {},
    create: {
      email: "admin@demo.kg",
      password: adminPass,
      name: "Администратор",
      role: "ADMIN",
    },
  });

  const demo = await prisma.user.upsert({
    where: { email: "demo@demo.kg" },
    update: {},
    create: {
      email: "demo@demo.kg",
      password: userPass,
      name: "Демо пользователь",
      phone: "+996555000000",
      role: "USER",
    },
  });

  await prisma.user.upsert({
    where: { email: "moderator@demo.kg" },
    update: { role: "MODERATOR" },
    create: {
      email: "moderator@demo.kg",
      password: await bcrypt.hash("mod12345", 10),
      name: "Модератор",
      role: "MODERATOR",
    },
  });
  console.log("Seed: модератор moderator@demo.kg / mod12345");

  // -------------------- АГЕНТСТВА --------------------
  const agencyAlatoo = await upsertAgencyUser({
    email: "alatoo@demo.kg",
    password: "demo123",
    name: "Ала-Тоо Недвижимость",
    agency: {
      name: "Ала-Тоо Недвижимость",
      slug: "alatoo-realty",
      logo: IMG("1560518883-ce09059eeffa"),
      description:
        "Агентство №1 по Бишкеку: квартиры, дома, коммерция. 12 лет на рынке, 80+ объектов в работе.",
      city: "Бишкек",
      phone: "+996555100100",
    },
  });

  const agencyManas = await upsertAgencyUser({
    email: "manas-estate@demo.kg",
    password: "demo123",
    name: "Манас Эстейт",
    agency: {
      name: "Манас Эстейт",
      slug: "manas-estate",
      logo: IMG("1564013799919-ab600027ffc6"),
      description:
        "Премиум-сегмент: новостройки, инвестиционные объекты. Сопровождение сделки «под ключ».",
      city: "Бишкек",
      phone: "+996555200200",
    },
  });

  const agencyOsh = await upsertAgencyUser({
    email: "osh-home@demo.kg",
    password: "demo123",
    name: "Ош Хоум",
    agency: {
      name: "Ош Хоум",
      slug: "osh-home",
      logo: IMG("1582407947304-fd86f028f716"),
      description:
        "Город Ош и южный регион: аренда, продажа, посуточно. Говорим на русском, кыргызском, узбекском.",
      city: "Ош",
      phone: "+996555300300",
    },
  });

  // -------------------- ОБЪЯВЛЕНИЯ --------------------
  // Идемпотентность: ключ = userId + title + district. Если такое уже есть — пропускаем.
  const listingsData = [
    // ---------- старые 9 (demo user) ----------
    {
      userId: demo.id,
      deal: "RENT",
      propertyType: "FLAT",
      title: "2-комн., центр, мебель",
      district: "Бишкек, Первомайский р-н",
      description: "Светлая квартира, вся мебель и техника.",
      price: "45 000",
      currency: "сом / мес",
      rooms: "2 комн.",
      area: "54 м²",
      floor: "5 из 9",
      lat: 42.882,
      lng: 74.603,
      images: JSON.stringify([IMG("1560448204-e02f11c3d0e2")]),
      rentPeriod: "MONTHLY",
      status: "ACTIVE",
    },
    {
      userId: demo.id,
      deal: "SALE",
      propertyType: "FLAT",
      title: "3-комн., евроремонт, вид на горы",
      district: "Бишкек, Октябрьский р-н",
      price: "125 000",
      currency: "$",
      rooms: "3 комн.",
      area: "78 м²",
      floor: "12 из 16",
      lat: 42.868,
      lng: 74.582,
      images: JSON.stringify([IMG("1502672260266-1c1ef2d93688")]),
      status: "ACTIVE",
    },
    {
      userId: demo.id,
      deal: "RENT",
      propertyType: "OFFICE",
      title: "Офис 85 м², бизнес-центр",
      district: "Бишкек, ул. Ибраимова",
      price: "120 000",
      currency: "сом / мес",
      rooms: "Офис",
      area: "85 м²",
      floor: "3 из 7",
      lat: 42.871,
      lng: 74.594,
      images: JSON.stringify([IMG("1497366216548-37526070297c")]),
      rentPeriod: "MONTHLY",
      status: "ACTIVE",
    },
    {
      userId: demo.id,
      deal: "SALE",
      propertyType: "NEWBUILD",
      title: "ЖК «Асман Сити», 2-комн. с котлована",
      district: "Чуйская обл., новостройка",
      price: "от 890 000",
      currency: "сом / м²",
      rooms: "2 комн.",
      area: "62 м²",
      floor: "Сдача 2026",
      lat: 42.856,
      lng: 74.612,
      images: JSON.stringify([IMG("1545324418-cc1a3fa10c00")]),
      installment: true,
      status: "ACTIVE",
    },
    {
      userId: demo.id,
      deal: "RENT",
      propertyType: "HOUSE",
      title: "Дом с участком, посуточно",
      district: "Иссык-Куль, Чолпон-Ата",
      price: "8 000",
      currency: "сом / сутки",
      rooms: "Дом",
      area: "120 м²",
      floor: "Участок 6 сот.",
      lat: 42.649,
      lng: 77.085,
      images: JSON.stringify([IMG("1568605114967-8130f3a36994")]),
      rentPeriod: "DAILY",
      status: "ACTIVE",
    },
    {
      userId: demo.id,
      deal: "SALE",
      propertyType: "FLAT",
      title: "1-комн., рассрочка от застройщика",
      district: "Бишкек, мкр. Ак-Кеме",
      price: "42 500",
      currency: "$",
      rooms: "1 комн.",
      area: "42 м²",
      floor: "8 из 12",
      lat: 42.889,
      lng: 74.556,
      images: JSON.stringify([IMG("1522708323590-d24dbb6b0267")]),
      installment: true,
      status: "ACTIVE",
    },
    {
      userId: demo.id,
      deal: "RENT",
      propertyType: "ROOM",
      title: "Комната 18 м², метро рядом",
      district: "Бишкек, мкр. Джал",
      description: "Светлая комната в 3-комнатной, соседи спокойные.",
      price: "12 000",
      currency: "сом / мес",
      rooms: "Комната",
      area: "18 м²",
      floor: "3 из 5",
      lat: 42.875,
      lng: 74.598,
      images: JSON.stringify([IMG("1522771730864-0a67f0e589bc")]),
      rentPeriod: "MONTHLY",
      status: "ACTIVE",
    },
    {
      userId: demo.id,
      deal: "SALE",
      propertyType: "LAND",
      title: "Участок 8 соток, коммуникации",
      district: "Чуйская обл., с. Кара-Жыгач",
      description: "Ровный участок, забор, въезд с асфальта.",
      price: "185 000",
      currency: "$",
      rooms: "Участок",
      area: "8 сот.",
      floor: "—",
      lat: 42.92,
      lng: 74.65,
      images: JSON.stringify([IMG("1500382017368-9319d9146715")]),
      status: "ACTIVE",
    },
    {
      userId: demo.id,
      deal: "RENT",
      propertyType: "FLAT",
      title: "Студия у парка, короткая аренда",
      district: "Бишкек, Панфилова",
      price: "22 000",
      currency: "сом / мес",
      rooms: "Студия",
      area: "32 м²",
      floor: "2 из 4",
      lat: 42.864,
      lng: 74.601,
      images: JSON.stringify([IMG("1484154218962-a197022b5858")]),
      rentPeriod: "MONTHLY",
      status: "ACTIVE",
    },

    // ---------- НОВЫЕ: VIP / TOP / PREMIUM ----------
    {
      userId: agencyAlatoo.id,
      deal: "SALE",
      propertyType: "FLAT",
      title: "VIP: 4-комн., пентхаус, дизайнерский ремонт",
      district: "Бишкек, Юг-2",
      description:
        "Полностью укомплектован, итальянская мебель, тёплый пол, видеонаблюдение, паркинг включён.",
      price: "320 000",
      currency: "$",
      rooms: "4 комн.",
      area: "168 м²",
      floor: "16 из 16",
      lat: 42.862,
      lng: 74.598,
      images: JSON.stringify([
        IMG("1502672260266-1c1ef2d93688"),
        IMG("1560448204-e02f11c3d0e2"),
        IMG("1505691938895-1758d7feb511"),
      ]),
      vipUntil: daysAhead(30),
      priorityScore: 300,
      status: "ACTIVE",
    },
    {
      userId: agencyManas.id,
      deal: "SALE",
      propertyType: "NEWBUILD",
      title: "TOP: ЖК «Манас Резиденс», 3-комн., сдача 2026",
      district: "Бишкек, ул. Манаса",
      description:
        "Премиум-новостройка, кирпич-монолит, закрытая территория, охрана, своя котельная.",
      price: "от 1 250 000",
      currency: "сом / м²",
      rooms: "3 комн.",
      area: "92 м²",
      floor: "Сдача Q4 2026",
      lat: 42.876,
      lng: 74.612,
      images: JSON.stringify([
        IMG("1545324418-cc1a3fa10c00"),
        IMG("1493809842364-78817add7ffb"),
      ]),
      installment: true,
      topUntil: daysAhead(7),
      priorityScore: 200,
      status: "ACTIVE",
    },
    {
      userId: agencyAlatoo.id,
      deal: "RENT",
      propertyType: "FLAT",
      title: "PREMIUM: 2-комн., LUX, краткосрочно",
      district: "Бишкек, Эркиндик",
      description:
        "Полностью укомплектована для гостей: бельё, посуда, Wi-Fi, отдельный вход. Минимум 3 ночи.",
      price: "5 500",
      currency: "сом / сутки",
      rooms: "2 комн.",
      area: "65 м²",
      floor: "7 из 12",
      lat: 42.876,
      lng: 74.598,
      images: JSON.stringify([
        IMG("1560448204-e02f11c3d0e2"),
        IMG("1502672023488-cc2e2ed6c2e3"),
      ]),
      rentPeriod: "DAILY",
      premiumUntil: daysAhead(14),
      priorityScore: 150,
      status: "ACTIVE",
    },

    // ---------- URGENT ----------
    {
      userId: demo.id,
      deal: "RENT",
      propertyType: "FLAT",
      title: "Срочно: 1-комн., заезд сегодня",
      district: "Бишкек, Восток-5",
      description: "Освободилась срочно, заезд в день обращения. Без посредников.",
      price: "28 000",
      currency: "сом / мес",
      rooms: "1 комн.",
      area: "38 м²",
      floor: "4 из 9",
      lat: 42.866,
      lng: 74.633,
      images: JSON.stringify([IMG("1522708323590-d24dbb6b0267")]),
      rentPeriod: "MONTHLY",
      urgent: true,
      status: "ACTIVE",
    },
    {
      userId: agencyOsh.id,
      deal: "SALE",
      propertyType: "HOUSE",
      title: "Срочно: дом 140 м², торг уместен",
      district: "Ош, мкр. Туран",
      description: "Хозяин уезжает, документы готовы, можно оформить за 3 дня.",
      price: "85 000",
      currency: "$",
      rooms: "5 комн.",
      area: "140 м²",
      floor: "Участок 8 сот.",
      lat: 40.5283,
      lng: 72.7985,
      images: JSON.stringify([IMG("1568605114967-8130f3a36994")]),
      urgent: true,
      status: "ACTIVE",
    },

    // ---------- АРЕНДА: ДОЛГОСРОЧНО ----------
    {
      userId: agencyAlatoo.id,
      deal: "RENT",
      propertyType: "FLAT",
      title: "3-комн., новый ремонт, без депозита",
      district: "Бишкек, мкр. Тунгуч",
      description: "Без депозита для долгосрочной аренды от 6 мес.",
      price: "55 000",
      currency: "сом / мес",
      rooms: "3 комн.",
      area: "72 м²",
      floor: "6 из 9",
      lat: 42.85,
      lng: 74.58,
      images: JSON.stringify([IMG("1493809842364-78817add7ffb")]),
      rentPeriod: "MONTHLY",
      status: "ACTIVE",
    },
    {
      userId: demo.id,
      deal: "RENT",
      propertyType: "FLAT",
      title: "Студия, новостройка, первый заезд",
      district: "Бишкек, Джал-29",
      description: "Полностью укомплектована, никто не жил после ремонта.",
      price: "32 000",
      currency: "сом / мес",
      rooms: "Студия",
      area: "36 м²",
      floor: "9 из 12",
      lat: 42.853,
      lng: 74.567,
      images: JSON.stringify([IMG("1484154218962-a197022b5858")]),
      rentPeriod: "MONTHLY",
      status: "ACTIVE",
    },
    {
      userId: agencyOsh.id,
      deal: "RENT",
      propertyType: "FLAT",
      title: "1-комн. в Оше, центр",
      district: "Ош, ул. Курманжан Датка",
      price: "18 000",
      currency: "сом / мес",
      rooms: "1 комн.",
      area: "40 м²",
      floor: "4 из 5",
      lat: 40.527,
      lng: 72.793,
      images: JSON.stringify([IMG("1522708323590-d24dbb6b0267")]),
      rentPeriod: "MONTHLY",
      status: "ACTIVE",
    },

    // ---------- ПРОДАЖА: РАЗНЫЕ ----------
    {
      userId: agencyManas.id,
      deal: "SALE",
      propertyType: "FLAT",
      title: "2-комн., вторичка, торг",
      district: "Бишкек, ул. Боконбаева",
      description: "Готова к заезду, ипотека одобрена в 4 банках.",
      price: "78 000",
      currency: "$",
      rooms: "2 комн.",
      area: "58 м²",
      floor: "4 из 5",
      lat: 42.872,
      lng: 74.6,
      images: JSON.stringify([IMG("1493809842364-78817add7ffb")]),
      installment: false,
      status: "ACTIVE",
    },
    {
      userId: demo.id,
      deal: "SALE",
      propertyType: "HOUSE",
      title: "Коттедж в пригороде, газ, скважина",
      district: "Чуйская обл., с. Лебединовка",
      description: "2 этажа, гараж на 2 машины, баня. Документы готовы.",
      price: "220 000",
      currency: "$",
      rooms: "6 комн.",
      area: "210 м²",
      floor: "Участок 10 сот.",
      lat: 42.91,
      lng: 74.71,
      images: JSON.stringify([IMG("1568605114967-8130f3a36994")]),
      status: "ACTIVE",
    },
    {
      userId: demo.id,
      deal: "SALE",
      propertyType: "DACHA",
      title: "Дача на Иссык-Куле у воды",
      district: "Иссык-Куль, с. Бостери",
      description: "200 м до пляжа, готовая к проживанию, мангал, кострище.",
      price: "55 000",
      currency: "$",
      rooms: "Дача",
      area: "80 м²",
      floor: "Участок 5 сот.",
      lat: 42.66,
      lng: 77.12,
      images: JSON.stringify([IMG("1505691938895-1758d7feb511")]),
      status: "ACTIVE",
    },

    // ---------- КОММЕРЦИЯ ----------
    {
      userId: agencyAlatoo.id,
      deal: "RENT",
      propertyType: "OFFICE",
      title: "Помещение 220 м² под салон/шоурум",
      district: "Бишкек, ул. Киевская",
      description: "Отдельный вход, витрина, парковка. Готовы к торгу за длительный договор.",
      price: "280 000",
      currency: "сом / мес",
      rooms: "Помещение",
      area: "220 м²",
      floor: "1 из 5",
      lat: 42.879,
      lng: 74.605,
      images: JSON.stringify([IMG("1497366216548-37526070297c")]),
      rentPeriod: "MONTHLY",
      status: "ACTIVE",
    },

    // ---------- ПОСУТОЧНО ----------
    {
      userId: demo.id,
      deal: "RENT",
      propertyType: "FLAT",
      title: "1-комн. посуточно, у Ала-Тоо",
      district: "Бишкек, пл. Ала-Тоо",
      description: "Самый центр, всё необходимое для гостя. Чек/отчётные документы.",
      price: "3 200",
      currency: "сом / сутки",
      rooms: "1 комн.",
      area: "40 м²",
      floor: "5 из 9",
      lat: 42.876,
      lng: 74.604,
      images: JSON.stringify([IMG("1502672023488-cc2e2ed6c2e3")]),
      rentPeriod: "DAILY",
      status: "ACTIVE",
    },

    // ---------- УЧАСТКИ / ПАРКИНГ ----------
    {
      userId: demo.id,
      deal: "SALE",
      propertyType: "LAND",
      title: "Участок ИЖС 12 соток, газ по границе",
      district: "Чуйская обл., с. Сокулук",
      price: "29 000",
      currency: "$",
      rooms: "Участок",
      area: "12 сот.",
      floor: "—",
      lat: 42.87,
      lng: 74.31,
      images: JSON.stringify([IMG("1500382017368-9319d9146715")]),
      status: "ACTIVE",
    },
    {
      userId: agencyManas.id,
      deal: "RENT",
      propertyType: "PARKING",
      title: "Паркинг в ЖК «Асман Сити»",
      district: "Бишкек, мкр. Ак-Кеме",
      description: "Тёплый подземный паркинг, видеонаблюдение, 24/7 охрана.",
      price: "6 000",
      currency: "сом / мес",
      rooms: "Паркинг",
      area: "16 м²",
      floor: "-1 этаж",
      lat: 42.856,
      lng: 74.612,
      images: JSON.stringify([IMG("1545324418-cc1a3fa10c00")]),
      rentPeriod: "MONTHLY",
      status: "ACTIVE",
    },
  ];

  let created = 0,
    skipped = 0;
  for (const row of listingsData) {
    const exists = await prisma.listing.findFirst({
      where: { userId: row.userId, title: row.title, district: row.district },
      select: { id: true },
    });
    if (exists) {
      skipped++;
      continue;
    }
    await prisma.listing.create({ data: row });
    created++;
  }
  console.log(
    `Seed: объявления → создано ${created}, пропущено (уже были) ${skipped}, всего в наборе ${listingsData.length}`
  );

  // -------------------- DEVELOPER / COMPLEX --------------------
  const developerCount = await prisma.developer.count();
  if (developerCount === 0) {
    const dev = await prisma.developer.create({
      data: {
        slug: "asman-build",
        name: "Asman Build",
        about:
          "Крупный застройщик жилых комплексов в Бишкеке. Сдан 6 ЖК, 2 в работе. Все стройплощадки доступны через котлован-трекер.",
        contactPhone: "+996555111000",
        contactEmail: "info@asman-build.kg",
        verified: true,
        members: {
          create: { userId: demo.id, role: "OWNER" },
        },
      },
    });

    const cx = await prisma.complex.create({
      data: {
        developerId: dev.id,
        slug: "asman-city",
        name: "ЖК Асман Сити",
        district: "Бишкек, мкр. Ак-Кеме",
        address: "пересечение ул. Льва Толстого и Ахунбаева",
        lat: 42.856,
        lng: 74.612,
        totalUnits: 240,
        deadline: new Date("2027-06-01T00:00:00.000Z"),
        progressPercent: 35,
        currentStage: "FRAME",
        about:
          "Премиум-комплекс из 4 башен с собственной набережной, школой и подземным паркингом.",
        photoCover: IMG("1545324418-cc1a3fa10c00"),
      },
    });

    await prisma.constructionUpdate.createMany({
      data: [
        {
          complexId: cx.id,
          text: "Залит фундамент башни А, начали работу с башней Б.",
          progressPercent: 12,
          stage: "FOUNDATION",
          milestone: true,
          photos: JSON.stringify([IMG("1493557634740-19a4cdc5ab9d")]),
        },
        {
          complexId: cx.id,
          text: "Подняли каркас 5-го этажа в башне А, по плану.",
          progressPercent: 28,
          stage: "FRAME",
          photos: JSON.stringify([IMG("1521587760476-6c12a4b040da")]),
        },
        {
          complexId: cx.id,
          text: "Заключён контракт на лифты Otis, поставка в декабре.",
          progressPercent: 35,
          stage: "FRAME",
        },
      ],
    });

    const newListing = await prisma.listing.findFirst({
      where: { propertyType: "NEWBUILD", complexId: null },
    });
    if (newListing) {
      await prisma.listing.update({
        where: { id: newListing.id },
        data: { complexId: cx.id, constructionStage: "FRAME", unitNumber: "А-12-3" },
      });
    }
    console.log("Seed: создан застройщик Asman Build и ЖК Асман Сити");
  } else {
    console.log("Seed: застройщики уже есть, пропуск");
  }

  // -------------------- CALLBACK REQUESTS (демо) --------------------
  const vipListing = await prisma.listing.findFirst({
    where: { title: { contains: "VIP" } },
  });
  if (vipListing) {
    const cbCount = await prisma.callbackRequest.count({
      where: { listingId: vipListing.id },
    });
    if (cbCount === 0) {
      await prisma.callbackRequest.create({
        data: {
          listingId: vipListing.id,
          ownerId: vipListing.userId,
          name: "Айбек",
          phone: "+996555900001",
          preferredAt: "сегодня после 18:00",
          comment: "Интересует ипотека и условия рассрочки.",
          status: "NEW",
        },
      });
      await prisma.callbackRequest.create({
        data: {
          listingId: vipListing.id,
          ownerId: vipListing.userId,
          name: "Наргиза",
          phone: "+996555900002",
          comment: "Хочу посмотреть в субботу.",
          status: "CONTACTED",
        },
      });
      console.log("Seed: добавлено 2 демо-callback к VIP-объявлению");
    }
  }

  console.log("Seed OK");
  console.log("  admin@demo.kg / admin123");
  console.log("  demo@demo.kg / demo123");
  console.log("  moderator@demo.kg / mod12345");
  console.log("  alatoo@demo.kg / demo123     (агентство «Ала-Тоо Недвижимость»)");
  console.log("  manas-estate@demo.kg / demo123 (агентство «Манас Эстейт»)");
  console.log("  osh-home@demo.kg / demo123   (агентство «Ош Хоум»)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

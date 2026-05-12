import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const IMG = (id) =>
  `https://images.unsplash.com/photo-${id}?w=800&q=80`;

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

  const listingsData = [
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
  ];

  const activeCount = await prisma.listing.count({ where: { status: "ACTIVE" } });
  if (activeCount === 0) {
    for (const row of listingsData) {
      await prisma.listing.create({ data: row });
    }
    console.log(`Seed: создано ${listingsData.length} демо-объявлений (активных не было)`);
  } else {
    console.log(`Seed: активных объявлений уже ${activeCount}, пропуск listings`);
  }

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

  console.log("Seed OK");
  console.log("  admin@demo.kg / admin123");
  console.log("  demo@demo.kg / demo123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const categories = [
  "Путешествия и отдых",
  "Технологии",
  "Искусство и фотография",
  "Спорт",
  "Здоровье и фитнес",
  "Кулинария",
  "Литература",
  "Музыка",
  "Кино и сериалы",
  "Образование",
  "Бизнес и финансы",
];

async function main() {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category },
      update: {},
      create: { name: category },
    });
    console.log(`Категория "${category}" успешно добавлена или уже существует.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

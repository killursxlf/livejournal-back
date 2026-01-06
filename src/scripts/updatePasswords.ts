import bcrypt from "bcryptjs";
import prisma from "../prisma"; 

async function updatePasswords() {
  try {
    const users = await prisma.user.findMany({
      where: {
        NOT: [{ password: "" }], 
      },
      select: {
        id: true,
        email: true,
        password: true,
      },
    });

    for (const user of users) {
      if (!user.password) continue; 

      const password = user.password as string; 

      if (!password.startsWith("$2a$")) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.update({
          where: { id: user.id },
          data: { password: hashedPassword },
        });
        console.log(`✅ Обновлён пароль для пользователя ${user.email}`);
      }
    }

    console.log("✅ Все старые пароли хешированы!");
  } catch (error) {
    console.error("🚨 Ошибка обновления паролей:", error);
  }
}

updatePasswords();

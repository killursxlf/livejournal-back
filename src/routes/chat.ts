import prisma from "../prisma";

export const chatHandler = {
  async sendMessage(req: Request) {
    try {
      const url = new URL(req.url);
      const chatId = url.pathname.split("/")[3];
      const { content, forwardedFromId, senderId } = await req.json();

      if (!content && !forwardedFromId) {
        return new Response(JSON.stringify({ error: "Сообщение не может быть пустым" }), { status: 400 });
      }

      const chatExists = await prisma.chat.findUnique({
        where: { id: chatId }
      });

      if (!chatExists) {
        return new Response(JSON.stringify({ error: "Чат не найден" }), { status: 404 });
      }

      const message = await prisma.message.create({
        data: {
          chatId,
          senderId,
          content,
          forwardedFromId,
          isRead: false,
        },
      });

      return new Response(JSON.stringify(message), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (error) {
      console.error("Ошибка в sendMessage:", error);
      return new Response(JSON.stringify({ error: "Ошибка сервера" }), { status: 500 });
    }
  },

  async getMessages(req: Request) {
    try {
      const url = new URL(req.url);
      const chatId = url.pathname.split("/")[3];

      const messages = await prisma.message.findMany({
        where: { chatId },
        include: {
          sender: { select: { id: true, username: true, avatar: true } },
          forwardedFrom: { select: { id: true, senderId: true, content: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      return new Response(JSON.stringify(messages), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (error) {
      console.error("Ошибка в getMessages:", error);
      return new Response(JSON.stringify({ error: "Ошибка сервера" }), { status: 500 });
    }
  },

  async markAsRead(req: Request) {
    try {
      const url = new URL(req.url);
      const chatId = url.pathname.split("/")[3];
      const { userId } = await req.json();

      const chatExists = await prisma.chat.findUnique({
        where: { id: chatId }
      });

      if (!chatExists) {
        return new Response(JSON.stringify({ error: "Чат не найден" }), { status: 404 });
      }

      await prisma.message.updateMany({
        where: {
          chatId,
          senderId: { not: userId },
          isRead: false
        },
        data: { isRead: true },
      });

      return new Response(JSON.stringify({ message: "Сообщения отмечены как прочитанные" }), { status: 200 });
    } catch (error) {
      console.error("Ошибка в markAsRead:", error);
      return new Response(JSON.stringify({ error: "Ошибка сервера" }), { status: 500 });
    }
  },

  async forwardMessage(req: Request) {
    try {
      const url = new URL(req.url);
      const chatId = url.pathname.split("/")[3];
      const { messageId, senderId } = await req.json();

      const originalMessage = await prisma.message.findUnique({
        where: { id: messageId },
      });

      if (!originalMessage) {
        return new Response(JSON.stringify({ error: "Сообщение не найдено" }), { status: 404 });
      }

      const forwardedMessage = await prisma.message.create({
        data: {
          chatId,
          senderId,
          forwardedFromId: messageId,
          content: originalMessage.content,
          isRead: false,
        },
      });

      return new Response(JSON.stringify(forwardedMessage), { status: 200 });
    } catch (error) {
      console.error("Ошибка в forwardMessage:", error);
      return new Response(JSON.stringify({ error: "Ошибка сервера" }), { status: 500 });
    }
  },

  async getUserChats(req: Request) {
    try {
      const url = new URL(req.url);
      let userId = url.pathname.split("/")[3];

      // ✅ Декодируем userId, если он закодирован в URL
      userId = decodeURIComponent(userId).replace(/{|}/g, "");

      const chats = await prisma.chat.findMany({
        where: {
          participants: {
            some: { userId }
          }
        },
        include: {
          participants: {
            include: {
              user: {
                select: { id: true, username: true, avatar: true }
              }
            }
          }
        }
      });

      // ✅ Преобразуем участников в массив пользователей
      const formattedChats = chats.map(chat => ({
        id: chat.id,
        participants: chat.participants.map(p => p.user)
      }));

      return new Response(JSON.stringify(formattedChats), { status: 200 });
    } catch (error) {
      console.error("Ошибка в getUserChats:", error);
      return new Response(JSON.stringify({ error: "Ошибка сервера" }), { status: 500 });
    }
  },
};

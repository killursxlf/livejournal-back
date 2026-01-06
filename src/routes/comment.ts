import { PrismaClient } from "@prisma/client";
import { corsHeaders } from "../utils/cors";
import { verifyToken } from "./auth";
const prisma = new PrismaClient();

export async function addComment(req: Request): Promise<Response> {
  console.log("Функция addComment запущена");
  try {
    const tokenData = await verifyToken(req);
    console.log("Token Data in addComment:", tokenData);
    const tokenUserId = tokenData?.user?.id || tokenData?.id;
    if (!tokenUserId) {
      return new Response(
        JSON.stringify({ error: "Не авторизован" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        }
      );
    }

    const { content, postId, userId } = await req.json();
    console.log("Request body in addComment:", { content, postId, userId });

    if (!content || !postId || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        }
      );
    }

    if (userId !== tokenUserId) {
      return new Response(
        JSON.stringify({ error: "Доступ запрещён" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        }
      );
    }

    const comment = await prisma.comment.create({
      data: {
        content,
        post: { connect: { id: postId } },
        user: { connect: { id: userId } },
      },
      include: {
        user: {
          select: { username: true, name: true, avatar: true },
        },
      },
    });

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, username: true }
    });      

    if (!sender) {
      throw new Error("Пользователь не найден");
    }

    if (post && post.authorId !== userId) {
      await prisma.notification.create({
        data: {
          type: "comment",
          senderId: userId,
          senderName: sender.username,
          recipientId: post.authorId,
          postId: postId,
          message: `Пользователь ${sender.name} прокомментировал ваш пост.`,
        },
      });
    }

    const commentWithAuthor = {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      author: comment.user,
    };

    console.log("Созданный комментарий:", commentWithAuthor);

    return new Response(JSON.stringify(commentWithAuthor), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (error) {
    console.error("Ошибка в addComment:", error);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}

export async function DELETE(req: Request, context: { params: { id: string } }) {
  try {
    const { id: commentId } = context.params;
    if (!commentId) {
      return new Response(
        JSON.stringify({ error: "Идентификатор комментария не указан" }),
        { status: 400 }
      );
    }

    const token = await verifyToken(req);
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Пользователь не авторизован" }),
        { status: 401 }
      );
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: true },
    });

    if (!comment) {
      return new Response(
        JSON.stringify({ error: "Комментарий не найден" }),
        { status: 404 }
      );
    }

    if (comment.userId !== token.id && comment.post.authorId !== token.id) {
      return new Response(
        JSON.stringify({ error: "Нет прав для удаления этого комментария" }),
        { status: 403 }
      );
    }

    await prisma.comment.delete({
      where: { id: commentId },
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error("Ошибка при удалении комментария:", error);
    return new Response(
      JSON.stringify({ error: "Ошибка при удалении комментария" }),
      { status: 500 }
    );
  }
}

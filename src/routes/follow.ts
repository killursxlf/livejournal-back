import prisma from "../prisma";
import { corsHeaders } from "../utils/cors";
import { verifyToken } from "./auth";

export async function toggleFollow(req: Request): Promise<Response> {
  try {
    const tokenData = await verifyToken(req);
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

    const { followingId, userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
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

    if (userId === followingId) {
      return new Response(
        JSON.stringify({ error: "Нельзя подписаться на самого себя" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        }
      );
    }

    const existingFollow = await prisma.follows.findUnique({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId,
        },
      },
    });

    if (existingFollow) {
      await prisma.follows.delete({
        where: {
          followerId_followingId: {
            followerId: userId,
            followingId,
          },
        },
      });

      const followerCount = await prisma.follows.count({
        where: { followingId },
      });

      return new Response(
        JSON.stringify({ followed: false, followerCount }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        }
      );
    } else {
      await prisma.follows.create({
        data: {
          followerId: userId,
          followingId,
        },
      });

      const sender = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, username: true }
      });      

      if (!sender) {
        throw new Error("Пользователь не найден");
      }

      await prisma.notification.create({
        data: {
          type: "follow",
          senderId: userId,
          senderName: sender.username,
          recipientId: followingId,
          message: `Пользователь ${sender.name} начал подписываться на вас.`,
        },
      });

      const followerCount = await prisma.follows.count({
        where: { followingId },
      });

      return new Response(
        JSON.stringify({ followed: true, followerCount }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        }
      );
    }
  } catch (error) {
    console.error("Ошибка в toggleFollow:", error);
    return new Response(
      JSON.stringify({ error: "Server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      }
    );
  }
}

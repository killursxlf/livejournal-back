import { PrismaClient } from "@prisma/client";
import { corsHeaders } from "../utils/cors";
import { verifyToken } from "./auth";

const prisma = new PrismaClient();


export async function createNotification(req: Request): Promise<Response> {
  try {
    const tokenData = await verifyToken(req);
    const tokenUserId = tokenData?.user?.id || tokenData?.id;
    if (!tokenUserId) {
      return new Response(
        JSON.stringify({ error: "Не авторизован" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const { type, senderId, senderName, recipientId, postId, message } = await req.json();

    if (senderId !== tokenUserId) {
      return new Response(
        JSON.stringify({ error: "Доступ запрещён" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const notification = await prisma.notification.create({
      data: {
        type,
        senderId,
        senderName,
        recipientId,
        postId,
        message,
      },
    });

    return new Response(JSON.stringify({ notification }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (error) {
    console.error("Ошибка в createNotification:", error);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}


export async function getNotifications(req: Request): Promise<Response> {
  try {
    const tokenData = await verifyToken(req);
    const tokenUserId = tokenData?.user?.id || tokenData?.id;
    if (!tokenUserId) {
      return new Response(
        JSON.stringify({ error: "Не авторизован" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const notifications = await prisma.notification.findMany({
      where: { recipientId: tokenUserId },
      orderBy: { createdAt: "desc" },
    });

    return new Response(JSON.stringify({ notifications }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (error) {
    console.error("Ошибка в getNotifications:", error);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}


export async function markNotificationsAsRead(req: Request): Promise<Response> {
  try {
    const tokenData = await verifyToken(req);
    const tokenUserId = tokenData?.user?.id || tokenData?.id;
    if (!tokenUserId) {
      return new Response(
        JSON.stringify({ error: "Не авторизован" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const { notificationIds } = await req.json();
    if (!notificationIds || !Array.isArray(notificationIds)) {
      return new Response(
        JSON.stringify({ error: "Некорректные данные" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const result = await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        recipientId: tokenUserId,
        isRead: false,
      },
      data: { isRead: true },
    });

    return new Response(JSON.stringify({ updated: result.count }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (error) {
    console.error("Ошибка в markNotificationsAsRead:", error);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}

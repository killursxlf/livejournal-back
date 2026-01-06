import { PrismaClient } from "@prisma/client";
import { corsHeaders } from "../utils/cors";
import { verifyToken } from "./auth";

const prisma = new PrismaClient();

export async function createComplaint(req: Request): Promise<Response> {
  try {
    const tokenData = await verifyToken(req);
    const tokenUserId = tokenData?.user?.id || tokenData?.id;
    if (!tokenUserId) {
      return new Response(
        JSON.stringify({ error: "Не авторизован" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const { reason, description, postId, commentId, userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Неавторизован" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    if (userId !== tokenUserId) {
      return new Response(
        JSON.stringify({ error: "Доступ запрещён" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const complaint = await prisma.complaint.create({
      data: {
        reason,
        description,
        user: { connect: { id: userId } },
        post: postId ? { connect: { id: postId } } : undefined,
        comment: commentId ? { connect: { id: commentId } } : undefined,
      },
    });

    return new Response(JSON.stringify(complaint), {
      status: 201,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (error: any) {
    console.error("Ошибка в createComplaint:", error);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}

export async function updateComplaintStatus(req: Request): Promise<Response> {
  try {
    const tokenData = await verifyToken(req);
    const tokenUserId = tokenData?.user?.id || tokenData?.id;
    if (!tokenUserId) {
      return new Response(
        JSON.stringify({ error: "Не авторизован" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const moderator = await prisma.moderator.findUnique({
      where: { userId: tokenUserId },
    });
    if (!moderator) {
      return new Response(
        JSON.stringify({ error: "Доступ запрещён" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const { complaintId, status } = await req.json();
    if (!complaintId) {
      return new Response(
        JSON.stringify({ error: "Отсутствует идентификатор жалобы" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const updatedComplaint = await prisma.complaint.update({
      where: { id: complaintId },
      data: { status },
    });

    return new Response(JSON.stringify(updatedComplaint), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (error: any) {
    console.error("Ошибка в updateComplaintStatus:", error);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}

export async function getComplaints(req: Request): Promise<Response> {
  try {
    const tokenData = await verifyToken(req);
    const tokenUserId = tokenData?.user?.id || tokenData?.id;
    if (!tokenUserId) {
      return new Response(
        JSON.stringify({ error: "Не авторизован" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const moderator = await prisma.moderator.findUnique({
      where: { userId: tokenUserId },
    });
    if (!moderator) {
      return new Response(
        JSON.stringify({ error: "Доступ запрещён" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const complaints = await prisma.complaint.findMany({
      include: {
        user: true,
        post: true,
        comment: true,
      },
    });

    return new Response(JSON.stringify(complaints), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (error: any) {
    console.error("Ошибка в getComplaints:", error);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}

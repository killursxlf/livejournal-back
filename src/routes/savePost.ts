import prisma from "../prisma";
import { corsHeaders } from "../utils/cors";
import { verifyToken } from "./auth";

export async function toggleSavedPost(req: Request): Promise<Response> {
  try {

    const tokenData = await verifyToken(req);
    const tokenUserId = tokenData?.user?.id || tokenData?.id;
    if (!tokenUserId) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    const { postId, userId } = await req.json();
    if (!userId || userId !== tokenUserId) {
      return new Response(JSON.stringify({ error: "Доступ запрещён" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    const existing = await prisma.savedPost.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    if (existing) {
      await prisma.savedPost.delete({
        where: {
          userId_postId: {
            userId,
            postId,
          },
        },
      });
      const saved = false;
      return new Response(
        JSON.stringify({ saved }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    } else {
      await prisma.savedPost.create({
        data: {
          userId,
          postId,
        },
      });
      const saved = true;
      return new Response(
        JSON.stringify({ saved }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }
  } catch (error) {
    console.error("Ошибка в toggleSavedPost:", error);
    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }
}

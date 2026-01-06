import prisma from "../prisma";
import { corsHeaders } from "../utils/cors";

export async function getAllTags(req: Request): Promise<Response> {
  try {
    const tags = await prisma.tag.findMany({
      select: { name: true },
    });

    return new Response(JSON.stringify(tags), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } catch (err) {
    console.error("Ошибка при getAllTags:", err);
    return new Response(JSON.stringify({ error: "Ошибка сервера" }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}

import prisma from "../prisma";
import { corsHeaders } from "../utils/cors";

export async function getCategories(req: Request): Promise<Response> {
  try {
    const categories = await prisma.category.findMany({
      select: { id: true, name: true },
    });

    return new Response(JSON.stringify(categories), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } catch (err) {
    console.error("Ошибка при получении категорий:", err);
    return new Response(JSON.stringify({ error: "Ошибка сервера" }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}

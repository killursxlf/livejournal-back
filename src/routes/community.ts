import { corsHeaders } from "../utils/cors";
import { verifyToken } from "./auth";
import { PrismaClient, PostStatus, PublicationType, PublicationMode } from "@prisma/client";

const prisma = new PrismaClient();
const backendURL = "http://localhost:3000"; 

export async function createCommunity(req: Request): Promise<Response> {
  try {
    const tokenData = await verifyToken(req);
    const tokenUserId = tokenData?.user?.id || tokenData?.id;
    if (!tokenUserId) {
      return new Response(
        JSON.stringify({ error: "Не авторизован" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    let name: string | null = null;
    let description: string | null = null;
    let categoryId: string | null = null;
    let rules: string | null = null;
    let avatar: string | null = null;
    let background: string | null = null;

    let avatarFile: File | null = null;
    let backgroundFile: File | null = null;

    const contentType = req.headers.get("Content-Type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      name = formData.get("name") as string | null;
      description = formData.get("description") as string | null;
      categoryId = formData.get("categoryId") as string | null;
      rules = formData.get("rules") as string | null;
      avatarFile = formData.get("avatar") as File | null;
      backgroundFile = formData.get("background") as File | null;
    } else {
      const body = await req.json();
      name = body.name;
      description = body.description;
      categoryId = body.categoryId;
      rules = body.rules;
      avatar = body.avatar;
      background = body.background;
    }

    if (!name || name.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "Название сообщества обязательно и должно содержать минимум 3 символа" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }
    if (!description || description.trim().length < 20) {
      return new Response(
        JSON.stringify({ error: "Описание сообщества обязательно и должно содержать минимум 20 символов" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    if (avatarFile && avatarFile instanceof File) {
      const fileExtension = avatarFile.name.split(".").pop();
      const fileName = `community_avatar_${Date.now()}.${fileExtension}`;
      const filePath = `/uploads/${fileName}`;
      await Bun.write(`./public${filePath}`, avatarFile);
      avatar = `${backendURL}${filePath}`;
    }
    if (backgroundFile && backgroundFile instanceof File) {
      const fileExtension = backgroundFile.name.split(".").pop();
      const fileName = `community_background_${Date.now()}.${fileExtension}`;
      const filePath = `/uploads/${fileName}`;
      await Bun.write(`./public${filePath}`, backgroundFile);
      background = `${backendURL}${filePath}`;
    }

    const community = await prisma.community.create({
      data: {
        name,
        description,
        avatar,      
        background,  
        rules,
        owner: {
          connect: { id: tokenUserId },
        },
        ...(categoryId && { category: { connect: { id: categoryId } } }),
        members: {
          create: {
            user: { connect: { id: tokenUserId } },
            role: "ADMIN",
          },
        },
      },
      include: {
        owner: true,
        category: true,
        members: true,
      },
    });

    return new Response(JSON.stringify(community), {
      status: 201,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (error: unknown) {
    console.error("Ошибка в createCommunity:", error);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}

export async function getCommunity(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const communityId = url.searchParams.get("id");
    const userId = url.searchParams.get("userId");

    if (!communityId) {
      return new Response(
        JSON.stringify({ error: "Не указан идентификатор сообщества" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const community = await prisma.community.findUnique({
      where: { id: communityId },
      include: {
        owner: true,
        category: true,
        members: {
          include: {
            user: true,
          },
        },
        posts: {
          where: { status: PostStatus.PUBLISHED },
          include: {
            author: true,
            community: true,
          },
        },
      },
    });

    if (!community) {
      return new Response(
        JSON.stringify({ error: "Сообщество не найдено" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    if (userId) {
      const member = community.members.find((m: any) => m.user.id === userId);
      (community as any).isFollow = !!member;
      (community as any).notificationEnabled = member ? member.notifications : false;
    }

    return new Response(JSON.stringify(community), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (error) {
    console.error("Ошибка получения сообщества:", error);
    return new Response(
      JSON.stringify({ error: "Ошибка сервера" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }
}

export async function toggleCommunitySubscription(req: Request): Promise<Response> {
  try {
    const tokenData = await verifyToken(req);
    const tokenUserId = tokenData?.user?.id || tokenData?.id;
    if (!tokenUserId) {
      return new Response(
        JSON.stringify({ error: "Не авторизован" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const { communityId } = await req.json();
    if (!communityId) {
      return new Response(
        JSON.stringify({ error: "Не указан идентификатор сообщества" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const existingMember = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: tokenUserId,
        },
      },
    });

    if (existingMember) {
      await prisma.communityMember.delete({
        where: {
          communityId_userId: {
            communityId,
            userId: tokenUserId,
          },
        },
      });
      return new Response(
        JSON.stringify({ message: "Отписка успешна" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    } else {
      await prisma.communityMember.create({
        data: {
          communityId,
          userId: tokenUserId,
          role: "MEMBER", 
        },
      });
      return new Response(
        JSON.stringify({ message: "Подписка успешна" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }
  } catch (error: any) {
    console.error("Ошибка в toggleCommunitySubscription:", error);
    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }
}

export async function toggleCommunityNotifications(req: Request): Promise<Response> {
  try {
    const tokenData = await verifyToken(req);
    const tokenUserId = tokenData?.user?.id || tokenData?.id;
    if (!tokenUserId) {
      return new Response(
        JSON.stringify({ error: "Не авторизован" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const { communityId } = await req.json();
    if (!communityId) {
      return new Response(
        JSON.stringify({ error: "Не указан идентификатор сообщества" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const member = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: tokenUserId,
        },
      },
    });

    if (!member) {
      return new Response(
        JSON.stringify({ error: "Вы не являетесь участником сообщества" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const newNotifications = !member.notifications;

    const updatedMember = await prisma.communityMember.update({
      where: {
        communityId_userId: {
          communityId,
          userId: tokenUserId,
        },
      },
      data: {
        notifications: newNotifications,
      },
    });

    return new Response(
      JSON.stringify({ notificationEnabled: updatedMember.notifications }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  } catch (error: any) {
    console.error("Ошибка переключения уведомлений:", error);
    return new Response(JSON.stringify({ error: "Ошибка сервера" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}

export async function getPendingPosts(req: Request) {
  const { searchParams } = new URL(req.url);
  const communityId = searchParams.get('communityId');
  if (!communityId) {
    return new Response(
      JSON.stringify({ error: "Параметр communityId обязателен" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const token = await verifyToken(req);
  if (!token || !token.id) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const userId = token.id;

  const communityMember = await prisma.communityMember.findUnique({
    where: {
      communityId_userId: { communityId, userId }
    }
  });

  if (!communityMember || (communityMember.role !== "MODERATOR" && communityMember.role !== "ADMIN")) {
    return new Response(
      JSON.stringify({ error: "Forbidden: insufficient permissions" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const posts = await prisma.post.findMany({
    where: {
      communityId,
      status: PostStatus.PENDING,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
        }
      },
      postTags: {
        include: {
          tag: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const transformedPosts = posts.map(post => ({
    id: post.id,
    title: post.title,
    content: post.content,
    authorId: post.author.id,
    authorName: post.author.name,
    communityId: post.communityId,
    createdAt: post.createdAt,
    tags: post.postTags.map(pt => pt.tag.name)
  }));

  return new Response(JSON.stringify({ posts: transformedPosts }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

export async function confrimPendingPosts(req: Request): Promise<Response> {
  try {
    const token = await verifyToken(req);
    if (!token || !token.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const moderatorId = token.id;

    const body = await req.json();
    const { postId, status: newStatus, publicationMode: newPublicationMode } = body;

    if (!postId || !newStatus || !newPublicationMode) {
      return new Response(
        JSON.stringify({ error: 'postId, status, and publicationMode are required' }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
    });
    if (!post) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (post.communityId) {
      const membership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: { communityId: post.communityId, userId: moderatorId },
        },
      });
      if (!membership || (membership.role !== "MODERATOR" && membership.role !== "ADMIN")) {
        return new Response(
          JSON.stringify({ error: "Forbidden: You are not a moderator of this community." }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: { status: newStatus, publicationMode: newPublicationMode },
      include: { author: true },
    });

    if (newStatus === PostStatus.PUBLISHED) {
      const notificationMessage = `Ваш пост "${updatedPost.title}" был опубликован.`;
      await prisma.notification.create({
        data: {
          type: "postPublished",
          senderId: moderatorId,
          senderName: token.name || "",
          recipientId: updatedPost.author.id,
          postId: updatedPost.id,
          message: notificationMessage,
        },
      });
    }

    return new Response(JSON.stringify({ message: "Post updated successfully", post: updatedPost }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating post:", error);
    return new Response(JSON.stringify({ error: error.message || "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function rejectPendingPost(req: Request): Promise<Response> {
  try {
    const token = await verifyToken(req);
    if (!token || !token.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }
    const moderatorId = token.id;

    const body = await req.json();
    const { postId, reason } = body;
    if (!postId || !reason) {
      return new Response(
        JSON.stringify({ error: "postId and reason are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
    });
    if (!post) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    if (post.communityId) {
      const membership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: { communityId: post.communityId, userId: moderatorId },
        },
      });
      if (!membership || (membership.role !== "MODERATOR" && membership.role !== "ADMIN")) {
        return new Response(
          JSON.stringify({ error: "Forbidden: You are not a moderator of this community." }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders() } }
        );
      }
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: { status: PostStatus.REJECTED },
      include: { author: true },
    });

    const notificationMessage = `Ваш пост "${updatedPost.title}" был отклонен. Причина: ${reason}`;
    await prisma.notification.create({
      data: {
        type: "postRejected",
        senderId: moderatorId,
        senderName: token.name || "",
        recipientId: updatedPost.author.id,
        postId: updatedPost.id,
        message: notificationMessage,
      },
    });

    return new Response(
      JSON.stringify({ message: "Post rejected successfully", post: updatedPost }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  } catch (error: any) {
    console.error("Error rejecting post:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }
}

export async function getCommunities(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get("q") || "";
    const category = url.searchParams.get("category") || url.searchParams.get("categoryId") || "";
    const sort = url.searchParams.get("sort") || "newest";

    const where: any = {};

    if (search) {
      where.AND = [
        {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        },
      ];
    }

    if (category && category !== "all") {
      where.categoryId = category;
    }

    let orderBy = {};
    switch (sort) {
      case "newest":
        orderBy = { createdAt: "desc" };
        break;
      case "oldest":
        orderBy = { createdAt: "asc" };
        break;
      case "alphabetical":
        orderBy = { name: "asc" };
        break;
      case "popularity":
        orderBy = { _count: { members: "desc" } };
        break;
      default:
        orderBy = { createdAt: "desc" };
    }

    const communitiesRaw = await prisma.community.findMany({
      where,
      orderBy,
      include: {
        owner: true,
        category: true,
        posts: {
          include: {
            postTags: { include: { tag: true } },
          },
        },
        _count: { select: { posts: true, members: true } },
      },
    });

    const communities = communitiesRaw.map((community) => {
      const postsCount = community._count.posts;
      const membersCount = community._count.members;
      const tagsSet = new Set<string>();
      community.posts.forEach((post) => {
        post.postTags.forEach((pt) => {
          if (pt.tag && pt.tag.name) {
            tagsSet.add(pt.tag.name);
          }
        });
      });
      const aggregatedTags = Array.from(tagsSet);
      return {
        ...community,
        postsCount,
        membersCount,
        tags: aggregatedTags,
      };
    });

    return new Response(JSON.stringify(communities), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } catch (err) {
    console.error("Ошибка при получении сообществ:", err);
    return new Response(JSON.stringify({ error: "Ошибка сервера" }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}

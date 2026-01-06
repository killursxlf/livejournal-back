import { PrismaClient, PostStatus, PublicationType, PublicationMode } from "@prisma/client";
import { corsHeaders } from "../utils/cors";
import { verifyToken } from "./auth";

const prisma = new PrismaClient();

export async function getAllPosts(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const tag = url.searchParams.get("tag"); 
    const sortParam = url.searchParams.get("sort"); 
    const subscriptions = url.searchParams.get("subscriptions"); 

    const whereClause: any = {};
    if (tag) {
      whereClause.postTags = {
        some: {
          tag: { name: tag },
        },
      };
    }

    if (subscriptions === "true" && userId) {
      whereClause.author = {
        followers: {
          some: {
            followerId: userId,
          },
        },
      };
    }

    whereClause.AND = [
      { status: { not: "DRAFT" } },
      { publishAt: { lte: new Date() } },
    ];

    let orderByClause: any = {};
    if (sortParam === "popular") {
      orderByClause = {
        likes: { _count: "desc" },
      };
    } else {
      orderByClause = {
        createdAt: "desc",
      };
    }

    const posts = await prisma.post.findMany({
      where: whereClause,
      orderBy: orderByClause,
      include: {
        author: {
          select: { username: true, name: true, email: true, avatar: true, followers: true },
        },
        postTags: { include: { tag: true } },
        likes: true,
        comments: {
          include: {
            user: {
              select: { username: true, name: true, avatar: true },
            },
          },
        },
        savedBy: true,
      },
    });

    if (!sortParam) {
      posts.sort(() => Math.random() - 0.5);
    }

    const postsWithExtraFields = posts.map((post) => {
      const basePost = {
        id: post.id,
        title: post.title,
        content: post.content,
        createdAt: post.createdAt,
        author: {
          username: post.author.username,
          name: post.author.name,
          avatar: post.author.avatar,
        },
        postTags: post.postTags.map((pt: { tag: { name: string } }) => ({
          tag: { name: pt.tag.name },
        })),
        likeCount: post.likes.length,
        commentCount: post.comments.length,
        comments: post.comments.map((comment) => ({
          id: comment.id,
          content: comment.content,
          createdAt: comment.createdAt,
          author: {
            username: comment.user.username,
            name: comment.user.name,
            avatar: comment.user.avatar,
          },
        })),
      };

      if (userId) {
        return {
          ...basePost,
          isLiked: post.likes.some(
            (like: { userId: string }) => like.userId === userId
          ),
          isSaved: post.savedBy.some(
            (saved: { userId: string }) => saved.userId === userId
          ),
        };
      }
      return basePost;
    });

    return new Response(JSON.stringify(postsWithExtraFields), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } catch (err) {
    console.error("Ошибка при getAllPosts:", err);
    return new Response(JSON.stringify({ error: "Ошибка сервера" }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}


export async function getPost(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const postId = url.searchParams.get("id");
    console.log("Запрошенный postId:", postId);

    if (!postId) {
      console.error("Отсутствует postId в запросе");
      return new Response(JSON.stringify({ error: "Missing post id" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    const tokenData = await verifyToken(req);
    console.log("Данные токена:", tokenData);
    const currentUserId: string | null = tokenData?.id || null;
    console.log("currentUserId:", currentUserId);

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: { id: true, username: true, name: true, email: true, avatar: true },
        },
        postTags: { include: { tag: true } },
        likes: { select: { userId: true } },
        comments: {
          include: {
            user: {
              select: { username: true, name: true, avatar: true },
            },
          },
        },
        savedBy: { select: { userId: true } },
        postVersions: true,
      },
    });
    console.log("Найденный пост:", post);

    if (!post) {
      console.error("Пост не найден");
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    if (post.status === "DRAFT" && post.author.id !== currentUserId) {
      console.warn(
        `Доступ к черновику запрещён. post.author.id: ${post.author.id}, currentUserId: ${currentUserId}`
      );
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    const isLiked = currentUserId
      ? post.likes.some((like) => like.userId === currentUserId)
      : false;
    const isSaved = currentUserId
      ? post.savedBy.some((saved) => saved.userId === currentUserId)
      : false;

    const postVersions =
      currentUserId && post.author.id === currentUserId
        ? post.postVersions.map((version) => ({
            id: version.id,
            title: version.title,
            content: version.content,
            editorId: version.editorId,
            createdAt: version.createdAt,
          }))
        : [];

    const postWithExtraFields = {
      id: post.id,
      title: post.title,
      content: post.content,
      createdAt: post.createdAt,
      status: post.status,
      publicationType: post.publicationType,
      publishAt: post.publishAt,
      author: {
        id: post.author.id,
        username: post.author.username,
        name: post.author.name,
        email: post.author.email,
        avatar: post.author.avatar,
      },
      postTags: post.postTags.map((pt) => ({ tag: { name: pt.tag.name } })),
      likeCount: post.likes.length,
      commentCount: post.comments.length,
      comments: post.comments.map((comment) => ({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        author: {
          username: comment.user.username,
          name: comment.user.name,
          avatar: comment.user.avatar,
        },
      })),
      isLiked,
      isSaved,
      postVersions, 
    };

    console.log("Формируемый объект поста для клиента:", postWithExtraFields);

    return new Response(JSON.stringify(postWithExtraFields), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (err) {
    console.error("Ошибка в getPost:", err);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}

export async function createPost(req: Request) {
  try {
    const tokenData = await verifyToken(req);
    const tokenEmail = tokenData?.user?.email || tokenData?.email;
    if (!tokenEmail) {
      return new Response(
        JSON.stringify({ error: "Не авторизован" }),
        { status: 401, headers: corsHeaders() }
      );
    }

    const {
      title,
      content,
      email,
      tags,
      status,          
      publicationType,  
      publishDate,     
      publishTime,      
    } = await req.json();

    if (!title || !content || !email) {
      return new Response(
        JSON.stringify({ error: "Все поля обязательны" }),
        { status: 400, headers: corsHeaders() }
      );
    }

    if (email !== tokenEmail) {
      return new Response(
        JSON.stringify({ error: "Доступ запрещён" }),
        { status: 403, headers: corsHeaders() }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Пользователь не найден" }),
        { status: 404, headers: corsHeaders() }
      );
    }

    const tagsData = (tags || []).map((tagName: string) => ({
      tag: {
        connectOrCreate: {
          where: { name: tagName.toLowerCase() },
          create: { name: tagName.toLowerCase() },
        },
      },
    }));

    const finalStatus = status || "DRAFT";

    let publishAt: Date | undefined;
    if (publishDate) {
      const timeStr = publishTime ? publishTime : "00:00";
      publishAt = new Date(`${publishDate}T${timeStr}:00`);
    } else if (finalStatus !== "DRAFT") {
      publishAt = new Date();
    }

    const post = await prisma.post.create({
      data: {
        title,
        content,
        authorId: user.id,
        status: finalStatus,
        publicationType: publicationType || "ARTICLE",
        ...(publishAt ? { publishAt } : {}),
        postTags: { create: tagsData },
      },
      include: {
        postTags: { include: { tag: true } },
      },
    });

    const followers = await prisma.follows.findMany({
      where: { followingId: user.id },
    });
  
    await Promise.all(
      followers.map(async (follower) => {
        await prisma.notification.create({
          data: {
            type: "new_post",
            senderId: user.id,
            senderName: user.username,
            recipientId: follower.followerId,
            postId: post.id,
            message: `Новый пост от ${user.name}.`,
          },
        });
      })
    );

    return new Response(
      JSON.stringify({ message: "Публикация создана", post }),
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error("Ошибка создания поста:", error);
    return new Response(
      JSON.stringify({ error: "Ошибка создания поста" }),
      { status: 500, headers: corsHeaders() }
    );
  }
}


export async function updateDraft(req: Request): Promise<Response> {
  try {
    const tokenData = await verifyToken(req);
    const currentUserId: string | null =
      tokenData?.user?.id || tokenData?.id || tokenData?.sub || null;
    if (!currentUserId) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    const {
      id,
      title,
      content,
      tags, 
      publicationType,
      publishDate,
      publishTime,
      status, 
    } = await req.json();

    if (!id) {
      return new Response(JSON.stringify({ error: "Missing post id" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    const existingPost = await prisma.post.findUnique({
      where: { id },
    });
    if (!existingPost) {
      return new Response(JSON.stringify({ error: "Пост не найден" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }


    if (existingPost.authorId !== currentUserId) {
      return new Response(JSON.stringify({ error: "Доступ запрещён" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    await prisma.postVersion.create({
      data: {
        postId: existingPost.id,
        title: existingPost.title,
        content: existingPost.content,
        editorId: currentUserId,
      },
    });

    let publishAt: Date | undefined;
    if (publishDate) {
      const timeStr = publishTime ? publishTime : "00:00:00";
      publishAt = new Date(`${publishDate}T${timeStr}`);
    }
    if (status === "PUBLISHED" && !publishAt) {
      publishAt = new Date();
    }

    const publicationTypeMapping: Record<string, string> = {
      "Article": "ARTICLE",
      "News": "NEWS",
      "Review": "REVIEW",
    };

    const updatedPost = await prisma.post.update({
      where: { id },
      data: {
        title,
        content,
        publicationType:
          publicationTypeMapping[publicationType as keyof typeof publicationTypeMapping] ||
          publicationType,
        publishAt,
        status, 
        postTags: {
          deleteMany: {},
          create: tags.map((tagName: string) => ({
            tag: {
              connectOrCreate: {
                where: { name: tagName.toLowerCase() },
                create: { name: tagName.toLowerCase() },
              },
            },
          })),
        },
      },
      include: {
        author: {
          select: { id: true, username: true, name: true, email: true, avatar: true },
        },
        postTags: { include: { tag: true } },
      },
    });

    return new Response(
      JSON.stringify({ message: "Черновик обновлён", post: updatedPost }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      }
    );
  } catch (error) {
    console.error("Ошибка обновления черновика:", error);
    return new Response(JSON.stringify({ error: "Ошибка сервера" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}

export async function deletePost(req: Request): Promise<Response> {
  try {
    const tokenData = await verifyToken(req);
    const currentUserId = tokenData?.user?.id || tokenData?.sub || null;
    if (!currentUserId) {
      return new Response(
        JSON.stringify({ error: "Не авторизован" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        }
      );
    }

    const url = new URL(req.url);
    const postId = url.searchParams.get("id");
    if (!postId) {
      return new Response(
        JSON.stringify({ error: "Отсутствует идентификатор поста" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        }
      );
    }

    const existingPost = await prisma.post.findUnique({
      where: { id: postId },
    });
    if (!existingPost) {
      return new Response(
        JSON.stringify({ error: "Пост не найден" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        }
      );
    }

    if (existingPost.authorId !== currentUserId) {
      return new Response(
        JSON.stringify({ error: "Доступ запрещён" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        }
      );
    }

    await prisma.postTag.deleteMany({
      where: { postId },
    });
    await prisma.like.deleteMany({
      where: { postId },
    });
    await prisma.comment.deleteMany({
      where: { postId },
    });

    await prisma.savedPost.deleteMany({
      where: { postId },
    });

    await prisma.postVersion.deleteMany({
      where: { postId },
    });


    await prisma.post.delete({
      where: { id: postId },
    });

    return new Response(
      JSON.stringify({ message: "Пост успешно удален" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      }
    );
  } catch (error) {
    console.error("Ошибка при удалении поста:", error);
    return new Response(
      JSON.stringify({ error: "Ошибка сервера" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      }
    );
  }
}

export async function searchPosts(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const q = url.searchParams.get("q");
    const tag = url.searchParams.get("tag");

    const whereClause: any = {};

    if (q) {
      whereClause.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
      ];
    }

    if (tag) {
      whereClause.postTags = {
        some: {
          tag: { name: tag },
        },
      };
    }

    whereClause.AND = [
      { status: { not: "DRAFT" } },
      { publishAt: { lte: new Date() } },
    ];

    const orderByClause = { createdAt: "desc" as const };

    const posts = await prisma.post.findMany({
      where: whereClause,
      orderBy: orderByClause,
      include: {
        author: {
          select: { username: true, name: true, email: true, avatar: true, followers: true },
        },
        postTags: { include: { tag: true } },
        likes: true,
        comments: {
          include: {
            user: {
              select: { username: true, name: true, avatar: true },
            },
          },
        },
        savedBy: true,
      },
    });

    const postsWithExtraFields = posts.map((post) => {
      const basePost = {
        id: post.id,
        title: post.title,
        content: post.content,
        createdAt: post.createdAt,
        author: {
          username: post.author.username,
          name: post.author.name,
          avatar: post.author.avatar,
        },
        postTags: post.postTags.map((pt: { tag: { name: string } }) => ({
          tag: { name: pt.tag.name },
        })),
        likeCount: post.likes.length,
        commentCount: post.comments.length,
        comments: post.comments.map((comment) => ({
          id: comment.id,
          content: comment.content,
          createdAt: comment.createdAt,
          author: {
            username: comment.user.username,
            name: comment.user.name,
            avatar: comment.user.avatar,
          },
        })),
      };

      if (userId) {
        return {
          ...basePost,
          isLiked: post.likes.some((like: { userId: string }) => like.userId === userId),
          isSaved: post.savedBy.some((saved: { userId: string }) => saved.userId === userId),
        };
      }
      return basePost;
    });

    return new Response(JSON.stringify(postsWithExtraFields), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } catch (err) {
    console.error("Ошибка при searchPosts:", err);
    return new Response(JSON.stringify({ error: "Ошибка сервера" }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}

export async function sharePost(req: Request) {
  const token = await verifyToken(req);
  if (!token || !token.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const userId = token.id;

  let payload;
  try {
    payload = await req.json();
  } catch (error) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { title, content, publicationType, tags, communities } = payload;
  
  if (!title || !content) {
    return new Response(JSON.stringify({ error: "Title and content are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  
  const finalPublicationType = publicationType || PublicationType.ARTICLE;
  
  let createdPosts = [];
  if (Array.isArray(communities) && communities.length > 0) {
    for (const communityId of communities) {
      const membership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: { communityId, userId },
        },
      });
      if (!membership) {
        continue;
      }
      
      const post = await prisma.post.create({
        data: {
          title,
          content,
          authorId: userId,
          communityId,
          publicationType: finalPublicationType,
          publicationMode: PublicationMode.COMMUNITY,
          status: PostStatus.PENDING,
        },
      });
      createdPosts.push(post);
      
      if (Array.isArray(tags)) {
        for (const tagName of tags) {
          let tag = await prisma.tag.findUnique({
            where: { name: tagName },
          });
          if (!tag) {
            tag = await prisma.tag.create({
              data: { name: tagName },
            });
          }
          await prisma.postTag.create({
            data: {
              postId: post.id,
              tagId: tag.id,
            },
          });
        }
      }
    }
    
    if (createdPosts.length === 0) {
      return new Response(JSON.stringify({ error: "You are not a member of the selected communities" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else {
    const post = await prisma.post.create({
      data: {
        title,
        content,
        authorId: userId,
        publicationType: finalPublicationType,
        publicationMode: PublicationMode.USER,
        status: PostStatus.PUBLISHED,
        publishAt: new Date(),
      },
    });
    createdPosts.push(post);
    
    if (Array.isArray(tags)) {
      for (const tagName of tags) {
        let tag = await prisma.tag.findUnique({
          where: { name: tagName },
        });
        if (!tag) {
          tag = await prisma.tag.create({
            data: { name: tagName },
          });
        }
        await prisma.postTag.create({
          data: {
            postId: post.id,
            tagId: tag.id,
          },
        });
      }
    }
  }
  
  return new Response(JSON.stringify({ message: "Post(s) created successfully", posts: createdPosts }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}
import prisma from "../prisma";
import { corsHeaders } from "../utils/cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { verifyToken } from "./auth";
import fs from "fs/promises";

const backendURL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";

export async function getUser(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get("email");
    const username = url.searchParams.get("username");
    const currentUserIdFromQuery = url.searchParams.get("userId");

    if (!email && !username) {
      return new Response(
        JSON.stringify({ error: "Необходимо указать email или username" }),
        {
          status: 400,
          headers: corsHeaders(),
        }
      );
    }

    const whereCondition = email
      ? { email }
      : username
      ? { username: username as string }
      : undefined;

    if (!whereCondition) {
      return new Response(
        JSON.stringify({ error: "Некорректный запрос" }),
        {
          status: 400,
          headers: corsHeaders(),
        }
      );
    }

    const token = await verifyToken(req);
    const currentUserId = token?.user?.id || currentUserIdFromQuery || null;

    const user = await prisma.user.findUnique({
      where: whereCondition,
      include: {
        posts: {
          include: {
            postTags: { include: { tag: true } },
            likes: { select: { userId: true } },
            comments: {
              include: {
                user: {
                  select: { id: true, username: true, name: true, avatar: true },
                },
              },
            },
            savedBy: true,
          },
        },
        followers: true,
        following: true,
      },
    });

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Пользователь не найден" }),
        {
          status: 404,
          headers: corsHeaders(),
        }
      );
    }


    const isFollow = currentUserId
      ? user.followers.some(
          (follow: { followerId: string }) => follow.followerId === currentUserId
        )
      : false;

    const isOwner = currentUserId && currentUserId === user.id;

    const mapPost = (post: any) => {
      const author = post.author || {
        id: user.id,
        username: user.username,
        name: user.name,
        avatar: user.avatar,
      };

      const basePost: any = {
        id: post.id,
        title: post.title,
        content: post.content,
        createdAt: post.createdAt,
        publishAt: post.publishAt, 
        author: {
          id: author.id,
          username: author.username,
          name: author.name,
          avatar: author.avatar,
        },
        postTags: post.postTags.map((pt: { tag: { name: string } }) => ({
          tag: { name: pt.tag.name },
        })),
        likeCount: post.likes.length,
        commentCount: post.comments.length,
        comments: post.comments.map((comment: any) => ({
          id: comment.id,
          content: comment.content,
          createdAt: comment.createdAt,
          author: {
            id: comment.user?.id,
            username: comment.user?.username || "Unknown",
            name: comment.user?.name || "Unknown",
            avatar: comment.user?.avatar,
          },
        })),
      };

      if (isOwner && currentUserId) {
        return {
          ...basePost,
          isLiked: post.likes.some(
            (like: { userId: string }) => like.userId === currentUserId
          ),
          isSaved: post.savedBy.some(
            (saved: { userId: string }) => saved.userId === currentUserId
          ),

          status: post.status,
        };
      }
      return basePost;
    };


    const now = new Date();
    const createdPosts = user.posts
    ? (isOwner
        ? user.posts.filter(post => !post.communityId)
        : user.posts.filter(
            (post) =>
              post.status === "PUBLISHED" &&
              post.publishAt &&
              new Date(post.publishAt) <= now &&
              !post.communityId
          )
      ).map(mapPost)
    : [];
  

    const likedPostsData = await prisma.post.findMany({
      where: {
        likes: {
          some: {
            userId: user.id,
          },
        },
      },
      include: {
        author: { select: { id: true, username: true, name: true, avatar: true } },
        postTags: { include: { tag: true } },
        likes: { select: { userId: true } },
        comments: {
          include: {
            user: { select: { id: true, username: true, name: true, avatar: true } },
          },
        },
        savedBy: true,
      },
    });
    const likedPosts = likedPostsData.map(mapPost);

    const savedPostsData = await prisma.post.findMany({
      where: {
        savedBy: {
          some: {
            userId: user.id,
          },
        },
      },
      include: {
        author: { select: { username: true, name: true, avatar: true } },
        postTags: { include: { tag: true } },
        likes: { select: { userId: true } },
        comments: {
          include: {
            user: { select: { id: true, username: true, name: true, avatar: true } },
          },
        },
        savedBy: true,
      },
    });
    const savedPosts = savedPostsData.map(mapPost);

    let draftPosts: any[] = [];
    if (isOwner && currentUserId) {
      const draftPostsData = await prisma.post.findMany({
        where: {
          authorId: user.id,
          status: "DRAFT",
        },
        include: {
          author: { select: { username: true, name: true, avatar: true } },
          postTags: { include: { tag: true } },
          likes: { select: { userId: true } },
          comments: {
            include: {
              user: { select: { username: true, name: true, avatar: true } },
            },
          },
          savedBy: true,
        },
      });
      draftPosts = draftPostsData.map(mapPost);
    }

    const result = {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      bio: user.bio,
      language: user.language,
      location: user.location,
      avatar: user.avatar,
      createdAt: user.createdAt,
      followerCount: user.followers ? user.followers.length : 0,
      followingCount: user.following ? user.following.length : 0,
      isFollow,
      posts: createdPosts,
      likedPosts,
      savedPosts,
      draftPosts,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } catch (err) {
    console.error("Ошибка при getUser:", err);
    return new Response(JSON.stringify({ error: "Ошибка сервера" }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}


export async function getCurrentUser(req: Request) {
  try {
    const cookieHeader = req.headers.get("Cookie");
    if (!cookieHeader) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), { status: 401 });
    }

    const cookies = Object.fromEntries(cookieHeader.split("; ").map(c => c.split("=")));
    const token = cookies["token"];

    if (!token) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), { status: 401 });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!);

    return new Response(JSON.stringify(decoded), { status: 200 });
  } catch (error) {
    console.error("Ошибка получения пользователя:", error);

    const errorMessage = error instanceof Error ? error.message : "Ошибка сервера";

    return new Response(JSON.stringify({ error: errorMessage }), { status: 401 });
  }
}


export async function completeProfile(req: Request) {
  try {
    const { email, name, username, password } = await req.json();

    if (!email || !username || !password) {
      return new Response(JSON.stringify({ error: "Все поля обязательны" }), {
        status: 400,
        headers: corsHeaders(),
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "Этот @username уже занят" }),
        {
          status: 400,
          headers: corsHeaders(),
        }
      );
    }

    let user = await prisma.user.findUnique({ where: { email } });

    const hashedPassword = await bcrypt.hash(password, 10);

    if (user) {
      user = await prisma.user.update({
        where: { email },
        data: {
          name,
          username,
          password: hashedPassword, 
        },
      });
    } else {

      user = await prisma.user.create({
        data: {
          email,
          name,
          username,
          password: hashedPassword, 
        },
      });
    }

    return new Response(
      JSON.stringify({ message: "Регистрация завершена", user }),
      {
        headers: corsHeaders(),
      }
    );
  
  } catch (error) {
    console.error("Ошибка завершения регистрации:", error);
    return new Response(JSON.stringify({ error: "Ошибка завершения регистрации" }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}


export async function updateProfile(req: Request): Promise<Response> {
  try {
    const tokenData = await verifyToken(req);
    console.log("Token Data:", tokenData);
    const tokenEmail = tokenData?.user?.email || tokenData?.email;
    
    if (!tokenEmail) {
      return new Response(
        JSON.stringify({ error: "Не авторизован" }),
        { status: 401, headers: corsHeaders() }
      );
    }

    const updateData: { 
      email?: string;
      name?: string; 
      bio?: string; 
      username?: string; 
      language?: string;
      location?: string;
      avatar?: string 
    } = {};
    
    let email: string | null = null;
    let avatarFile: File | null = null;

    const contentType = req.headers.get("Content-Type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      email = formData.get("email") as string | null;
      const name = formData.get("name") as string | null;
      const bio = formData.get("bio") as string | null;
      const newUsername = formData.get("username") as string | null;
      const language = formData.get("language") as string | null;
      const location = formData.get("location") as string | null;
      avatarFile = formData.get("avatar") as File | null;

      if (email) updateData.email = email;
      if (name) updateData.name = name;
      if (bio) updateData.bio = bio;
      if (newUsername) updateData.username = newUsername;
      if (language) updateData.language = language;
      if (location) updateData.location = location;
    } else {
      const body = await req.json();
      email = body.email;
      if (body.name !== undefined) updateData.name = body.name;
      if (body.bio !== undefined) updateData.bio = body.bio;
      if (body.username !== undefined) updateData.username = body.username;
      if (body.email !== undefined) updateData.email = body.email;
      if (body.language !== undefined) updateData.language = body.language;
      if (body.location !== undefined) updateData.location = body.location;
    }

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email обязателен" }),
        { status: 400, headers: corsHeaders() }
      );
    }

    if (email !== tokenEmail) {
      return new Response(
        JSON.stringify({ error: "Доступ запрещён" }),
        { status: 403, headers: corsHeaders() }
      );
    }

    if (avatarFile && avatarFile instanceof File) {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser && existingUser.avatar && existingUser.avatar.startsWith(`${backendURL}`)) {
        try {
          const oldUrl = new URL(existingUser.avatar);
          const oldFilePath = `./public${oldUrl.pathname}`;
          await fs.unlink(oldFilePath);
        } catch (err) {
          console.error("Ошибка удаления старого файла аватара:", err);
        }
      }

      const fileExtension = avatarFile.name.split(".").pop();
      const fileName = `avatar_${Date.now()}.${fileExtension}`;
      const filePath = `/uploads/${fileName}`;

      await Bun.write(`./public${filePath}`, avatarFile);
      updateData.avatar = `${backendURL}${filePath}`;
    }

    if (!Object.keys(updateData).length) {
      return new Response(
        JSON.stringify({ error: "Нет данных для обновления" }),
        { status: 400, headers: corsHeaders() }
      );
    }

    await prisma.user.update({
      where: { email },
      data: updateData,
    });

    return new Response(
      JSON.stringify({ message: "Профиль обновлён", ...updateData }),
      { headers: corsHeaders() }
    );
  } catch (error: any) {
    console.error("Ошибка обновления профиля:", error);
    return new Response(
      JSON.stringify({ error: "Ошибка обновления профиля" }),
      { status: 500, headers: corsHeaders() }
    );
  }
}

  
export async function getUserWithPosts(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const username = url.searchParams.get("username");

    if (!username) {
      return new Response(
        JSON.stringify({ error: "Username обязателен" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        }
      );
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        posts: {
          include: {
            postTags: { include: { tag: true } },
            likes: true,
            comments: {
              include: {
                user: {
                  select: { username: true, name: true, avatar: true },
                },
              },
            },
          },
        },
        followers: true,
        following: true,
      },
    });

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Пользователь не найден" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        }
      );
    }

    const postsWithExtraFields = user.posts.map((post) => ({
      id: post.id,
      title: post.title,
      content: post.content,
      createdAt: post.createdAt,
      author: {
        username: user.username,
        name: user.name,
        avatar: user.avatar,
      },
      postTags: post.postTags.map((pt: { tag: { name: string } }) => ({
        tag: { name: pt.tag.name },
      })),
      likeCount: post.likes ? post.likes.length : 0,
      commentCount: post.comments ? post.comments.length : 0,
      comments: post.comments
        ? post.comments.map((comment) => ({
            id: comment.id,
            content: comment.content,
            createdAt: comment.createdAt,
            author: {
              username: comment.user?.username || "Unknown",
              name: comment.user?.name || "Unknown",
              avatar: comment.user?.avatar,
            },
          }))
        : [],
    }));

    const result = {
      id: user.id,
      username: user.username,
      name: user.name,
      bio: user.bio,
      email: user.email,
      avatar: user.avatar,
      createdAt: user.createdAt, 
      followerCount: user.followers ? user.followers.length : 0,
      followingCount: user.following ? user.following.length : 0,
      posts: postsWithExtraFields,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (err) {
    console.error("Ошибка при getUserWithPosts:", err);
    return new Response(JSON.stringify({ error: "Ошибка сервера" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}

export async function getUserCommunities(req: Request) {
  const token = await verifyToken(req);
  if (!token || !token.id) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  
  const userId = token.id;
  console.log("UserID from token:", token.id);
  
  try {
    const communityMembers = await prisma.communityMember.findMany({
      where: { userId },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            avatar: true,
            _count: { select: { members: true } }
          }
        }
      }
    });

    console.log("Community members found:", communityMembers);
  
    const communities = communityMembers.map(cm => ({
      id: cm.community.id,
      name: cm.community.name,
      avatar: cm.community.avatar,
      userCount: cm.community._count.members
    }));
  
    return new Response(JSON.stringify({ communities }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Ошибка сервера" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
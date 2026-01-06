import { serve } from "bun";
import {
  register,
  login,
  logout,
  verifyToken,
  verifyUser,
  checkGoogleUser,
} from "./routes/auth";
import {
  getUser,
  completeProfile,
  updateProfile,
  getUserCommunities,
} from "./routes/user";
import { corsHeaders } from "./utils/cors";
import { readFile } from "fs/promises";
import {
  getAllPosts,
  getPost,
  createPost,
  updateDraft,
  deletePost,
  searchPosts,
  sharePost,
} from "./routes/posts";
import { toggleLike } from "./routes/like";
import { addComment, DELETE } from "./routes/comment";
import { toggleFollow } from "./routes/follow";
import { toggleSavedPost } from "./routes/savePost";
import { getAllTags } from "./routes/tags";
import {
  createNotification,
  getNotifications,
  markNotificationsAsRead,
} from "./routes/notifications";
import {
  createComplaint,
  updateComplaintStatus,
  getComplaints,
} from "./routes/complaints";
import { chatHandler } from "./routes/chat";
import {
  createCommunity,
  getCommunity,
  toggleCommunitySubscription,
  toggleCommunityNotifications,
  getPendingPosts,
  confrimPendingPosts,
  rejectPendingPost,
  getCommunities,
} from "./routes/community";
import { getCategories } from "./routes/categories";

const publicRoutes: Record<string, Record<string, (req: Request) => Promise<Response>>> = {
  "POST": {
    "/api/register": register,
    "/api/login": login,
    "/api/logout": logout,
    "/api/complete-profile": completeProfile,
    "/api/user/verify": verifyUser,
    "/api/oauth/google/check": checkGoogleUser,
  },
  "GET": {
    "/api/posts": getAllPosts,
    "/api/getpost": getPost,
    "/api/search": searchPosts,
    "/api/get-tags": getAllTags,
    "/api/get-categories": getCategories,
    "/api/community": getCommunity,
    "/api/communities": getCommunities,
  },
};

const privateRoutes: Record<string, Record<string, (req: Request) => Promise<Response>>> = {
  "GET": {
    "/api/user": getUser,
    "/api/user/communities": getUserCommunities,
    "/api/notifications": getNotifications,
    "/api/complaints": getComplaints,
    "/api/community/moderation/posts": getPendingPosts,
  },
  "POST": {
    "/api/like": toggleLike,
    "/api/comment": addComment,
    "/api/comment-delete": async (req) => {
      const url = new URL(req.url);
      const commentId = url.searchParams.get("id");
      if (!commentId) {
        return new Response(JSON.stringify({ error: "Идентификатор комментария не указан" }), { status: 400 });
      }
      return DELETE(req, { params: { id: commentId } });
    },
    "/api/update-profile": updateProfile,
    "/api/create-post": createPost,
    "/api/user/share-post": sharePost,
    "/api/toggle-follow": toggleFollow,
    "/api/toggle-saved-post": toggleSavedPost,
    "/api/notifications": createNotification,
    "/api/complaints": createComplaint,
    "/api/community/create": createCommunity,
    "/api/community/moderation/update-post": confrimPendingPosts,
    "/api/community/moderation/reject-post": rejectPendingPost,
    "/api/community/subscribe": toggleCommunitySubscription,
    "/api/community/subscribe/notifications": toggleCommunityNotifications,
  },
  "PUT": {
    "/api/update-post": updateDraft,
    "/api/notifications": markNotificationsAsRead,
    "/api/complaints": updateComplaintStatus,
  },
  "DELETE": {
    "/api/delete-post": deletePost,
  },
};

async function handleDynamicRoutes(url: URL, req: Request) {
  const path = url.pathname;

  // чат
  if (path.startsWith("/api/chat/") && path.endsWith("/message") && req.method === "POST")
    return chatHandler.sendMessage(req);

  if (path.startsWith("/api/chat/") && path.endsWith("/messages") && req.method === "GET")
    return chatHandler.getMessages(req);

  if (path.startsWith("/api/chat/") && path.endsWith("/read") && req.method === "PATCH")
    return chatHandler.markAsRead(req);

  if (path.startsWith("/api/chat/") && path.endsWith("/forward") && req.method === "POST")
    return chatHandler.forwardMessage(req);

  if (path.startsWith("/api/user/") && path.endsWith("/chats") && req.method === "GET")
    return chatHandler.getUserChats(req);

  return null;
}

serve({
  port: 3000,
  async fetch(req: Request) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          ...corsHeaders(req),
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    try {
      if (url.pathname.startsWith("/uploads/")) {
        try {
          const filePath = `./public${url.pathname}`;
          const file = await readFile(filePath);
          return new Response(file, { headers: { "Content-Type": "image/jpeg" } });
        } catch {
          return new Response("Файл не найден", { status: 404 });
        }
      }

      const methodRoutesPublic = publicRoutes[req.method] || {};
      const methodRoutesPrivate = privateRoutes[req.method] || {};
      const normalizedPath = url.pathname.replace(/\/$/, "");

      if (methodRoutesPublic[normalizedPath]) {
        return wrapWithCors(await methodRoutesPublic[normalizedPath](req), req);
      }

      const user = await verifyToken(req);
      if (!user) {
        return new Response(JSON.stringify({ error: "Не авторизован" }), {
          status: 401,
          headers: corsHeaders(req),
        });
      }

      if (methodRoutesPrivate[normalizedPath]) {
        return wrapWithCors(await methodRoutesPrivate[normalizedPath](req), req);
      }

      const dyn = await handleDynamicRoutes(url, req);
      if (dyn) return wrapWithCors(dyn, req);

      return new Response("Страница не найдена", { status: 404 });
    } catch (err) {
      console.error("Ошибка на сервере:", err);
      return new Response(JSON.stringify({ error: "Ошибка сервера" }), {
        status: 500,
        headers: corsHeaders(req),
      });
    }
  },
});

function wrapWithCors(response: Response, req: Request) {
  const mergedHeaders = new Headers(response.headers);
  const cors = corsHeaders(req);
  for (const [key, value] of Object.entries(cors)) {
    mergedHeaders.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers: mergedHeaders });
}

console.log("🚀 Bun API работает на http://localhost:3000");

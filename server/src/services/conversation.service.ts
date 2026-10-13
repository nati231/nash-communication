
import { prisma } from "../config/prisma.js";

type ConversationMemberRecord = {
  conversationId: string;
  userId: string;
  [key: string]: unknown;
};

type UserRecord = {
  id: string;
  name?: string;
  username?: string;
  email?: string;
  avatarUrl?: string | null;
  [key: string]: unknown;
};

function sameId(a: unknown, b: unknown): boolean {
  return String(a) === String(b);
}

export async function createConversation(userId: string) {
  const conversation =
    await prisma.orm.public.Conversation.create({});

  const conversationId = String(conversation.id);

  await prisma.orm.public.ConversationMember.create({
    conversationId,
    userId,
  });

  return { ...conversation, id: conversationId };
}

export async function addConversationMember(
  conversationId: string,
  userId: string,
) {
  const existing = await isConversationMember(
    conversationId,
    userId,
  );

  if (existing) return null;

  return prisma.orm.public.ConversationMember.create({
    conversationId,
    userId,
  });
}

export async function getConversationMembers(
  conversationId: string,
) {
  const allMembers =
    (await prisma.orm.public.ConversationMember.all()) as
      ConversationMemberRecord[];

  return allMembers.filter((member) =>
    sameId(member.conversationId, conversationId),
  );
}

export async function isConversationMember(
  conversationId: string,
  userId: string,
) {
  const members = await getConversationMembers(conversationId);

  return members.some((member) =>
    sameId(member.userId, userId),
  );
}

/**
 * Find an existing direct conversation between exactly two users.
 * Group conversations are not treated as direct conversations.
 */
export async function findDirectConversation(
  firstUserId: string,
  secondUserId: string,
) {
  const [allConversations, allMembers] = await Promise.all([
    prisma.orm.public.Conversation.all(),
    prisma.orm.public.ConversationMember.all(),
  ]);

  const members = allMembers as ConversationMemberRecord[];

  for (const conversation of allConversations) {
    const conversationId = String(conversation.id);

    const conversationMembers = members.filter((member) =>
      sameId(member.conversationId, conversationId),
    );

    if (conversationMembers.length !== 2) continue;

    const hasFirst = conversationMembers.some((member) =>
      sameId(member.userId, firstUserId),
    );

    const hasSecond = conversationMembers.some((member) =>
      sameId(member.userId, secondUserId),
    );

    if (hasFirst && hasSecond) {
      return { ...conversation, id: conversationId };
    }
  }

  return null;
}

/**
 * Return each conversation that the user belongs to, with its
 * members' public profile fields. The frontend can display the
 * other member's name instead of the conversation ID.
 */
export async function getUserConversations(userId: string) {
  const [allConversations, allMembers, allUsers] = await Promise.all([
    prisma.orm.public.Conversation.all(),
    prisma.orm.public.ConversationMember.all(),
    prisma.orm.public.User.all(),
  ]);

  const members = allMembers as ConversationMemberRecord[];
  const users = allUsers as UserRecord[];

  const userConversationIds = new Set(
    members
      .filter((member) => sameId(member.userId, userId))
      .map((member) => String(member.conversationId)),
  );

  return allConversations
    .filter((conversation) =>
      userConversationIds.has(String(conversation.id)),
    )
    .map((conversation) => {
      const id = String(conversation.id);

      const conversationMembers = members
        .filter((member) => sameId(member.conversationId, id))
        .map((member) => {
          const profile = users.find((user) =>
            sameId(user.id, member.userId),
          );

          return {
            id: String(member.userId),
            name: profile?.name ?? profile?.username ?? profile?.email ?? "User",
            username: profile?.username,
            email: profile?.email,
            avatarUrl: profile?.avatarUrl,
          };
        });

      const otherMember = conversationMembers.find(
        (member) => member.id !== String(userId),
      );

      return {
        id,
        conversationId: id,
        members: conversationMembers,
        name: otherMember?.name ?? "Conversation",
        title: otherMember?.name ?? "Conversation",
      };
    });
}

import { prisma } from "../config/prisma.js";

export async function createConversation(userId: string) {
  const conversation =
    await prisma.orm.public.Conversation.create({});

  await prisma.orm.public.ConversationMember.create({
    conversationId: conversation.id,
    userId,
  });

  return conversation;
}

export async function addConversationMember(
  conversationId: string,
  userId: string,
) {
  return prisma.orm.public.ConversationMember.create({
    conversationId,
    userId,
  });
}

export async function getConversationMembers(
  conversationId: string,
) {
  const members =
    await prisma.orm.public.ConversationMember.all();

  return members.filter(
    (member) =>
      String(member.conversationId) === conversationId,
  );
}

export async function isConversationMember(
  conversationId: string,
  userId: string,
) {
  const members =
    await prisma.orm.public.ConversationMember.all();

  return members.some(
    (member) =>
      String(member.conversationId) === conversationId &&
      String(member.userId) === userId,
  );
}
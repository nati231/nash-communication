import { prisma } from "../config/prisma.js";

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  content: string;
}

export async function createMessage(
  input: SendMessageInput,
) {
  return prisma.orm.public.Message.create({
    conversationId: input.conversationId,
    senderId: input.senderId,
    content: input.content,
  });
}

export async function getConversationMessages(
  conversationId: string,
) {
  const messages =
    await prisma.orm.public.Message.all();

  return messages.filter(
    (message) =>
      String(message.conversationId) === conversationId,
  );
}
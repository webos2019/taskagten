"use client";

import ChatContainer from "@/components/ChatContainer";
import { useChatStream } from "@/hooks/useChatStream";

export default function HomePage() {
  const chatState = useChatStream();

  return <ChatContainer {...chatState} />;
}

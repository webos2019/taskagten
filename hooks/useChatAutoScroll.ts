"use client";

import { useEffect, useRef } from "react";

export function useChatAutoScroll(dependencies: any[]) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, dependencies);

  return {
    messagesEndRef,
    chatBodyRef,
  };
}
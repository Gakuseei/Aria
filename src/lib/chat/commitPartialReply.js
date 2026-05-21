export function commitPartialReply({ streamBufferRef, messagesRef, setMessages, saveSession }) {
  const partial = (streamBufferRef.current || '').trim();
  if (!partial) return false;

  const current = Array.isArray(messagesRef.current) ? messagesRef.current : [];
  const next = [...current, {
    role: 'assistant',
    content: partial,
    createdAt: Date.now(),
    partial: true
  }];

  setMessages(next);
  if (typeof saveSession === 'function') {
    try {
      saveSession(next);
    } catch (e) {
      console.warn('[chat] partial save failed', e);
    }
  }
  streamBufferRef.current = '';
  return true;
}

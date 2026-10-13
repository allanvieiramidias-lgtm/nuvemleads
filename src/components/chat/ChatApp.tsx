"use client";

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { firstNameOf } from "@/lib/status";
import { useToast } from "@/components/ui/Toast";
import { pauseAllMedia } from "./attachments";
import { revokeAllBlobUrls } from "./blob-urls";
import { ChatHeader } from "./ChatHeader";
import { MediaViewer } from "./MediaViewer";
import { clearUploads, retryAttachment, sendAttachment } from "./upload-queue";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { clearQueue, retry, sendText } from "./send-queue";
import { EmptyState, ErrorState, LoadingState, OfflineBanner, WaitingState } from "./States";
import { useChat } from "./store";
import type { Contact, Me, MessageDto, Settings } from "./types";
import { useRealtime } from "./useRealtime";

type MeResponse = {
  session: Me & { locked: boolean };
  contact: Contact | null;
  settings: Settings;
};
type Page = { messages: MessageDto[]; nextCursor: string | null };

// Uma vez por carregamento completo da página (DECISOES §7, §23).
let bootPromise: Promise<{ locked: boolean; slug: string }> | null = null;

export function ChatApp(props: { name: string; slug: string }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: Infinity } },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      <ChatInner {...props} />
    </QueryClientProvider>
  );
}

function ChatInner({ name, slug }: { name: string; slug: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"boot" | "ready">("boot");

  useEffect(() => {
    bootPromise ??= api<{ locked: boolean; slug: string }>("/api/session/boot");
    let alive = true;
    bootPromise
      .then((r) => {
        if (!alive) return;
        // Até a tela de bloqueio existir (Etapa 8), sessão bloqueada volta para o PIN.
        if (r.locked) router.replace(`/u/${r.slug}`);
        else setPhase("ready");
      })
      .catch((e: unknown) => {
        bootPromise = null;
        if (alive)
          router.replace(e instanceof ApiError && e.code === "REVOKED" ? `/u/${slug}` : "/");
      });
    return () => {
      alive = false;
    };
  }, [router, slug]);

  if (phase === "boot") {
    return (
      <div className="nl-chat">
        <div className="nl-msgs">
          <div className="nl-col">
            <LoadingState />
          </div>
        </div>
      </div>
    );
  }
  return <Conversation name={name} slug={slug} />;
}

function Conversation({ name, slug }: { name: string; slug: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const chat = useChat;
  const connection = useChat((s) => s.connection);
  const loaded = useChat((s) => s.loaded);
  const loadError = useChat((s) => s.loadError);
  const leaving = useRef(false);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResponse>("/api/me", undefined, "GET"),
  });
  const meId = me.data?.session.userId ?? "";
  const contact = me.data?.contact ?? null;
  const settings = me.data?.settings;

  useEffect(() => {
    chat.getState().setContact(contact);
  }, [contact, chat]);

  /** Apaga tudo o que a conversa deixou na memória (README §4.4). */
  const wipe = useCallback(() => {
    pauseAllMedia();
    clearUploads();
    revokeAllBlobUrls();
    clearQueue();
    chat.getState().reset();
    qc.clear();
  }, [chat, qc]);

  const leaveTo = useCallback(
    (path: string) => {
      if (leaving.current) return;
      leaving.current = true;
      wipe();
      router.replace(path);
    },
    [router, wipe],
  );

  const loadInitial = useCallback(async () => {
    try {
      const page = await api<Page>("/api/messages?limit=50", undefined, "GET");
      chat.getState().setInitial(page.messages, page.nextCursor);
      chat.getState().setLoadError(false);
    } catch (e) {
      if (e instanceof ApiError && (e.code === "LOCKED" || e.code === "REVOKED"))
        leaveTo(`/u/${slug}`);
      else if (e instanceof ApiError && e.code === "NOT_FOUND")
        chat.getState().setInitial([], null);
      else chat.getState().setLoadError(true);
    }
  }, [chat, leaveTo, slug]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadOlder = useCallback(async () => {
    const cursor = chat.getState().nextCursor;
    if (!cursor) return;
    const page = await api<Page>(
      `/api/messages?limit=50&cursor=${encodeURIComponent(cursor)}`,
      undefined,
      "GET",
    ).catch(() => null);
    if (page) chat.getState().prependOlder(page.messages, page.nextCursor);
  }, [chat]);

  const rt = useRealtime({
    meId,
    onRevoked: () => leaveTo(`/u/${slug}`),
    onLocked: () => leaveTo(`/u/${slug}`),
    onRoomChanged: () => {
      void me.refetch();
      void loadInitial();
    },
    onSettings: (s) => qc.setQueryData<MeResponse>(["me"], (d) => (d ? { ...d, settings: s } : d)),
    onResync: () => {
      void me.refetch();
      void loadInitial();
    },
  });

  // "Lida": com a conversa visível, marca até a última mensagem da outra pessoa.
  const lastFromContact = useChat((s) => {
    for (let i = s.messages.length - 1; i >= 0; i--) {
      const m = s.messages[i]!;
      if (m.senderId === contact?.id && m.id) return m.status === "read" ? null : m;
    }
    return null;
  });
  useEffect(() => {
    if (!lastFromContact?.id || !contact) return;
    const mark = () => {
      if (document.visibilityState !== "visible") return;
      chat.getState().markReadUpTo(contact.id, lastFromContact.createdAt);
      void api("/api/messages/read", { upToId: lastFromContact.id }).catch(() => null);
    };
    const t = setTimeout(mark, 300);
    document.addEventListener("visibilitychange", mark);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", mark);
    };
  }, [lastFromContact, contact, chat]);

  async function lockNow() {
    rt.disconnectForLock();
    await api("/api/session/lock", { reason: "MANUAL" }).catch(() => null);
    leaveTo(`/u/${slug}`);
  }

  async function logout() {
    rt.disconnectForLock();
    await api("/api/auth/logout").catch(() => null);
    leaveTo("/");
  }

  const meFirst = firstNameOf(name);
  const contactFirst = contact ? firstNameOf(contact.name) : "";
  const offline = connection !== "online";

  let body: React.ReactNode;
  if (loadError)
    body = (
      <ErrorState
        onRetry={() => {
          chat.getState().setLoadError(false);
          void loadInitial();
        }}
      />
    );
  else if (!loaded || me.isPending) body = <LoadingState />;
  else if (!contact) body = <WaitingState />;

  return (
    <div className="nl-chat">
      <ChatHeader
        autoLockMinutes={settings?.autoLockMinutes ?? 5}
        onLock={lockNow}
        onLogout={logout}
      />
      {offline ? <OfflineBanner /> : null}
      {body ? (
        <div className="nl-msgs">
          <div className="nl-col">{body}</div>
        </div>
      ) : (
        <MessageList
          meId={meId}
          meFirst={meFirst}
          contactFirst={contactFirst}
          onLoadOlder={loadOlder}
          onRetry={(clientId) => {
            const m = chat.getState().messages.find((x) => x.clientId === clientId);
            if (m?.kind === "TEXT") retry(clientId);
            else retryAttachment(clientId, toast.error);
          }}
          empty={<EmptyState me={meFirst} contact={contactFirst} />}
        />
      )}
      {contact && loaded && !loadError ? (
        <Composer
          onSend={(t) => sendText(t, meId)}
          onTyping={rt.typing}
          onAttach={(a) => sendAttachment(a, meId, toast.error)}
          notify={toast.error}
        />
      ) : null}
      <MediaViewer
        names={contact ? { [meId]: name, [contact.id]: contact.name } : { [meId]: name }}
      />
    </div>
  );
}

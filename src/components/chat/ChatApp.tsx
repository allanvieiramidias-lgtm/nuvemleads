"use client";

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { firstNameOf } from "@/lib/status";
import { broadcast, LockController, type LockSource } from "@/components/lock/LockController";
import {
  type LockReason,
  type LockSettings,
  useLock,
  veilOff,
  veilOn,
} from "@/components/lock/lock-store";
import { LockScreen } from "@/components/lock/LockScreen";
import { Button } from "@/components/ui/Button";
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

type Boot = {
  locked: boolean;
  lockReason: LockReason | null;
  lockedAt: string | null;
  slug: string;
  settings: LockSettings;
};
type Profile = { name: string; slug: string; tone: "ACCENT" | "NEUTRAL"; avatarUrl: string | null };

// Uma vez por carregamento completo da página (DECISOES §7, §23).
let bootPromise: Promise<Boot> | null = null;

export function ChatApp(props: Profile) {
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

function ChatInner(profile: Profile) {
  const { slug } = profile;
  const router = useRouter();
  const qc = useQueryClient();
  const phase = useLock((s) => s.phase);
  const [tabId] = useState(() => crypto.randomUUID());
  const leaving = useRef(false);

  useEffect(() => {
    bootPromise ??= api<Boot>("/api/session/boot");
    let alive = true;
    bootPromise
      .then((r) => {
        if (!alive) return;
        const lock = useLock.getState();
        lock.setSettings(r.settings);
        if (r.locked) lock.setLocked(r.lockReason ?? "REOPEN", r.lockedAt);
        else lock.setPhase("unlocked");
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

  /** Apaga tudo o que a conversa deixou na memória (README §4.4, ARQUITETURA §7). */
  const wipe = useCallback(() => {
    pauseAllMedia();
    clearUploads();
    revokeAllBlobUrls();
    clearQueue();
    useChat.getState().reset();
    qc.clear();
  }, [qc]);

  /**
   * Bloquear (ARQUITETURA §7): (1) véu já está ligado; (2) desmonta a conversa; (3) limpa o
   * cache; (4) avisa o servidor (sendBeacon); (5) avisa as outras abas; (6) o socket cai ao desmontar.
   */
  const lock = useCallback(
    (reason: LockReason, source: LockSource) => {
      const st = useLock.getState();
      if (st.phase === "locked" || leaving.current) return;
      veilOn();
      wipe();
      if (source !== "server") {
        const body = JSON.stringify({ reason });
        const sent = navigator.sendBeacon?.(
          "/api/session/lock",
          new Blob([body], { type: "text/plain" }),
        );
        if (!sent)
          void fetch("/api/session/lock", {
            method: "POST",
            body,
            keepalive: true,
            credentials: "same-origin",
          }).catch(() => null);
      }
      if (source !== "broadcast") broadcast({ type: "lock", reason });
      st.setLocked(reason);
    },
    [wipe],
  );

  const leaveTo = useCallback(
    (path: string) => {
      if (leaving.current) return;
      leaving.current = true;
      wipe();
      veilOff();
      router.replace(path);
    },
    [router, wipe],
  );

  const unlocked = useCallback(() => {
    veilOff();
    useLock.getState().setPhase("unlocked");
  }, []);

  return (
    <>
      <LockController
        active={phase === "unlocked"}
        tabId={tabId}
        onLock={lock}
        onRevoked={() => leaveTo(`/u/${slug}`)}
        onTakeover={() => {
          if (useLock.getState().phase !== "unlocked") return;
          wipe();
          useLock.getState().setPhase("elsewhere");
        }}
      />
      {phase === "boot" ? (
        <div className="nl-chat">
          <div className="nl-msgs">
            <div className="nl-col">
              <LoadingState />
            </div>
          </div>
        </div>
      ) : phase === "locked" ? (
        <LockScreen me={profile} onUnlocked={unlocked} onRevoked={() => leaveTo(`/u/${slug}`)} />
      ) : phase === "elsewhere" ? (
        <ElsewhereState onUseHere={() => useLock.getState().setPhase("unlocked")} />
      ) : (
        <Conversation
          name={profile.name}
          slug={slug}
          tabId={tabId}
          onLock={(r) => lock(r, "local")}
          onServerLock={(r) => lock(r, "server")}
          onLeave={leaveTo}
          wipe={wipe}
        />
      )}
    </>
  );
}

/** DECISOES §6: uma aba ativa por pessoa. */
function ElsewhereState({ onUseHere }: { onUseHere: () => void }) {
  return (
    <div className="nl-chat">
      <div className="nl-msgs">
        <div className="nl-col">
          <div className="nl-state">
            <div className="nl-state-title">A conversa está aberta em outra aba.</div>
            <div>
              <Button variant="primary" onClick={onUseHere}>
                Usar esta aba
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Conversation({
  name,
  slug,
  tabId,
  onLock,
  onServerLock,
  onLeave,
  wipe,
}: {
  name: string;
  slug: string;
  tabId: string;
  onLock: (r: LockReason) => void;
  onServerLock: (r: LockReason) => void;
  onLeave: (path: string) => void;
  wipe: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const chat = useChat;
  const connection = useChat((s) => s.connection);
  const loaded = useChat((s) => s.loaded);
  const loadError = useChat((s) => s.loadError);
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

  // Esta aba assume a conversa (DECISOES §6) e limpa a memória ao desmontar.
  useEffect(() => {
    broadcast({ type: "active", tab: tabId });
  }, [tabId]);

  const leaveTo = onLeave;

  // Configurações vindas do servidor alimentam o bloqueio automático.
  useEffect(() => {
    if (settings) useLock.getState().setSettings(settings);
  }, [settings]);

  const loadInitial = useCallback(async () => {
    try {
      const page = await api<Page>("/api/messages?limit=50", undefined, "GET");
      chat.getState().setInitial(page.messages, page.nextCursor);
      chat.getState().setLoadError(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "LOCKED") onServerLock("IDLE");
      else if (e instanceof ApiError && e.code === "REVOKED") leaveTo(`/u/${slug}`);
      else if (e instanceof ApiError && e.code === "NOT_FOUND")
        chat.getState().setInitial([], null);
      else chat.getState().setLoadError(true);
    }
  }, [chat, leaveTo, onServerLock, slug]);

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
    onLocked: (reason) => onServerLock(reason as LockReason),
    onRoomChanged: () => {
      void me.refetch();
      void loadInitial();
    },
    onSettings: (s) => {
      useLock.getState().setSettings(s);
      qc.setQueryData<MeResponse>(["me"], (d) => (d ? { ...d, settings: s } : d));
    },
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

  function lockNow() {
    rt.disconnectForLock();
    onLock("MANUAL");
  }

  async function logout() {
    rt.disconnectForLock();
    wipe();
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

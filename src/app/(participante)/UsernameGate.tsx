"use client";

import { ArrowRightIcon, UserIcon } from "@phosphor-icons/react/ssr";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { normalizeUsername, USERNAME_RE } from "@/lib/validators";
import { PinGate } from "./u/[slug]/PinGate";

/**
 * Página principal: usuário → PIN (DECISOES §29). O usuário não é conferido antes do PIN,
 * para a tela não revelar quem existe: usuário errado e PIN errado dão a mesma mensagem.
 */
export function UsernameGate() {
  const [value, setValue] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function next(ev: FormEvent) {
    ev.preventDefault();
    const u = normalizeUsername(value);
    if (!USERNAME_RE.test(u)) {
      setError("Digite seu usuário.");
      return;
    }
    setUsername(u);
  }

  if (username) {
    return (
      <PinGate
        key={username}
        username={username}
        header={
          <div className="flex items-center gap-3">
            <span className="nl-icon-box" aria-hidden>
              <UserIcon size={20} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-medium">{username}</div>
              <Button
                variant="ghost"
                className="-ml-[3px] text-[12.5px]"
                onClick={() => {
                  setUsername(null);
                  setError(null);
                }}
              >
                Trocar usuário
              </Button>
            </div>
          </div>
        }
      />
    );
  }

  return (
    <form onSubmit={next} noValidate className="flex flex-col gap-[18px]">
      <div>
        <h3 className="mb-1.5">Conversa privada</h3>
        <p className="m-0 text-[14px] text-[var(--color-neutral-500)]">
          Digite seu usuário para continuar.
        </p>
      </div>
      <Input
        label="Usuário"
        placeholder="seu usuário"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        error={error}
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={24}
        autoFocus
        hint="Ou abra o link pessoal que o administrador enviou."
      />
      <Button
        type="submit"
        variant="primary"
        block
        large
        icon={<ArrowRightIcon size={16} aria-hidden />}
      >
        Continuar
      </Button>
    </form>
  );
}

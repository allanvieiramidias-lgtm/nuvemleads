"use client";

import { XIcon } from "@phosphor-icons/react/ssr";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, type ReactNode } from "react";

export type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Botões no rodapé (ex.: Cancelar · Confirmar). */
  actions?: ReactNode;
  children?: ReactNode;
  /** Largura máxima (padrão 440; preview de anexo usa 480). */
  width?: number;
  /** Mostra o "X" de fechar ao lado do título. */
  closeButton?: boolean;
};

/** README §4.11: `.dialog` do Nocturne, backdrop com blur 4px, Esc fecha, foco preso no modal. */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  actions,
  children,
  width = 440,
  closeButton = false,
}: ModalProps) {
  // Modal controlado (sem Dialog.Trigger): guarda quem tinha o foco para devolvê-lo ao fechar.
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open && document.activeElement instanceof HTMLElement)
      returnFocus.current = document.activeElement;
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="nl-dialog-backdrop" />
        <div className="nl-dialog-wrap">
          <Dialog.Content
            className="dialog"
            style={{ width: `min(${width}px, 100%)` }}
            onCloseAutoFocus={(e) => {
              if (returnFocus.current?.isConnected) {
                e.preventDefault();
                returnFocus.current.focus();
              }
            }}
            {...(description ? {} : { "aria-describedby": undefined })}
          >
            {closeButton ? (
              <div className="flex items-start justify-between gap-3">
                <Dialog.Title className="dialog-title">{title}</Dialog.Title>
                <Dialog.Close className="btn btn-icon btn-plain -mt-1 -mr-1" aria-label="Fechar">
                  <XIcon size={18} aria-hidden />
                </Dialog.Close>
              </div>
            ) : (
              <Dialog.Title className="dialog-title">{title}</Dialog.Title>
            )}
            {description ? (
              <Dialog.Description className="dialog-body">{description}</Dialog.Description>
            ) : null}
            {children}
            {actions ? <div className="dialog-actions">{actions}</div> : null}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Fecha o modal ao clicar (use em volta do botão "Cancelar"). */
export const ModalClose = Dialog.Close;

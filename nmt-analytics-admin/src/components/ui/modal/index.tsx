import { useRef, useEffect, useId } from "react";
import { useT } from "../../../lib/i18n";

// Only mounted, open dialogs own focus and the body scroll lock.
const openModals: HTMLDivElement[] = [];
let previousBodyOverflow = "";
const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean; // New prop to control close button visibility
  isFullscreen?: boolean; // Default to false for backwards compatibility
  title?: string; // Optional title for the modal
  description?: string; // Optional subtitle/description below modal title
  scrollable?: boolean;
  closeLabel?: string;
  closeDisabled?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className = "",
  showCloseButton = true, // Default to true for backwards compatibility
  isFullscreen = false,
  title,
  description,
  scrollable = false,
  closeLabel,
  closeDisabled = false,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  const titleId = useId();
  const { t } = useT();

  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => { closeDisabledRef.current = closeDisabled; }, [closeDisabled]);

  useEffect(() => {
    const modal = modalRef.current;
    if (!isOpen || !modal) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openModals.length === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openModals.push(modal);
    // Legacy callers render their own heading instead of passing `title`.
    const heading = modal.querySelector<HTMLElement>('h1, h2, h3, h4');
    if (heading) {
      if (!heading.id) heading.id = titleId;
      modal.setAttribute('aria-labelledby', heading.id);
    }
    const isTop = () => openModals[openModals.length - 1] === modal;
    const focusables = () => Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector))
      .filter(el => el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest('[inert]'));
    modal.focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === "Escape") {
        if (closeDisabledRef.current) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      } else if (event.key === "Tab") {
        const elements = focusables();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) {
          event.preventDefault();
          modal.focus();
        } else if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === modal)) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (isTop() && !modal.contains(event.target as Node)) modal.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", containFocus);
    return () => {
      const wasTop = isTop();
      const index = openModals.indexOf(modal);
      if (index !== -1) openModals.splice(index, 1);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", containFocus);
      if (openModals.length === 0) document.body.style.overflow = previousBodyOverflow;
      if (wasTop && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [isOpen, titleId]);

  if (!isOpen) return null;

  const hasExplicitWidth = /\bmax-w-/.test(className);
  const contentClasses = isFullscreen
    ? "relative w-full h-full overflow-y-auto outline-none focus:outline-none"
    : `relative w-full ${hasExplicitWidth ? "" : "max-w-lg"} max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 bg-white shadow-2xl outline-none focus:outline-none dark:border-gray-800 dark:bg-gray-900`;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center overflow-y-auto p-4 modal">
      {!isFullscreen && (
        <div
          className="fixed inset-0 h-full w-full bg-gray-900/50 backdrop-blur-xs transition-opacity dark:bg-black/65"
          onClick={() => { if (!closeDisabled) onClose(); }}
        ></div>
      )}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`${contentClasses} text-gray-900 dark:text-gray-100 ${scrollable ? "overscroll-contain" : ""} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseButton && (
          <button
            type="button"
            disabled={closeDisabled}
            aria-label={closeLabel || t?.common?.close || "Close"}
            onClick={onClose}
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-transparent text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.04289 16.5413C5.65237 16.9318 5.65237 17.565 6.04289 17.9555C6.43342 18.346 7.06658 18.346 7.45711 17.9555L11.9987 13.4139L16.5408 17.956C16.9313 18.3466 17.5645 18.3466 17.955 17.956C18.3455 17.5655 18.3455 16.9323 17.955 16.5418L13.4129 11.9997L17.955 7.4576C18.3455 7.06707 18.3455 6.43391 17.955 6.04338C17.5645 5.65286 16.9313 5.65286 16.5408 6.04338L11.9987 10.5855L7.45711 6.0439C7.06658 5.65338 6.43342 5.65338 6.04289 6.0439C5.65237 6.43442 5.65237 7.06759 6.04289 7.45811L10.5845 11.9997L6.04289 16.5413Z"
                fill="currentColor"
              />
            </svg>
          </button>
        )}
        {title && (
          <div className="border-b border-gray-100 px-6 py-4 pr-14 dark:border-gray-800">
            <h3 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
            )}
          </div>
        )}
        <div>{children}</div>
      </div>
    </div>
  );
};

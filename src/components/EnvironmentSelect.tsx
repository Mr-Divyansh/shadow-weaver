import {
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * EnvironmentSelect — a small, dependency-free replacement for the native
 * <select> used in the Settings target form.
 *
 * Why a custom control: the native <select> cannot style per-option status
 * text ("Not available" / "Coming soon") and renders a white popup that
 * clashes with the dark SOC theme (especially in Firefox). This keeps the
 * existing WAI-ARIA combobox/listbox contract: the trigger keeps DOM focus
 * while `aria-activedescendant` tracks the keyboard-highlighted option, so
 * keyboard navigation and screen-reader behaviour match a native select.
 *
 * No new dependencies. Pure React + CSS.
 */

export interface EnvironmentOption {
  value: string;
  label: string;
  /** Secondary status text shown at the right edge of the option row. */
  hint?: string;
  /** When true the option is selectable-but-unavailable, or genuinely blocked. */
  disabled?: boolean;
}

interface EnvironmentSelectProps {
  id?: string;
  /** Visual micro-label shown above the control. */
  label: string;
  /** Accessible name (used only if no visible label is desired). */
  ariaLabel?: string;
  value: string;
  options: EnvironmentOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

let _seq = 0;
function useIdPair(base?: string) {
  const n = useRef<number>(0);
  if (n.current === 0) n.current = ++_seq;
  const id = base ?? `env-select-${n.current}`;
  return {
    labelId: `${id}-label`,
    btnId: id,
    listId: `${id}-listbox`,
        optId: (i: number) => `${id}-opt-${i}`,
  };
}

const ENV_STATUS_HINT_CLASS = "env-hint";

export function EnvironmentSelect({
  id,
  label,
  ariaLabel,
  value,
  options,
  onChange,
  disabled,
}: EnvironmentSelectProps) {
  const ids = useIdPair(id);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const btnRef = useRef<HTMLButtonElement>(null);
  const ulRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? options[0],
    [options, value],
  );
  const enabledOpts = useMemo(
    () => options.filter((o) => !o.disabled),
    [options],
  );

  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const activeOrDefault = (idx: number) => {
    if (idx < 0) return Math.max(enabledOpts.length - 1, 0);
    if (idx >= enabledOpts.length) return 0;
    return idx;
  };
  const scrollActive = (idx: number) => {
    const li = ulRef.current?.querySelector<HTMLElement>(`#${ids.optId(idx)}`);
    li?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const openAt = (idx: number) => {
    const el = activeOrDefault(idx);
    setOpen(true);
    setActive(el);
    scrollActive(el);
  };
  const commit = (idx: number) => {
    const opt = enabledOpts[idx];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    close();
    btnRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (ulRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

      const onOptionMouseDown = (e: ReactMouseEvent<HTMLLIElement>) => e.preventDefault();

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        const selIdx = Math.max(enabledOpts.findIndex((o) => o.value === value), 0);
        const idx = e.key === "ArrowUp" ? selIdx - 1 : selIdx;
        openAt(idx);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setActive(activeOrDefault(active + 1)); break;
      case "ArrowUp": e.preventDefault(); setActive(activeOrDefault(active - 1)); break;
      case "Home": e.preventDefault(); setActive(0); break;
      case "End": e.preventDefault(); setActive(Math.max(enabledOpts.length - 1, 0)); break;
      case "Enter":
      case " ": e.preventDefault(); if (active >= 0) commit(active); break;
      case "Escape": close(); break;
      case "Tab": close(); break;
    }
  };

  return (
    <div className="env-select-root">
      <label
        id={ids.labelId}
        className="env-label"
        onClick={() => btnRef.current?.focus()}
      >
        {label}
      </label>
      <button
        id={ids.btnId}
        ref={btnRef}
        type="button"
        disabled={disabled}
        className="env-select-trigger"
        role="combobox"
        aria-labelledby={ids.labelId}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={ids.listId}
        aria-disabled={disabled}
        aria-activedescendant={open && active >= 0 ? ids.optId(active) : undefined}
        onClick={() =>
          open
            ? close()
            : openAt(Math.max(enabledOpts.findIndex((o) => o.value === value), 0))
        }
        onKeyDown={onTriggerKey}
      >
        <span className="env-select-value">
          <span
            className={
              "env-select-name" +
              (selected.disabled ? " env-select-name--muted" : "")
            }
          >
            {selected.label}
          </span>
          {selected.disabled && selected.hint ? (
            <span className={`${ENV_STATUS_HINT_CLASS} ${ENV_STATUS_HINT_CLASS}--muted`} aria-hidden="true">
              {selected.hint}
            </span>
          ) : null}
        </span>
        <span className="env-select-chevron" aria-hidden="true" />
      </button>

      {open ? (
        <ul id={ids.listId} ref={ulRef} role="listbox" className="env-select-list">
          {options.map((opt) => {
            const idx = enabledOpts.findIndex((o) => o === opt);
            const isSelected = opt.value === value;
            const isActive = idx === active;
            return (
              <li
                id={ids.optId(idx)}
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled ? true : undefined}
                className={
                  "env-select-option" +
                  (isSelected ? " env-select-option--selected" : "") +
                  (isActive ? " env-select-option--active" : "") +
                  (opt.disabled ? " env-select-option--disabled" : "")
                }
                onMouseDown={opt.disabled ? undefined : onOptionMouseDown}
                onClick={(e) => {
                  e.preventDefault();
                  if (!opt.disabled) commit(idx);
                }}
              >
                <span className="env-opt-label">{opt.label}</span>
                {opt.hint ? <span className={ENV_STATUS_HINT_CLASS}>{opt.hint}</span> : null}
                {isSelected ? <span className="env-opt-check" aria-hidden="true">✓</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

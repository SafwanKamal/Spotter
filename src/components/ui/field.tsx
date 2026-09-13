"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

/** Keep native labels, input types, refs and browser behavior. */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={["ui-input", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

/** Multiline field sharing the Input visual language. */
export function Textarea({
  className,
  ...props
}: ComponentProps<"textarea">) {
  return (
    <textarea
      className={["ui-input", "ui-textarea", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

type OptionData = { value: string; label: string; disabled?: boolean };

type OptionProps = {
  value?: string | number | readonly string[];
  disabled?: boolean;
  children?: ReactNode;
};

function optionLabel(node: ReactNode): string {
  return Children.toArray(node)
    .map((part) => {
      if (typeof part === "string" || typeof part === "number") return String(part);
      if (isValidElement<{ children?: ReactNode }>(part))
        return optionLabel(part.props.children);
      return "";
    })
    .join("");
}

/** Read `<option>` children as data. The familiar markup stays; only the
 *  rendering changes. An option with no `value` uses its text, exactly as
 *  a native select does. */
function readOptions(children: ReactNode): OptionData[] {
  return Children.toArray(children).flatMap<OptionData>((child) => {
    if (!isValidElement<OptionProps>(child)) return [];
    const label = optionLabel(child.props.children);
    return [
      {
        value:
          child.props.value === undefined ? label : String(child.props.value),
        label,
        disabled: child.props.disabled,
      },
    ];
  });
}

export type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};

/**
 * A listbox, not a native `<select>`.
 *
 * The native control renders its option list with the operating system, so
 * an open dropdown ignored every token in the theme — grey on macOS, a
 * different grey on Windows, a sheet on iOS. This draws the list itself so
 * it matches the rest of the product, and keeps the keyboard contract a
 * select is expected to honour: Up/Down/Home/End to move, Enter or Space to
 * choose, Escape to cancel, type a letter to jump, Tab to leave. The
 * trigger is a `<button>`, which is a labelable element, so an existing
 * `<label htmlFor>` still points at it.
 */
export function Select({
  value,
  onValueChange,
  children,
  id,
  name,
  disabled,
  className,
  placeholder = "Select…",
  ...aria
}: SelectProps) {
  const options = readOptions(children);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(selectedIndex, 0));
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);

  // Clicking anywhere else dismisses the list, the way a menu should.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.focus();
  }, [open]);

  // Keep the active option in view when the list is longer than its box.
  useEffect(() => {
    if (!open) return;
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function openList(startAt = Math.max(selectedIndex, 0)) {
    if (disabled) return;
    setActive(startAt);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onValueChange(option.value);
    close();
  }

  /** Type-ahead: letters typed within 700ms of each other accumulate into
   *  one query, the way a native select behaves. Wrapped in useCallback so
   *  the clock is only read inside an event, never during render. */
  const jumpToTyped = useCallback(
    (key: string, from: number, all: OptionData[]) => {
      const now = Date.now();
      typed.current.text =
        now - typed.current.at > 700 ? key : typed.current.text + key;
      typed.current.at = now;
      const query = typed.current.text.toLowerCase();
      const order = [...all.slice(from + 1), ...all.slice(0, from + 1)];
      const match = order.find((option) =>
        option.label.toLowerCase().startsWith(query),
      );
      return match ? all.indexOf(match) : -1;
    },
    [],
  );

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openList();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openList(selectedIndex >= 0 ? selectedIndex : options.length - 1);
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const next = jumpToTyped(event.key, selectedIndex, options);
      if (next >= 0) onValueChange(options[next].value);
    }
  }

  function onListKeyDown(event: ReactKeyboardEvent<HTMLUListElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => Math.min(index + 1, options.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        break;
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "Tab":
        close(false);
        break;
      default:
        if (event.key.length === 1 && /\S/.test(event.key)) {
          const next = jumpToTyped(event.key, active, options);
          if (next >= 0) setActive(next);
        }
    }
  }

  return (
    <div
      className={["ui-select-root", className].filter(Boolean).join(" ")}
      ref={root}
    >
      {name && <input type="hidden" name={name} value={value} />}
      <button
        {...aria}
        type="button"
        id={id}
        ref={trigger}
        className="ui-select"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={selected ? undefined : "ui-select-placeholder"}>
          {selected?.label ?? placeholder}
        </span>
      </button>
      {open && (
        <ul
          className="ui-select-list"
          id={listId}
          ref={list}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKeyDown}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              className={index === active ? "active" : undefined}
              onMouseEnter={() => setActive(index)}
              // Prefer pointerdown over click: unmounting the list on click
              // lets the same gesture fall through and re-open the trigger.
              onPointerDown={(event) => {
                event.preventDefault();
                choose(index);
              }}
            >
              <span className="ui-select-check" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
                  <path
                    d="M3.5 8.5 6.5 11.5 12.5 5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

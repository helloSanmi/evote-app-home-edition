import { forwardRef, useMemo } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const toLocalInputValue = (date) => {
  if (!date) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const parseValue = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const InputShell = forwardRef(({ value, onClick, placeholder, disabled }, ref) => (
  <button
    type="button"
    ref={ref}
    onClick={onClick}
    disabled={disabled}
    className={`flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-indigo-200 hover:shadow-md"}`}
  >
    <span className={value ? "text-slate-900" : "text-slate-400"}>{value || placeholder || "Select date & time"}</span>
    <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M6 2a1 1 0 0 1 2 0v1h4V2a1 1 0 0 1 2 0v1h1.5A1.5 1.5 0 0 1 17 4.5v11A2.5 2.5 0 0 1 14.5 18h-9A2.5 2.5 0 0 1 3 15.5v-11A1.5 1.5 0 0 1 4.5 3H6V2Zm0 3H4.5V9h11V5H14v1a1 1 0 1 1-2 0V5H8v1a1 1 0 1 1-2 0V5Zm9.5 6h-11v4.5c0 .55.45 1 1 1h9c.55 0 1-.45 1-1V11Z" />
    </svg>
  </button>
));
InputShell.displayName = "InputShell";

export default function DateTimePicker({
  value,
  onChange,
  placeholder,
  disabled = false,
  minDate,
  maxDate,
  id,
  name,
  required = false,
}) {
  const selected = useMemo(() => parseValue(value), [value]);

  return (
    <DatePicker
      selected={selected}
      onChange={(date) => onChange?.(date ? toLocalInputValue(date) : "")}
      showTimeSelect
      timeIntervals={1}
      dateFormat="MMM d, yyyy · h:mm aa"
      placeholderText={placeholder}
      customInput={<InputShell placeholder={placeholder} disabled={disabled} />}
      popperClassName="z-[300]"
      calendarClassName="rounded-2xl border border-slate-200 bg-white shadow-2xl"
      wrapperClassName="w-full"
      minDate={minDate}
      maxDate={maxDate}
      disabled={disabled}
      id={id}
      name={name}
      required={required}
    />
  );
}

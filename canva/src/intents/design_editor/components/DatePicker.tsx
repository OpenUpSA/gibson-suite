import { Button, ChevronLeftIcon, ChevronRightIcon } from "@canva/app-ui-kit";
import type { DateObj } from "../utils/gibs";
import { useIntl } from "react-intl";
import * as styles from "styles/components.css";

type DatePickerProps = {
  /** Currently selected date. */
  value: DateObj;
  /** Earliest selectable date. */
  min: DateObj;
  /** Latest selectable date. */
  max: DateObj;
  /** Called when the user picks a new date. */
  onChange: (value: DateObj) => void;
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Total days (serial number) for a `DateObj`, for fast comparisons. */
const dateObjToDays = (d: DateObj): number =>
  Math.floor(Date.UTC(d.year, d.month - 1, d.day) / 86_400_000);

/** Clamp `value` to the inclusive `[min, max]` range. */
const clampDate = (value: DateObj, min: DateObj, max: DateObj): DateObj => {
  const v = dateObjToDays(value);
  if (v < dateObjToDays(min)) return min;
  if (v > dateObjToDays(max)) return max;
  return value;
};

/**
 * A compact day / month / year date stepper, mirroring the reference app's
 * `DatePicker` (`gibson/src/components/DatePicker.jsx`). Prev/next chevrons
 * step a day at a time; the three boxes show the current day, month, and year.
 * Constrained to the GIBS availability range `[min, max]`.
 */
export const DatePicker = ({
  value,
  min,
  max,
  onChange,
}: DatePickerProps) => {
  const intl = useIntl();

  const atMin = dateObjToDays(value) <= dateObjToDays(min);
  const atMax = dateObjToDays(value) >= dateObjToDays(max);

  const step = (delta: number) => {
    const next = clampDate(
      { year: value.year, month: value.month, day: value.day + delta },
      min,
      max,
    );
    onChange(next);
  };

  const dayLabel = intl.formatMessage({
    defaultMessage: "Day",
    description: "Label for the day box in the date stepper.",
  });
  const monthLabel = intl.formatMessage({
    defaultMessage: "Month",
    description: "Label for the month box in the date stepper.",
  });
  const yearLabel = intl.formatMessage({
    defaultMessage: "Year",
    description: "Label for the year box in the date stepper.",
  });

  return (
    <div className={styles.dateStepper}>
      <Button
        variant="tertiary"
        size="small"
        icon={ChevronLeftIcon}
        ariaLabel={intl.formatMessage({
          defaultMessage: "Previous day",
          description:
            "Accessible label for the date stepper's previous-day button.",
        })}
        disabled={atMin}
        onClick={() => step(-1)}
      />
      <div className={styles.dateStepperBoxes}>
        <div className={styles.dateStepperBox}>
          <span className={styles.dateStepperBoxValue}>
            {String(value.day).padStart(2, "0")}
          </span>
          <span className={styles.dateStepperBoxLabel}>{dayLabel}</span>
        </div>
        <div className={styles.dateStepperBox}>
          <span className={styles.dateStepperBoxValue}>
            {MONTH_NAMES[value.month - 1]}
          </span>
          <span className={styles.dateStepperBoxLabel}>{monthLabel}</span>
        </div>
        <div className={styles.dateStepperBox}>
          <span className={styles.dateStepperBoxValue}>{value.year}</span>
          <span className={styles.dateStepperBoxLabel}>{yearLabel}</span>
        </div>
      </div>
      <Button
        variant="tertiary"
        size="small"
        icon={ChevronRightIcon}
        ariaLabel={intl.formatMessage({
          defaultMessage: "Next day",
          description:
            "Accessible label for the date stepper's next-day button.",
        })}
        disabled={atMax}
        onClick={() => step(1)}
      />
    </div>
  );
};

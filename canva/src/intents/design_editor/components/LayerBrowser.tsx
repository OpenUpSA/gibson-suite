import { Accordion, AccordionItem, Text } from "@canva/app-ui-kit";
import type { ReactNode } from "react";
import { useIntl } from "react-intl";
import * as styles from "styles/components.css";
import type { GibsLayerCategory } from "../config/layers";

type LayerBrowserProps = {
  /** The themed categories to render as accordion sections. */
  categories: GibsLayerCategory[];
  /** The id of the currently selected layer, if any. */
  selectedLayerId?: string;
  /** Called when the user clicks a layer card. */
  onSelect: (layerId: string) => void;
};

/**
 * An accordion browser for GIBS layers, mirroring the collapsible category
 * list in the reference app (`gibson/src/components/LayerSelector.jsx`).
 *
 * Each category is an `AccordionItem`; each layer inside it is a thumbnailless
 * card containing the layer name (bold) and description (subtle). Both text
 * blocks wrap freely to multiple lines so long layer names and descriptions
 * are never truncated. The card is a `<div role="button">` so it can hold the
 * multi-line text layout (the App UI Kit's `Button` only takes a single
 * string) while still being keyboard accessible.
 */
export const LayerBrowser = ({
  categories,
  selectedLayerId,
  onSelect,
}: LayerBrowserProps) => {
  const intl = useIntl();

  return (
    <Accordion>
      {categories.map((category) => (
        <AccordionItem
          key={category.name}
          title={intl.formatMessage(
            {
              defaultMessage: "{name} ({count})",
              description:
                "Accordion section title: a GIBS theme name followed by its layer count.",
            },
            { name: category.name, count: category.layers.length },
          )}
        >
          {category.layers.map((layer) => {
            const isSelected = selectedLayerId === layer.id;
            const ariaLabel = intl.formatMessage(
              {
                defaultMessage: "Select {name}",
                description:
                  "Accessible label for selecting a GIBS layer from the browser.",
              },
              { name: layer.name },
            );
            // Space/Enter activate the card for keyboard users. The
            // `aria-disabled` attribute conveys the selected state to
            // assistive tech (a real `disabled` attribute would prevent
            // focus, which we don't want here).
            const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
              if (isSelected) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(layer.id);
              }
            };
            const content: ReactNode = (
              <>
                <Text size="small" variant="bold">
                  {layer.name}
                </Text>
                <Text size="xsmall" tone="tertiary">
                  {layer.description}
                </Text>
              </>
            );
            return isSelected ? (
              <div
                key={layer.id}
                className={styles.layerCard}
                role="button"
                tabIndex={-1}
                aria-label={ariaLabel}
                aria-disabled
                data-selected
              >
                {content}
              </div>
            ) : (
              <div
                key={layer.id}
                className={styles.layerCard}
                role="button"
                tabIndex={0}
                aria-label={ariaLabel}
                onClick={() => onSelect(layer.id)}
                onKeyDown={handleKeyDown}
              >
                {content}
              </div>
            );
          })}
        </AccordionItem>
      ))}
    </Accordion>
  );
};

import { Accordion, AccordionItem, HorizontalCard } from "@canva/app-ui-kit";
import { useIntl } from "react-intl";
import { DUMMY_THUMBNAIL, type GibsLayerCategory } from "../config/layers";

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
 * Each category is an `AccordionItem`; each layer inside it is a
 * `HorizontalCard` with a (dummy) thumbnail, the layer name as the title and
 * the layer description. Clicking a card selects that layer.
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
          {category.layers.map((layer) => (
            <HorizontalCard
              key={layer.id}
              title={layer.name}
              description={layer.description}
              thumbnail={{
                url: DUMMY_THUMBNAIL,
                alt: intl.formatMessage(
                  {
                    defaultMessage: "Thumbnail for {name}",
                    description:
                      "Alt text for a layer card thumbnail in the GIBS layer browser.",
                  },
                  { name: layer.name },
                ),
              }}
              ariaLabel={intl.formatMessage(
                {
                  defaultMessage: "Select {name}",
                  description:
                    "Accessible label for selecting a GIBS layer from the browser.",
                },
                { name: layer.name },
              )}
              disabled={selectedLayerId === layer.id}
              onClick={() => onSelect(layer.id)}
            />
          ))}
        </AccordionItem>
      ))}
    </Accordion>
  );
};

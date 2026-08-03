// For usage information, see the README.md file.

// Import Canva SDK testing utilities
import * as asset from "@canva/asset/test";
import * as design from "@canva/design/test";
import * as error from "@canva/error/test";
import * as intents from "@canva/intents/test";
import * as platform from "@canva/platform/test";
import * as user from "@canva/user/test";

/*
  Initialize test environments for each Canva SDK package
  This sets up the necessary test infrastructure before mocking the actual SDK methods
*/
asset.initTestEnvironment();
design.initTestEnvironment();
error.initTestEnvironment();
intents.initTestEnvironment();
platform.initTestEnvironment();
user.initTestEnvironment();

/*
  Mock all Canva SDK packages except @canva/error
  This allows tests to run without making real API calls to Canva's services
*/
jest.mock("@canva/asset");
jest.mock("@canva/design", () => {
  const appElementHandlers: ((el: unknown) => void)[] = [];
  const mockAddElement = jest.fn().mockResolvedValue(undefined);
  return {
    initAppElement: jest.fn(() => ({
      addElement: mockAddElement,
      addOrUpdateElement: jest.fn().mockResolvedValue(undefined),
      registerOnElementChange: jest.fn((handler: (el: unknown) => void) => {
        // Replace (don't append) so jest.clearAllMocks + new mock stays synced.
        appElementHandlers.length = 0;
        appElementHandlers.push(handler);
      }),
    })),
    // Exposed for tests to simulate selecting / deselecting an app element.
    __triggerElementChange: (el: unknown) => {
      for (const h of appElementHandlers) h(el);
    },
    __mockAddElement: mockAddElement,
  };
});
jest.mock("@canva/intents");
jest.mock("@canva/platform");
jest.mock("@canva/user");
// Leaflet is auto-mocked via __mocks__/leaflet.js (node_modules dependency).
// The CSS side-effect import is mocked as an empty virtual module.
jest.mock("leaflet/dist/leaflet.css", () => ({}), { virtual: true });
/*
  Important: @canva/error should not be mocked
  Use it to simulate API error responses from other mocks by throwing CanvaError instances
  This allows testing of error handling scenarios
*/

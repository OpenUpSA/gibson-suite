// Auto-mock for leaflet in the Jest (jsdom) environment.
// Leaflet depends on browser APIs that jsdom doesn't fully provide.
// Placed in __mocks__/ so Jest automatically uses it for `import L from "leaflet"`.

const fn = jest.fn();

const mapInstance = {
  on: fn,
  off: fn,
  remove: fn,
  invalidateSize: fn,
  setView: fn,
  dragging: { disable: fn, enable: fn },
  getContainer: jest.fn(() => ({ style: {} })),
};

const tileLayerObj = {};
tileLayerObj.addTo = jest.fn(() => tileLayerObj);

const layerGroupObj = {};
layerGroupObj.addTo = jest.fn(() => layerGroupObj);
layerGroupObj.addLayer = fn;
layerGroupObj.clearLayers = fn;

const markerInstance = {
  on: fn,
  off: fn,
  addTo: jest.fn(() => markerInstance),
  remove: fn,
  setLatLng: fn,
  getLatLng: jest.fn(() => ({ lat: 0, lng: 0 })),
};

const L = {
  map: jest.fn(() => mapInstance),
  tileLayer: jest.fn(() => tileLayerObj),
  layerGroup: jest.fn(() => layerGroupObj),
  rectangle: jest.fn(() => ({ setBounds: fn })),
  marker: jest.fn(() => markerInstance),
  divIcon: jest.fn(() => ({})),
  latLng: jest.fn((lat, lng) => ({ lat, lng })),
  latLngBounds: jest.fn(() => ({
    getSouth: jest.fn(() => 0),
    getNorth: jest.fn(() => 10),
    getWest: jest.fn(() => 0),
    getEast: jest.fn(() => 10),
  })),
  DomEvent: {
    stopPropagation: fn,
  },
};

module.exports = L;
module.exports.default = L;


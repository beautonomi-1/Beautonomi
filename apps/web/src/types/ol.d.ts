declare module 'ol/Map' {
  const Map: any;
  export default Map;
}
declare module 'ol/View' {
  const View: any;
  export default View;
}
declare module 'ol/layer/Tile' {
  const TileLayer: any;
  export default TileLayer;
}
declare module 'ol/source/OSM' {
  const OSM: any;
  export default OSM;
}
declare module 'ol/proj' {
  export function fromLonLat(coordinate: number[], projection?: string): number[];
  export function toLonLat(coordinate: number[], projection?: string): number[];
}
declare module 'ol/Overlay' {
  const Overlay: any;
  export default Overlay;
}
declare module 'ol/layer/Vector' {
  const VectorLayer: any;
  export default VectorLayer;
}
declare module 'ol/source/Vector' {
  const VectorSource: any;
  export default VectorSource;
}
declare module 'ol/Feature' {
  const Feature: any;
  export default Feature;
}
declare module 'ol/geom/Point' {
  const Point: any;
  export default Point;
}
declare module 'ol/style' {
  export const Style: any;
  export const Icon: any;
  export const Circle: any;
  export const Fill: any;
  export const Stroke: any;
  export const Text: any;
}

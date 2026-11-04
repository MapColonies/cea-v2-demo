import { LayersControl, TileLayer } from 'react-leaflet';

export function BasemapLayers() {
  return <LayersControl position="bottomleft">
    <LayersControl.BaseLayer checked name="מפת רחובות">
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
    </LayersControl.BaseLayer>
    <LayersControl.BaseLayer name="אורתופוטו">
      <TileLayer attribution="Powered by Esri — Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19}/>
    </LayersControl.BaseLayer>
  </LayersControl>;
}
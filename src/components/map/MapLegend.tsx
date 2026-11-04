export function MapLegend({inline=false}:{inline?:boolean}) {
  return <div className={`cea-map-legend ${inline?'relative':'absolute top-2 right-2'} pointer-events-none bg-popover/95 text-popover-foreground border rounded-md px-2 py-1.5 text-[10px] flex flex-wrap gap-x-3 gap-y-1 max-w-[calc(100%-1rem)]`} dir="rtl" aria-label="מקרא מפה">
    <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 bg-success border border-success"/>מאושר</span>
    <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 bg-warning border border-unapproved-stroke"/>לא נבדק</span>
    <span className="flex items-center gap-1"><i className="cea-rejected-swatch h-2.5 w-2.5 border"/>לא מאושר</span>
    <span className="flex items-center gap-1"><i className="cea-local-reference-swatch h-2.5 w-2.5 border border-dashed"/>שייפ</span>
    <span className="flex items-center gap-1"><i className="cea-selection-swatch h-2.5 w-2.5 border-2"/>נבחר</span>
    <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 border-2 border-pending"/>מודל פעיל</span>
    <span className="flex items-center gap-1"><i className="cea-reference-approved-swatch h-2.5 w-2.5 border border-dashed"/>שכן מאושר</span>
    <span className="flex items-center gap-1"><i className="cea-reference-unapproved-swatch h-2.5 w-2.5 border border-dashed"/>שכן לא נבדק</span>
  </div>;
}

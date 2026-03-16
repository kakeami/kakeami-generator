/**
 * SVG / PNG export utilities.
 */

/** Serialize SVG element to a downloadable SVG file. */
export function downloadSvg(svgEl: SVGSVGElement, filename: string = 'kakeami.svg'): void {
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgEl);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, filename);
}

/** Render SVG to a PNG via offscreen canvas and download. */
export function downloadPng(
  svgEl: SVGSVGElement,
  filename: string = 'kakeami.png',
  size: number = 4096,
): void {
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgEl);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, size, size);
    URL.revokeObjectURL(url);

    canvas.toBlob((pngBlob) => {
      if (pngBlob) {
        triggerDownload(pngBlob, filename);
      }
    }, 'image/png');
  };
  img.src = url;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

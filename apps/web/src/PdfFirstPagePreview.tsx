import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';

export function PdfFirstPagePreview({ src, title }: { src: string; title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [message, setMessage] = useState('Loading first page…');
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let document: PDFDocumentProxy | undefined;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    let pdfjs: typeof import('pdfjs-dist') | undefined;
    let renderTask: RenderTask | undefined;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderFirstPage = async () => {
      if (!document) return;
      const page = await document.getPage(1);
      if (cancelled) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = canvas.parentElement?.clientWidth ?? baseViewport.width;
      const scale = Math.max(0.1, availableWidth / baseViewport.width);
      const viewport = page.getViewport({ scale });
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.ceil(viewport.width * pixelRatio);
      canvas.height = Math.ceil(viewport.height * pixelRatio);
      canvas.style.width = `${Math.ceil(viewport.width)}px`;
      canvas.style.height = `${Math.ceil(viewport.height)}px`;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas rendering is not available in this browser.');
      renderTask = page.render({ canvasContext: context, viewport, transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0] });
      await renderTask.promise;
      if (!cancelled) setMessage('');
    };

    const load = async () => {
      try {
        pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const response = await fetch(src, { credentials: 'include' });
        if (!response.ok) throw new Error(`Could not load the PDF (${response.status}).`);
        const data = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        loadingTask = pdfjs.getDocument({ data });
        document = await loadingTask.promise;
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        await renderFirstPage();
      } catch (error) {
        if (!cancelled) {
          setHasError(true);
          setMessage(error instanceof Error ? `Could not render the first page: ${error.message}` : 'Could not render the first page.');
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      void loadingTask?.destroy();
    };
  }, [src]);

  return <div className="pdf-first-page" aria-label={`First page of ${title}`}>
    {message && <p className="pdf-preview-message" role="status">{message}</p>}
    <canvas ref={canvasRef} hidden={hasError} aria-label={`Page 1 of ${title}`} />
  </div>;
}

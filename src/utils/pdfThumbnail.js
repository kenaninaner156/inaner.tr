// Bellek içi thumbnail önbelleği (Tekrar indirme veya render maliyetini 0'a indirir)
const thumbnailMemoryCache = new Map();
let pdfjsLibPromise = null;

async function getPdfJs() {
    if (!pdfjsLibPromise) {
        pdfjsLibPromise = (async () => {
            const pdfjs = await import('pdfjs-dist');
            try {
                if (typeof window !== 'undefined') {
                    // PDF.js worker kaynağını tanımla (Vite asset URL veya CDN)
                    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
                        'pdfjs-dist/build/pdf.worker.min.mjs',
                        import.meta.url
                    ).toString();
                }
            } catch (e) {
                console.warn('PDF.js worker başlatılamadı, doğrudan worker çalışacak:', e);
            }
            return pdfjs;
        })();
    }
    return pdfjsLibPromise;
}

/**
 * Verilen PDF URL'sinden 1. sayfanın thumbnail görselini (Base64 Data URL) üretir.
 * @param {string} url - PDF dosyasının API veya doğrudan URL'si
 * @param {number} targetWidth - İstenen önizleme genişliği (piksel, varsayılan 320)
 * @returns {Promise<string>} - Base64 Data URL
 */
export async function generatePdfThumbnail(url, targetWidth = 320) {
    if (!url) return null;

    // 1. Önce RAM önbelleğine bak
    if (thumbnailMemoryCache.has(url)) {
        return thumbnailMemoryCache.get(url);
    }

    // 2. SessionStorage önbelleğine bak
    const cacheKey = `inaner_pdf_thumb_${url}`;
    try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            thumbnailMemoryCache.set(url, cached);
            return cached;
        }
    } catch (_) {}

    try {
        const pdfjs = await getPdfJs();
        const loadingTask = pdfjs.getDocument({
            url,
            cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version || '4.0.0'}/cmaps/`,
            cMapPacked: true,
            verbosity: 0
        });

        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        // Orijinal görünüm oranına göre ölçek hesapla
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = targetWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale });

        // Offscreen canvas üzerinde render et
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d', { alpha: false });

        if (!ctx) {
            throw new Error('Canvas 2D context alınamadı');
        }

        // Arka planı beyaz yap (şeffaf PDF sayfalarında koyu tema altında okunaklılık sağlar)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        // Önbelleğe kaydet
        thumbnailMemoryCache.set(url, dataUrl);
        try {
            sessionStorage.setItem(cacheKey, dataUrl);
        } catch (_) {}

        return dataUrl;
    } catch (err) {
        console.error('PDF thumbnail oluşturulamadı:', err);
        throw err;
    }
}

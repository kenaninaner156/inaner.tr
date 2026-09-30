import React, { useState, useEffect } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { generatePdfThumbnail } from '../utils/pdfThumbnail';

export default function PdfPreviewThumbnail({
    url,
    alt = 'PDF Belgesi',
    isMini = false,
    fallbackIcon = null
}) {
    const [thumbUrl, setThumbUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        setError(false);

        const targetWidth = isMini ? 64 : 320;

        generatePdfThumbnail(url, targetWidth)
            .then((dataUrl) => {
                if (isMounted) {
                    if (dataUrl) {
                        setThumbUrl(dataUrl);
                    } else {
                        setError(true);
                    }
                    setLoading(false);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setError(true);
                    setLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [url, isMini]);

    // Hata durumunda veya yüklenirken fallback ikon
    if (error || (!thumbUrl && !loading)) {
        return fallbackIcon || (
            <div className="w-full h-full flex items-center justify-center text-rose-400">
                <FileText size={isMini ? 14 : 24} />
            </div>
        );
    }

    if (loading && !thumbUrl) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900/60 animate-pulse">
                <Loader2 size={isMini ? 12 : 20} className="animate-spin text-zinc-500 mb-1" />
                {!isMini && (
                    <span className="text-[10px] text-zinc-500 font-mono tracking-tight">
                        Önizleme...
                    </span>
                )}
            </div>
        );
    }

    if (isMini) {
        return (
            <img
                src={thumbUrl}
                alt={alt}
                loading="lazy"
                className="w-full h-full object-cover object-top rounded"
            />
        );
    }

    return (
        <div className="w-full h-full flex items-center justify-center overflow-hidden bg-[#07090e] p-1">
            <div className="relative w-full h-full flex items-center justify-center">
                <img
                    src={thumbUrl}
                    alt={alt}
                    loading="lazy"
                    className="max-w-full max-h-full object-contain rounded shadow-md border border-white/[0.08] transition-transform duration-300 group-hover:scale-105"
                />
            </div>
        </div>
    );
}

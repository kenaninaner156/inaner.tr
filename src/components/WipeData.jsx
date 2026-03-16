import React, { useState } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';

const WipeData = () => {
    const [confirmPhase, setConfirmPhase] = useState(0); // 0: initial, 1: confirm, 2: playing
    const [showVideo, setShowVideo] = useState(false);

    const VIDEO_ID = 'w6neux29_5A';

    const handleButtonClick = () => {
        if (confirmPhase === 0) {
            setConfirmPhase(1);
        } else if (confirmPhase === 1) {
            setConfirmPhase(2);
            setShowVideo(true);
        }
    };

    const handleClose = () => {
        setShowVideo(false);
        setConfirmPhase(0);
    };

    return (
        <>
            <div className="p-5 bg-red-500/10 border border-red-500/30 rounded-xl mt-8">
                <h3 className="text-xl font-bold text-red-500 mb-2 flex items-center justify-center gap-2">
                    <AlertTriangle size={20} />
                    SİSTEM SIFIRLAMA (VERİLERİ SİL)
                </h3>
                <p className="text-sm text-[var(--text-primary)] mb-4 text-center">
                    Bu özellik sistemdeki bütün <strong>Sefer, Mazot, Bakım ve Ödeme</strong> kayıtlarını Firebase veritabanından <span className="text-red-400 font-bold underline">kalıcı olarak siler</span>. Uygulamayı sıfırdan, tertemiz kullanmak istediğinizde kullanın. Bu işlem geri alınamaz!
                </p>

                <div className="flex flex-col items-center max-w-sm mx-auto">
                    <button
                        onClick={handleButtonClick}
                        className={`w-full py-3 px-6 rounded-lg font-bold flex justify-center items-center transition-all ${
                            confirmPhase === 0
                                ? 'bg-slate-700 hover:bg-slate-600 text-[var(--text-primary)]'
                                : 'bg-red-600 hover:bg-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.5)]'
                        }`}
                    >
                        <Trash2 size={18} className="mr-2" />
                        {confirmPhase === 0
                            ? 'BÜTÜN VERİLERİ SİL'
                            : '⚠️ EMİN MİSİNİZ? Her şey silinecek! Onayla'}
                    </button>

                    {confirmPhase === 1 && (
                        <button
                            onClick={() => setConfirmPhase(0)}
                            className="mt-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                        >
                            Vazgeç
                        </button>
                    )}
                </div>
            </div>

            {/* YouTube Modal */}
            {showVideo && (
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm"
                    onClick={handleClose}
                >
                    <div
                        className="relative w-full max-w-3xl mx-4 rounded-2xl overflow-hidden shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={handleClose}
                            className="absolute top-3 right-3 z-10 bg-black/60 hover:bg-black text-white rounded-full p-1.5 transition-colors"
                        >
                            <X size={18} />
                        </button>
                        <div className="relative" style={{ paddingBottom: '56.25%' }}>
                            <iframe
                                className="absolute inset-0 w-full h-full"
                                src={`https://www.youtube.com/embed/${VIDEO_ID}?autoplay=1&rel=0`}
                                title="Sistem Sıfırlama"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default WipeData;

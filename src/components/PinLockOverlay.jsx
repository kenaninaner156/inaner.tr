import React, { useState, useEffect, useRef } from 'react';
import { Lock, AlertCircle, Delete, ArrowLeft } from 'lucide-react';

const CORRECT_PIN = '1285';
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;

const PinLockOverlay = ({ onUnlock, onCancel, companyName = 'Şirket', title = 'Özel Finans Kasası' }) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isShaking, setIsShaking] = useState(false);
    const [failedAttempts, setFailedAttempts] = useState(() => {
        return parseInt(localStorage.getItem('tir_pin_failed_attempts') || '0', 10);
    });
    const [lockoutRemaining, setLockoutRemaining] = useState(() => {
        const lockoutUntil = parseInt(localStorage.getItem('tir_pin_lockout_until') || '0', 10);
        const now = Math.floor(Date.now() / 1000);
        return lockoutUntil > now ? lockoutUntil - now : 0;
    });

    const keypadNumbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'DEL'];

    // Geri sayım sayacı
    useEffect(() => {
        if (lockoutRemaining <= 0) return;

        const interval = setInterval(() => {
            setLockoutRemaining((prev) => {
                if (prev <= 1) {
                    localStorage.removeItem('tir_pin_lockout_until');
                    localStorage.setItem('tir_pin_failed_attempts', '0');
                    setFailedAttempts(0);
                    setError('');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [lockoutRemaining]);

    // PIN kontrolü
    const checkPin = (enteredPin) => {
        if (lockoutRemaining > 0) return;

        if (enteredPin === CORRECT_PIN) {
            // Başarılı giriş
            localStorage.setItem('tir_pin_failed_attempts', '0');
            setFailedAttempts(0);
            setError('');
            onUnlock();
        } else {
            // Hatalı PIN
            setIsShaking(true);
            setTimeout(() => setIsShaking(false), 500);
            setPin('');

            const newAttempts = failedAttempts + 1;
            setFailedAttempts(newAttempts);
            localStorage.setItem('tir_pin_failed_attempts', String(newAttempts));

            if (newAttempts >= MAX_ATTEMPTS) {
                const lockoutUntil = Math.floor(Date.now() / 1000) + LOCKOUT_SECONDS;
                localStorage.setItem('tir_pin_lockout_until', String(lockoutUntil));
                setLockoutRemaining(LOCKOUT_SECONDS);
                setError(`5 kez hatalı girildi! ${LOCKOUT_SECONDS} saniye kilitlendi.`);
            } else {
                setError(`Hatalı şifre! (Kalan hak: ${MAX_ATTEMPTS - newAttempts})`);
            }
        }
    };

    const handleKeyPress = (val) => {
        if (lockoutRemaining > 0) return;

        if (val === 'C') {
            setPin('');
            setError('');
        } else if (val === 'DEL') {
            setPin(prev => prev.slice(0, -1));
            setError('');
        } else {
            if (pin.length < 4) {
                const nextPin = pin + val;
                setPin(nextPin);
                setError('');
                if (nextPin.length === 4) {
                    setTimeout(() => checkPin(nextPin), 80);
                }
            }
        }
    };

    // Fiziksel klavye dinleyicisi
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (lockoutRemaining > 0) return;
            if (e.key >= '0' && e.key <= '9') {
                handleKeyPress(e.key);
            } else if (e.key === 'Backspace') {
                handleKeyPress('DEL');
            } else if (e.key === 'Escape') {
                handleKeyPress('C');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [pin, lockoutRemaining]);

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
            style={{
                backgroundColor: 'var(--bg-base, #07090e)'
            }}
        >
            {/* Geri Dön Butonu */}
            {onCancel && (
                <button
                    onClick={onCancel}
                    className="absolute flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition cursor-pointer"
                    style={{
                        top: 'calc(1.25rem + env(safe-area-inset-top, 0px))',
                        left: 'calc(1.25rem + env(safe-area-inset-left, 0px))'
                    }}
                >
                    <ArrowLeft size={16} />
                    <span>Geri Dön</span>
                </button>
            )}

            <div className="w-full max-w-[340px] flex flex-col items-center text-center">
                {/* Güvenlik İkonu (Çerçevesiz, Sade & Tek Renk Kilit) */}
                <div className="mb-3 flex items-center justify-center">
                    <div className="w-12 h-12 flex items-center justify-center text-amber-400">
                        <Lock size={32} className="stroke-[2.2]" />
                    </div>
                </div>

                {/* Başlık */}
                <h3 className="text-lg font-bold text-white tracking-tight mb-6">
                    {title}
                </h3>

                {/* PIN Gösterge Noktaları (Dots) */}
                <div className={`flex items-center justify-center gap-4 mb-8 transition-transform duration-200 ${isShaking ? 'animate-bounce' : ''}`}>
                    {[0, 1, 2, 3].map((i) => {
                        const isFilled = pin.length > i;
                        return (
                            <div
                                key={i}
                                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                                    isFilled
                                        ? 'bg-amber-400 scale-110'
                                        : 'bg-white/10 border border-white/20'
                                }`}
                            />
                        );
                    })}
                </div>

                {/* Hata veya Kilitlenme Mesajı */}
                <div className="h-6 mb-4 flex items-center justify-center">
                    {lockoutRemaining > 0 ? (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                            <AlertCircle size={13} />
                            <span>Kilitli: {lockoutRemaining} saniye bekleyin</span>
                        </div>
                    ) : error ? (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-rose-400">
                            <AlertCircle size={13} />
                            <span>{error}</span>
                        </div>
                    ) : null}
                </div>

                {/* Tuş Takımı (Keypad) */}
                <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
                    {keypadNumbers.map((key) => {
                        const isAction = key === 'C' || key === 'DEL';
                        const disabled = lockoutRemaining > 0;

                        return (
                            <button
                                key={key}
                                type="button"
                                disabled={disabled}
                                onClick={() => handleKeyPress(key)}
                                className={`h-14 rounded-2xl flex items-center justify-center font-mono font-bold transition active:scale-90 select-none cursor-pointer ${
                                    disabled 
                                        ? 'opacity-30 cursor-not-allowed bg-white/[0.02] text-slate-600'
                                        : isAction
                                            ? 'text-xs text-slate-400 hover:text-white hover:bg-white/[0.08] bg-white/[0.02] border border-white/[0.05]'
                                            : 'text-xl text-white bg-[#0d1117] hover:bg-[#161b22] border border-white/[0.08] hover:border-white/20'
                                }`}
                            >
                                {key === 'DEL' ? <Delete size={18} /> : key}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default PinLockOverlay;

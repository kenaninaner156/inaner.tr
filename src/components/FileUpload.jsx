import React, { useRef, useState } from 'react';
import { Paperclip, X, FileText, Image, Loader2 } from 'lucide-react';
import { uploadToCloudinary } from '../services/cloudinaryService';

const FileUpload = ({ files = [], onChange, maxSizeMB = 3 }) => {
    const inputRef = useRef();
    const [uploading, setUploading] = useState(false);

    const handleFileSelect = async (e) => {
        const selected = Array.from(e.target.files);
        const maxBytes = maxSizeMB * 1024 * 1024;
        e.target.value = '';
        setUploading(true);
        const newFiles = [...files];

        for (const file of selected) {
            if (file.size > maxBytes) {
                alert(`"${file.name}" dosyası ${maxSizeMB}MB sınırını aşıyor.`);
                continue;
            }
            const isPdf = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');
            try {
                let url;
                if (isPdf) {
                    // PDF → Base64 olarak oku (Free, Firestore'a doğrudan kaydedilir)
                    url = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                } else {
                    // Görsel → Cloudinary
                    const result = await uploadToCloudinary(file);
                    url = result.url;
                }
                newFiles.push({ id: Date.now() + Math.random(), name: file.name, type: file.type, size: file.size, data: url });
            } catch (error) {
                alert(`"${file.name}" yüklenirken hata oluştu: ${error.message}`);
            }
        }
        onChange(newFiles);
        setUploading(false);
    };

    const removeFile = (id) => {
        onChange(files.filter(f => f.id !== id));
    };

    const formatSize = (bytes) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    };

    const isImage = (type) => type && type.startsWith('image/');

    // PDF → base64 data URL'sini blob olarak aç (hiçbir dış servis gerekmez)
    const openFile = (f) => {
        if ((f.type === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf')) && f.data?.startsWith('data:')) {
            // base64 → Blob → Object URL
            const byteStr = atob(f.data.split(',')[1]);
            const arr = new Uint8Array(byteStr.length);
            for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
            const blob = new Blob([arr], { type: 'application/pdf' });
            window.open(URL.createObjectURL(blob));
        } else {
            window.open(f.data, '_blank');
        }
    };

    return (
        <div className="space-y-2">
            {/* Ekli dosyalar */}
            {files.length > 0 && (
                <div className="space-y-1.5">
                    {files.map(f => (
                        <div key={f.id} className="flex items-center gap-2 p-2 bg-white/5 border border-[var(--border-color)] rounded-lg group">
                            {isImage(f.type) ? (
                                <a href={f.data} target="_blank" rel="noreferrer">
                                    <img src={f.data} alt={f.name} className="w-10 h-10 object-cover rounded-md border border-[var(--border-color)] cursor-pointer hover:opacity-80 transition" />
                                </a>
                            ) : (
                                <button onClick={() => openFile(f)} className="w-10 h-10 bg-slate-700 rounded-md flex items-center justify-center hover:bg-slate-600 transition cursor-pointer" title="PDF'i Aç">
                                    <FileText size={18} className="text-red-400" />
                                </button>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-[var(--text-primary)] truncate">{f.name}</p>
                                <p className="text-xs text-slate-500">{formatSize(f.size)}</p>
                            </div>
                            <button onClick={() => removeFile(f.id)}
                                className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                                <X size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Ekle butonu */}
            <button type="button" onClick={() => !uploading && inputRef.current?.click()}
                disabled={uploading}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[var(--border-color)] hover:border-brand-500/50 hover:bg-brand-500/5 text-[var(--text-secondary)] hover:text-brand-300 transition-all text-sm w-full justify-center ${uploading ? 'opacity-60 cursor-not-allowed' : ''}`}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                {uploading ? 'Yükleniyor...' : 'Fotoğraf / Dosya Ekle'}
            </button>

            <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx"
                className="hidden"
                onChange={handleFileSelect}
            />
            <p className="text-xs text-slate-600 text-center">Maks {maxSizeMB}MB · JPG, PNG, PDF desteklenir</p>
        </div>
    );
};

export default FileUpload;


